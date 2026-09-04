package com.naranote.mining;

import com.naranote.dictionary.DictionaryDtos.EntryMatch;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class MiningDtos {

    private MiningDtos() {}

    public record AnalyzeRequest(@NotBlank @Size(max = 8000) String text) {}

    /**
     * @param content false for particles, punctuation and other grammar — still
     *     returned so the sentence renders whole, but not worth offering to save
     * @param saved whether this word is already in the user's collection, which is
     *     what lets a pasted passage read as a diff of what you know
     */
    public record AnalyzedToken(
            String surface,
            String reading,
            String baseForm,
            boolean content,
            boolean saved,
            List<EntryMatch> entries) {}

    public record AnalyzedSentence(List<AnalyzedToken> tokens) {}

    /**
     * @param known how many content words were already in the collection — the
     *     numerator of the comprehension figure
     */
    public record AnalyzeResponse(
            List<AnalyzedSentence> sentences, int contentWords, int known, int unknown) {}
}
