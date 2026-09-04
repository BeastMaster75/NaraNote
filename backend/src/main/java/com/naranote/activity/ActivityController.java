package com.naranote.activity;

import com.naranote.user.CurrentUser;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The record behind the calendar: characters drawn and characters added, per day.
 *
 * <p>Deliberately a record and not a to-do list. There are no streaks and nothing
 * carries forward — an activity view fills itself in from what you did, where a
 * chore tracker asks you to keep it fed.
 */
@RestController
@RequestMapping("/api/activity")
public class ActivityController {

    private static final String SQL =
            """
            select day, sum(drawn)::int as drawn, sum(reviewed)::int as reviewed,
                   sum(added)::int as added
            from (
                select attempted_at::date as day, count(*) as drawn, 0 as reviewed, 0 as added
                from kanji_attempt
                where user_id = ? and attempted_at >= ? and attempted_at < ?
                group by 1
                union all
                select attempted_at::date as day, 0 as drawn, count(*) as reviewed, 0 as added
                from vocab_attempt
                where user_id = ? and attempted_at >= ? and attempted_at < ?
                group by 1
                union all
                select added_at::date as day, 0 as drawn, 0 as reviewed, count(*) as added
                from kanji_library
                where user_id = ? and added_at >= ? and added_at < ?
                group by 1
                union all
                select created_at::date as day, 0 as drawn, 0 as reviewed, count(*) as added
                from vocab_item
                where user_id = ? and created_at >= ? and created_at < ?
                group by 1
            ) t
            group by day
            order by day
            """;

    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;

    public ActivityController(JdbcTemplate jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<ActivityDay> month(
            @RequestParam(required = false)
                    @DateTimeFormat(pattern = "yyyy-MM")
                    YearMonth month) {
        YearMonth target = month == null ? YearMonth.now() : month;
        var zone = ZoneId.systemDefault();
        var from = java.sql.Timestamp.from(target.atDay(1).atStartOfDay(zone).toInstant());
        var to =
                java.sql.Timestamp.from(
                        target.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant());
        long userId = currentUser.id();

        return jdbc.query(
                SQL,
                (rs, row) ->
                        new ActivityDay(
                                rs.getObject("day", LocalDate.class),
                                rs.getInt("drawn"),
                                rs.getInt("reviewed"),
                                rs.getInt("added")),
                userId, from, to,
                userId, from, to,
                userId, from, to,
                userId, from, to);
    }
}
