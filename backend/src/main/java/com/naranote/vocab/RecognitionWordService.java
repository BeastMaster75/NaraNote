package com.naranote.vocab;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Generates the Reading deck: common words built entirely out of kanji the
 * user already holds in kanji_library. Never user-picked — a word is a
 * candidate only because every character in it is already known, so the deck
 * is a direct function of the kanji collection rather than an independent
 * list to maintain.
 *
 * <p>Capped per kanji *character*, not per triggering call or per reading. An
 * earlier version capped per reading but scoped to whichever kanji's
 * {@code generateFor} call found the word — for a word like 三日, that's 三's
 * budget, not 日's, so a heavily-shared character like 日 kept accumulating
 * day-counting words (三日, 七日, 八日, 九日, …) forever, one or two at a time,
 * from every different companion kanji. Checking every kanji in the candidate
 * against its own running total — not just the trigger — is what actually
 * bounds how many words end up touching any one character.
 */
@Service
public class RecognitionWordService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RecognitionWordService.class);

    private static final String SOURCE = "Reading";
    private static final int CANDIDATE_LIMIT = 40;

    /** How many stored words may touch any single kanji character, total. */
    private static final int MAX_WORDS_PER_KANJI = 10;

    private static final String CANDIDATES_SQL =
            """
            select dfk.entry_id, dfk.form
            from dict_form_kanji dfk
            join dict_entry de on de.id = dfk.entry_id
            where dfk.literal = ?
            order by de.common desc, de.sense_count desc
            limit ?
            """;

    private final JdbcTemplate jdbc;
    private final ConfigurableApplicationContext context;

    public RecognitionWordService(JdbcTemplate jdbc, ConfigurableApplicationContext context) {
        this.jdbc = jdbc;
        this.context = context;
    }

    /**
     * Called whenever a kanji joins a user's library. Checks candidates
     * against the user's *current full* library, not just the literal just
     * added, so a multi-kanji word becomes eligible the moment its last
     * character is known, regardless of which addition triggered the call.
     */
    @Transactional
    public void generateFor(long userId, String literal) {
        Set<String> known =
                new HashSet<>(
                        jdbc.queryForList(
                                "select literal from kanji_library where user_id = ?",
                                String.class,
                                userId));
        if (known.isEmpty()) {
            return;
        }

        List<Object[]> candidates =
                jdbc.query(
                        CANDIDATES_SQL,
                        (rs, row) ->
                                new Object[] {rs.getString("entry_id"), rs.getString("form")},
                        literal,
                        CANDIDATE_LIMIT);

        // Running per-character counts, seeded lazily from what's already
        // stored and updated as candidates are accepted, so two kanji in the
        // same word both count against — and are counted against by — the
        // same running total within this one call.
        Map<String, Integer> wordCounts = new HashMap<>();

        for (Object[] candidate : candidates) {
            String entryId = (String) candidate[0];
            String form = (String) candidate[1];
            if (!allKanjiKnown(form, known)) {
                continue;
            }
            Set<String> formKanji = kanjiCharsIn(form);
            boolean anyCharacterFull =
                    formKanji.stream()
                            .anyMatch(
                                    c ->
                                            wordCounts.computeIfAbsent(
                                                            c, k -> existingWordCount(userId, k))
                                                    >= MAX_WORDS_PER_KANJI);
            if (anyCharacterFull) {
                continue;
            }
            if (insertWord(userId, entryId, form)) {
                formKanji.forEach(c -> wordCounts.merge(c, 1, Integer::sum));
            }
        }
    }

    private int existingWordCount(long userId, String literal) {
        Integer count =
                jdbc.queryForObject(
                        "select count(*) from vocab_item where user_id = ? and term like ?",
                        Integer.class,
                        userId,
                        "%" + literal + "%");
        return count == null ? 0 : count;
    }

    /** The one-time backfill: every (user, literal) pair already in the library. */
    public void generateForAllKnown() {
        List<Object[]> pairs =
                jdbc.query(
                        "select distinct user_id, literal from kanji_library",
                        (rs, row) -> new Object[] {rs.getLong("user_id"), rs.getString("literal")});
        for (Object[] pair : pairs) {
            generateFor((Long) pair[0], (String) pair[1]);
        }
    }

    private static Set<String> kanjiCharsIn(String form) {
        Set<String> chars = new HashSet<>();
        form.codePoints()
                .filter(cp -> cp >= 0x3400 && cp <= 0x9FFF)
                .forEach(cp -> chars.add(new String(Character.toChars(cp))));
        return chars;
    }

    private static boolean allKanjiKnown(String form, Set<String> known) {
        return form.codePoints()
                .filter(cp -> cp >= 0x3400 && cp <= 0x9FFF)
                .allMatch(cp -> known.contains(new String(Character.toChars(cp))));
    }

    /** False when the entry has no usable meaning, or the term is already saved. */
    private boolean insertWord(long userId, String entryId, String term) {
        String reading =
                jdbc.query(
                                """
                                select text from dict_form
                                where entry_id = ? and is_kana = true
                                order by common desc limit 1
                                """,
                                (rs, row) -> rs.getString("text"),
                                entryId)
                        .stream()
                        .findFirst()
                        .orElse(null);

        String meaning =
                jdbc.query(
                                """
                                select glosses[1] as gloss from dict_sense
                                where entry_id = ? order by ord limit 1
                                """,
                                (rs, row) -> rs.getString("gloss"),
                                entryId)
                        .stream()
                        .findFirst()
                        .orElse(null);

        if (meaning == null) {
            return false;
        }

        int rows =
                jdbc.update(
                        """
                        insert into vocab_item (user_id, term, reading, meaning, dict_entry_id, source)
                        values (?, ?, ?, ?, ?, ?)
                        on conflict (user_id, term) do nothing
                        """,
                        userId,
                        term,
                        reading,
                        meaning,
                        entryId,
                        SOURCE);
        return rows > 0;
    }

    /**
     * One-off backfill, run explicitly:
     *
     * <pre>./mvnw spring-boot:run -Dspring-boot.run.arguments=--generate-recognition-words</pre>
     *
     * Populates the Reading deck for kanji already in every user's library —
     * without this, the deck would only start filling from the next kanji
     * added after this ships.
     */
    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption("generate-recognition-words")) {
            return;
        }
        log.info("Generating Reading-deck words for existing kanji libraries");
        generateForAllKnown();
        log.info("Done");
        System.exit(SpringApplication.exit(context, () -> 0));
    }
}
