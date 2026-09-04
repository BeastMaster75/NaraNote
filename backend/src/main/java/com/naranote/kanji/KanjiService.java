package com.naranote.kanji;

import com.naranote.library.KanjiLibraryService;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KanjiService {

    private final KanjiRepository kanjiRepository;
    private final KanjiStrokeOrderRepository strokeOrderRepository;
    private final KanjiLibraryService libraryService;

    public KanjiService(
            KanjiRepository kanjiRepository,
            KanjiStrokeOrderRepository strokeOrderRepository,
            KanjiLibraryService libraryService) {
        this.kanjiRepository = kanjiRepository;
        this.strokeOrderRepository = strokeOrderRepository;
        this.libraryService = libraryService;
    }

    /**
     * Looks up one character. The stroke-order diagram is optional — around a third
     * of the characters KANJIDIC2 knows about have no KanjiVG drawing.
     */
    @Transactional(readOnly = true)
    public Optional<KanjiResponse> find(String literal) {
        return kanjiRepository
                .findById(literal)
                .map(kanji -> KanjiResponse.of(
                        kanji,
                        strokeOrderRepository
                                .findById(literal)
                                .map(KanjiStrokeOrder::getSvg)
                                .orElse(null),
                        libraryService.contains(literal)));
    }
}
