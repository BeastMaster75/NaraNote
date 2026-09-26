package com.naranote.auth;

import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Writes and clears the session cookie. Shared by {@link AuthController}, which sets it at sign-in,
 * and {@link SessionInterceptor}, which re-sends it whenever a sliding session is renewed.
 */
@Component
public class SessionCookie {

    static final String NAME = "naranote_session";

    private final boolean secure;

    public SessionCookie(@Value("${naranote.cookie-secure:false}") boolean secure) {
        // Driven by naranote.cookie-secure — false for local dev, since Secure cookies are
        // silently dropped by the browser over plain http; NARANOTE_COOKIE_SECURE=true in
        // docker-compose.prod.yml turns it on for the real, https-served deployment.
        this.secure = secure;
    }

    public void set(HttpServletResponse response, String token, Duration maxAge) {
        write(response, token, maxAge);
    }

    public void clear(HttpServletResponse response) {
        write(response, "", Duration.ZERO);
    }

    private void write(HttpServletResponse response, String value, Duration maxAge) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                ResponseCookie.from(NAME, value)
                        .httpOnly(true)
                        .secure(secure)
                        .sameSite("Lax")
                        .path("/")
                        .maxAge(maxAge)
                        .build()
                        .toString());
    }
}
