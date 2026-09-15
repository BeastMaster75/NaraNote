package com.naranote.user;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who the request belongs to.
 *
 * <p>Backed by {@code SessionInterceptor}, which resolves the session cookie
 * onto the request before any controller runs and rejects unauthenticated
 * requests to everything except register/login/logout — so by the time
 * {@code .id()} is called here, a valid user id should already be present.
 * Throwing rather than falling back to a default is deliberate: a future
 * endpoint that forgets to require auth fails loudly instead of silently
 * leaking someone else's data, matching the interceptor's own enforcement
 * rather than quietly working around a gap in it.
 */
@Component
public class CurrentUser {

    /** Request attribute {@code SessionInterceptor} sets when a session resolves. */
    public static final String REQUEST_ATTRIBUTE = "naranote.userId";

    public long id() {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        Object resolved = attributes == null ? null : attributes.getRequest().getAttribute(REQUEST_ATTRIBUTE);
        if (resolved instanceof Long userId) {
            return userId;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
    }
}
