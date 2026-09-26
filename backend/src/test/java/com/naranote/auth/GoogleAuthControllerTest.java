package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.naranote.auth.GoogleOAuthClient.GoogleIdentity;
import java.time.Instant;
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

/**
 * The callback's CSRF check, and each branch of what a Google sign-in does depending on who is
 * already here. JdbcTemplate is mocked, as in {@link AuthControllerTest}.
 */
@ExtendWith(MockitoExtension.class)
class GoogleAuthControllerTest {

    private static final String BY_SUB = "select id from app_user where google_sub = ?";
    private static final String BY_EMAIL = "select id from app_user where lower(email) = lower(?)";
    private static final GoogleIdentity AYA = new GoogleIdentity("sub-1", "aya@gmail.com", true, "Aya", null);

    @Mock private GoogleOAuthClient google;
    @Mock private JdbcTemplate jdbc;
    @Mock private SessionService sessionService;
    @Mock private LoginRateLimiter rateLimiter;

    private GoogleAuthController controller;

    @BeforeEach
    void setUp() {
        controller =
                new GoogleAuthController(
                        google, jdbc, sessionService, new SessionCookie(false), rateLimiter, false,
                        "http://localhost:5173");
    }

    @Test
    void start_whenNotConfigured_goesBackToLogin() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.start(response);

        assertThat(response.getHeader("Location")).isEqualTo("http://localhost:5173/welcome?google=disabled");
    }

    @Test
    void start_setsTheStateCookie_andSendsItToGoogle() {
        when(google.enabled()).thenReturn(true);
        when(google.authorizationUrl(anyString())).thenAnswer(a -> "https://google/?state=" + a.getArgument(0));

        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.start(response);

        String cookie = response.getHeader("Set-Cookie");
        String state = cookie.substring(cookie.indexOf('=') + 1, cookie.indexOf(';'));
        assertThat(cookie).startsWith(GoogleAuthController.STATE_COOKIE).contains("HttpOnly").contains("SameSite=Lax");
        assertThat(response.getHeader("Location")).isEqualTo("https://google/?state=" + state);
    }

    @Test
    void callback_withMismatchedState_neverTalksToGoogle() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.callback("code", "attacker-state", null, "real-state", null, new MockHttpServletRequest(), response);

        verify(google, never()).exchange(any());
        assertThat(response.getHeader("Location")).endsWith("/welcome?google=failed");
    }

    @Test
    void callback_withNoStateCookie_isRejected() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.callback("code", "state", null, null, null, new MockHttpServletRequest(), response);

        verify(google, never()).exchange(any());
        assertThat(response.getHeader("Location")).endsWith("/welcome?google=failed");
    }

    @Test
    void callback_success_signsInAndGoesHome() {
        when(google.exchange("code")).thenReturn(AYA);
        when(sessionService.lookup(null)).thenReturn(Optional.empty());
        found(BY_SUB, AYA.sub(), 9L);
        found(BY_EMAIL, AYA.email());
        when(sessionService.issue(9L)).thenReturn("new-session");

        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.callback("code", "s", null, "s", null, new MockHttpServletRequest(), response);

        assertThat(response.getHeader("Location")).isEqualTo("http://localhost:5173/");
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(c -> c.startsWith("naranote_session=new-session"));
    }

    @Test
    void callback_refusedForAGuest_goesBackToSettings() {
        SessionService.Session session = guest(42L);
        when(sessionService.lookup("guest-token")).thenReturn(Optional.of(session));
        when(google.exchange("code")).thenReturn(AYA);
        found(BY_SUB, AYA.sub(), 9L);
        found(BY_EMAIL, AYA.email(), 9L);

        MockHttpServletResponse response = new MockHttpServletResponse();
        controller.callback("code", "s", null, "s", "guest-token", new MockHttpServletRequest(), response);

        assertThat(response.getHeader("Location")).isEqualTo("http://localhost:5173/settings?google=exists");
        verify(sessionService, never()).revoke(any());
    }

    @Test
    void linkedGoogleAccount_signsIn() {
        found(BY_SUB, AYA.sub(), 9L);
        found(BY_EMAIL, AYA.email(), 9L);

        assertThat(controller.signIn(AYA, Optional.empty()).userId()).isEqualTo(9L);
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void newGoogleAccount_isCreatedVerified() {
        found(BY_SUB, AYA.sub());
        found(BY_EMAIL, AYA.email());
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq("Aya"), eq("aya@gmail.com"), eq(true), eq("sub-1")))
                .thenReturn(11L);

        assertThat(controller.signIn(AYA, Optional.empty()).userId()).isEqualTo(11L);
    }

    @Test
    void existingPasswordAccount_isLinked_whenGoogleVouchesForTheAddress() {
        found(BY_SUB, AYA.sub());
        found(BY_EMAIL, AYA.email(), 5L);

        assertThat(controller.signIn(AYA, Optional.empty()).userId()).isEqualTo(5L);
        verify(jdbc).update("update app_user set google_sub = ?, email_verified = true where id = ?", "sub-1", 5L);
    }

    @Test
    void existingAccount_isNotLinked_onANonAuthoritativeAddress() {
        GoogleIdentity other = new GoogleIdentity("sub-2", "me@example.com", true, "Me", null);
        found(BY_SUB, other.sub());
        found(BY_EMAIL, other.email(), 5L);

        GoogleAuthController.Outcome outcome = controller.signIn(other, Optional.empty());

        assertThat(outcome.userId()).isNull();
        assertThat(outcome.refusal()).isEqualTo("taken");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void guest_becomesTheGoogleAccount_keepingTheirRow() {
        found(BY_SUB, AYA.sub());
        found(BY_EMAIL, AYA.email());

        assertThat(controller.signIn(AYA, Optional.of(guest(42L))).userId()).isEqualTo(42L);
        verify(jdbc).update(anyString(), eq("sub-1"), eq("aya@gmail.com"), eq(true), eq(42L));
    }

    @Test
    void guest_isNotSwallowedByAnExistingGoogleAccount() {
        found(BY_SUB, AYA.sub(), 9L);
        found(BY_EMAIL, AYA.email(), 9L);

        GoogleAuthController.Outcome outcome = controller.signIn(AYA, Optional.of(guest(42L)));

        assertThat(outcome.refusal()).isEqualTo("exists");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void guest_cannotTakeAnAddressAnotherAccountHolds() {
        found(BY_SUB, AYA.sub());
        found(BY_EMAIL, AYA.email(), 5L);

        assertThat(controller.signIn(AYA, Optional.of(guest(42L))).refusal()).isEqualTo("taken");
    }

    private static SessionService.Session guest(long id) {
        return new SessionService.Session(id, true, true, Instant.now());
    }

    @SuppressWarnings("unchecked")
    private void found(String sql, String value, Long... ids) {
        when(jdbc.query(eq(sql), any(RowMapper.class), eq(value))).thenReturn(List.of(ids));
    }
}
