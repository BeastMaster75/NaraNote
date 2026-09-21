package com.naranote.reading;

import com.naranote.reading.ReadingDtos.EvaluateResponse;
import com.naranote.security.CryptoService;
import java.util.Base64;
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
import tools.jackson.databind.ObjectMapper;

/**
 * Judges a recording of someone reading a known passage aloud — BYO Gemini key,
 * same pattern as {@code TranslateService}. Scoped deliberately to "did you read
 * the right words," not pitch-accent or accent quality: general ASR is built to
 * recognize *intent* through noise and mispronunciation, so it isn't a reliable
 * signal for the latter, and pretending otherwise would just be confident-sounding
 * wrong feedback — worse than no feedback.
 *
 * <p>{@code generationConfig.responseSchema} constrains Gemini to a fixed JSON
 * shape rather than trusting a prompt instruction alone — the point of this
 * feature is specific, structured feedback (an actual transcript, named
 * mismatches), not prose that has to be trusted or fuzzy-parsed.
 */
@Service
public class ReadingEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(ReadingEvaluationService.class);
    private static final String MODEL = "gemini-3.6-flash";

    private static final String PROMPT_PREFIX =
            "You will hear an audio recording of someone reading a piece of Japanese text aloud. "
                    + "The text they were asked to read is:\n\n";

    private static final String PROMPT_SUFFIX =
            "\n\nTranscribe exactly what was actually said in the recording (not what was asked "
                    + "for). Then compare it word-by-word against the text above, treating "
                    + "genuinely equivalent readings (okurigana or kana-vs-kanji spelling of the "
                    + "same word) as a match rather than a mismatch. List every word or phrase "
                    + "that was misread, skipped, or added, with what was expected and what was "
                    + "actually heard. Give one short, specific, plain-language sentence of "
                    + "feedback tied to what was actually heard — never a vague compliment.";

    private static final Map<String, Object> RESPONSE_SCHEMA =
            Map.of(
                    "type",
                    "OBJECT",
                    "properties",
                    Map.of(
                            "transcript", Map.of("type", "STRING"),
                            "matched", Map.of("type", "BOOLEAN"),
                            "misreads",
                                    Map.of(
                                            "type", "ARRAY",
                                            "items",
                                                    Map.of(
                                                            "type", "OBJECT",
                                                            "properties",
                                                                    Map.of(
                                                                            "expected", Map.of("type", "STRING"),
                                                                            "heard", Map.of("type", "STRING"),
                                                                            "type", Map.of("type", "STRING")),
                                                            "required",
                                                                    List.of("expected", "heard", "type"))),
                            "feedback", Map.of("type", "STRING")),
                    "required",
                    List.of("transcript", "matched", "misreads", "feedback"));

    private final JdbcTemplate jdbc;
    private final CryptoService crypto;
    private final ObjectMapper objectMapper;
    private final RestClient gemini = RestClient.create("https://generativelanguage.googleapis.com");

    public ReadingEvaluationService(JdbcTemplate jdbc, CryptoService crypto, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.objectMapper = objectMapper;
    }

    public EvaluateResponse evaluate(long userId, String expectedText, byte[] audio, String mimeType) {
        String apiKey = decryptedKey(userId);
        if (apiKey == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Add a Gemini API key in Settings to evaluate a reading.");
        }

        String bareMimeType = bareMimeType(mimeType);

        Map<String, Object> requestBody =
                Map.of(
                        "contents",
                        List.of(
                                Map.of(
                                        "parts",
                                        List.of(
                                                Map.of("text", PROMPT_PREFIX + expectedText + PROMPT_SUFFIX),
                                                Map.of(
                                                        "inlineData",
                                                        Map.of(
                                                                "mimeType", bareMimeType,
                                                                "data", Base64.getEncoder().encodeToString(audio)))))),
                        "generationConfig",
                        Map.of(
                                "responseMimeType", "application/json",
                                "responseSchema", RESPONSE_SCHEMA));

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
            log.warn(
                    "Gemini reading-evaluation call failed: status={} body={}",
                    e.getStatusCode(),
                    e.getResponseBodyAsString());
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Evaluation failed — check your Gemini API key in Settings.",
                    e);
        } catch (RestClientException e) {
            log.warn("Gemini reading-evaluation call failed", e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Evaluation failed.", e);
        }

        String json = extractText(response);
        if (json == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Gemini returned an unexpected response shape.");
        }
        try {
            return objectMapper.readValue(json, EvaluateResponse.class);
        } catch (Exception e) {
            log.warn("Gemini reading-evaluation returned unparseable JSON: {}", json, e);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Gemini returned an unreadable evaluation.");
        }
    }

    // inlineData.mimeType wants the bare type — a browser's MediaRecorder reports
    // "audio/webm;codecs=opus", which Gemini rejects outright.
    static String bareMimeType(String mimeType) {
        return mimeType == null ? "audio/webm" : mimeType.split(";")[0].strip();
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

    private String decryptedKey(long userId) {
        String encrypted =
                jdbc.queryForObject(
                        "select gemini_api_key from app_user where id = ?", String.class, userId);
        return encrypted == null ? null : crypto.decrypt(encrypted);
    }
}
