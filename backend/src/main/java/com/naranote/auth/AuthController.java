package com.naranote.auth;

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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Register, login, logout. Phase 1 only — no email confirmation yet (that's a
 * later phase), so accounts are usable the moment they're created.
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

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final SessionService sessionService;
    private final LoginRateLimiter rateLimiter;
    private final boolean cookieSecure;

    public AuthController(
            JdbcTemplate jdbc,
            BCryptPasswordEncoder passwordEncoder,
            SessionService sessionService,
            LoginRateLimiter rateLimiter,
            @Value("${naranote.cookie-secure:false}") boolean cookieSecure) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.sessionService = sessionService;
        this.rateLimiter = rateLimiter;
        this.cookieSecure = cookieSecure;
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

    private static String normalize(String email) {
        return email.trim().toLowerCase();
    }
}
