package com.naranote.kanji;

import static org.assertj.core.api.Assertions.assertThat;

import com.naranote.kanji.KanjiResponse.SavedWord;
import com.naranote.kanji.KanjiService.CandidateWord;
import java.util.List;
import org.junit.jupiter.api.Test;

class KanjiServiceTest {

    private static final String[] ON_READINGS = {"ニチ", "ジツ"};
    private static final String[] KUN_READINGS = {"ひ", "-び", "-か"};

    @Test
    void bucketByReading_spreadsAcrossReadingsAndCapsEach() {
        // Ranked by commonality already, as the real query would return them.
        List<CandidateWord> candidates =
                List.of(
                        new CandidateWord("日曜日", "にちようび", "Sunday", null),
                        new CandidateWord("毎日", "まいにち", "every day", null),
                        // Third にち candidate — must be dropped, the bucket is full.
                        new CandidateWord("一日中", "いちにちじゅう", "all day long", null),
                        new CandidateWord("本日", "ほんじつ", "today (formal)", null),
                        // Neither reading matches 明日/今日 at all — must land in "other".
                        new CandidateWord("明日", "あした", "tomorrow", null),
                        new CandidateWord("今日", "きょう", "today", null));

        List<SavedWord> result =
                KanjiService.bucketByReading(candidates, ON_READINGS, KUN_READINGS);

        assertThat(result).extracting(SavedWord::term)
                .containsExactly("日曜日", "毎日", "本日", "明日", "今日");

        // The dominant reading (にち) doesn't crowd out the others: ジツ still shows up.
        assertThat(result).extracting(SavedWord::term).contains("本日");
        // Capped at two even though a third にち candidate was available.
        assertThat(result).extracting(SavedWord::term).doesNotContain("一日中");
    }

    @Test
    void classifyReading_fallsBackToOtherWhenNothingMatches() {
        List<String> on = List.of("にち", "じつ");
        List<String> kun = List.of("ひ", "び", "か");

        assertThat(KanjiService.classifyReading("にちようび", on, kun)).isEqualTo("にち");
        assertThat(KanjiService.classifyReading("あした", on, kun)).isEqualTo("other");
        assertThat(KanjiService.classifyReading(null, on, kun)).isEqualTo("other");
    }

    @Test
    void kunStem_stripsOkuriganaAndDashes() {
        assertThat(KanjiService.kunStem("ちい.さい")).isEqualTo("ちい");
        assertThat(KanjiService.kunStem("-び")).isEqualTo("び");
        assertThat(KanjiService.kunStem("こ-")).isEqualTo("こ");
        assertThat(KanjiService.kunStem("ひ")).isEqualTo("ひ");
    }
}
