package com.naranote.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * A fixed-window limiter keyed by client IP, in-memory only — this app runs as a single backend
 * instance (see docker-compose*.yml), so there's no shared-state need a dependency like Redis
 * would justify. Guards {@code /api/auth/login} and {@code /register} against brute-forcing,
 * not general traffic shaping.
 *
 * <p>Windows for IPs that stop calling in are never proactively removed except by the
 * opportunistic sweep below — acceptable at this app's scale, but a sustained flood of unique
 * IPs between sweeps would grow the map faster than it's trimmed. Revisit with a bounded cache
 * (e.g. Caffeine) if that ever becomes real traffic rather than a theoretical concern.
 */
@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 10;
    private static final Duration WINDOW = Duration.ofMinutes(5);
    private static final long SWEEP_EVERY_N_CALLS = 1000;

    private record Window(Instant start, AtomicInteger count) {
        boolean expired(Instant now) {
            return start.plus(WINDOW).isBefore(now);
        }
    }

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();
    private final AtomicLong calls = new AtomicLong();
    private final Clock clock;

    public LoginRateLimiter() {
        this(Clock.systemUTC());
    }

    /** Package-private so tests can supply a fixed/advanceable clock instead of real time. */
    LoginRateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** Throws 429 if {@code key} (the caller's IP) has exceeded the attempt budget. */
    public void check(String key) {
        Instant now = clock.instant();
        if (calls.incrementAndGet() % SWEEP_EVERY_N_CALLS == 0) {
            windows.values().removeIf(window -> window.expired(now));
        }

        Window window =
                windows.compute(
                        key,
                        (k, existing) ->
                                existing == null || existing.expired(now)
                                        ? new Window(now, new AtomicInteger(0))
                                        : existing);
        if (window.count().incrementAndGet() > MAX_ATTEMPTS) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.");
        }
    }
}
