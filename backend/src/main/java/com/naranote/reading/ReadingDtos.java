package com.naranote.reading;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class ReadingDtos {

    private ReadingDtos() {}

    public record ExtractResponse(String text) {}

    /**
     * A larger cap than Mining's 8000 chars — a short story or EPUB chapter runs
     * longer than a pasted excerpt. Text past the cap is truncated at a sentence
     * boundary before analysis, not just cut mid-word.
     */
    public record ReadingAnalyzeRequest(@NotBlank @Size(max = 40000) String text) {}

    /**
     * One word of the passage that wasn't heard as written.
     *
     * @param start offset into the expected text, so the client can underline the word in
     *     place without re-tokenizing
     * @param say the word in hiragana as it should sound — what to hand /api/tts
     * @param heard the kana actually heard in its place, empty if skipped
     * @param type "misread" or "skipped"
     */
    public record MisreadSpan(int start, int end, String expected, String say, String heard, String type) {}

    /**
     * @param transcript what Gemini heard, in hiragana
     * @param wordCount words that could be checked by ear — punctuation and numerals aren't
     * @param feedback one short, specific sentence — never a bare score
     */
    public record EvaluateResponse(
            String transcript,
            boolean matched,
            int wordCount,
            List<MisreadSpan> misreads,
            String feedback) {}

    /** The only thing Gemini is asked for. */
    public record Transcription(String transcript) {}
}
