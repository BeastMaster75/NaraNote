package com.naranote.kanji;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

public record KanjiResponse(
        String literal,
        Integer strokeCount,
        Integer grade,
        Integer jlptLevel,
        Integer frequency,
        List<String> meanings,
        List<String> onReadings,
        List<String> kunReadings,
        List<String> nanori,
        List<String> radicals,
        String strokeOrderSvg,
        /** Everything about this character that is true of you rather than of it. */
        Yours yours) {

    /** A word from the user's collection that contains this character. */
    public record SavedWord(String term, String reading, String meaning, String sentence) {}

    /**
     * All four ratings are carried, not just pass and fail: with only again and
     * good the numbers visibly fail to add up, because a Hard falls in neither.
     *
     * @param due when it next comes up. Null when the character has been removed
     *     from the library — the schedule goes, but the attempt history stays.
     */
    public record Practice(
            int attempts,
            int again,
            int hard,
            int good,
            Instant lastAttempt,
            String state,
            Instant due) {}

    /**
     * @param literal a character in your library that shares components with this one
     * @param shared how many components they have in common — one shared 木 is a
     *     weak link, two or three is a real relationship
     */
    public record Related(String literal, int shared) {}

    public record Yours(
            boolean inLibrary,
            List<SavedWord> words,
            Practice practice,
            List<Related> relatedInLibrary) {}

    static KanjiResponse of(
            Kanji kanji, List<String> radicals, String strokeOrderSvg, Yours yours) {
        return new KanjiResponse(
                kanji.getLiteral(),
                kanji.getStrokeCount(),
                kanji.getGrade(),
                kanji.getJlptLevel(),
                kanji.getFrequency(),
                list(kanji.getMeanings()),
                list(kanji.getOnReadings()),
                list(kanji.getKunReadings()),
                list(kanji.getNanori()),
                radicals,
                strokeOrderSvg,
                yours);
    }

    private static List<String> list(String[] values) {
        return values == null ? List.of() : Arrays.asList(values);
    }
}
