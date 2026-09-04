package com.naranote.practice;

import io.github.openspacedrepetition.Rating;
import jakarta.validation.constraints.NotNull;

public record ReviewRequest(
        @NotNull Rating rating,
        /** How many strokes the user actually drew, for the attempt history. */
        Integer strokesDrawn) {
}
