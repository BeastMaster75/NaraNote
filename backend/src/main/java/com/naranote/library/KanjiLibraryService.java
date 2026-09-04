package com.naranote.library;

import com.naranote.kanji.Kanji;
import com.naranote.kanji.KanjiRepository;
import com.naranote.user.CurrentUser;
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

    public KanjiLibraryService(
            KanjiLibraryRepository libraryRepository,
            KanjiRepository kanjiRepository,
            CurrentUser currentUser) {
        this.libraryRepository = libraryRepository;
        this.kanjiRepository = kanjiRepository;
        this.currentUser = currentUser;
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
            libraryRepository.save(new KanjiLibraryEntry(currentUser.id(), literal, "MANUAL"));
        }
        return true;
    }

    @Transactional
    public void remove(String literal) {
        libraryRepository.deleteByIdUserIdAndIdLiteral(currentUser.id(), literal);
    }

    private static List<String> list(String[] values) {
        return values == null ? List.of() : Arrays.asList(values);
    }
}
