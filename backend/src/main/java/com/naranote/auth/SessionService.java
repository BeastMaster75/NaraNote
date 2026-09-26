package com.naranote.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
 *
 * <p>Sessions slide: {@link SessionInterceptor} renews one at most once a day while it's in use,
 * so only a session left idle for its whole lifetime ends. A guest's is much longer than an
 * account's because the cookie is a guest's only key — when it ends, the collection behind it is
 * unreachable, and {@link GuestCleanupJob} removes it.
 */
@Service
public class SessionService {

    private static final int TOKEN_BYTES = 32;
    static final Duration ACCOUNT_LIFETIME = Duration.ofDays(30);
    static final Duration GUEST_LIFETIME = Duration.ofDays(180);
    /** Renew once the session is this far into its lifetime — at most one write a day per user. */
    private static final Duration RENEW_AFTER = Duration.ofDays(1);

    /**
     * What the interceptor needs about a live session, in one query: who it is, whether the
     * account is past the email-verification gate (a guest, with no address, always is), and
     * when it expires.
     */
    public record Session(long userId, boolean guest, boolean verified, Instant expiresAt) {
        public Duration lifetime() {
            return guest ? GUEST_LIFETIME : ACCOUNT_LIFETIME;
        }
    }

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    public SessionService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Creates an account session and returns the raw token — the only time it's ever visible. */
    public String issue(long userId) {
        return issue(userId, false);
    }

    public String issue(long userId, boolean guest) {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        jdbc.update(
                "insert into app_session (user_id, token_hash, expires_at) values (?, ?, ?)",
                userId,
                hash(token),
                Timestamp.from(Instant.now().plus(guest ? GUEST_LIFETIME : ACCOUNT_LIFETIME)));

        return token;
    }

    /** Empty when the token is missing, unknown, or expired. */
    public Optional<Session> lookup(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        List<Session> found =
                jdbc.query(
                        """
                        select s.user_id, s.expires_at, u.is_guest,
                               (u.email is null or u.email_verified) as verified
                          from app_session s join app_user u on u.id = s.user_id
                         where s.token_hash = ? and s.expires_at > now()
                        """,
                        (rs, row) ->
                                new Session(
                                        rs.getLong("user_id"),
                                        rs.getBoolean("is_guest"),
                                        rs.getBoolean("verified"),
                                        rs.getTimestamp("expires_at").toInstant()),
                        hash(rawToken));
        return found.stream().findFirst();
    }

    /**
     * Pushes the session's expiry a full lifetime out if it's been at least a day since it was
     * last set. Returns true when it did, so the caller re-sends the cookie with a matching
     * Max-Age — the browser drops the cookie on its own clock, whatever the database says.
     */
    public boolean renewIfDue(String rawToken, Session session) {
        Instant now = Instant.now();
        if (session.expiresAt().isAfter(now.plus(session.lifetime()).minus(RENEW_AFTER))) {
            return false;
        }
        jdbc.update(
                "update app_session set expires_at = ? where token_hash = ?",
                Timestamp.from(now.plus(session.lifetime())),
                hash(rawToken));
        return true;
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

    /** Ends the user's other sessions, keeping {@code keepToken}'s. Returns how many ended. */
    public int revokeOthers(long userId, String keepToken) {
        return jdbc.update(
                "delete from app_session where user_id = ? and token_hash <> ?",
                userId,
                keepToken == null ? "" : hash(keepToken));
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
