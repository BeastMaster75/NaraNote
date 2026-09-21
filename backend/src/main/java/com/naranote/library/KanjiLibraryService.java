package com.naranote.library;

import com.naranote.kanji.Kanji;
import com.naranote.kanji.KanjiRepository;
import com.naranote.user.CurrentUser;
import com.naranote.vocab.RecognitionWordService;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KanjiLibraryService {

    private final KanjiLibraryRepository libraryRepository;
    private final KanjiRepository kanjiRepository;
    private final CurrentUser currentUser;
    private final RecognitionWordService recognitionWordService;

    public KanjiLibraryService(
            KanjiLibraryRepository libraryRepository,
            KanjiRepository kanjiRepository,
            CurrentUser currentUser,
            RecognitionWordService recognitionWordService) {
        this.libraryRepository = libraryRepository;
        this.kanjiRepository = kanjiRepository;
        this.currentUser = currentUser;
        this.recognitionWordService = recognitionWordService;
    }

    @Transactional(readOnly = true)
    public List<LibraryEntryResponse> list() {
        List<KanjiLibraryEntry> entries =
                libraryRepository.findByIdUserIdOrderByAddedAtDesc(currentUser.id());

        // Two queries rather than a join: the reference rows are fetched in one
        // batch and merged back in the order the library defined.
        Map<String, Kanji> details =
                kanjiRepository
                        .findAllById(entries.stream().map(e -> e.getId().getLiteral()).toList())
                        .stream()
                        .collect(Collectors.toMap(Kanji::getLiteral, Function.identity()));

        return entries.stream()
                .map(entry -> {
                    Kanji kanji = details.get(entry.getId().getLiteral());
                    return new LibraryEntryResponse(
                            entry.getId().getLiteral(),
                            kanji == null ? null : kanji.getStrokeCount(),
                            kanji == null ? null : kanji.getGrade(),
                            kanji == null ? null : kanji.getJlptLevel(),
                            kanji == null ? null : kanji.getFrequency(),
                            list(kanji == null ? null : kanji.getMeanings()),
                            list(kanji == null ? null : kanji.getOnReadings()),
                            list(kanji == null ? null : kanji.getKunReadings()),
                            entry.getAddedAt());
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean contains(String literal) {
        return libraryRepository.existsByIdUserIdAndIdLiteral(currentUser.id(), literal);
    }

    /** Idempotent: adding a character already in the library is a no-op. */
    @Transactional
    public boolean add(String literal) {
        if (!kanjiRepository.existsById(literal)) {
            return false;
        }
        if (!contains(literal)) {
            // Flushed, not just saved: generateFor reads kanji_library back through a
            // raw JdbcTemplate query on the same connection, which won't see a
            // pending Hibernate insert that hasn't been flushed yet.
            libraryRepository.saveAndFlush(new KanjiLibraryEntry(currentUser.id(), literal, "MANUAL"));
            recognitionWordService.generateFor(currentUser.id(), literal);
        }
        return true;
    }

    @Transactional
    public void remove(String literal) {
        libraryRepository.deleteByIdUserIdAndIdLiteral(currentUser.id(), literal);
    }

    /** Result of a batch add: how many were added, already present, or unknown. */
    public record BatchResult(int added, int alreadySaved, int notFound, List<String> notFoundLiterals) {}

    /** Same as {@link #addBatch(List, String)}, tagged {@code "BATCH"} — the original caller
     *  (bulk-pasting kanji from text) and default when no more specific source applies. */
    @Transactional
    public BatchResult addBatch(List<String> literals) {
        return addBatch(literals, "BATCH");
    }

    /**
     * Add many characters at once. Each literal must be a single code point.
     * Unknown characters and duplicates are counted but never cause a failure.
     */
    @Transactional
    public BatchResult addBatch(List<String> literals, String source) {
        // Deduplicate while preserving order for a predictable result.
        List<String> unique = literals.stream().distinct().toList();

        // One query: which of these actually exist in the kanji table?
        var knownKanji = kanjiRepository.findAllById(unique).stream()
                .map(Kanji::getLiteral)
                .collect(Collectors.toSet());

        List<String> notFoundLiterals = unique.stream()
                .filter(lit -> !knownKanji.contains(lit))
                .toList();

        // Of the ones that exist, which are already in this user's library?
        var existingEntries = libraryRepository.findByIdUserIdOrderByAddedAtDesc(currentUser.id())
                .stream()
                .map(e -> e.getId().getLiteral())
                .collect(Collectors.toSet());

        List<KanjiLibraryEntry> toSave = unique.stream()
                .filter(knownKanji::contains)
                .filter(lit -> !existingEntries.contains(lit))
                .map(lit -> new KanjiLibraryEntry(currentUser.id(), lit, "BATCH"))
                .toList();

        if (!toSave.isEmpty()) {
            // saveAllAndFlush, not saveAll: generateFor reads kanji_library back
            // through a raw JdbcTemplate query on the same connection, which won't
            // see pending Hibernate inserts that haven't been flushed yet.
            libraryRepository.saveAllAndFlush(toSave);
            for (KanjiLibraryEntry entry : toSave) {
                recognitionWordService.generateFor(currentUser.id(), entry.getId().getLiteral());
            }
        }

        int alreadySaved = (int) unique.stream()
                .filter(knownKanji::contains)
                .filter(existingEntries::contains)
                .count();

        return new BatchResult(toSave.size(), alreadySaved, notFoundLiterals.size(), notFoundLiterals);
    }

    private static List<String> list(String[] values) {
        return values == null ? List.of() : Arrays.asList(values);
    }
}
