package com.naranote.auth;

import com.naranote.user.CurrentUser;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
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
 * else answers 403 rather than reaching the controller.
 */
@Component
public class SessionInterceptor implements HandlerInterceptor {

    /** No session required — you can't already have one to reach these. */
    private static final Set<String> PUBLIC_PATHS =
            Set.of(
                    "/api/auth/register",
                    "/api/auth/login",
                    "/api/auth/logout",
                    "/api/auth/verify",
                    "/api/auth/forgot-password",
                    "/api/auth/reset-password");

    /** Reachable by a signed-in-but-unverified account; everything else answers 403. */
    private static final Set<String> VERIFICATION_EXEMPT_PATHS =
            Set.of(
                    "/api/me",
                    "/api/auth/logout",
                    "/api/auth/verify",
                    "/api/auth/resend-verification",
                    "/api/auth/forgot-password",
                    "/api/auth/reset-password");

    private final SessionService sessionService;
    private final JdbcTemplate jdbc;

    public SessionInterceptor(SessionService sessionService, JdbcTemplate jdbc) {
        this.sessionService = sessionService;
        this.jdbc = jdbc;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws IOException {
        Long userId = resolve(request);
        if (userId == null) {
            if (PUBLIC_PATHS.contains(request.getRequestURI())) {
                return true;
            }
            reject(response, HttpServletResponse.SC_UNAUTHORIZED, "Not authenticated");
            return false;
        }

        request.setAttribute(CurrentUser.REQUEST_ATTRIBUTE, userId);
        if (!VERIFICATION_EXEMPT_PATHS.contains(request.getRequestURI()) && !isEmailVerified(userId)) {
            reject(response, HttpServletResponse.SC_FORBIDDEN, "Email not verified");
            return false;
        }
        return true;
    }

    private boolean isEmailVerified(long userId) {
        Boolean verified =
                jdbc.queryForObject("select email_verified from app_user where id = ?", Boolean.class, userId);
        return Boolean.TRUE.equals(verified);
    }

    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"%s\"}".formatted(message));
    }

    private Long resolve(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (AuthController.COOKIE_NAME.equals(cookie.getName())) {
                return sessionService.resolve(cookie.getValue()).orElse(null);
            }
        }
        return null;
    }
}
