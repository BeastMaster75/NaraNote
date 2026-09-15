package com.naranote.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * One-off: turns the seeded local account (id=1) into a real one, run explicitly:
 *
 * <pre>
 * NARANOTE_CLAIM_EMAIL=you@example.com NARANOTE_CLAIM_PASSWORD=... \
 *   ./mvnw spring-boot:run -Dspring-boot.run.arguments=--claim-local-account
 * </pre>
 *
 * <p>Read from the environment rather than as CLI args, so the password
 * doesn't land in shell history or show up in a process list. Existing data
 * (kanji library, review history, tasks) stays put — this only sets email and
 * password_hash on the row that data already points to.
 */
@Component
public class ClaimLocalAccountRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ClaimLocalAccountRunner.class);
    private static final long LOCAL_USER_ID = 1L;

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final ConfigurableApplicationContext context;

    public ClaimLocalAccountRunner(
            JdbcTemplate jdbc,
            BCryptPasswordEncoder passwordEncoder,
            ConfigurableApplicationContext context) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption("claim-local-account")) {
            return;
        }

        String email = System.getenv("NARANOTE_CLAIM_EMAIL");
        String password = System.getenv("NARANOTE_CLAIM_PASSWORD");
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            log.error(
                    "Set NARANOTE_CLAIM_EMAIL and NARANOTE_CLAIM_PASSWORD before running --claim-local-account");
            System.exit(SpringApplication.exit(context, () -> 1));
            return;
        }

        int rows =
                jdbc.update(
                        "update app_user set email = ?, password_hash = ? where id = ?",
                        email.trim().toLowerCase(),
                        passwordEncoder.encode(password),
                        LOCAL_USER_ID);

        log.info(rows > 0 ? "Local account claimed." : "No local account (id=1) found — nothing changed.");
        System.exit(SpringApplication.exit(context, () -> 0));
    }
}
