package com.naranote.user;

import org.springframework.stereotype.Component;

/**
 * Who the request belongs to.
 *
 * <p>There is no authentication yet, so this returns the single seeded local user.
 * Everything user-scoped goes through here rather than hard-coding an id at each
 * call site — when auth lands, this is the one place that changes.
 */
@Component
public class CurrentUser {

    private static final long LOCAL_USER_ID = 1L;

    public long id() {
        return LOCAL_USER_ID;
    }
}
