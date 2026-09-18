package com.naranote.translate;

import com.naranote.security.CryptoService;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sentence translation via the user's own Gemini key — BYO-key, same as any other AI feature
 * would be, decrypted per request via {@link CryptoService} rather than cached.
 *
 * <p>LibreTranslate was tried first (self-hosted, no key, matching VOICEVOX's pattern) but its
 * free en→ja model collapses onto generic boilerplate ("contact us") for ordinary short
 * phrases — confirmed by direct testing, not assumed. Translation quality matters enough
 * here that a real model earns the key prompt Settings already has for future AI features.
 */
@Service
public class TranslateService {

    private static final Logger log = LoggerFactory.getLogger(TranslateService.class);

    private static final String MODEL = "gemini-3.6-flash";

    private static final String JA_TO_EN_PROMPT =
            "Translate the following Japanese text to natural English. Respond with only the "
                    + "translation, no notes or alternatives:\n\n";

    private static final String EN_TO_JA_PROMPT =
            "Translate the following English text to natural Japanese. Respond with only the "
                    + "translation, no notes or alternatives:\n\n";

    private final JdbcTemplate jdbc;
    private final CryptoService crypto;
    private final RestClient gemini = RestClient.create("https://generativelanguage.googleapis.com");

    public TranslateService(JdbcTemplate jdbc, CryptoService crypto) {
        this.jdbc = jdbc;
        this.crypto = crypto;
    }

    public String translate(long userId, String text, boolean toJapanese) {
        String apiKey = decryptedKey(userId);
        if (apiKey == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Add a Gemini API key in Settings to translate.");
        }

        String prompt = (toJapanese ? EN_TO_JA_PROMPT : JA_TO_EN_PROMPT) + text;
        Map<String, Object> requestBody =
                Map.of(
                        "contents",
                        List.of(Map.of("parts", List.of(Map.of("text", prompt)))));

        Map<String, Object> response;
        try {
            response =
                    gemini.post()
                            .uri("/v1beta/models/{model}:generateContent", MODEL)
                            .header("x-goog-api-key", apiKey)
                            .body(requestBody)
                            .retrieve()
                            .body(new ParameterizedTypeReference<Map<String, Object>>() {});
        } catch (RestClientResponseException e) {
            // Gemini's actual reason (invalid key, quota, bad model name, ...) — logged
            // server-side only, since the response body isn't something to hand back to
            // the client verbatim, but it's the whole reason this failed.
            log.warn(
                    "Gemini translate call failed: status={} body={}",
                    e.getStatusCode(),
                    e.getResponseBodyAsString());
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Translation failed — check your Gemini API key in Settings.",
                    e);
        } catch (RestClientException e) {
            log.warn("Gemini translate call failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Translation failed.", e);
        }

        String result = extractText(response);
        if (result == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Gemini returned an unexpected response shape.");
        }
        return result.strip();
    }

    @SuppressWarnings("unchecked")
    private static String extractText(Map<String, Object> response) {
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

    private String decryptedKey(long userId) {
        String encrypted =
                jdbc.queryForObject(
                        "select gemini_api_key from app_user where id = ?", String.class, userId);
        return encrypted == null ? null : crypto.decrypt(encrypted);
    }
}
