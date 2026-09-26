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
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    // The conflict thrown by promotePendingEmail must not undo the cleanup it just did.
    @Transactional(noRollbackFor = ResponseStatusException.class)
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
        promotePendingEmail(userId);
        jdbc.update("update app_user set email_verified = true where id = ?", userId);
        jdbc.update("delete from email_verification_token where user_id = ?", userId);
        return Optional.of(userId);
    }

    /**
     * For a guest saving their collection (see {@code AuthController.upgrade}), the click is what
     * turns the guest into an account: the pending address becomes the account's email. Someone
     * else may have registered that address since the link was sent — then the save is abandoned
     * rather than failing on the unique index, and the guest stays a guest with their collection
     * intact.
     */
    private void promotePendingEmail(long userId) {
        List<String> pending =
                jdbc.query(
                        "select pending_email from app_user where id = ? and pending_email is not null",
                        (rs, row) -> rs.getString("pending_email"),
                        userId);
        if (pending.isEmpty()) {
            return;
        }
        String email = pending.getFirst();
        Boolean taken =
                jdbc.queryForObject(
                        "select exists(select 1 from app_user where lower(email) = lower(?) and id <> ?)",
                        Boolean.class,
                        email,
                        userId);
        if (Boolean.TRUE.equals(taken)) {
            jdbc.update(
                    "update app_user set pending_email = null, password_hash = null where id = ?", userId);
            jdbc.update("delete from email_verification_token where user_id = ?", userId);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }
        jdbc.update(
                """
                update app_user
                   set email = pending_email, pending_email = null, is_guest = false
                 where id = ?
                """,
                userId);
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
