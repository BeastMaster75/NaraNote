package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.Cookie;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Covers the two-tier gate: no session is 401 on anything but the public auth paths, and a
 * resolved-but-unverified session is 403 on anything but the handful of paths an unverified
 * account still needs (checking {@code /api/me}, verifying, resending, logging out, resetting
 * a forgotten password).
 */
@ExtendWith(MockitoExtension.class)
class SessionInterceptorTest {

    private static final String TOKEN = "session-token";

    @Mock private SessionService sessionService;
    @Mock private JdbcTemplate jdbc;

    private SessionInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new SessionInterceptor(sessionService, jdbc);
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
    void noSession_protectedPath_isRejectedWith401() throws Exception {
        MockHttpServletRequest request = request("/api/decks", null);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void unverifiedSession_protectedPath_isRejectedWith403() throws Exception {
        when(sessionService.resolve(TOKEN)).thenReturn(Optional.of(1L));
        when(jdbc.queryForObject("select email_verified from app_user where id = ?", Boolean.class, 1L))
                .thenReturn(false);

        MockHttpServletRequest request = request("/api/decks", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void unverifiedSession_exemptPath_isAllowedThrough() throws Exception {
        when(sessionService.resolve(TOKEN)).thenReturn(Optional.of(1L));
        // No email_verified stub here on purpose: an exempt path must short-circuit before
        // ever consulting it — asserting that by never telling the mock what to answer.

        MockHttpServletRequest request = request("/api/me", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }

    @Test
    void unverifiedSession_canStillDeleteTheAccount() throws Exception {
        // A mistyped address can never be verified; that account must still be removable.
        when(sessionService.resolve(TOKEN)).thenReturn(Optional.of(1L));

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
        when(sessionService.resolve(TOKEN)).thenReturn(Optional.of(1L));
        when(jdbc.queryForObject("select email_verified from app_user where id = ?", Boolean.class, 1L))
                .thenReturn(true);

        MockHttpServletRequest request = request("/api/decks", TOKEN);
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
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
