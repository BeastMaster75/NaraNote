package com.naranote.gemini;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The deterministic pieces: response walking and what each failure tells the user. */
class GeminiClientTest {

    @Test
    void extractText_walksCandidatesContentPartsText() {
        Map<String, Object> response =
                Map.of(
                        "candidates",
                        List.of(
                                Map.of(
                                        "content",
                                        Map.of("parts", List.of(Map.of("text", "{\"transcript\":\"hi\"}"))))));

        assertThat(GeminiClient.extractText(response)).isEqualTo("{\"transcript\":\"hi\"}");
    }

    @Test
    void extractText_returnsNullOnUnexpectedShape() {
        assertThat(GeminiClient.extractText(Map.of("candidates", List.of()))).isNull();
        assertThat(GeminiClient.extractText(null)).isNull();
    }

    @Test
    void anOverloadedModelIsNotBlamedOnTheKey() {
        // The exact body Gemini sent when this was reported.
        String body = "{\"error\":{\"code\":503,\"message\":\"This model is currently experiencing "
                + "high demand.\",\"status\":\"UNAVAILABLE\"}}";

        assertThat(GeminiClient.isOverloaded(503)).isTrue();
        assertThat(GeminiClient.message("Evaluation", 503, body))
                .contains("overloaded")
                .doesNotContain("API key");
    }

    @Test
    void overloadAndRateLimitsFallBackToAnotherModel_butABadKeyDoesNot() {
        assertThat(GeminiClient.isWorthAnotherModel(503)).isTrue();
        assertThat(GeminiClient.isWorthAnotherModel(429)).isTrue();
        assertThat(GeminiClient.isWorthAnotherModel(400)).isFalse();
        assertThat(GeminiClient.isKeyRejected(400, "{\"reason\":\"API_KEY_INVALID\"}")).isTrue();
        assertThat(GeminiClient.MODELS).hasSizeGreaterThan(1).doesNotHaveDuplicates();
    }

    @Test
    void aRejectedKeySaysSo() {
        // Google answers a bad key with 400, not 401 — the reason is only in the body.
        String body = "{\"error\":{\"code\":400,\"details\":[{\"reason\":\"API_KEY_INVALID\"}]}}";

        assertThat(GeminiClient.message("Evaluation", 400, body)).contains("rejected your API key");
        assertThat(GeminiClient.message("Evaluation", 403, "")).contains("rejected your API key");
    }

    @Test
    void aRateLimitIsNotRetriedAndSaysToWait() {
        assertThat(GeminiClient.isOverloaded(429)).isFalse();
        assertThat(GeminiClient.message("Translation", 429, "")).contains("usage limit");
    }

    @Test
    void anythingElseIsGeneric() {
        assertThat(GeminiClient.message("Translation", 404, "{}"))
                .isEqualTo("Translation failed — Gemini couldn't handle the request.");
    }
}
