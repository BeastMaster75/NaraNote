package com.naranote.user;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Who the request belongs to.
 *
 * <p>Sessions are real now (see {@code com.naranote.auth}), but enforcement
 * isn't on yet — {@code SessionInterceptor} resolves a valid session cookie
 * onto the request when one is present, and this falls back to the seeded
 * local user when it isn't, exactly as it always has. That fallback is what
 * lets auth ship without breaking the app before a login page exists to send
 * people to; removing it is Phase 2's job, not this class's.
 */
@Component
public class CurrentUser {

    /** Request attribute {@code SessionInterceptor} sets when a session resolves. */
    public static final String REQUEST_ATTRIBUTE = "naranote.userId";

    private static final long LOCAL_USER_ID = 1L;

    public long id() {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return LOCAL_USER_ID;
        }
        HttpServletRequest request = attributes.getRequest();
        Object resolved = request.getAttribute(REQUEST_ATTRIBUTE);
        return resolved instanceof Long userId ? userId : LOCAL_USER_ID;
    }
}
