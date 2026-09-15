package com.naranote.logging;

import com.naranote.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * One line per API request, so "what happened" is traceable from the
 * terminal without needing to remember to add logging to each new
 * controller — this covers every endpoint automatically, present and
 * future.
 *
 * <p>Deliberately logs method/path/who/status/timing only, never the
 * request body: a generic body-dump would risk printing a password on a
 * failed login. Anything that needs the "what" (not just "which endpoint")
 * — like which email a login was for — is a hand-written log statement at
 * the point that already knows it's safe to print, not something this
 * interceptor tries to infer generically.
 *
 * <p>Severity is tiered: mutating requests (anything but GET/HEAD/OPTIONS)
 * log at INFO since they're the "what changed" trail; reads log at DEBUG so
 * the default console isn't dominated by page-load traffic. Any 4xx (a
 * failed login, an unauthorized request, a bad payload) logs at WARN
 * regardless of method — that's exactly the signal worth seeing by default
 * when tracing "did something go wrong." A 5xx or an exception escaping the
 * handler logs at ERROR with the stack trace.
 */
@Component
public class RequestLoggingInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger("naranote.requests");
    private static final String START_ATTRIBUTE = "naranote.requestStart";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_ATTRIBUTE, System.currentTimeMillis());
        return true;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        Object startedAt = request.getAttribute(START_ATTRIBUTE);
        long tookMs = startedAt instanceof Long start ? System.currentTimeMillis() - start : -1;

        // Read the raw attribute rather than injecting CurrentUser and calling
        // .id() — that throws for an unauthenticated request once Phase 2
        // enforcement lands, and an anonymous/failed-auth request is exactly
        // one we still want a log line for, just with no user id to show.
        Object userId = request.getAttribute(CurrentUser.REQUEST_ATTRIBUTE);
        String user = userId == null ? "-" : userId.toString();

        String method = request.getMethod();
        boolean mutating = !("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method));
        int status = response.getStatus();

        String message = "{} {} ip={} user={} status={} {}ms";
        Object[] fields = {method, request.getRequestURI(), request.getRemoteAddr(), user, status, tookMs};

        if (ex != null) {
            // SLF4J's varargs form treats a trailing Throwable specially — it
            // prints the stack trace but isn't consumed as a {} substitution,
            // so appending it here doesn't shift the six fields above.
            Object[] withException = Arrays.copyOf(fields, fields.length + 1);
            withException[fields.length] = ex;
            log.error(message, withException);
        } else if (status >= 500) {
            log.error(message, fields);
        } else if (status >= 400) {
            log.warn(message, fields);
        } else if (mutating) {
            log.info(message, fields);
        } else {
            log.debug(message, fields);
        }
    }
}
