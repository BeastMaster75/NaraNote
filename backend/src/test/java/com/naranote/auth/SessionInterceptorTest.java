package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.naranote.user.CurrentUser;

/**
 * Covers the two-tier gate: no session is 401 on anything but the public auth paths, and a
 * resolved-but-unverified session is 403 on anything but the handful of paths an unverified
 * account still needs (checking {@code /api/me}, verifying, resending, logging out, resetting
 * a forgotten password). Guests have no address and pass the gate. Plus sliding renewal: the
 * cookie is re-sent exactly when the session was renewed.
 */
@ExtendWith(MockitoExtension.class)
class SessionInterceptorTest {

    private static final String TOKEN = "session-token";

    @Mock private SessionService sessionService;

    private SessionInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new SessionInterceptor(sessionService, new SessionCookie(false));
    }

    @Test
    void noSession_publicPath_isAllowedThrough() throws Exception {
        MockHttpServletRequest request = request("/api/auth/login", null);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void noSession_startingAGuest_isAllowedThrough() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request("/api/auth/guest", null), response, new Object())).isTrue();
    }

    @Test
    void noSession_protectedPath_isRejectedWith401() throws Exception {
        MockHttpServletRequest request = request("/api/decks", null);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void unverifiedSession_protectedPath_isRejectedWith403() throws Exception {
        session(false, false);

        MockHttpServletRequest request = request("/api/decks", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void unverifiedSession_exemptPath_isAllowedThrough() throws Exception {
        session(false, false);

        MockHttpServletRequest request = request("/api/me", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
        assertThat(request.getAttribute(CurrentUser.REQUEST_ATTRIBUTE)).isEqualTo(1L);
    }

    @Test
    void unverifiedSession_canStillDeleteTheAccount() throws Exception {
        // A mistyped address can never be verified; that account must still be removable.
        session(false, false);

        MockHttpServletRequest request = request("/api/auth/account", TOKEN);
        request.setMethod("DELETE");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request, response, new Object())).isTrue();
    }

    @Test
    void noSession_siteFacts_areReadable() throws Exception {
        // The privacy page is public, and it reads its contact address from here.
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertThat(interceptor.preHandle(request("/api/site", null), response, new Object())).isTrue();
    }

    @Test
    void verifiedSession_protectedPath_isAllowedThrough() throws Exception {
        session(false, true);

        MockHttpServletRequest request = request("/api/decks", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }

    @Test
    void guestSession_protectedPath_isAllowedThrough() throws Exception {
        // SessionService reports a guest as verified — there's no address to gate on.
        session(true, true);

        assertThat(interceptor.preHandle(request("/api/decks", TOKEN), new MockHttpServletResponse(), new Object()))
                .isTrue();
    }

    @Test
    void renewedSession_reSendsTheCookieWithTheFullLifetime() throws Exception {
        SessionService.Session session = session(true, true);
        when(sessionService.renewIfDue(TOKEN, session)).thenReturn(true);

        MockHttpServletResponse response = new MockHttpServletResponse();
        interceptor.preHandle(request("/api/decks", TOKEN), response, new Object());

        assertThat(response.getHeader("Set-Cookie"))
                .contains(TOKEN)
                .contains("Max-Age=" + SessionService.GUEST_LIFETIME.toSeconds());
    }

    @Test
    void sessionNotDueForRenewal_sendsNoCookie() throws Exception {
        SessionService.Session session = session(false, true);
        when(sessionService.renewIfDue(TOKEN, session)).thenReturn(false);

        MockHttpServletResponse response = new MockHttpServletResponse();
        interceptor.preHandle(request("/api/decks", TOKEN), response, new Object());

        assertThat(response.getHeader("Set-Cookie")).isNull();
    }

    @Test
    void rejectedSession_isNeverRenewed() throws Exception {
        session(false, false);

        interceptor.preHandle(request("/api/decks", TOKEN), new MockHttpServletResponse(), new Object());

        verify(sessionService, never()).renewIfDue(anyString(), any());
    }

    private SessionService.Session session(boolean guest, boolean verified) {
        SessionService.Session session = new SessionService.Session(1L, guest, verified, Instant.now());
        when(sessionService.lookup(TOKEN)).thenReturn(Optional.of(session));
        return session;
    }

    private static MockHttpServletRequest request(String uri, String sessionCookie) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
        request.setRequestURI(uri);
        if (sessionCookie != null) {
            request.setCookies(new Cookie(AuthController.COOKIE_NAME, sessionCookie));
        }
        return request;
    }
}
