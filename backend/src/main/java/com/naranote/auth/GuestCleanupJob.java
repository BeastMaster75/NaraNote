package com.naranote.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nightly sweep of expired sessions, and of guests nobody can reach any more.
 *
 * <p>A guest's session is the only key to their collection. Once no live session is left — idle
 * for the guest lifetime ({@link SessionService#GUEST_LIFETIME}), or logged out — nobody can ever
 * open that notebook again, so the row (and, by cascade, everything in it) goes. The purge never
 * takes anything that was still reachable; it only collects what already wasn't. The one-day
 * grace keeps a guest mid-creation, whose session row isn't committed yet, out of it.
 */
@Configuration
@EnableScheduling
public class GuestCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(GuestCleanupJob.class);

    private final JdbcTemplate jdbc;

    public GuestCleanupJob(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 30 4 * * *")
    @Transactional
    public void sweep() {
        int sessions = jdbc.update("delete from app_session where expires_at <= now()");
        int guests =
                jdbc.update(
                        """
                        delete from app_user u
                         where u.is_guest
                           and u.created_at < now() - interval '1 day'
                           and not exists (select 1 from app_session s where s.user_id = u.id)
                        """);
        if (sessions > 0 || guests > 0) {
            log.info("Cleanup: removed {} expired sessions, {} unreachable guests", sessions, guests);
        }
    }
}
