package com.naranote.deck;

public final class DeckDtos {

    private DeckDtos() {}

    /**
     * @param id opaque; pass it back as the {@code deck} parameter rather than
     *     rebuilding it on the client. See {@link DeckRef}.
     * @param kind WORDS or KANJI — the client needs it to know which session to
     *     start and whether the deck can be exported to Anki.
     * @param unseen never studied once, which is a different thing from due:
     *     "12 due" on a deck you have never opened means something else.
     */
    public record Deck(String id, String name, String kind, int total, int due, int unseen) {}
}
