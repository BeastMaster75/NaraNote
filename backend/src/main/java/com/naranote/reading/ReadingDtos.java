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

    /** @param type a short label for what kind of mismatch this was (e.g. "misread",
     *     "skipped", "added") — free-form rather than an enum, since Gemini is the one
     *     filling it in and the exact taxonomy isn't fixed yet. */
    public record MisreadSpan(String expected, String heard, String type) {}

    /** @param matched whether the recording matched the expected text overall
     *  @param feedback one short, specific sentence — never a bare score */
    public record EvaluateResponse(
            String transcript, boolean matched, List<MisreadSpan> misreads, String feedback) {}
}
