package com.naranote.search;

import com.naranote.dictionary.DictionaryDtos.EntryMatch;
import java.util.List;

public final class SearchDtos {

    private SearchDtos() {}

    /** No {@code Yours} here on purpose — that's 4+ queries per kanji, worth paying only for
     * the one kanji actually clicked into, not every row in a results list. */
    public record KanjiHit(
            String literal, List<String> meanings, List<String> onReadings, List<String> kunReadings) {}

    public record SearchResponse(List<KanjiHit> kanji, List<EntryMatch> words) {}
}
