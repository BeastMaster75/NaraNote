package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class LoginRateLimiterTest {

    private static final String IP = "203.0.113.7";

    @Test
    void allowsUpToTheLimit() {
        LoginRateLimiter limiter = new LoginRateLimiter(fixedClock(Instant.now()));

        for (int i = 0; i < 10; i++) {
            limiter.check(IP);
        }
        // The 10th call above already consumed the budget; an 11th trips it.
        assertThatThrownBy(() -> limiter.check(IP)).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void tracksEachKeyIndependently() {
        LoginRateLimiter limiter = new LoginRateLimiter(fixedClock(Instant.now()));

        for (int i = 0; i < 10; i++) {
            limiter.check(IP);
        }
        // A different caller has its own, untouched budget.
        assertThat(catchStatus(() -> limiter.check("198.51.100.9"))).isNull();
    }

    @Test
    void resetsOnceTheWindowExpires() {
        MutableClock clock = new MutableClock(Instant.now());
        LoginRateLimiter limiter = new LoginRateLimiter(clock);

        for (int i = 0; i < 10; i++) {
            limiter.check(IP);
        }
        assertThatThrownBy(() -> limiter.check(IP)).isInstanceOf(ResponseStatusException.class);

        clock.advance(Duration.ofMinutes(5).plusSeconds(1));

        // A fresh window — the same IP is allowed again rather than staying locked out forever.
        assertThat(catchStatus(() -> limiter.check(IP))).isNull();
    }

    private static Exception catchStatus(Runnable action) {
        try {
            action.run();
            return null;
        } catch (Exception e) {
            return e;
        }
    }

    private static Clock fixedClock(Instant instant) {
        return Clock.fixed(instant, ZoneOffset.UTC);
    }

    /** A Clock whose instant can be moved forward, to exercise window expiry without waiting. */
    private static final class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public Instant instant() {
            return instant;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }
}
