package com.naranote.kanji;

import java.time.Instant;

/**
 * One sentence from the user's collection that contains a given character.
 *
 * <p>Keyed on the sentence rather than on the word: 待 appears in 「時間を待つ」
 * whether it was saved under 待つ or under 時間, and the point of this view is
 * every place you have actually met the character — not only the entries whose
 * dictionary form happens to spell it.
 *
 * @param term the word the sentence was saved under, kept so a sentence can say
 *     where it came from rather than floating free
 * @param source where the user said the word came from (a book, a show); null
 *     when they didn't say
 */
public record KanjiSentence(
        /**
         * The row id when you filed this sentence under the character yourself,
         * null when it merely came along with a saved word. Only the former can be
         * unfiled — the latter belongs to the word and goes when the word goes.
         */
        Long id,
        String sentence,
        String term,
        String reading,
        String meaning,
        String source,
        Instant savedAt) {}
