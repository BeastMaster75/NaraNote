package com.naranote.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Browser security headers on every response, set here rather than in the reverse proxy so
 * they ship with the app, are covered by a test, and can be checked against the prod image
 * without a proxy in front of it.
 *
 * <p>The policy is what the built frontend actually needs, and nothing more:
 *
 * <ul>
 *   <li>Scripts only from our own origin. Vite's production build has no inline script, and
 *       nothing is loaded from a CDN — the fonts are bundled for the same reason (see
 *       main.tsx), so {@code 'self'} covers styles and fonts too.
 *   <li>{@code style-src 'unsafe-inline'} because the stroke-order SVGs and a few components
 *       carry inline {@code style} attributes. Injected styles can restyle a page but can't run
 *       code, and it's the scripts that matter.
 *   <li>{@code data:} for images and fonts (the select chevron is an inline SVG, and Vite
 *       inlines very small assets), {@code blob:} for images and media.
 *   <li>The microphone for our own origin only — the Read page records you reading aloud.
 * </ul>
 *
 * <p>HSTS only on a secure request. Behind the proxy that is decided by its
 * {@code X-Forwarded-Proto} ({@code server.forward-headers-strategy=native} in
 * docker-compose.prod.yml); plain-http local runs never send it, so a developer's browser
 * isn't told to insist on https for localhost.
 */
@Component
public class SecurityHeadersFilter extends OncePerRequestFilter {

    static final String CONTENT_SECURITY_POLICY =
            String.join(
                    "; ",
                    "default-src 'self'",
                    "script-src 'self'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self' data:",
                    "media-src 'self' blob:",
                    "connect-src 'self'",
                    "object-src 'none'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'none'");

    static final String PERMISSIONS_POLICY =
            "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)";

    /** One year. No includeSubDomains or preload: those are hard to undo, add them deliberately. */
    static final String STRICT_TRANSPORT_SECURITY = "max-age=31536000";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        response.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        if (request.isSecure()) {
            response.setHeader("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
        }
        chain.doFilter(request, response);
    }
}
