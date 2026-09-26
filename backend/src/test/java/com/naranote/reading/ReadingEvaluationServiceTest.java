package com.naranote.reading;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** MimeType normalization. Response walking and errors are {@code GeminiClientTest}'s. */
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
}
