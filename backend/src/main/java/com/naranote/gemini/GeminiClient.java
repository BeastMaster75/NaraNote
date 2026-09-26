package com.naranote.gemini;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

/**
 * The one place NaraNote calls Gemini, on the user's own key.
 *
 * <p>Two things every caller needs and used to get wrong: telling the user what actually
 * went wrong — every failure used to read "check your Gemini API key", including Google's
 * own servers being overloaded, which sent people to re-enter a key that was fine — and
 * riding out that overload, which is common on the free tier and usually over in a second.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    /** Waits before each retry of an overloaded call. Two retries, then give up. */
    private static final long[] RETRY_DELAYS_MS = {1000, 2500};

    private final RestClient gemini = RestClient.create("https://generativelanguage.googleapis.com");

    /**
     * Calls {@code generateContent} and returns the first candidate's text.
     *
     * @param action what the user was doing, for messages — "Evaluation", "Translation"
     */
    public String generate(String model, String apiKey, Map<String, Object> body, String action) {
        for (int attempt = 0; ; attempt++) {
            try {
                Map<String, Object> response =
                        gemini.post()
                                .uri("/v1beta/models/{model}:generateContent", model)
                                .header("x-goog-api-key", apiKey)
                                .body(body)
                                .retrieve()
                                .body(new ParameterizedTypeReference<Map<String, Object>>() {});
                String text = extractText(response);
                if (text == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY, "Gemini returned an unexpected response shape.");
                }
                return text;
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                if (isOverloaded(status) && attempt < RETRY_DELAYS_MS.length) {
                    log.info("Gemini {} busy (status={}), retrying", action, status);
                    pause(RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                // Gemini's own reason is logged, never handed to the client verbatim.
                log.warn(
                        "Gemini {} call failed: status={} body={}",
                        action,
                        e.getStatusCode(),
                        e.getResponseBodyAsString());
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, message(action, status, e.getResponseBodyAsString()), e);
            } catch (RestClientException e) {
                log.warn("Gemini {} call failed", action, e);
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, action + " failed — couldn't reach Gemini.", e);
            }
        }
    }

    /** Google's side, and temporary — worth another try. */
    static boolean isOverloaded(int status) {
        return status == 500 || status == 503 || status == 504;
    }

    static String message(String action, int status, String body) {
        if (status == 401 || status == 403 || (body != null && body.contains("API_KEY_INVALID"))) {
            return action + " failed — Gemini rejected your API key. Check it in Settings.";
        }
        if (status == 429) {
            return action + " failed — your Gemini key hit its usage limit. Wait a minute and try again.";
        }
        if (isOverloaded(status)) {
            return action + " failed — Gemini is overloaded right now. Try again in a moment.";
        }
        return action + " failed — Gemini couldn't handle the request.";
    }

    @SuppressWarnings("unchecked")
    static String extractText(Map<String, Object> response) {
        if (response == null) return null;
        var candidates = (List<Map<String, Object>>) response.get("candidates");
        if (candidates == null || candidates.isEmpty()) return null;
        var content = (Map<String, Object>) candidates.get(0).get("content");
        if (content == null) return null;
        var parts = (List<Map<String, Object>>) content.get("parts");
        if (parts == null || parts.isEmpty()) return null;
        Object text = parts.get(0).get("text");
        return text instanceof String s ? s : null;
    }

    private static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Interrupted.", e);
        }
    }
}
