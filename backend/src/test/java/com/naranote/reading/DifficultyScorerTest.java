package com.naranote.reading;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.naranote.kanji.Kanji;
import com.naranote.kanji.KanjiRepository;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DifficultyScorerTest {

    @Mock private KanjiRepository kanjiRepository;

    private DifficultyScorer scorer() {
        return new DifficultyScorer(kanjiRepository);
    }

    private static Kanji mockKanji(String literal, Integer jlptLevel) {
        Kanji kanji = mock(Kanji.class);
        when(kanji.getLiteral()).thenReturn(literal);
        when(kanji.getJlptLevel()).thenReturn(jlptLevel);
        return kanji;
    }

    @Test
    void score_returnsNullForTextWithNoKanji() {
        assertThat(scorer().score("ひらがなだけのぶんしょうです。")).isNull();
    }

    @Test
    void score_ignoresARareOutlierAmongManyEasyKanji() {
        // 20 distinct easy (N5) kanji plus one unrated outlier — the single
        // outlier alone should not drag the whole score down to "unrated".
        StringBuilder text = new StringBuilder();
        List<Kanji> known = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            String literal = String.valueOf((char) ('一' + i));
            text.append(literal);
            known.add(mockKanji(literal, 5));
        }
        text.append("𩸽"); // rare, unrated
        known.add(mockKanji("𩸽", null));

        when(kanjiRepository.findAllById(anyList())).thenReturn(known);

        assertThat(scorer().score(text.toString())).isEqualTo(5);
    }

    @Test
    void score_pureHardTextScoresHard() {
        List<Kanji> known = List.of(mockKanji("憂", 1), mockKanji("鬱", 1));
        when(kanjiRepository.findAllById(anyList())).thenReturn(known);

        assertThat(scorer().score("憂鬱")).isEqualTo(1);
    }
}
