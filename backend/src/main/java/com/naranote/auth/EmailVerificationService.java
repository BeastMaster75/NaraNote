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
import org.springframework.transaction.annotation.Transactional;

/**
 * Issues and consumes the opaque tokens mailed to a new account to prove it owns the address
 * it registered with — same hashed-token-at-rest approach as {@link SessionService}, for the
 * same reason: a DB leak alone shouldn't hand out a working verification link.
 */
@Service
public class EmailVerificationService {

    private static final int TOKEN_BYTES = 32;
    private static final int TOKEN_TTL_HOURS = 24;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public EmailVerificationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates a token and returns the raw value — the only time it's ever visible. Replaces
     * any token already outstanding for this user, so an older email's link stops working the
     * moment a new one is sent.
     */
    @Transactional
    public String issue(long userId) {
        jdbc.update("delete from email_verification_token where user_id = ?", userId);

        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        jdbc.update(
                "insert into email_verification_token (user_id, token_hash, expires_at) values (?, ?, ?)",
                userId,
                hash(token),
                Timestamp.from(Instant.now().plus(TOKEN_TTL_HOURS, ChronoUnit.HOURS)));

        return token;
    }

    /**
     * Marks the owning account verified and burns the token so the link can't be replayed.
     * Empty when the token is missing, unknown, or expired.
     */
    @Transactional
    public Optional<Long> consume(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        List<Long> found =
                jdbc.query(
                        "select user_id from email_verification_token"
                                + " where token_hash = ? and expires_at > now()",
                        (rs, row) -> rs.getLong("user_id"),
                        hash(rawToken));
        if (found.isEmpty()) {
            return Optional.empty();
        }

        long userId = found.getFirst();
        jdbc.update("update app_user set email_verified = true where id = ?", userId);
        jdbc.update("delete from email_verification_token where user_id = ?", userId);
        return Optional.of(userId);
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
