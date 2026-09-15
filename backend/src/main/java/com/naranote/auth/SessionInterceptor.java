package com.naranote.auth;

import com.naranote.user.CurrentUser;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Resolves the session cookie, if any, onto the request for {@link CurrentUser}
 * to read — and, as of Phase 2, actually enforces it: any {@code /api/**}
 * request other than register/login/logout is rejected with 401 unless a
 * valid session resolved.
 *
 * <p>Phase 1 shipped this purely advisory (never rejecting) so the app kept
 * working before a login page existed to send people to. That page exists
 * now, so this is the actual cutover.
 */
@Component
public class SessionInterceptor implements HandlerInterceptor {

    /** No session required — you can't already have one to reach these. */
    private static final Set<String> PUBLIC_PATHS =
            Set.of("/api/auth/register", "/api/auth/login", "/api/auth/logout");

    private final SessionService sessionService;

    public SessionInterceptor(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        Long userId = resolve(request);
        if (userId != null) {
            request.setAttribute(CurrentUser.REQUEST_ATTRIBUTE, userId);
        }

        if (userId == null && !PUBLIC_PATHS.contains(request.getRequestURI())) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Not authenticated\"}");
            return false;
        }
        return true;
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
