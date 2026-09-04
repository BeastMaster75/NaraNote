package com.naranote.deck;

import com.naranote.user.CurrentUser;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The decks shown on the review hub, with their counts.
 *
 * <p>Both study loops appear here — words and handwriting — because the app had
 * two unrelated nav items running the same FSRS scheduler over different tables,
 * and no single place that answered "what is there to do?".
 */
@Service
public class DeckService {

    /**
     * One row per distinct source. {@code nullif(trim(...), '')} folds nulls and
     * whitespace-only sources into one bucket, so a word saved with a stray space
     * doesn't create a deck of its own that looks identical to Unsorted.
     */
    private static final String WORD_DECKS_SQL =
            """
            select nullif(trim(v.source), '') as source,
                   count(*)::int as total,
                   count(*) filter (where r.due is null or r.due <= now())::int as due,
                   count(*) filter (where r.vocab_id is null)::int as unseen
            from vocab_item v
            left join vocab_review r on r.vocab_id = v.id
            where v.user_id = ?
            group by 1
            order by total desc, source asc nulls last
            """;

    private static final String KANJI_DECK_SQL =
            """
            select count(*)::int as total,
                   count(*) filter (where r.due is null or r.due <= now())::int as due,
                   count(*) filter (where r.literal is null)::int as unseen
            from kanji_library l
            left join kanji_review r on r.user_id = l.user_id and r.literal = l.literal
            where l.user_id = ?
            """;

    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;

    public DeckService(JdbcTemplate jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<DeckDtos.Deck> decks() {
        long userId = currentUser.id();
        List<DeckDtos.Deck> decks = new ArrayList<>();

        // Handwriting first: it is the one deck that exists whether or not any
        // words have been mined, and it's what the app is actually for.
        DeckDtos.Deck kanji =
                jdbc.queryForObject(
                        KANJI_DECK_SQL,
                        (rs, row) ->
                                new DeckDtos.Deck(
                                        DeckRef.KANJI.id(),
                                        "Handwriting",
                                        DeckRef.Kind.KANJI.name(),
                                        rs.getInt("total"),
                                        rs.getInt("due"),
                                        rs.getInt("unseen")),
                        userId);
        if (kanji != null && kanji.total() > 0) {
            decks.add(kanji);
        }

        decks.addAll(
                jdbc.query(
                        WORD_DECKS_SQL,
                        (rs, row) -> {
                            String source = rs.getString("source");
                            DeckRef ref = DeckRef.words(source);
                            return new DeckDtos.Deck(
                                    ref.id(),
                                    source == null ? "Unsorted" : source,
                                    DeckRef.Kind.WORDS.name(),
                                    rs.getInt("total"),
                                    rs.getInt("due"),
                                    rs.getInt("unseen"));
                        },
                        userId));

        return decks;
    }
}
