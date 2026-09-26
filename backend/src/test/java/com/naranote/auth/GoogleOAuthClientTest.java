package com.naranote.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.naranote.auth.GoogleOAuthClient.GoogleIdentity;
import com.naranote.auth.GoogleOAuthClient.GoogleSignInException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * The ID token's claims are all that stands between a token for some other app (or an old one)
 * and a session here — the signature isn't checked, since the token comes straight from Google's
 * token endpoint over TLS. So each claim check gets a test.
 */
class GoogleOAuthClientTest {

    private static final Instant NOW = Instant.parse("2026-09-26T00:00:00Z");
    private static final long LATER = NOW.getEpochSecond() + 600;

    private final GoogleOAuthClient client =
            new GoogleOAuthClient("my-client", "secret", "http://localhost:5173/", JsonMapper.builder().build());

    @Test
    void validToken_yieldsTheIdentity() {
        GoogleIdentity identity =
                client.identityFrom(
                        token(
                                """
                                {"iss":"https://accounts.google.com","aud":"my-client","exp":%d,
                                 "sub":"1234","email":"a@gmail.com","email_verified":true,"name":"Aya"}
                                """
                                        .formatted(LATER)),
                        NOW);

        assertThat(identity).isEqualTo(new GoogleIdentity("1234", "a@gmail.com", true, "Aya", null));
        assertThat(identity.emailAuthoritative()).isTrue();
    }

    @Test
    void tokenForAnotherClient_isRejected() {
        assertRejected("""
                {"iss":"accounts.google.com","aud":"someone-else","exp":%d,"sub":"1"}
                """.formatted(LATER));
    }

    @Test
    void tokenFromAnotherIssuer_isRejected() {
        assertRejected("""
                {"iss":"https://evil.example","aud":"my-client","exp":%d,"sub":"1"}
                """.formatted(LATER));
    }

    @Test
    void expiredToken_isRejected() {
        assertRejected("""
                {"iss":"accounts.google.com","aud":"my-client","exp":%d,"sub":"1"}
                """.formatted(NOW.getEpochSecond() - 1));
    }

    @Test
    void tokenWithoutSubject_isRejected() {
        assertRejected("""
                {"iss":"accounts.google.com","aud":"my-client","exp":%d}
                """.formatted(LATER));
    }

    @Test
    void verifiedNonGmailAddress_isNotAuthoritative_unlessWorkspace() {
        assertThat(new GoogleIdentity("1", "a@example.com", true, null, null).emailAuthoritative()).isFalse();
        assertThat(new GoogleIdentity("1", "a@example.com", true, null, "example.com").emailAuthoritative())
                .isTrue();
        assertThat(new GoogleIdentity("1", "a@gmail.com", false, null, null).emailAuthoritative()).isFalse();
    }

    @Test
    void redirectsThroughTheAppsOwnOrigin() {
        assertThat(client.authorizationUrl("st"))
                .startsWith("https://accounts.google.com/o/oauth2/v2/auth?")
                .contains("redirect_uri=http://localhost:5173/api/auth/google/callback")
                .contains("state=st")
                .contains("client_id=my-client");
    }

    @Test
    void enabledOnlyWithBothIdAndSecret() {
        assertThat(client.enabled()).isTrue();
        assertThat(new GoogleOAuthClient("id", " ", "http://x", JsonMapper.builder().build()).enabled()).isFalse();
    }

    private void assertRejected(String claims) {
        assertThatThrownBy(() -> client.identityFrom(token(claims), NOW)).isInstanceOf(GoogleSignInException.class);
    }

    private static String token(String claimsJson) {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        return b64.encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8))
                + "."
                + b64.encodeToString(claimsJson.getBytes(StandardCharsets.UTF_8))
                + ".signature";
    }
}
