package com.naranote.export;

import com.naranote.deck.DeckRef;
import com.naranote.user.CurrentUser;
import com.naranote.vocab.VocabItem;
import com.naranote.vocab.VocabRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds an Anki package from the user's vocabulary.
 *
 * <p>Written in Java rather than shelled out to genanki, so the export needs no
 * Python and no third-party package — an {@code .apkg} is a zip around a SQLite
 * database, which the JVM can write on its own. See {@link ApkgWriter} for the
 * format, which was derived from genanki's output and verified against it.
 */
@Service
public class AnkiExportService {

    private final VocabRepository vocabRepository;
    private final CurrentUser currentUser;

    public AnkiExportService(VocabRepository vocabRepository, CurrentUser currentUser) {
        this.vocabRepository = vocabRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<VocabItem> words(DeckRef deck) {
        List<VocabItem> all = vocabRepository.findByUserIdOrderByCreatedAtDesc(currentUser.id());
        if (deck == null || deck.kind() != DeckRef.Kind.WORDS) {
            return all;
        }
        // Filtered here rather than in a query: the deck's source is already the
        // grouping key the hub computed, and the list is small enough that a
        // second repository method earns nothing.
        return all.stream().filter(item -> deck.equals(deckOf(item))).toList();
    }

    /** The deck a word belongs to, by the same folding rule as the hub's counts. */
    private static DeckRef deckOf(VocabItem item) {
        return DeckRef.words(item.getSource());
    }

    public byte[] buildApkg(String deckName, DeckRef deck) throws IOException, SQLException {
        List<VocabItem> items = words(deck);
        if (items.isEmpty()) {
            throw new IllegalStateException("Nothing to export");
        }

        List<ApkgWriter.Note> notes = new ArrayList<>(items.size());
        for (VocabItem item : items) {
            notes.add(
                    new ApkgWriter.Note(
                            // Keyed on the row id, never the term: a GUID derived
                            // from the word itself would orphan the card and lose
                            // its history the moment the word was edited.
                            NaraNoteDeck.guidFor("naranote-vocab", item.getId()),
                            List.of(
                                    orEmpty(item.getTerm()),
                                    orEmpty(item.getReading()),
                                    orEmpty(item.getMeaning()),
                                    orEmpty(item.getSentence()),
                                    orEmpty(item.getSource()))));
        }

        Path output = Files.createTempFile("naranote-export-", ".apkg");
        try {
            Files.deleteIfExists(output);
            ApkgWriter.write(
                    output,
                    NaraNoteDeck.MODEL_ID,
                    NaraNoteDeck.DECK_ID,
                    NaraNoteDeck.modelJson(),
                    NaraNoteDeck.decksJson(deckName),
                    NaraNoteDeck.confJson(),
                    NaraNoteDeck.dconfJson(),
                    NaraNoteDeck.TEMPLATE_COUNT,
                    notes);
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    /**
     * Tab-separated rather than comma-separated: meanings routinely contain
     * commas ("river; stream, brook") and quoting them correctly for every
     * importer is more fragile than avoiding the problem.
     */
    public String buildTsv(DeckRef deck) {
        StringBuilder tsv = new StringBuilder("Term\tReading\tMeaning\tSentence\tSource\n");
        for (VocabItem item : words(deck)) {
            tsv.append(cell(item.getTerm()))
                    .append('\t')
                    .append(cell(item.getReading()))
                    .append('\t')
                    .append(cell(item.getMeaning()))
                    .append('\t')
                    .append(cell(item.getSentence()))
                    .append('\t')
                    .append(cell(item.getSource()))
                    .append('\n');
        }
        return tsv.toString();
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String cell(String value) {
        return value == null ? "" : value.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
    }
}
