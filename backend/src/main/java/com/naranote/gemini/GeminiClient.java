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
 * riding out that overload, which is common on the free tier.
 *
 * <p>Overload is per model: when one is saturated (AI Studio shows the same 503) retrying it
 * just fails again, so an overloaded or rate-limited call moves on to the next model in
 * {@link #MODELS}, and the whole list gets one more pass after a short wait.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    /**
     * Tried in order. The first is the one callers are tuned against; the rest are the models
     * Google points new traffic at, so they're the likeliest to have headroom when it doesn't.
     * Free-tier quotas are per model too, so a 429 on one says nothing about the next.
     */
    static final List<String> MODELS =
            List.of("gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite");

    /** Waits before each pass through {@link #MODELS}. */
    private static final long[] PASS_DELAYS_MS = {0, 2000};

    private final RestClient gemini = RestClient.create("https://generativelanguage.googleapis.com");

    /**
     * Calls {@code generateContent} and returns the first candidate's text.
     *
     * @param action what the user was doing, for messages — "Evaluation", "Translation"
     */
    public String generate(String apiKey, Map<String, Object> body, String action) {
        // The primary model's failure is the one reported: a fallback failing for its own
        // reasons (retired, no audio support) shouldn't hide that the real cause was overload.
        RestClientResponseException reported = null;
        for (long delay : PASS_DELAYS_MS) {
            pause(delay);
            for (String model : MODELS) {
                try {
                    return call(model, apiKey, body);
                } catch (RestClientResponseException e) {
                    int status = e.getStatusCode().value();
                    String responseBody = e.getResponseBodyAsString();
                    boolean primary = model.equals(MODELS.get(0));
                    if (isKeyRejected(status, responseBody)
                            || (primary && !isWorthAnotherModel(status))) {
                        log.warn("Gemini {} call failed: model={} status={} body={}",
                                action, model, status, responseBody);
                        throw new ResponseStatusException(
                                HttpStatus.BAD_GATEWAY, message(action, status, responseBody), e);
                    }
                    log.info("Gemini {} unavailable on {} (status={}), trying next model",
                            action, model, status);
                    if (reported == null) reported = e;
                } catch (RestClientException e) {
                    log.warn("Gemini {} call failed", action, e);
                    throw new ResponseStatusException(
                            HttpStatus.BAD_GATEWAY, action + " failed — couldn't reach Gemini.", e);
                }
            }
        }
        log.warn("Gemini {} failed on every model: status={} body={}",
                action, reported.getStatusCode(), reported.getResponseBodyAsString());
        throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                message(action, reported.getStatusCode().value(), reported.getResponseBodyAsString()),
                reported);
    }

    private String call(String model, String apiKey, Map<String, Object> body) {
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
    }

    /** Busy or out of this model's quota — another model may well answer. */
    static boolean isWorthAnotherModel(int status) {
        return isOverloaded(status) || status == 429;
    }

    static boolean isKeyRejected(int status, String body) {
        return status == 401 || status == 403 || (body != null && body.contains("API_KEY_INVALID"));
    }

    /** Google's side, and temporary — worth another try. */
    static boolean isOverloaded(int status) {
        return status == 500 || status == 503 || status == 504;
    }

    static String message(String action, int status, String body) {
        if (isKeyRejected(status, body)) {
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
        if (millis <= 0) return;
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Interrupted.", e);
        }
    }
}
