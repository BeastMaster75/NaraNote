package com.naranote.reading;

import com.naranote.kanji.Kanji;
import com.naranote.kanji.KanjiRepository;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * How hard a passage is, on the same 1 (N1, hardest) .. 5 (N5, easiest) scale as
 * {@code kanji.jlpt_level} and {@code app_user.target_jlpt_level} — "books at or
 * below my level" is then a single {@code computedJlptLevel >= targetJlptLevel}
 * comparison, no scale flip needed.
 */
@Component
public class DifficultyScorer {

    /**
     * The hardest-scoring 5% of a passage's distinct kanji are treated as outliers
     * and ignored — a single rare or unrated character deep in an otherwise
     * approachable short story shouldn't hide the whole story from someone it
     * would otherwise suit.
     */
    private static final double OUTLIER_FRACTION = 0.05;

    private final KanjiRepository kanjiRepository;

    public DifficultyScorer(KanjiRepository kanjiRepository) {
        this.kanjiRepository = kanjiRepository;
    }

    /** Null if the text has no kanji the dictionary recognizes — nothing to score. */
    public Integer score(String plainText) {
        List<String> literals =
                plainText
                        .codePoints()
                        .filter(DifficultyScorer::isKanji)
                        .mapToObj(cp -> new String(Character.toChars(cp)))
                        .distinct()
                        .toList();
        if (literals.isEmpty()) {
            return null;
        }

        // Unrated (jlptLevel null — rare or name-only kanji) counts as harder than
        // any rated level rather than being skipped: a reader still has to cope
        // with it, dictionary rating or not.
        List<Integer> levels =
                kanjiRepository.findAllById(literals).stream()
                        .map(k -> k.getJlptLevel() == null ? 0 : k.getJlptLevel())
                        .sorted()
                        .toList();
        if (levels.isEmpty()) {
            return null;
        }

        int skip = (int) Math.floor(OUTLIER_FRACTION * levels.size());
        return levels.get(Math.min(skip, levels.size() - 1));
    }

    /** CJK Unified Ideographs (4E00-9FFF) and Extension A (3400-4DBF) — same range
     *  {@code BatchAddModal.tsx}'s CJK_RE uses on the frontend. */
    private static boolean isKanji(int codePoint) {
        return (codePoint >= 0x4E00 && codePoint <= 0x9FFF)
                || (codePoint >= 0x3400 && codePoint <= 0x4DBF);
    }
}
