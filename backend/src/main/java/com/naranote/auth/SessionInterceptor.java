package com.naranote.auth;

import com.naranote.user.CurrentUser;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Resolves the session cookie, if any, onto the request for {@link CurrentUser}
 * to read — and, as of Phase 2, actually enforces it: any {@code /api/**}
 * request other than register/login/logout/verify/forgot-password/reset-password
 * is rejected with 401 unless a valid session resolved.
 *
 * <p>Phase 1 shipped this purely advisory (never rejecting) so the app kept
 * working before a login page existed to send people to. That page exists
 * now, so this is the actual cutover.
 *
 * <p>Phase 3 adds a second, narrower gate on top: a resolved-but-unverified session is let
 * through only to the handful of paths an unverified account still needs (checking who it
 * is, verifying, resending the email, logging out, resetting a forgotten password) — anything
 * else answers 403 rather than reaching the controller. A guest has no address to verify and is
 * never gated; neither is a guest waiting on the link to save their collection, since the address
 * stays pending rather than becoming the account's until it's clicked.
 *
 * <p>It also keeps sessions sliding: a session in use is renewed at most once a day, and the
 * cookie re-sent with it (see {@link SessionService}).
 */
@Component
public class SessionInterceptor implements HandlerInterceptor {

    /**
     * No session required — you can't already have one to reach these. {@code /api/site} is
     * the public page facts (the privacy page's contact address), readable before signing up.
     */
    private static final Set<String> PUBLIC_PATHS =
            Set.of(
                    "/api/auth/register",
                    "/api/auth/login",
                    "/api/auth/guest",
                    "/api/auth/google/start",
                    "/api/auth/google/callback",
                    "/api/auth/logout",
                    "/api/auth/verify",
                    "/api/auth/forgot-password",
                    "/api/auth/reset-password",
                    "/api/site");

    /**
     * Reachable by a signed-in-but-unverified account; everything else answers 403. Deleting
     * the account is here because an address typed wrong at registration can never be
     * verified, and that account must still be removable.
     */
    private static final Set<String> VERIFICATION_EXEMPT_PATHS =
            Set.of(
                    "/api/me",
                    "/api/auth/logout",
                    "/api/auth/verify",
                    "/api/auth/resend-verification",
                    "/api/auth/forgot-password",
                    "/api/auth/reset-password",
                    "/api/auth/account",
                    "/api/auth/google/start",
                    "/api/auth/google/callback",
                    "/api/site");

    private final SessionService sessionService;
    private final SessionCookie sessionCookie;

    public SessionInterceptor(SessionService sessionService, SessionCookie sessionCookie) {
        this.sessionService = sessionService;
        this.sessionCookie = sessionCookie;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        String token = sessionToken(request);
        SessionService.Session session = sessionService.lookup(token).orElse(null);
        if (session == null) {
            if (PUBLIC_PATHS.contains(request.getRequestURI())) {
                return true;
            }
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Not authenticated");
            return false;
        }

        request.setAttribute(CurrentUser.REQUEST_ATTRIBUTE, session.userId());
        if (!VERIFICATION_EXEMPT_PATHS.contains(request.getRequestURI()) && !session.verified()) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "Email not verified");
            return false;
        }
        if (sessionService.renewIfDue(token, session)) {
            sessionCookie.set(response, token, session.lifetime());
        }
        return true;
    }

    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"%s\"}".formatted(message));
    }

    private static String sessionToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (SessionCookie.NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
