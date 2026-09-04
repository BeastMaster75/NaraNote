package com.naranote.dictionary;

import java.util.List;

public final class DictionaryDtos {

    private DictionaryDtos() {}

    public record Sense(List<String> partOfSpeech, List<String> glosses) {}

    /**
     * One dictionary entry as shown next to a word.
     *
     * @param kanji the entry's primary written form, or null for kana-only words
     * @param reading the entry's primary kana reading
     */
    public record EntryMatch(
            String id, boolean common, String kanji, String reading, List<Sense> senses) {}
}
