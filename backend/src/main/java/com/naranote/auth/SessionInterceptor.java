package com.naranote.auth;

import com.naranote.user.CurrentUser;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Resolves the session cookie, if any, onto the request for {@link CurrentUser}
 * to read.
 *
 * <p>Deliberately never rejects a request in this phase — a missing or invalid
 * cookie just means nothing gets resolved, and {@code CurrentUser} falls back
 * to the seeded local account exactly as it does today. Phase 2 (once a login
 * page exists to send people to) is what turns that fallback off.
 */
@Component
public class SessionInterceptor implements HandlerInterceptor {

    private final SessionService sessionService;

    public SessionInterceptor(SessionService sessionService) {
        this.sessionService = sessionService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return true;
        }
        for (Cookie cookie : cookies) {
            if (AuthController.COOKIE_NAME.equals(cookie.getName())) {
                sessionService
                        .resolve(cookie.getValue())
                        .ifPresent(userId -> request.setAttribute(CurrentUser.REQUEST_ATTRIBUTE, userId));
                break;
            }
        }
        return true;
    }
}
