package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
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

import com.naranote.email.EmailService;
import com.naranote.user.CurrentUser;

/**
 * Unit-level, not a slice test — JdbcTemplate is mocked rather than hitting a real Postgres,
 * same reasoning as {@code NaraNoteApplicationTests} being the one test that needs a live
 * database. Covers exactly the properties a login endpoint has to get right: same response
 * for "no such account" and "wrong password" (no account-existence leak), the rate limiter
 * actually being consulted, and the session cookie actually being marked HttpOnly/SameSite —
 * plus the verify/resend/forgot/reset endpoints added alongside email verification.
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    private static final String EMAIL = "person@example.com";

    @Mock private JdbcTemplate jdbc;
    @Mock private LoginRateLimiter rateLimiter;
    @Mock private EmailVerificationService emailVerificationService;
    @Mock private PasswordResetService passwordResetService;
    @Mock private EmailService emailService;
    @Mock private CurrentUser currentUser;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private AuthController controller;

    @BeforeEach
    void setUp() {
        controller =
                new AuthController(
                        jdbc,
                        passwordEncoder,
                        new SessionService(jdbc),
                        rateLimiter,
                        false,
                        emailVerificationService,
                        passwordResetService,
                        emailService,
                        currentUser);
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

    @Test
    void verify_invalidOrExpiredToken_throws400() {
        when(emailVerificationService.consume("bad-token")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.verify(new AuthController.TokenRequest("bad-token"), request()))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(400));
    }

    @Test
    void verify_validToken_succeedsWithoutThrowing() {
        when(emailVerificationService.consume("good-token")).thenReturn(Optional.of(1L));

        controller.verify(new AuthController.TokenRequest("good-token"), request());
        // No exception is the assertion — consume() itself is what flips email_verified.
    }

    @Test
    void resendVerification_alreadyVerified_sendsNothing() {
        when(currentUser.id()).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(1L)))
                .thenReturn(List.<Object[]>of(new Object[] {EMAIL, true}));

        controller.resendVerification(request());

        verify(emailService, never()).sendVerificationEmail(any(), any(), any());
    }

    @Test
    void resendVerification_unverified_reissuesTokenAndSendsEmail() {
        when(currentUser.id()).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(1L)))
                .thenReturn(List.<Object[]>of(new Object[] {EMAIL, false}));
        when(emailVerificationService.issue(1L)).thenReturn("fresh-token");

        controller.resendVerification(request());

        verify(emailService).sendVerificationEmail(EMAIL, EMAIL, "fresh-token");
    }

    @Test
    void forgotPassword_unknownEmail_sendsNothing_soItCannotConfirmTheAccountExists() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(EMAIL))).thenReturn(List.of());

        controller.forgotPassword(new AuthController.ForgotPasswordRequest(EMAIL), request());

        verify(emailService, never()).sendPasswordResetEmail(any(), any(), any());
    }

    @Test
    void forgotPassword_unclaimedAccount_sendsNothing() {
        // The seeded local user before ClaimLocalAccountRunner: a row exists but has no
        // password yet, so there's nothing a reset link could usefully change.
        when(jdbc.query(anyString(), any(RowMapper.class), eq(EMAIL)))
                .thenReturn(List.<Object[]>of(new Object[] {1L, null}));

        controller.forgotPassword(new AuthController.ForgotPasswordRequest(EMAIL), request());

        verify(emailService, never()).sendPasswordResetEmail(any(), any(), any());
    }

    @Test
    void forgotPassword_knownAccount_sendsResetEmail() {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(EMAIL)))
                .thenReturn(List.<Object[]>of(new Object[] {1L, "some-hash"}));
        when(passwordResetService.issue(1L)).thenReturn("reset-token");

        controller.forgotPassword(new AuthController.ForgotPasswordRequest(EMAIL), request());

        verify(emailService).sendPasswordResetEmail(EMAIL, EMAIL, "reset-token");
    }

    @Test
    void resetPassword_invalidOrExpiredToken_throws400() {
        when(passwordResetService.consume("bad-token")).thenReturn(Optional.empty());

        assertThatThrownBy(
                        () ->
                                controller.resetPassword(
                                        new AuthController.ResetPasswordRequest("bad-token", "new-password-1"),
                                        request()))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(400));

        verify(jdbc, never()).update(anyString(), any(), anyLong());
    }

    @Test
    void resetPassword_validToken_updatesPasswordAndSignsOutEverySession() {
        when(passwordResetService.consume("good-token")).thenReturn(Optional.of(1L));

        controller.resetPassword(
                new AuthController.ResetPasswordRequest("good-token", "new-password-1"), request());

        verify(jdbc).update(anyString(), any(), eq(1L));
        // revokeAllForUser runs on the real SessionService against the mocked jdbc — this is
        // the one query it issues, keyed by user id rather than a token.
        verify(jdbc).update("delete from app_session where user_id = ?", 1L);
    }

    @Test
    void deleteAccount_wrongPassword_is403_andDeletesNothing() {
        when(currentUser.id()).thenReturn(7L);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(7L)))
                .thenReturn(List.of(passwordEncoder.encode("correct-horse-battery")));

        MockHttpServletResponse response = response();
        assertThatThrownBy(
                        () ->
                                controller.deleteAccount(
                                        new AuthController.DeleteAccountRequest("wrong-password"),
                                        request(),
                                        response))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        // Not 401: the session is valid, and the client reads 401 as signed out.
                        e -> assertThat(e.getStatusCode().value()).isEqualTo(403));

        verify(jdbc, never()).update("delete from app_user where id = ?", 7L);
        assertThat(response.getHeader("Set-Cookie")).isNull();
    }

    @Test
    void deleteAccount_correctPassword_deletesTheUserRow_andClearsTheCookie() {
        when(currentUser.id()).thenReturn(7L);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(7L)))
                .thenReturn(List.of(passwordEncoder.encode("correct-horse-battery")));

        MockHttpServletResponse response = response();
        controller.deleteAccount(
                new AuthController.DeleteAccountRequest("correct-horse-battery"), request(), response);

        // One statement: everything the user owns cascades from app_user.
        verify(jdbc).update("delete from app_user where id = ?", 7L);
        assertThat(response.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    void deleteAccount_consultsTheRateLimiterBeforeCheckingThePassword() {
        MockHttpServletRequest req = request();
        req.setRemoteAddr("203.0.113.9");
        doThrow(tooManyRequests()).when(rateLimiter).check("203.0.113.9");

        assertThatThrownBy(
                        () ->
                                controller.deleteAccount(
                                        new AuthController.DeleteAccountRequest("whatever"), req, response()))
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
