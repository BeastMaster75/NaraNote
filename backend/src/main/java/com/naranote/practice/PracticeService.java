package com.naranote.practice;

import com.naranote.user.CurrentUser;
import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.CardAndReviewLog;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import io.github.openspacedrepetition.State;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The handwriting practice loop: what is due, and what a rating does to it.
 *
 * <p>Uses {@link JdbcTemplate} rather than JPA deliberately. The due query is a
 * three-way outer join whose whole point is "rows that may not exist yet", and the
 * review write is an upsert — both of which JPA expresses far less clearly than SQL.
 */
@Service
public class PracticeService {

    private static final String DUE_SQL =
            """
            select k.literal, k.stroke_count, k.meanings, k.on_readings, k.kun_readings,
                   s.svg, (r.literal is null) as is_new
            from kanji_library l
            join kanji k on k.literal = l.literal
            left join kanji_review r on r.user_id = l.user_id and r.literal = l.literal
            left join kanji_stroke_order s on s.literal = l.literal
            where l.user_id = ?
              and (r.due is null or r.due <= now())
            order by r.due asc nulls first, l.added_at asc
            limit ?
            """;

    private static final String COUNT_DUE_SQL =
            """
            select count(*)
            from kanji_library l
            left join kanji_review r on r.user_id = l.user_id and r.literal = l.literal
            where l.user_id = ? and (r.due is null or r.due <= now())
            """;

    private final JdbcTemplate jdbc;
    private final Scheduler scheduler;
    private final CurrentUser currentUser;

    public PracticeService(JdbcTemplate jdbc, Scheduler scheduler, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.scheduler = scheduler;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<DueCard> due(int limit) {
        return jdbc.query(DUE_SQL, DUE_CARD, currentUser.id(), limit);
    }

    @Transactional(readOnly = true)
    public long dueCount() {
        Long count = jdbc.queryForObject(COUNT_DUE_SQL, Long.class, currentUser.id());
        return count == null ? 0 : count;
    }

    /**
     * Applies a rating and reschedules. Returns empty when the character isn't in the
     * user's library, so the controller can 404 rather than silently creating state.
     */
    @Transactional
    public Optional<ReviewResult> review(String literal, Rating rating, Integer strokesDrawn) {
        long userId = currentUser.id();

        Boolean inLibrary =
                jdbc.queryForObject(
                        "select exists(select 1 from kanji_library where user_id = ? and literal = ?)",
                        Boolean.class,
                        userId,
                        literal);
        if (!Boolean.TRUE.equals(inLibrary)) {
            return Optional.empty();
        }

        Card reviewed =
                scheduler
                        .reviewCard(loadCard(userId, literal), rating, Instant.now())
                        .card();

        jdbc.update(
                """
                insert into kanji_review (user_id, literal, state, step, stability, difficulty,
                                          due, last_review)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (user_id, literal) do update set
                    state = excluded.state, step = excluded.step,
                    stability = excluded.stability, difficulty = excluded.difficulty,
                    due = excluded.due, last_review = excluded.last_review
                """,
                userId,
                literal,
                reviewed.getState().name(),
                reviewed.getStep(),
                reviewed.getStability(),
                reviewed.getDifficulty(),
                java.sql.Timestamp.from(reviewed.getDue()),
                reviewed.getLastReview() == null
                        ? null
                        : java.sql.Timestamp.from(reviewed.getLastReview()));

        Integer expected =
                jdbc.queryForObject(
                        "select stroke_count from kanji where literal = ?", Integer.class, literal);

        jdbc.update(
                """
                insert into kanji_attempt (user_id, literal, rating, strokes_drawn, strokes_expected)
                values (?, ?, ?, ?, ?)
                """,
                userId,
                literal,
                rating.name(),
                strokesDrawn,
                expected);

        return Optional.of(
                new ReviewResult(
                        literal, reviewed.getState().name(), reviewed.getDue(), dueCount()));
    }

    /** An unreviewed character has no row yet; FSRS treats a fresh Card as new. */
    private Card loadCard(long userId, String literal) {
        List<Card> found =
                jdbc.query(
                        """
                        select state, step, stability, difficulty, due, last_review
                        from kanji_review where user_id = ? and literal = ?
                        """,
                        (rs, row) ->
                                Card.builder()
                                        .cardId(literal.hashCode())
                                        .state(State.valueOf(rs.getString("state")))
                                        .step((Integer) rs.getObject("step"))
                                        .stability((Double) rs.getObject("stability"))
                                        .difficulty((Double) rs.getObject("difficulty"))
                                        .due(rs.getTimestamp("due").toInstant())
                                        .lastReview(
                                                rs.getTimestamp("last_review") == null
                                                        ? null
                                                        : rs.getTimestamp("last_review")
                                                                .toInstant())
                                        .build(),
                        userId,
                        literal);

        return found.isEmpty()
                ? Card.builder().cardId(literal.hashCode()).build()
                : found.getFirst();
    }

    private static final RowMapper<DueCard> DUE_CARD =
            (ResultSet rs, int row) ->
                    new DueCard(
                            rs.getString("literal"),
                            (Integer) rs.getObject("stroke_count"),
                            textArray(rs.getArray("meanings")),
                            textArray(rs.getArray("on_readings")),
                            textArray(rs.getArray("kun_readings")),
                            rs.getString("svg"),
                            rs.getBoolean("is_new"));

    private static List<String> textArray(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((String[]) array.getArray());
    }
}
