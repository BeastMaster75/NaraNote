package com.naranote.translate;

import com.naranote.gemini.GeminiClient;
import com.naranote.security.CryptoService;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
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

    private static final String JA_TO_EN_PROMPT =
            "Translate the following Japanese text to natural English. Respond with only the "
                    + "translation, no notes or alternatives:\n\n";

    private static final String EN_TO_JA_PROMPT =
            "Translate the following English text to natural Japanese. Respond with only the "
                    + "translation, no notes or alternatives:\n\n";

    private final JdbcTemplate jdbc;
    private final CryptoService crypto;
    private final GeminiClient gemini;

    public TranslateService(JdbcTemplate jdbc, CryptoService crypto, GeminiClient gemini) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.gemini = gemini;
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

        return gemini.generate(apiKey, requestBody, "Translation").strip();
    }

    private String decryptedKey(long userId) {
        String encrypted =
                jdbc.queryForObject(
                        "select gemini_api_key from app_user where id = ?", String.class, userId);
        return encrypted == null ? null : crypto.decrypt(encrypted);
    }
}
