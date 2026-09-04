package com.naranote.practice;

import java.util.List;

/**
 * One card in a practice session.
 *
 * <p>The prompt is meaning plus <em>both</em> readings, not meaning alone: "book"
 * cannot distinguish 本 from 書, and "origin" cannot distinguish 本 from 元, so a
 * bare keyword leaves two defensible answers and nothing to self-grade against.
 */
public record DueCard(
        String literal,
        Integer strokeCount,
        List<String> meanings,
        List<String> onReadings,
        List<String> kunReadings,
        String strokeOrderSvg,
        boolean isNew) {
}
