package com.naranote.review;

import com.naranote.deck.DeckRef;
import com.naranote.review.ReviewDtos.DueWord;
import com.naranote.review.ReviewDtos.ReviewResult;
import com.naranote.user.CurrentUser;
import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import io.github.openspacedrepetition.State;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Vocabulary review, using the same FSRS scheduler already wired up for
 * handwriting. Deliberately the same algorithm and the same rating scale, so the
 * two study loops behave alike rather than each inventing their own feel.
 */
@Service
public class VocabReviewService {

    private static final String DUE_SQL =
            """
            select v.id, v.term, v.reading, v.meaning, v.sentence, v.source,
                   (r.vocab_id is null) as is_new
            from vocab_item v
            left join vocab_review r on r.vocab_id = v.id
            where v.user_id = ?
              and (r.due is null or r.due <= now())
            %s
            %s
            order by r.due asc nulls first, random()
            limit ?
            """;

    /**
     * Deck scoping, spliced into the queries above. Both branches are constants
     * chosen by the deck's kind — no user text reaches the SQL, the source name
     * is always bound as a parameter.
     */
    private static final String SOURCE_UNSORTED = "and nullif(trim(v.source), '') is null";

    private static final String SOURCE_EQUALS = "and nullif(trim(v.source), '') = ?";

    /**
     * Exact match, not cumulative — drilling one level this session is a different intent
     * from the account-wide generation cap. A word's level is derived, not stored: the
     * hardest (lowest-numbered) level among its kanji, same as the cap uses. A word with any
     * untagged kanji has no derived level and never matches an active filter.
     */
    private static final String LEVEL_EQUALS =
            """
            and (select min(k.jlpt_level) from kanji k
                 where k.literal = any(regexp_split_to_array(v.term, ''))) = ?
            """;

    private static final String COUNT_DUE_SQL =
            """
            select count(*) from vocab_item v
            left join vocab_review r on r.vocab_id = v.id
            where v.user_id = ? and (r.due is null or r.due <= now())
            %s
            """;

    private static final RowMapper<DueWord> DUE_WORD =
            (rs, row) ->
                    new DueWord(
                            rs.getLong("id"),
                            rs.getString("term"),
                            rs.getString("reading"),
                            rs.getString("meaning"),
                            rs.getString("sentence"),
                            rs.getString("source"),
                            rs.getBoolean("is_new"));

    private final JdbcTemplate jdbc;
    private final Scheduler scheduler;
    private final CurrentUser currentUser;

    public VocabReviewService(JdbcTemplate jdbc, Scheduler scheduler, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.scheduler = scheduler;
        this.currentUser = currentUser;
    }

    /**
     * The session queue, optionally narrowed to one deck.
     *
     * <p>Narrowing is for starting a deliberate session on one source, not the
     * default: a null deck means "everything due", which is the point of a
     * scheduler. Splitting the queue permanently by deck is how you end up with
     * three decks each saying "4 due" and nothing getting reviewed.
     */
    @Transactional(readOnly = true)
    public List<DueWord> due(int limit, DeckRef deck, Integer jlptLevel) {
        String levelClause = jlptLevel == null ? "" : LEVEL_EQUALS;
        List<Object> args = new ArrayList<>();
        args.add(currentUser.id());

        String deckClause;
        if (deck == null || deck.kind() != DeckRef.Kind.WORDS) {
            deckClause = "";
        } else if (deck.isUnsorted()) {
            deckClause = SOURCE_UNSORTED;
        } else {
            deckClause = SOURCE_EQUALS;
            args.add(deck.source());
        }
        if (jlptLevel != null) {
            args.add(jlptLevel);
        }
        args.add(limit);

        return jdbc.query(
                DUE_SQL.formatted(deckClause, levelClause), DUE_WORD, args.toArray());
    }

    @Transactional(readOnly = true)
    public long dueCount(Integer jlptLevel) {
        String levelClause = jlptLevel == null ? "" : LEVEL_EQUALS;
        List<Object> args = new ArrayList<>();
        args.add(currentUser.id());
        if (jlptLevel != null) {
            args.add(jlptLevel);
        }
        Long count =
                jdbc.queryForObject(COUNT_DUE_SQL.formatted(levelClause), Long.class, args.toArray());
        return count == null ? 0 : count;
    }

    /** Empty when the word isn't the user's, so the controller can 404. */
    @Transactional
    public Optional<ReviewResult> review(long vocabId, Rating rating) {
        long userId = currentUser.id();

        Boolean owned =
                jdbc.queryForObject(
                        "select exists(select 1 from vocab_item where id = ? and user_id = ?)",
                        Boolean.class,
                        vocabId,
                        userId);
        if (!Boolean.TRUE.equals(owned)) {
            return Optional.empty();
        }

        Card reviewed = scheduler.reviewCard(loadCard(vocabId), rating, Instant.now()).card();

        jdbc.update(
                """
                insert into vocab_review (vocab_id, user_id, state, step, stability, difficulty,
                                          due, last_review)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (vocab_id) do update set
                    state = excluded.state, step = excluded.step,
                    stability = excluded.stability, difficulty = excluded.difficulty,
                    due = excluded.due, last_review = excluded.last_review
                """,
                vocabId,
                userId,
                reviewed.getState().name(),
                reviewed.getStep(),
                reviewed.getStability(),
                reviewed.getDifficulty(),
                Timestamp.from(reviewed.getDue()),
                reviewed.getLastReview() == null ? null : Timestamp.from(reviewed.getLastReview()));

        jdbc.update(
                "insert into vocab_attempt (user_id, vocab_id, rating) values (?, ?, ?)",
                userId,
                vocabId,
                rating.name());

        return Optional.of(
                new ReviewResult(
                        vocabId, reviewed.getState().name(), reviewed.getDue(), dueCount(null)));
    }

    /** A word never reviewed has no row yet; a fresh Card is what FSRS calls new. */
    private Card loadCard(long vocabId) {
        List<Card> found =
                jdbc.query(
                        """
                        select state, step, stability, difficulty, due, last_review
                        from vocab_review where vocab_id = ?
                        """,
                        (rs, row) ->
                                Card.builder()
                                        .cardId(Long.hashCode(vocabId))
                                        .state(State.valueOf(rs.getString("state")))
                                        .step((Integer) rs.getObject("step"))
                                        .stability((Double) rs.getObject("stability"))
                                        .difficulty((Double) rs.getObject("difficulty"))
                                        .due(rs.getTimestamp("due").toInstant())
                                        .lastReview(
                                                rs.getTimestamp("last_review") == null
                                                        ? null
                                                        : rs.getTimestamp("last_review").toInstant())
                                        .build(),
                        vocabId);

        return found.isEmpty()
                ? Card.builder().cardId(Long.hashCode(vocabId)).build()
                : found.getFirst();
    }
}
