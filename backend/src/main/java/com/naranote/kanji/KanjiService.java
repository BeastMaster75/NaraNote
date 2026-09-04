package com.naranote.kanji;

import com.naranote.library.KanjiLibraryService;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KanjiService {

    private final KanjiRepository kanjiRepository;
    private final KanjiStrokeOrderRepository strokeOrderRepository;
    private final KanjiLibraryService libraryService;
    // Radicals are a plain two-column lookup with no behaviour of their own;
    // an entity and repository for them would be pure ceremony.
    private final JdbcTemplate jdbc;

    public KanjiService(
            KanjiRepository kanjiRepository,
            KanjiStrokeOrderRepository strokeOrderRepository,
            KanjiLibraryService libraryService,
            JdbcTemplate jdbc) {
        this.kanjiRepository = kanjiRepository;
        this.strokeOrderRepository = strokeOrderRepository;
        this.libraryService = libraryService;
        this.jdbc = jdbc;
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
                        jdbc.queryForList(
                                "select radical from kanji_radical where literal = ? order by radical",
                                String.class,
                                literal),
                        strokeOrderRepository
                                .findById(literal)
                                .map(KanjiStrokeOrder::getSvg)
                                .orElse(null),
                        libraryService.contains(literal)));
    }
}
