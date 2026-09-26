package com.naranote.auth;

import com.naranote.auth.GoogleOAuthClient.GoogleIdentity;
import com.naranote.auth.GoogleOAuthClient.GoogleSignInException;
import com.naranote.user.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sign in with Google: {@code /start} sends the browser to Google, {@code /callback} is where it
 * comes back. Both are plain browser navigations, not fetches, so every outcome ends in a redirect
 * to the app — {@code /} on success, otherwise back where they started with {@code ?google=<reason>}:
 * Settings for a guest saving their collection, the welcome page for everyone else.
 *
 * <p>What a Google sign-in does depends on who's already here:
 * <ul>
 *   <li>Google account already linked → sign in to that account.
 *   <li>Signed in as a guest → the guest becomes this Google account, collection and all — unless
 *       the Google account or its address already belongs to someone, in which case nothing
 *       changes ({@code exists} / {@code taken}): merging two notebooks isn't something to do
 *       silently, and signing in elsewhere would strand the guest's.
 *   <li>Address matches an existing account → link and sign in, but only when Google's word on
 *       the address is authoritative (see {@link GoogleIdentity#emailAuthoritative}); otherwise
 *       {@code taken}, and they log in with their password.
 *   <li>Otherwise → a new account, already verified: Google has checked the address.
 * </ul>
 *
 * <p>From Settings, a signed-in account can also <em>connect</em> Google ({@code /start?intent=link}):
 * the Google account is attached to the account already signed in rather than signing in as it,
 * and the answer comes back to Settings as {@code ?google=linked} (or {@code exists} when that
 * Google account belongs to another notebook). {@code DELETE /api/auth/google} disconnects it
 * again — only when the account has a password, so nobody locks themselves out.
 *
 * <p>CSRF on the callback is stopped by {@code state}: a random value set in a short-lived cookie
 * before leaving, which must come back unchanged in the URL. The connect intent rides inside
 * that same value, so it can't be added or stripped on the way back without failing the check.
 */
@RestController
@RequestMapping("/api/auth/google")
public class GoogleAuthController {

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthController.class);

    static final String STATE_COOKIE = "naranote_oauth_state";
    private static final Duration STATE_MAX_AGE = Duration.ofMinutes(10);
    private static final String STATE_COOKIE_PATH = "/api/auth/google";
    private static final String LINK_PREFIX = "link.";

    private final GoogleOAuthClient google;
    private final JdbcTemplate jdbc;
    private final SessionService sessionService;
    private final SessionCookie sessionCookie;
    private final LoginRateLimiter rateLimiter;
    private final CurrentUser currentUser;
    private final boolean cookieSecure;
    private final String appBaseUrl;
    private final SecureRandom random = new SecureRandom();

    public GoogleAuthController(
            GoogleOAuthClient google,
            JdbcTemplate jdbc,
            SessionService sessionService,
            SessionCookie sessionCookie,
            LoginRateLimiter rateLimiter,
            CurrentUser currentUser,
            @Value("${naranote.cookie-secure:false}") boolean cookieSecure,
            @Value("${naranote.app-base-url}") String appBaseUrl) {
        this.google = google;
        this.jdbc = jdbc;
        this.sessionService = sessionService;
        this.sessionCookie = sessionCookie;
        this.rateLimiter = rateLimiter;
        this.currentUser = currentUser;
        this.cookieSecure = cookieSecure;
        this.appBaseUrl = appBaseUrl.replaceAll("/+$", "");
    }

    @GetMapping("/start")
    public void start(@RequestParam(required = false) String intent, HttpServletResponse response) {
        if (!google.enabled()) {
            redirect(response, "/welcome?google=disabled");
            return;
        }
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String state =
                ("link".equals(intent) ? LINK_PREFIX : "")
                        + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        // Lax, not Strict: the callback is a top-level navigation arriving from Google's origin,
        // and a Strict cookie wouldn't be sent with it.
        stateCookie(response, state, STATE_MAX_AGE);
        response.setStatus(HttpServletResponse.SC_FOUND);
        response.setHeader(HttpHeaders.LOCATION, google.authorizationUrl(state));
    }

    @GetMapping("/callback")
    @Transactional
    public void callback(
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String error,
            @CookieValue(name = STATE_COOKIE, required = false) String expectedState,
            @CookieValue(name = SessionCookie.NAME, required = false) String sessionToken,
            HttpServletRequest request,
            HttpServletResponse response) {
        stateCookie(response, "", Duration.ZERO);
        Optional<SessionService.Session> current = sessionService.lookup(sessionToken);
        Optional<SessionService.Session> guest = current.filter(SessionService.Session::guest);
        // Connecting only means something to an account already signed in; with no session left
        // (it expired on Google's screen) it falls back to an ordinary sign-in.
        Optional<SessionService.Session> linkingAccount =
                state != null && state.startsWith(LINK_PREFIX)
                        ? current.filter(session -> !session.guest())
                        : Optional.empty();
        String back =
                guest.isPresent() || linkingAccount.isPresent() ? "/settings?google=" : "/welcome?google=";
        if (error != null) {
            // Most often "access_denied": they backed out on Google's screen. Not a failure.
            redirect(response, back + "cancelled");
            return;
        }
        if (code == null || state == null || expectedState == null || !constantTimeEquals(state, expectedState)) {
            log.warn("Google sign-in rejected: state missing or mismatched");
            redirect(response, back + "failed");
            return;
        }
        rateLimiter.check(request.getRemoteAddr());

        GoogleIdentity identity;
        try {
            identity = google.exchange(code);
        } catch (GoogleSignInException e) {
            log.warn("Google sign-in failed: {}", e.getMessage());
            redirect(response, back + "failed");
            return;
        }

        if (linkingAccount.isPresent()) {
            redirect(response, back + link(identity, linkingAccount.get().userId()));
            return;
        }

        Outcome outcome = signIn(identity, guest);
        if (outcome.userId() == null) {
            redirect(response, back + outcome.refusal());
            return;
        }
        // Always a fresh session, even when a guest just became this account: the old one carries
        // a guest's lifetime, and the new account-length cookie would outlive its renewals.
        current.ifPresent(session -> sessionService.revoke(sessionToken));
        sessionCookie.set(response, sessionService.issue(outcome.userId()), SessionService.ACCOUNT_LIFETIME);
        redirect(response, "/");
    }

    /**
     * Disconnects Google from the signed-in account. Refused while the account has no password:
     * Google would be its only way in, and removing it would lock the account for good.
     */
    @DeleteMapping
    @Transactional
    public void unlink() {
        long userId = currentUser.id();
        List<String> hashes =
                jdbc.query(
                        "select password_hash from app_user where id = ?",
                        (rs, row) -> rs.getString("password_hash"),
                        userId);
        if (hashes.isEmpty() || hashes.getFirst() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Set a password before disconnecting Google");
        }
        jdbc.update("update app_user set google_sub = null where id = ?", userId);
        log.info("Google disconnected: user={}", userId);
    }

    /** Attaches the Google account to {@code userId}: {@code linked}, or {@code exists} if it's someone else's. */
    String link(GoogleIdentity identity, long userId) {
        Optional<Long> owner = findOne("select id from app_user where google_sub = ?", identity.sub());
        if (owner.isPresent() && owner.get() != userId) {
            log.info("Google connect refused, linked to another account: user={}", userId);
            return "exists";
        }
        jdbc.update("update app_user set google_sub = ? where id = ?", identity.sub(), userId);
        log.info("Google connected: user={}", userId);
        return "linked";
    }

    /** Either the account to sign in to, or why not ({@code exists}, {@code taken}). */
    record Outcome(Long userId, String refusal) {
        static Outcome of(long userId) {
            return new Outcome(userId, null);
        }

        static Outcome refused(String reason) {
            return new Outcome(null, reason);
        }
    }

    Outcome signIn(GoogleIdentity identity, Optional<SessionService.Session> guest) {
        Optional<Long> linked = findOne("select id from app_user where google_sub = ?", identity.sub());
        Optional<Long> sameEmail =
                identity.email() == null
                        ? Optional.empty()
                        : findOne("select id from app_user where lower(email) = lower(?)", identity.email());

        if (guest.isPresent()) {
            long guestId = guest.get().userId();
            if (linked.isPresent()) {
                log.info("Google sign-in as guest refused, Google account already linked: user={}", guestId);
                return Outcome.refused("exists");
            }
            if (sameEmail.isPresent()) {
                log.info("Google sign-in as guest refused, address already registered: user={}", guestId);
                return Outcome.refused("taken");
            }
            jdbc.update(
                    """
                    update app_user
                       set google_sub = ?, email = ?, email_verified = ?, is_guest = false,
                           pending_email = null
                     where id = ?
                    """,
                    identity.sub(),
                    identity.email(),
                    identity.emailVerified(),
                    guestId);
            log.info("Guest saved with Google: user={}", guestId);
            return Outcome.of(guestId);
        }

        if (linked.isPresent()) {
            log.info("Google sign-in: user={}", linked.get());
            return Outcome.of(linked.get());
        }

        if (sameEmail.isPresent()) {
            if (!identity.emailAuthoritative()) {
                log.info("Google sign-in not linked, address not authoritative: user={}", sameEmail.get());
                return Outcome.refused("taken");
            }
            jdbc.update(
                    "update app_user set google_sub = ?, email_verified = true where id = ?",
                    identity.sub(),
                    sameEmail.get());
            log.info("Google linked to existing account: user={}", sameEmail.get());
            return Outcome.of(sameEmail.get());
        }

        Long userId =
                jdbc.queryForObject(
                        """
                        insert into app_user (display_name, email, email_verified, google_sub)
                        values (?, ?, ?, ?)
                        returning id
                        """,
                        Long.class,
                        displayName(identity),
                        identity.email(),
                        identity.emailVerified(),
                        identity.sub());
        log.info("Registered with Google: user={}", userId);
        return Outcome.of(userId);
    }

    private Optional<Long> findOne(String sql, String value) {
        List<Long> ids = jdbc.query(sql, (rs, row) -> rs.getLong("id"), value);
        return ids.stream().findFirst();
    }

    private static String displayName(GoogleIdentity identity) {
        String name = identity.name();
        if (name == null && identity.email() != null) {
            name = identity.email().substring(0, identity.email().indexOf('@'));
        }
        if (name == null) {
            name = "Friend";
        }
        return name.length() > 80 ? name.substring(0, 80) : name;
    }

    private void redirect(HttpServletResponse response, String path) {
        response.setStatus(HttpServletResponse.SC_FOUND);
        response.setHeader(HttpHeaders.LOCATION, appBaseUrl + path);
    }

    private void stateCookie(HttpServletResponse response, String value, Duration maxAge) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                ResponseCookie.from(STATE_COOKIE, value)
                        .httpOnly(true)
                        .secure(cookieSecure)
                        .sameSite("Lax")
                        .path(STATE_COOKIE_PATH)
                        .maxAge(maxAge)
                        .build()
                        .toString());
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
