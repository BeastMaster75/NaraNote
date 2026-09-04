package com.naranote.review;

import io.github.openspacedrepetition.Rating;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public final class ReviewDtos {

    private ReviewDtos() {}

    /**
     * One word in a review session.
     *
     * <p>Recognition only: you are shown the word and recall what it means. That is
     * the direction mining is for — you met it while reading and want to know it
     * next time. The exported deck also carries a production card, which Anki is
     * perfectly good at.
     */
    public record DueWord(
            long id,
            String term,
            String reading,
            String meaning,
            String sentence,
            String source,
            boolean isNew) {}

    public record ReviewRequest(@NotNull Rating rating) {}

    public record ReviewResult(long id, String state, Instant due, long remainingDue) {}
}
