package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

/**
 * Unit-level, not a slice test — JdbcTemplate is mocked rather than hitting a real Postgres,
 * same reasoning as {@code NaraNoteApplicationTests} being the one test that needs a live
 * database. Covers exactly the properties a login endpoint has to get right: same response
 * for "no such account" and "wrong password" (no account-existence leak), the rate limiter
 * actually being consulted, and the session cookie actually being marked HttpOnly/SameSite.
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    private static final String EMAIL = "person@example.com";

    @Mock private JdbcTemplate jdbc;
    @Mock private LoginRateLimiter rateLimiter;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private AuthController controller;

    @BeforeEach
    void setUp() {
        controller = new AuthController(jdbc, passwordEncoder, new SessionService(jdbc), rateLimiter, false);
    }

    @Test
    void login_wrongPassword_and_unknownEmail_giveTheSameOutcome() {
        String correctHash = passwordEncoder.encode("correct-horse-battery");
        mockLookup(List.<Object[]>of(new Object[] {1L, correctHash}));

        assertThatThrownBy(() -> controller.login(credentials("wrong-password"), request(), response()))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(401));

        mockLookup(List.of());

        assertThatThrownBy(() -> controller.login(credentials("anything"), request(), response()))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(401));
    }

    @Test
    void login_correctPassword_issuesAnHttpOnlySameSiteCookie() {
        String hash = passwordEncoder.encode("correct-horse-battery");
        mockLookup(List.<Object[]>of(new Object[] {1L, hash}));

        MockHttpServletResponse response = response();
        controller.login(credentials("correct-horse-battery"), request(), response);

        String cookie = response.getHeader("Set-Cookie");
        assertThat(cookie).contains("HttpOnly").contains("SameSite=Lax");
    }

    @Test
    void login_consultsTheRateLimiterBeforeTouchingTheDatabase() {
        MockHttpServletRequest req = request();
        req.setRemoteAddr("203.0.113.9");

        doThrow(tooManyRequests()).when(rateLimiter).check("203.0.113.9");

        assertThatThrownBy(() -> controller.login(credentials("whatever"), req, response()))
                .isInstanceOf(ResponseStatusException.class);

        verify(jdbc, never()).query(anyString(), any(RowMapper.class), any());
    }

    private void mockLookup(List<Object[]> rows) {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(EMAIL))).thenReturn(rows);
    }

    private static AuthController.Credentials credentials(String password) {
        return new AuthController.Credentials(EMAIL, password);
    }

    private static MockHttpServletRequest request() {
        return new MockHttpServletRequest();
    }

    private static MockHttpServletResponse response() {
        return new MockHttpServletResponse();
    }

    private static ResponseStatusException tooManyRequests() {
        return new ResponseStatusException(
                org.springframework.http.HttpStatus.TOO_MANY_REQUESTS, "Too many attempts.");
    }
}
