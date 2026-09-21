package com.naranote.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Issues and resolves opaque session tokens. Only a token's SHA-256 hash is
 * ever stored — a database leak alone shouldn't hand out usable sessions, the
 * same reasoning as storing a password hash rather than the password.
 */
@Service
public class SessionService {

    private static final int TOKEN_BYTES = 32;
    private static final int SESSION_DAYS = 30;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public SessionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Creates a session and returns the raw token — the only time it's ever visible. */
    public String issue(long userId) {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        jdbc.update(
                "insert into app_session (user_id, token_hash, expires_at) values (?, ?, ?)",
                userId,
                hash(token),
                Timestamp.from(Instant.now().plus(SESSION_DAYS, ChronoUnit.DAYS)));

        return token;
    }

    /** Empty when the token is missing, unknown, or expired. */
    public Optional<Long> resolve(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        List<Long> found =
                jdbc.query(
                        "select user_id from app_session where token_hash = ? and expires_at > now()",
                        (rs, row) -> rs.getLong("user_id"),
                        hash(rawToken));
        return found.stream().findFirst();
    }

    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        jdbc.update("delete from app_session where token_hash = ?", hash(rawToken));
    }

    /**
     * Signs the account out everywhere, not just the current device — used after a password
     * reset, since the reset itself is evidence the old password (and anything logged in with
     * it) may not have been trustworthy.
     */
    public void revokeAllForUser(long userId) {
        jdbc.update("delete from app_session where user_id = ?", userId);
    }

    private static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed present on every JVM; this can't actually happen.
            throw new IllegalStateException(e);
        }
    }
}
