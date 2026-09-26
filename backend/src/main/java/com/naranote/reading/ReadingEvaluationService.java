package com.naranote.reading;

import com.naranote.gemini.GeminiClient;
import com.naranote.reading.ReadAloudScorer.Score;
import com.naranote.reading.ReadingDtos.EvaluateResponse;
import com.naranote.reading.ReadingDtos.MisreadSpan;
import com.naranote.reading.ReadingDtos.Transcription;
import com.naranote.security.CryptoService;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/**
 * Checks a recording of someone reading a known passage aloud — BYO Gemini key,
 * same pattern as {@code TranslateService}. Scoped deliberately to "did you read
 * the right words," not pitch-accent or accent quality: general ASR is built to
 * recognize *intent* through noise and mispronunciation, so it isn't a reliable
 * signal for the latter, and pretending otherwise would just be confident-sounding
 * wrong feedback — worse than no feedback.
 *
 * <p>Gemini is only a transcriber here, and is deliberately <em>not</em> shown the
 * passage. Given the text first, it hears what was meant rather than what was said
 * and passes misreadings — the one thing this feature exists to catch. The judgement
 * is {@link ReadAloudScorer}'s: plain code, the same answer every time.
 */
@Service
public class ReadingEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(ReadingEvaluationService.class);
    private static final String PROMPT =
            "Transcribe this recording of someone reading Japanese aloud. Write exactly the sounds "
                    + "they actually said, in hiragana only: no kanji, no katakana, no punctuation, "
                    + "no spaces. Write sounds as pronounced — the particle は as わ, を as お, へ as "
                    + "え. Do not correct mistakes or guess what they meant to say: if a word was "
                    + "mispronounced, write the mispronunciation. Leave out fillers like えーと and "
                    + "silence. If nothing was said, return an empty string.";

    private static final Map<String, Object> RESPONSE_SCHEMA =
            Map.of(
                    "type", "OBJECT",
                    "properties", Map.of("transcript", Map.of("type", "STRING")),
                    "required", List.of("transcript"));

    private final JdbcTemplate jdbc;
    private final CryptoService crypto;
    private final ObjectMapper objectMapper;
    private final ReadAloudScorer scorer;
    private final GeminiClient gemini;

    public ReadingEvaluationService(
            JdbcTemplate jdbc,
            CryptoService crypto,
            ObjectMapper objectMapper,
            ReadAloudScorer scorer,
            GeminiClient gemini) {
        this.jdbc = jdbc;
        this.crypto = crypto;
        this.objectMapper = objectMapper;
        this.scorer = scorer;
        this.gemini = gemini;
    }

    public EvaluateResponse evaluate(long userId, String expectedText, byte[] audio, String mimeType) {
        String transcript = transcribe(userId, audio, mimeType);
        Score score = scorer.score(expectedText, transcript);
        return new EvaluateResponse(
                transcript,
                score.misreads().isEmpty() && !transcript.isBlank(),
                score.wordCount(),
                score.misreads(),
                feedback(transcript, score));
    }

    static String feedback(String transcript, Score score) {
        if (transcript.isBlank()) {
            return "Didn't catch any speech — check your microphone and try again.";
        }
        List<MisreadSpan> misreads = score.misreads();
        if (misreads.isEmpty()) {
            return "Every word matched.";
        }
        long skipped = misreads.stream().filter(m -> m.type().equals("skipped")).count();
        String counted = misreads.size() + " of " + score.wordCount() + " words didn't match";
        return skipped == 0 ? counted + "." : counted + ", " + skipped + " of them skipped.";
    }

    private String transcribe(long userId, byte[] audio, String mimeType) {
        String apiKey = decryptedKey(userId);
        if (apiKey == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Add a Gemini API key in Settings to evaluate a reading.");
        }

        Map<String, Object> requestBody =
                Map.of(
                        "contents",
                        List.of(
                                Map.of(
                                        "parts",
                                        List.of(
                                                Map.of("text", PROMPT),
                                                Map.of(
                                                        "inlineData",
                                                        Map.of(
                                                                "mimeType", bareMimeType(mimeType),
                                                                "data", Base64.getEncoder().encodeToString(audio)))))),
                        "generationConfig",
                        Map.of(
                                "temperature", 0,
                                "responseMimeType", "application/json",
                                "responseSchema", RESPONSE_SCHEMA));

        String json = gemini.generate(apiKey, requestBody, "Evaluation");
        try {
            String transcript = objectMapper.readValue(json, Transcription.class).transcript();
            return transcript == null ? "" : transcript.strip();
        } catch (Exception e) {
            log.warn("Gemini transcription returned unparseable JSON: {}", json, e);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY, "Gemini returned an unreadable transcription.");
        }
    }

    // inlineData.mimeType wants the bare type — a browser's MediaRecorder reports
    // "audio/webm;codecs=opus", which Gemini rejects outright.
    static String bareMimeType(String mimeType) {
        return mimeType == null ? "audio/webm" : mimeType.split(";")[0].strip();
    }

    private String decryptedKey(long userId) {
        String encrypted =
                jdbc.queryForObject(
                        "select gemini_api_key from app_user where id = ?", String.class, userId);
        return encrypted == null ? null : crypto.decrypt(encrypted);
    }
}
