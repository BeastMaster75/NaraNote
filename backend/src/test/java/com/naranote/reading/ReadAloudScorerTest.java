package com.naranote.reading;

import static org.assertj.core.api.Assertions.assertThat;

import com.naranote.mining.TokenizerService;
import com.naranote.reading.ReadAloudScorer.Score;
import com.naranote.reading.ReadingDtos.MisreadSpan;
import org.junit.jupiter.api.Test;

/** Runs the real Kuromoji tokenizer — the folding only means anything against its output. */
class ReadAloudScorerTest {

    private final ReadAloudScorer scorer = new ReadAloudScorer(new TokenizerService());

    private static final String WEATHER = "今日はいい天気です。";

    @Test
    void aCorrectReadingAsPronouncedMatches() {
        Score score = scorer.score(WEATHER, "きょうわいいてんきです");

        assertThat(score.misreads()).isEmpty();
        // 今日 は いい 天気 です — the 。 isn't something you can say.
        assertThat(score.wordCount()).isEqualTo(5);
    }

    @Test
    void spellingDifferencesAreNotMistakes() {
        // は written as は, the long vowel spelled out, and a transcript that slipped into kanji.
        assertThat(scorer.score(WEATHER, "きょうはいいてんきです").misreads()).isEmpty();
        assertThat(scorer.score(WEATHER, "きょーわいーてんきです").misreads()).isEmpty();
        assertThat(scorer.score(WEATHER, "今日はいい天気です").misreads()).isEmpty();
    }

    @Test
    void aWrongReadingIsFlaggedOnThatWordAlone() {
        Score score = scorer.score(WEATHER, "こんにちわいいてんきです");

        assertThat(score.misreads()).hasSize(1);
        MisreadSpan misread = score.misreads().get(0);
        assertThat(misread.expected()).isEqualTo("今日");
        assertThat(misread.start()).isZero();
        assertThat(misread.end()).isEqualTo(2);
        assertThat(misread.type()).isEqualTo("misread");
        assertThat(misread.say()).isEqualTo("きょー");
        assertThat(misread.heard()).startsWith("こんにち");
    }

    @Test
    void stoppingEarlyMarksTheRestSkipped() {
        Score score = scorer.score(WEATHER, "きょうわいい");

        assertThat(score.misreads()).extracting(MisreadSpan::expected).containsExactly("天気", "です");
        assertThat(score.misreads()).extracting(MisreadSpan::type).containsOnly("skipped");
        assertThat(score.misreads().get(0).start()).isEqualTo(WEATHER.indexOf("天気"));
    }

    @Test
    void theSpelledReadingIsAcceptedWhereItDiffersFromThePronunciation() {
        // 言う is pronounced ゆう; reading it as spelled isn't wrong.
        assertThat(scorer.score("友達に言う。", "ともだちにいう").misreads()).isEmpty();
        assertThat(scorer.score("友達に言う。", "ともだちにゆう").misreads()).isEmpty();
    }

    @Test
    void nothingHeardSkipsEverything() {
        Score score = scorer.score(WEATHER, "");

        assertThat(score.misreads()).hasSize(5).extracting(MisreadSpan::type).containsOnly("skipped");
        assertThat(ReadingEvaluationService.feedback("", score)).contains("microphone");
    }

    @Test
    void longVowelsFoldToOneSpelling() {
        assertThat(ReadAloudScorer.lengthen("とうきょう")).isEqualTo("とーきょー");
        assertThat(ReadAloudScorer.lengthen("とおきょお")).isEqualTo("とーきょー");
        assertThat(ReadAloudScorer.lengthen("せんせい")).isEqualTo("せんせー");
        // ん has no vowel, so the い after it is a real い.
        assertThat(ReadAloudScorer.lengthen("ほんい")).isEqualTo("ほんい");
    }

    @Test
    void feedbackCountsWhatDidntMatch() {
        Score score = scorer.score(WEATHER, "こんにちわいい");

        assertThat(ReadingEvaluationService.feedback("こんにちわいい", score))
                .isEqualTo("3 of 5 words didn't match, 2 of them skipped.");
    }
}
