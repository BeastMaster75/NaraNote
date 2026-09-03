package com.naranote.kanji;

import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KanjiService {

    private final KanjiRepository kanjiRepository;
    private final KanjiStrokeOrderRepository strokeOrderRepository;

    public KanjiService(
            KanjiRepository kanjiRepository, KanjiStrokeOrderRepository strokeOrderRepository) {
        this.kanjiRepository = kanjiRepository;
        this.strokeOrderRepository = strokeOrderRepository;
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
                                .orElse(null)));
    }
}
