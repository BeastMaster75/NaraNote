package com.naranote.auth;

import com.naranote.email.EmailService;
import com.naranote.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Register, login, logout, account deletion, and the two token-mailing flows that hang off them: email
 * verification (new accounts start {@code email_verified = false} and are gated out of the
 * rest of the app by {@link SessionInterceptor} until they click the link) and forgot/reset
 * password.
 *
 * <p>Logs which email attempted what, and whether it succeeded — never the
 * password. {@link com.naranote.logging.RequestLoggingInterceptor} already
 * logs every request generically (method, path, status); this fills in the
 * "which account" detail that a generic access log can't safely infer from a
 * request body that might contain a password.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    static final String COOKIE_NAME = "naranote_session";
    private static final Duration COOKIE_MAX_AGE = Duration.ofDays(30);

    public record Credentials(
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 8, max = 200) String password) {}

    public record TokenRequest(@NotBlank String token) {}

    public record ForgotPasswordRequest(@NotBlank @Email @Size(max = 200) String email) {}

    public record ResetPasswordRequest(
            @NotBlank String token, @NotBlank @Size(min = 8, max = 200) String newPassword) {}

    public record DeleteAccountRequest(@NotBlank @Size(max = 200) String password) {}

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final SessionService sessionService;
    private final LoginRateLimiter rateLimiter;
    private final boolean cookieSecure;
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;
    private final EmailService emailService;
    private final CurrentUser currentUser;

    public AuthController(
            JdbcTemplate jdbc,
            BCryptPasswordEncoder passwordEncoder,
            SessionService sessionService,
            LoginRateLimiter rateLimiter,
            @Value("${naranote.cookie-secure:false}") boolean cookieSecure,
            EmailVerificationService emailVerificationService,
            PasswordResetService passwordResetService,
            EmailService emailService,
            CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.sessionService = sessionService;
        this.rateLimiter = rateLimiter;
        this.cookieSecure = cookieSecure;
        this.emailVerificationService = emailVerificationService;
        this.passwordResetService = passwordResetService;
        this.emailService = emailService;
        this.currentUser = currentUser;
    }

    @PostMapping("/register")
    @Transactional
    public void register(
            @Valid @RequestBody Credentials request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        String email = normalize(request.email());
        Boolean exists =
                jdbc.queryForObject(
                        "select exists(select 1 from app_user where lower(email) = ?)",
                        Boolean.class,
                        email);
        if (Boolean.TRUE.equals(exists)) {
            log.warn("Registration attempt for already-registered email: {}", email);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already registered");
        }

        Long userId =
                jdbc.queryForObject(
                        """
                        insert into app_user (display_name, email, password_hash)
                        values (?, ?, ?)
                        returning id
                        """,
                        Long.class,
                        email,
                        email,
                        passwordEncoder.encode(request.password()));

        log.info("Registered new account: user={} email={}", userId, email);
        // Best-effort: EmailService swallows and logs delivery failures rather than throwing,
        // so a broken mail transport doesn't roll back an otherwise-successful registration —
        // the account exists either way and resendVerification() covers a first send that
        // never arrived.
        emailService.sendVerificationEmail(email, email, emailVerificationService.issue(userId));
        setSessionCookie(sessionService.issue(userId), response);
    }

    @PostMapping("/login")
    public void login(
            @Valid @RequestBody Credentials request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        String email = normalize(request.email());
        List<Object[]> rows =
                jdbc.query(
                        "select id, password_hash from app_user where lower(email) = ?",
                        (rs, row) -> new Object[] {rs.getLong("id"), rs.getString("password_hash")},
                        email);

        if (rows.isEmpty()) {
            // Same message and same log detail as a wrong password below — not
            // distinguishing "no such account" from "wrong password" avoids
            // letting either the response or the log confirm which emails have
            // an account here.
            log.warn("Login failed: {}", email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password");
        }
        String storedHash = (String) rows.getFirst()[1];
        if (storedHash == null || !passwordEncoder.matches(request.password(), storedHash)) {
            log.warn("Login failed: {}", email);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password");
        }

        long userId = (long) rows.getFirst()[0];
        log.info("Login succeeded: user={} email={}", userId, email);
        setSessionCookie(sessionService.issue(userId), response);
    }

    @PostMapping("/logout")
    public void logout(
            @CookieValue(name = COOKIE_NAME, required = false) String token,
            HttpServletResponse response) {
        sessionService.resolve(token).ifPresent(userId -> log.info("Logout: user={}", userId));
        sessionService.revoke(token);
        clearSessionCookie(response);
    }

    /**
     * Deletes the signed-in account and everything it owns. Every table holding a user's data
     * references {@code app_user} with {@code on delete cascade} — collection, sentences, review
     * state and history, tasks, sessions, pending email tokens — so the one delete below is the
     * whole erasure, and it is atomic. Shared caches ({@code tts_audio}, keyed by reading, not
     * by user) and the reference data are not personal and stay.
     *
     * <p>Asks for the password even though the caller is signed in: a session left open on a
     * shared computer shouldn't be enough to destroy years of review history. 403 rather than
     * 401 on a wrong password, because the session itself is fine — a 401 would read to the
     * client as "you've been signed out". Rate-limited like login, since this is a password
     * check an attacker holding a stolen session could otherwise hammer.
     *
     * <p>Exempt from the email-verification gate (see {@link SessionInterceptor}): someone who
     * registered with a mistyped address must still be able to remove the account.
     */
    @DeleteMapping("/account")
    @Transactional
    public void deleteAccount(
            @Valid @RequestBody DeleteAccountRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse response) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        long userId = currentUser.id();
        List<String> hashes =
                jdbc.query(
                        "select password_hash from app_user where id = ?",
                        (rs, row) -> rs.getString("password_hash"),
                        userId);
        String storedHash = hashes.isEmpty() ? null : hashes.getFirst();
        if (storedHash == null || !passwordEncoder.matches(request.password(), storedHash)) {
            log.warn("Account deletion refused, wrong password: user={}", userId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Wrong password");
        }

        jdbc.update("delete from app_user where id = ?", userId);
        // The id only — logging the address would keep the one thing just erased.
        log.info("Account deleted: user={}", userId);
        clearSessionCookie(response);
    }

    /**
     * Confirms an address from the link mailed by register()/resendVerification(). Token-only
     * on purpose — the click may land in a different browser than the one that registered, so
     * this can't depend on a session cookie being present. Public in {@link SessionInterceptor}
     * for the same reason, and exempt from its verification gate so a signed-in-but-unverified
     * user clicking their own link (the common case) isn't blocked before reaching here.
     */
    @PostMapping("/verify")
    public void verify(@Valid @RequestBody TokenRequest request, HttpServletRequest httpRequest) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        long userId =
                emailVerificationService
                        .consume(request.token())
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "That verification link is invalid or has expired"));
        log.info("Email verified: user={}", userId);
    }

    /** Re-sends the verification email to whichever account the caller's session belongs to. */
    @PostMapping("/resend-verification")
    public void resendVerification(HttpServletRequest httpRequest) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        long userId = currentUser.id();
        List<Object[]> rows =
                jdbc.query(
                        "select email, email_verified from app_user where id = ?",
                        (rs, row) -> new Object[] {rs.getString("email"), rs.getBoolean("email_verified")},
                        userId);
        if (rows.isEmpty() || Boolean.TRUE.equals(rows.getFirst()[1])) {
            // Already verified (or, in principle, a vanished account) — nothing to resend.
            return;
        }

        String email = (String) rows.getFirst()[0];
        emailService.sendVerificationEmail(email, email, emailVerificationService.issue(userId));
        log.info("Resent verification email: user={}", userId);
    }

    /**
     * Always answers the same way whether or not the address has an account — the response
     * (and the UI built on it) must not become a way to check which emails are registered.
     * An account without a password yet (the unclaimed seeded local user, see
     * ClaimLocalAccountRunner) has nothing to reset either, so it's treated the same as
     * "no such account."
     */
    @PostMapping("/forgot-password")
    public void forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request, HttpServletRequest httpRequest) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        String email = normalize(request.email());
        List<Object[]> rows =
                jdbc.query(
                        "select id, password_hash from app_user where lower(email) = ?",
                        (rs, row) -> new Object[] {rs.getLong("id"), rs.getString("password_hash")},
                        email);

        if (rows.isEmpty() || rows.getFirst()[1] == null) {
            log.info("Password reset requested for unknown/unclaimed email: {}", email);
            return;
        }

        long userId = (long) rows.getFirst()[0];
        emailService.sendPasswordResetEmail(email, email, passwordResetService.issue(userId));
        log.info("Password reset email sent: user={}", userId);
    }

    /**
     * Token-only, like verify() — reached from an emailed link, not necessarily the browser
     * that's currently signed in as this (or any) account. Signs the account out everywhere
     * afterwards: a password reset is reason enough to distrust whatever sessions already
     * existed.
     */
    @PostMapping("/reset-password")
    public void resetPassword(
            @Valid @RequestBody ResetPasswordRequest request, HttpServletRequest httpRequest) {
        rateLimiter.check(httpRequest.getRemoteAddr());
        long userId =
                passwordResetService
                        .consume(request.token())
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "That reset link is invalid or has expired"));

        jdbc.update(
                "update app_user set password_hash = ? where id = ?",
                passwordEncoder.encode(request.newPassword()),
                userId);
        sessionService.revokeAllForUser(userId);
        log.info("Password reset: user={}", userId);
    }

    private void setSessionCookie(String token, HttpServletResponse response) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                ResponseCookie.from(COOKIE_NAME, token)
                        .httpOnly(true)
                        // Driven by naranote.cookie-secure — false for local dev, since
                        // Secure cookies are silently dropped by the browser over plain
                        // http; NARANOTE_COOKIE_SECURE=true in docker-compose.prod.yml
                        // turns it on for the real, https-served deployment.
                        .secure(cookieSecure)
                        .sameSite("Lax")
                        .path("/")
                        .maxAge(COOKIE_MAX_AGE)
                        .build()
                        .toString());
    }

    private void clearSessionCookie(HttpServletResponse response) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                ResponseCookie.from(COOKIE_NAME, "")
                        .httpOnly(true)
                        .secure(cookieSecure)
                        .sameSite("Lax")
                        .path("/")
                        .maxAge(0)
                        .build()
                        .toString());
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase();
    }
}
