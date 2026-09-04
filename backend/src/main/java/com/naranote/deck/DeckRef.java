package com.naranote.deck;

/**
 * Which deck a request is about.
 *
 * <p>Decks are not a table. Word decks are the distinct values of {@code
 * vocab_item.source} — the "Where it's from" field the mining page already
 * captures — and there is one built-in deck for handwriting. That means no
 * membership rows to keep in step, and a word's deck changes by editing the word.
 *
 * <p>The wire form is a single opaque string so the client never has to encode
 * the awkward case. "No source" is a real deck (you mined some words without
 * saying where from), and it has to be distinguishable from "every deck" — two
 * separate query parameters cannot express that without an ambiguous empty
 * value, so the id carries it:
 *
 * <pre>
 *   kanji            the handwriting deck
 *   words:よつばと！   words whose source is よつばと！
 *   words:           words with no source at all
 * </pre>
 */
public record DeckRef(Kind kind, String source) {

    public enum Kind {
        WORDS,
        KANJI
    }

    private static final String WORDS_PREFIX = "words:";
    private static final String KANJI_ID = "kanji";

    public static final DeckRef KANJI = new DeckRef(Kind.KANJI, null);

    public static DeckRef words(String source) {
        return new DeckRef(Kind.WORDS, blankToNull(source));
    }

    /** Null for "every deck" — an absent parameter, not an invalid one. */
    public static DeckRef parse(String id) {
        if (id == null || id.isBlank()) return null;
        if (KANJI_ID.equals(id)) return KANJI;
        if (id.startsWith(WORDS_PREFIX)) return words(id.substring(WORDS_PREFIX.length()));
        // Unrecognised ids are treated as no filter rather than an error: a stale
        // bookmark should show you everything, not a 400.
        return null;
    }

    public String id() {
        return kind == Kind.KANJI ? KANJI_ID : WORDS_PREFIX + (source == null ? "" : source);
    }

    /** True when this is the catch-all deck of words saved without a source. */
    public boolean isUnsorted() {
        return kind == Kind.WORDS && source == null;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
