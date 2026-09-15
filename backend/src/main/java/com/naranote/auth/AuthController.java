package com.naranote.auth;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.List;
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
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    static final String COOKIE_NAME = "naranote_session";
    private static final Duration COOKIE_MAX_AGE = Duration.ofDays(30);

    public record Credentials(
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 8, max = 200) String password) {}

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final SessionService sessionService;

    public AuthController(
            JdbcTemplate jdbc, BCryptPasswordEncoder passwordEncoder, SessionService sessionService) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.sessionService = sessionService;
    }

    @PostMapping("/register")
    @Transactional
    public void register(@Valid @RequestBody Credentials request, HttpServletResponse response) {
        String email = normalize(request.email());
        Boolean exists =
                jdbc.queryForObject(
                        "select exists(select 1 from app_user where lower(email) = ?)",
                        Boolean.class,
                        email);
        if (Boolean.TRUE.equals(exists)) {
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

        setSessionCookie(sessionService.issue(userId), response);
    }

    @PostMapping("/login")
    public void login(@Valid @RequestBody Credentials request, HttpServletResponse response) {
        String email = normalize(request.email());
        List<Object[]> rows =
                jdbc.query(
                        "select id, password_hash from app_user where lower(email) = ?",
                        (rs, row) -> new Object[] {rs.getLong("id"), rs.getString("password_hash")},
                        email);

        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password");
        }
        String storedHash = (String) rows.getFirst()[1];
        if (storedHash == null || !passwordEncoder.matches(request.password(), storedHash)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Wrong email or password");
        }

        long userId = (long) rows.getFirst()[0];
        setSessionCookie(sessionService.issue(userId), response);
    }

    @PostMapping("/logout")
    public void logout(
            @CookieValue(name = COOKIE_NAME, required = false) String token,
            HttpServletResponse response) {
        sessionService.revoke(token);
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                ResponseCookie.from(COOKIE_NAME, "")
                        .httpOnly(true)
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
                        // TODO: add .secure(true) once this is served over https — omitted
                        // now because local dev is plain http and Secure cookies are
                        // silently dropped by the browser over http.
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
