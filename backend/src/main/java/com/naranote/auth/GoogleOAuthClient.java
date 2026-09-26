package com.naranote.auth;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The two calls Google's authorization-code flow needs: where to send the browser, and trading
 * the code it comes back with for who signed in.
 *
 * <p>Server-side redirect flow rather than Google's JavaScript button on purpose: no third-party
 * script ever runs on our pages, and the CSP stays as tight as it is. The ID token arrives over a
 * direct TLS call to Google's token endpoint, which OpenID Connect accepts in place of checking its
 * signature (Core §3.1.3.7) — so no JWKS fetching and no JWT library, only the claim checks below.
 *
 * <p>Disabled until {@code naranote.google.client-id} and {@code client-secret} are set; the
 * welcome page asks {@code /api/site} whether to show the button.
 */
@Component
public class GoogleOAuthClient {

    private static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    /** Who signed in. {@code hostedDomain} is the Workspace domain, null for a personal account. */
    public record GoogleIdentity(
            String sub, String email, boolean emailVerified, String name, String hostedDomain) {

        /**
         * Whether Google's word on the address is good enough to link this sign-in to an existing
         * NaraNote account holding the same email. Google's own guidance: {@code email_verified}
         * alone is only authoritative for Gmail addresses and Workspace ({@code hd}) accounts —
         * a personal Google account on some other domain may have verified it long ago.
         */
        public boolean emailAuthoritative() {
            return emailVerified
                    && email != null
                    && (email.toLowerCase().endsWith("@gmail.com") || hostedDomain != null);
        }
    }

    /** The sign-in failed in a way the user can only retry; the message is for the log. */
    public static class GoogleSignInException extends RuntimeException {
        public GoogleSignInException(String message) {
            super(message);
        }

        public GoogleSignInException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final ObjectMapper json;
    private final RestClient http = RestClient.create();

    public GoogleOAuthClient(
            @Value("${naranote.google.client-id:}") String clientId,
            @Value("${naranote.google.client-secret:}") String clientSecret,
            @Value("${naranote.app-base-url}") String appBaseUrl,
            ObjectMapper json) {
        this.clientId = clientId.strip();
        this.clientSecret = clientSecret.strip();
        // Through the frontend's origin, like the emailed links: Vite proxies /api in dev, Caddy
        // in production. This exact string must be listed in the Google Cloud console.
        this.redirectUri = appBaseUrl.replaceAll("/+$", "") + "/api/auth/google/callback";
        this.json = json;
    }

    public boolean enabled() {
        return !clientId.isEmpty() && !clientSecret.isEmpty();
    }

    public String authorizationUrl(String state) {
        return UriComponentsBuilder.fromUriString(AUTHORIZE_URL)
                .queryParam("client_id", clientId)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("response_type", "code")
                .queryParam("scope", "openid email profile")
                .queryParam("state", state)
                // Let someone signed in to several Google accounts pick, rather than silently
                // using whichever is the browser's default.
                .queryParam("prompt", "select_account")
                .encode()
                .build()
                .toUriString();
    }

    public GoogleIdentity exchange(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        form.add("redirect_uri", redirectUri);
        form.add("grant_type", "authorization_code");

        JsonNode token;
        try {
            token =
                    http.post()
                            .uri(TOKEN_URL)
                            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                            .body(form)
                            .retrieve()
                            .body(JsonNode.class);
        } catch (RestClientException e) {
            throw new GoogleSignInException("Token exchange failed", e);
        }
        if (token == null || !token.hasNonNull("id_token")) {
            throw new GoogleSignInException("Token response had no id_token");
        }
        return identityFrom(token.get("id_token").asString(), Instant.now());
    }

    /** Package-private so the claim checks can be tested without a live Google. */
    GoogleIdentity identityFrom(String idToken, Instant now) {
        String[] parts = idToken.split("\\.");
        if (parts.length != 3) {
            throw new GoogleSignInException("Malformed id_token");
        }
        JsonNode claims =
                json.readTree(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8));

        if (!ISSUERS.contains(claims.path("iss").asString(""))) {
            throw new GoogleSignInException("Unexpected issuer");
        }
        if (!clientId.equals(claims.path("aud").asString(""))) {
            throw new GoogleSignInException("Token was issued to another client");
        }
        if (claims.path("exp").asLong(0) <= now.getEpochSecond()) {
            throw new GoogleSignInException("Token expired");
        }
        String sub = claims.path("sub").asString("");
        if (sub.isEmpty()) {
            throw new GoogleSignInException("Token had no subject");
        }

        return new GoogleIdentity(
                sub,
                text(claims, "email"),
                claims.path("email_verified").asBoolean(false),
                text(claims, "name"),
                text(claims, "hd"));
    }

    private static String text(JsonNode claims, String field) {
        String value = claims.path(field).asString("");
        return value.isBlank() ? null : value.strip();
    }
}
