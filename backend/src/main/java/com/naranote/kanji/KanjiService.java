package com.naranote.kanji;

import com.naranote.kanji.KanjiResponse.Practice;
import com.naranote.kanji.KanjiResponse.Related;
import com.naranote.kanji.KanjiResponse.SavedWord;
import com.naranote.kanji.KanjiResponse.Yours;
import com.naranote.library.KanjiLibraryService;
import com.naranote.mining.TokenizerService;
import com.naranote.user.CurrentUser;
import com.naranote.vocab.RecognitionWordService;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KanjiService {

    private final KanjiRepository kanjiRepository;
    private final KanjiStrokeOrderRepository strokeOrderRepository;
    private final KanjiLibraryService libraryService;
    private final CurrentUser currentUser;
    private final RecognitionWordService recognitionWordService;
    // Radicals and the personal blocks are plain lookups with no behaviour of
    // their own; entities and repositories for them would be pure ceremony.
    private final JdbcTemplate jdbc;

    public KanjiService(
            KanjiRepository kanjiRepository,
            KanjiStrokeOrderRepository strokeOrderRepository,
            KanjiLibraryService libraryService,
            CurrentUser currentUser,
            RecognitionWordService recognitionWordService,
            JdbcTemplate jdbc) {
        this.kanjiRepository = kanjiRepository;
        this.strokeOrderRepository = strokeOrderRepository;
        this.libraryService = libraryService;
        this.currentUser = currentUser;
        this.recognitionWordService = recognitionWordService;
        this.jdbc = jdbc;
    }

    /**
     * Looks up one character. The stroke-order diagram is optional — around a third
     * of the characters KANJIDIC2 knows about have no KanjiVG drawing.
     */
    @Transactional(readOnly = true)
    public Optional<KanjiResponse> find(String literal) {
        return kanjiRepository
                .findById(literal)
                .map(
                        kanji ->
                                KanjiResponse.of(
                                        kanji,
                                        radicals(literal),
                                        strokeOrderRepository
                                                .findById(literal)
                                                .map(KanjiStrokeOrder::getSvg)
                                                .orElse(null),
                                        yours(kanji)));
    }

    private List<String> radicals(String literal) {
        return jdbc.queryForList(
                "select radical from kanji_radical where literal = ? order by radical",
                String.class,
                literal);
    }

    /** The part of the page that is about the reader rather than the character. */
    private Yours yours(Kanji kanji) {
        long userId = currentUser.id();
        String literal = kanji.getLiteral();
        return new Yours(
                libraryService.contains(literal),
                wordsContaining(userId, literal, kanji.getOnReadings(), kanji.getKunReadings()),
                practice(userId, literal),
                relatedInLibrary(userId, literal));
    }

    /**
     * Every sentence you have stored that contains this character, from both
     * directions: the ones you filed under it deliberately, and the ones that came
     * along with a saved word and happen to contain it.
     *
     * <p>Deduplicated on the sentence text, preferring the deliberate filing —
     * the same sentence reached two ways is still one sentence. Uncapped by
     * design: this answers "show me all of them".
     */
    @Transactional(readOnly = true)
    public List<KanjiSentence> sentencesContaining(String literal) {
        long userId = currentUser.id();
        // The literal is always a single CJK character, so it can carry no LIKE
        // wildcards of its own and needs no escaping.
        return jdbc.query(
                """
                select id, sentence, term, reading, meaning, source, saved_at
                from (
                    select distinct on (sentence)
                           id, sentence, term, reading, meaning, source, saved_at, filed
                    from (
                        select id,
                               sentence,
                               null::text as term,
                               null::text as reading,
                               null::text as meaning,
                               source,
                               created_at as saved_at,
                               0 as filed
                        from kanji_sentence
                        where user_id = ? and literal = ?
                        union all
                        select null::bigint, sentence, term, reading, meaning,
                               source, created_at, 1
                        from vocab_item
                        where user_id = ? and sentence is not null and sentence like ?
                    ) both_ways
                    order by sentence, filed
                ) deduped
                order by saved_at desc
                """,
                (rs, row) ->
                        new KanjiSentence(
                                (Long) rs.getObject("id"),
                                rs.getString("sentence"),
                                rs.getString("term"),
                                rs.getString("reading"),
                                rs.getString("meaning"),
                                rs.getString("source"),
                                rs.getTimestamp("saved_at").toInstant()),
                userId,
                literal,
                userId,
                "%" + literal + "%");
    }

    /**
     * Every word in the collection containing this character, newest first.
     * Unlike {@link #wordsContaining} (which feeds the dictionary page's Yours
     * panel, capped and balanced across readings for a quick glance) this is
     * uncapped — the collection page this feeds answers "show me everything
     * I've met with this character," same as {@link #sentencesContaining}.
     */
    @Transactional(readOnly = true)
    public List<SavedWord> allWordsContaining(String literal) {
        long userId = currentUser.id();
        // The literal is always a single CJK character, so it can carry no LIKE
        // wildcards of its own and needs no escaping.
        return jdbc.query(
                """
                select term, reading, meaning, sentence from vocab_item
                where user_id = ? and term like ?
                order by created_at desc
                """,
                (rs, row) ->
                        new SavedWord(
                                rs.getString("term"),
                                rs.getString("reading"),
                                rs.getString("meaning"),
                                rs.getString("sentence")),
                userId,
                "%" + literal + "%");
    }

    /**
     * Unfiles a sentence. Scoped to the current user so an id from someone else's
     * collection deletes nothing rather than deleting theirs. The character stays
     * in the library — you filed it on purpose, and dropping it because its last
     * sentence went would be a surprise.
     */
    @Transactional
    public boolean unfileSentence(long id) {
        return jdbc.update(
                        "delete from kanji_sentence where id = ? and user_id = ?",
                        id,
                        currentUser.id())
                > 0;
    }

    /**
     * Files a sentence under a character, adding the character to the library if
     * it isn't there yet. Returns false when the character isn't one we know, so
     * the controller can 404 rather than let a foreign key blow up as a 500.
     *
     * <p>Both writes are idempotent: filing the same sentence twice, or filing one
     * under a character you already study, changes nothing.
     */
    @Transactional
    public boolean fileSentence(String literal, String sentence, String source) {
        if (!kanjiRepository.existsById(literal)) {
            return false;
        }
        long userId = currentUser.id();
        int added =
                jdbc.update(
                        """
                        insert into kanji_library (user_id, literal, source)
                        values (?, ?, 'MINING')
                        on conflict (user_id, literal) do nothing
                        """,
                        userId,
                        literal);
        if (added > 0) {
            recognitionWordService.generateFor(userId, literal);
        }
        jdbc.update(
                """
                insert into kanji_sentence (user_id, literal, sentence, source)
                values (?, ?, ?, ?)
                on conflict (user_id, literal, sentence) do nothing
                """,
                userId,
                literal,
                sentence,
                source == null || source.isBlank() ? null : source.trim());
        return true;
    }

    private static final int WORD_CANDIDATE_LIMIT = 60;
    private static final int WORDS_PER_READING = 2;

    record CandidateWord(String term, String reading, String meaning, String sentence) {}

    /**
     * Every reading the kanji has gets its own two slots, ranked by how common
     * the word is within that reading — a flat "most recent 12" let one
     * productive reading (usually a kun'yomi that forms lots of compounds) crowd
     * out the rest, so a common kanji's on'yomi could go entirely unrepresented.
     *
     * <p>JMdict gives a word's whole reading, not which part of it belongs to
     * this kanji, so matching is a best-effort substring check against the
     * kanji's own declared readings rather than a real decomposition — rendaku
     * (人 as びと in 恋人) and irregular compounds (明日 as あした) won't match and
     * land in a shared "other" bucket, capped the same as any real reading.
     */
    private List<SavedWord> wordsContaining(
            long userId, String literal, String[] onReadings, String[] kunReadings) {
        // The literal is always a single CJK character, so it can carry no LIKE
        // wildcards of its own and needs no escaping.
        List<CandidateWord> candidates =
                jdbc.query(
                        """
                        select v.term, v.reading, v.meaning, v.sentence
                        from vocab_item v
                        left join dict_entry de on de.id = v.dict_entry_id
                        where v.user_id = ? and v.term like ?
                        order by de.common desc nulls last,
                                 de.sense_count desc nulls last,
                                 v.created_at desc
                        limit ?
                        """,
                        (rs, row) ->
                                new CandidateWord(
                                        rs.getString("term"),
                                        rs.getString("reading"),
                                        rs.getString("meaning"),
                                        rs.getString("sentence")),
                        userId,
                        "%" + literal + "%",
                        WORD_CANDIDATE_LIMIT);

        return bucketByReading(candidates, onReadings, kunReadings);
    }

    /**
     * Pure and package-private so it's testable without a database: given
     * candidates already ranked by commonality, keep the first
     * {@value #WORDS_PER_READING} per reading bucket.
     */
    static List<SavedWord> bucketByReading(
            List<CandidateWord> candidates, String[] onReadings, String[] kunReadings) {
        List<String> normalizedOn =
                Arrays.stream(onReadings == null ? new String[0] : onReadings)
                        .map(TokenizerService::toHiragana)
                        .toList();
        List<String> normalizedKun =
                Arrays.stream(kunReadings == null ? new String[0] : kunReadings)
                        .map(KanjiService::kunStem)
                        .toList();

        Map<String, Integer> bucketCounts = new LinkedHashMap<>();
        List<SavedWord> result = new ArrayList<>();
        for (CandidateWord candidate : candidates) {
            String bucket = classifyReading(candidate.reading(), normalizedOn, normalizedKun);
            int seenInBucket = bucketCounts.merge(bucket, 1, Integer::sum);
            if (seenInBucket <= WORDS_PER_READING) {
                result.add(
                        new SavedWord(
                                candidate.term(),
                                candidate.reading(),
                                candidate.meaning(),
                                candidate.sentence()));
            }
        }
        return result;
    }

    /** The kanji-only part of a KANJIDIC2 kun'yomi: strip okurigana after "." and any "-". */
    static String kunStem(String kunReading) {
        int dot = kunReading.indexOf('.');
        String stem = dot >= 0 ? kunReading.substring(0, dot) : kunReading;
        return stem.replace("-", "");
    }

    static String classifyReading(
            String wordReading, List<String> onReadings, List<String> kunReadings) {
        if (wordReading == null || wordReading.isBlank()) {
            return "other";
        }
        for (String reading : onReadings) {
            if (!reading.isBlank() && wordReading.contains(reading)) {
                return reading;
            }
        }
        for (String reading : kunReadings) {
            if (!reading.isBlank() && wordReading.contains(reading)) {
                return reading;
            }
        }
        return "other";
    }

    private Practice practice(long userId, String literal) {
        List<Practice> found =
                jdbc.query(
                        """
                        select
                            count(a.*)::int                                            as attempts,
                            count(a.*) filter (where a.rating = 'AGAIN')::int           as again,
                            count(a.*) filter (where a.rating = 'HARD')::int            as hard,
                            count(a.*) filter (where a.rating in ('GOOD','EASY'))::int  as good,
                            max(a.attempted_at)                                         as last_attempt,
                            max(r.state)                                                as state,
                            max(r.due)                                                  as due
                        from kanji_attempt a
                        left join kanji_review r
                               on r.user_id = a.user_id and r.literal = a.literal
                        where a.user_id = ? and a.literal = ?
                        """,
                        (rs, row) -> {
                            int attempts = rs.getInt("attempts");
                            if (attempts == 0) {
                                return null;
                            }
                            Timestamp last = rs.getTimestamp("last_attempt");
                            Timestamp due = rs.getTimestamp("due");
                            return new Practice(
                                    attempts,
                                    rs.getInt("again"),
                                    rs.getInt("hard"),
                                    rs.getInt("good"),
                                    last == null ? null : last.toInstant(),
                                    rs.getString("state"),
                                    due == null ? null : due.toInstant());
                        },
                        userId,
                        literal);
        return found.isEmpty() ? null : found.getFirst();
    }

    /**
     * Characters you are already studying that share a component with this one.
     * Not "all kanji containing 彳" — that would be a dictionary fact. This is the
     * far smaller and more useful set: the ones already on your own list.
     */
    private List<Related> relatedInLibrary(long userId, String literal) {
        // Ranked by how many components are shared, not merely whether any are.
        // 木 alone links hundreds of characters and means almost nothing; two or
        // three shared parts is a relationship worth showing.
        return jdbc.query(
                """
                select l.literal, count(*)::int as shared
                from kanji_library l
                join kanji_radical r on r.literal = l.literal
                where l.user_id = ?
                  and l.literal <> ?
                  and r.radical in (select radical from kanji_radical where literal = ?)
                group by l.literal
                order by shared desc, l.literal
                limit 8
                """,
                (rs, row) -> new Related(rs.getString("literal"), rs.getInt("shared")),
                userId,
                literal,
                literal);
    }
}
