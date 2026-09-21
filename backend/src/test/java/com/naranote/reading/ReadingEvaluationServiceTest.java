package com.naranote.reading;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Covers the deterministic pieces of the Gemini call — mimeType normalization and
 * response-shape walking — the same scope {@code TranslateService} (which this
 * mirrors) is exercised at today: no test wraps its RestClient chain either.
 */
class ReadingEvaluationServiceTest {

    @Test
    void bareMimeType_stripsCodecsSuffix() {
        assertThat(ReadingEvaluationService.bareMimeType("audio/webm;codecs=opus"))
                .isEqualTo("audio/webm");
    }

    @Test
    void bareMimeType_leavesABareTypeUnchanged() {
        assertThat(ReadingEvaluationService.bareMimeType("audio/ogg")).isEqualTo("audio/ogg");
    }

    @Test
    void bareMimeType_fallsBackWhenMissing() {
        assertThat(ReadingEvaluationService.bareMimeType(null)).isEqualTo("audio/webm");
    }

    @Test
    void extractText_walksCandidatesContentPartsText() {
        Map<String, Object> response =
                Map.of(
                        "candidates",
                        List.of(
                                Map.of(
                                        "content",
                                        Map.of("parts", List.of(Map.of("text", "{\"transcript\":\"hi\"}"))))));

        assertThat(ReadingEvaluationService.extractText(response)).isEqualTo("{\"transcript\":\"hi\"}");
    }

    @Test
    void extractText_returnsNullOnUnexpectedShape() {
        assertThat(ReadingEvaluationService.extractText(Map.of("candidates", List.of()))).isNull();
        assertThat(ReadingEvaluationService.extractText(null)).isNull();
    }
}
