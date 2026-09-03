package com.naranote.kanji;

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
        String strokeOrderSvg) {

    static KanjiResponse of(Kanji kanji, String strokeOrderSvg) {
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
                strokeOrderSvg);
    }

    private static List<String> list(String[] values) {
        return values == null ? List.of() : Arrays.asList(values);
    }
}
