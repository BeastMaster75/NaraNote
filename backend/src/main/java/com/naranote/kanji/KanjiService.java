package com.naranote.kanji;

import com.naranote.kanji.KanjiResponse.Practice;
import com.naranote.kanji.KanjiResponse.Related;
import com.naranote.kanji.KanjiResponse.SavedWord;
import com.naranote.kanji.KanjiResponse.Yours;
import com.naranote.library.KanjiLibraryService;
import com.naranote.user.CurrentUser;
import java.sql.Timestamp;
import java.util.List;
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
    // Radicals and the personal blocks are plain lookups with no behaviour of
    // their own; entities and repositories for them would be pure ceremony.
    private final JdbcTemplate jdbc;

    public KanjiService(
            KanjiRepository kanjiRepository,
            KanjiStrokeOrderRepository strokeOrderRepository,
            KanjiLibraryService libraryService,
            CurrentUser currentUser,
            JdbcTemplate jdbc) {
        this.kanjiRepository = kanjiRepository;
        this.strokeOrderRepository = strokeOrderRepository;
        this.libraryService = libraryService;
        this.currentUser = currentUser;
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
                                        yours(literal)));
    }

    private List<String> radicals(String literal) {
        return jdbc.queryForList(
                "select radical from kanji_radical where literal = ? order by radical",
                String.class,
                literal);
    }

    /** The part of the page that is about the reader rather than the character. */
    private Yours yours(String literal) {
        long userId = currentUser.id();
        return new Yours(
                libraryService.contains(literal),
                wordsContaining(userId, literal),
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
        jdbc.update(
                """
                insert into kanji_library (user_id, literal, source)
                values (?, ?, 'MINING')
                on conflict (user_id, literal) do nothing
                """,
                userId,
                literal);
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

    private List<SavedWord> wordsContaining(long userId, String literal) {
        // The literal is always a single CJK character, so it can carry no LIKE
        // wildcards of its own and needs no escaping.
        return jdbc.query(
                """
                select term, reading, meaning, sentence from vocab_item
                where user_id = ? and term like ?
                order by created_at desc
                limit 12
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
