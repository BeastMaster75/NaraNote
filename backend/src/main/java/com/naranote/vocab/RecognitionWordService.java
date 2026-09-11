package com.naranote.vocab;

import java.util.HashSet;
import java.util.List;
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
 */
@Service
public class RecognitionWordService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RecognitionWordService.class);

    private static final String SOURCE = "Reading";
    private static final int CANDIDATE_LIMIT = 30;
    private static final int INSERT_CAP = 8;

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

        int inserted = 0;
        for (Object[] candidate : candidates) {
            if (inserted >= INSERT_CAP) {
                break;
            }
            String entryId = (String) candidate[0];
            String form = (String) candidate[1];
            if (!allKanjiKnown(form, known)) {
                continue;
            }
            if (insertWord(userId, entryId, form)) {
                inserted++;
            }
        }
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
