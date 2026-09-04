package com.naranote.task;

import com.naranote.task.TaskDtos.Suggestion;
import com.naranote.user.CurrentUser;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Prompts computed from the library and review tables.
 *
 * <p>Nothing here is stored, and nothing can be ticked off. Each one exists only
 * while its condition holds — practise the due cards and "4 due" simply stops
 * appearing. That is the difference between this and a to-do list: you cannot
 * fall behind on it, because it is a view of the present rather than a record of
 * an intention.
 */
@Service
public class SuggestionService {

    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;

    public SuggestionService(JdbcTemplate jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<Suggestion> suggestions() {
        long userId = currentUser.id();
        List<Suggestion> out = new ArrayList<>();

        int due =
                count(
                        """
                        select count(*) from kanji_library l
                        left join kanji_review r on r.user_id = l.user_id and r.literal = l.literal
                        where l.user_id = ? and (r.due is null or r.due <= now())
                        """,
                        userId);
        if (due > 0) {
            out.add(
                    new Suggestion(
                            "DUE",
                            "Practise " + due + (due == 1 ? " character" : " characters"),
                            "Scheduled for now",
                            due,
                            "/write"));
        }

        int wordsDue =
                count(
                        """
                        select count(*) from vocab_item v
                        left join vocab_review r on r.vocab_id = v.id
                        where v.user_id = ? and (r.due is null or r.due <= now())
                        """,
                        userId);
        if (wordsDue > 0) {
            out.add(
                    new Suggestion(
                            "WORDS_DUE",
                            "Review " + wordsDue + (wordsDue == 1 ? " word" : " words"),
                            "Scheduled for now",
                            wordsDue,
                            "/review"));
        }

        int untouched =
                count(
                        """
                        select count(*) from kanji_library l
                        left join kanji_review r on r.user_id = l.user_id and r.literal = l.literal
                        where l.user_id = ? and r.literal is null
                        """,
                        userId);
        if (untouched > 0) {
            out.add(
                    new Suggestion(
                            "UNTOUCHED",
                            untouched + " never practised",
                            "Added but never written once",
                            untouched,
                            "/write"));
        }

        // Characters failed more than once recently: the ones actually costing you.
        int struggling =
                count(
                        """
                        select count(*) from (
                            select literal from kanji_attempt
                            where user_id = ? and rating = 'AGAIN'
                              and attempted_at > now() - interval '30 days'
                            group by literal having count(*) >= 2
                        ) s
                        """,
                        userId);
        if (struggling > 0) {
            out.add(
                    new Suggestion(
                            "STRUGGLING",
                            struggling + (struggling == 1 ? " keeps" : " keep") + " catching you out",
                            "Failed twice or more this month",
                            struggling,
                            "/collection"));
        }

        int emptyLibrary =
                count("select count(*) from kanji_library where user_id = ?", userId);
        if (emptyLibrary == 0) {
            out.add(
                    new Suggestion(
                            "EMPTY",
                            "Add your first kanji",
                            "Find one on the kanji page to start",
                            0,
                            "/kanji"));
        }

        return out;
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }
}
