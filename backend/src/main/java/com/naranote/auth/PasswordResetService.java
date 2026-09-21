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
 * Issues and consumes the opaque tokens mailed out for "forgot password" — same
 * hashed-token-at-rest shape as {@link SessionService} and {@link EmailVerificationService},
 * with a shorter TTL than either because a live reset link is the most sensitive of the three:
 * anyone who opens it can take over the account.
 *
 * <p>Unlike {@link EmailVerificationService#consume}, consuming a reset token here does not
 * itself change anything about the account — it only proves the token was valid and burns it.
 * {@code AuthController.resetPassword} does the actual password update, since it needs the new
 * password too and this service has no reason to know about password hashing.
 */
@Service
public class PasswordResetService {

    private static final int TOKEN_BYTES = 32;
    private static final int TOKEN_TTL_MINUTES = 60;

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Creates a token and returns the raw value — the only time it's ever visible. Replaces
     * any token already outstanding for this user, so requesting a second reset link kills the
     * first (an old, still-live link sitting in an inbox shouldn't outlive the request that
     * superseded it).
     */
    @Transactional
    public String issue(long userId) {
        jdbc.update("delete from password_reset_token where user_id = ?", userId);

        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        jdbc.update(
                "insert into password_reset_token (user_id, token_hash, expires_at) values (?, ?, ?)",
                userId,
                hash(token),
                Timestamp.from(Instant.now().plus(TOKEN_TTL_MINUTES, ChronoUnit.MINUTES)));

        return token;
    }

    /** Burns the token so it can't be replayed. Empty when missing, unknown, or expired. */
    @Transactional
    public Optional<Long> consume(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        List<Long> found =
                jdbc.query(
                        "select user_id from password_reset_token"
                                + " where token_hash = ? and expires_at > now()",
                        (rs, row) -> rs.getLong("user_id"),
                        hash(rawToken));
        if (found.isEmpty()) {
            return Optional.empty();
        }

        long userId = found.getFirst();
        jdbc.update("delete from password_reset_token where user_id = ?", userId);
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
