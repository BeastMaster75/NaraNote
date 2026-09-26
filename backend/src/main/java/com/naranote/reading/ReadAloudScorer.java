package com.naranote.reading;

import com.naranote.mining.TokenizerService;
import com.naranote.mining.TokenizerService.Token;
import com.naranote.reading.ReadingDtos.MisreadSpan;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Decides which words of a passage were misread, by comparing sounds rather than asking a model.
 *
 * <p>Gemini only transcribes (see {@link ReadingEvaluationService}); it never sees the passage,
 * because a model told what someone was <em>meant</em> to say tends to hear exactly that. The
 * judgement happens here: both sides are reduced to hiragana as spoken, aligned by edit
 * distance, and any word whose sounds weren't all heard in place is a misread.
 *
 * <p>Folding that makes spelling differences not count as mistakes: は/へ/を as particles, ぢ/づ,
 * and long vowels in any spelling (とうきょう, とーきょー and とおきょお all compare equal). The
 * cost is that は↔わ and へ↔え stop being distinguishable inside content words too — a real
 * misreading of that one kind goes unnoticed, which beats flagging every correct particle.
 */
@Component
public class ReadAloudScorer {

    private final TokenizerService tokenizer;

    public ReadAloudScorer(TokenizerService tokenizer) {
        this.tokenizer = tokenizer;
    }

    /**
     * One checkable word of the passage.
     *
     * @param say what to feed text-to-speech to hear it said correctly
     * @param spoken normalized kana, as pronounced
     * @param spelled normalized kana, as spelled — accepted too, since 言う said いう is not wrong
     */
    record Unit(String surface, int start, String say, String spoken, String spelled) {}

    public record Score(List<MisreadSpan> misreads, int wordCount) {}

    public Score score(String expectedText, String heardText) {
        return align(units(expectedText), lengthen(fold(spokenForm(heardText))));
    }

    /**
     * The words that can be checked by ear. Punctuation, numerals and anything Kuromoji has no
     * pronunciation for are left out rather than guessed at — a digit could be read three ways.
     */
    List<Unit> units(String text) {
        List<Unit> units = new ArrayList<>();
        for (Token token : tokenizer.tokenize(text)) {
            String spoken = fold(token.pronunciation());
            if (spoken.isEmpty() || !hasKanaOrKanji(token.surface())) continue;
            units.add(
                    new Unit(
                            token.surface(),
                            token.start(),
                            token.pronunciation(),
                            spoken,
                            fold(token.reading())));
        }
        return units;
    }

    /**
     * Gemini is asked for hiragana only, but may still hand back a kanji or a katakana loanword.
     * Running the transcript through the same tokenizer turns any of those into sounds, and
     * leaves plain kana as it was.
     */
    private String spokenForm(String heard) {
        if (heard == null || heard.isBlank()) return "";
        StringBuilder out = new StringBuilder();
        for (Token token : tokenizer.tokenize(heard)) {
            out.append(token.pronunciation() != null ? token.pronunciation() : token.surface());
        }
        return out.toString();
    }

    static Score align(List<Unit> units, String heard) {
        // The passage as one string, each character remembering which word it belongs to.
        StringBuilder expectedBuilder = new StringBuilder();
        List<Integer> unitStarts = new ArrayList<>();
        for (Unit unit : units) {
            unitStarts.add(expectedBuilder.length());
            expectedBuilder.append(unit.spoken());
        }
        // Long-vowel folding looks at the previous sound, so it has to run across the whole
        // string — a word starting with い after one ending in い would otherwise fold on one
        // side and not the other.
        String expected = lengthen(expectedBuilder.toString());
        int n = expected.length();
        int m = heard.length();

        int[][] cost = new int[n + 1][m + 1];
        for (int i = 0; i <= n; i++) cost[i][0] = i;
        for (int j = 0; j <= m; j++) cost[0][j] = j;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                int substitute = cost[i - 1][j - 1] + (expected.charAt(i - 1) == heard.charAt(j - 1) ? 0 : 1);
                cost[i][j] = Math.min(substitute, Math.min(cost[i - 1][j], cost[i][j - 1]) + 1);
            }
        }

        // heardAt[i]: the character heard in place of expected[i], or 0 if it was dropped.
        // insertedBefore[i]: anything extra heard just before expected[i].
        char[] heardAt = new char[n];
        boolean[] wrong = new boolean[n];
        StringBuilder[] insertedBefore = new StringBuilder[n + 1];
        for (int k = 0; k <= n; k++) insertedBefore[k] = new StringBuilder();
        int i = n;
        int j = m;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0
                    && cost[i][j] == cost[i - 1][j - 1] + (expected.charAt(i - 1) == heard.charAt(j - 1) ? 0 : 1)) {
                heardAt[i - 1] = heard.charAt(j - 1);
                wrong[i - 1] = expected.charAt(i - 1) != heard.charAt(j - 1);
                i--;
                j--;
            } else if (i > 0 && cost[i][j] == cost[i - 1][j] + 1) {
                wrong[i - 1] = true;
                i--;
            } else {
                insertedBefore[i].insert(0, heard.charAt(j - 1));
                j--;
            }
        }

        List<MisreadSpan> misreads = new ArrayList<>();
        for (int u = 0; u < units.size(); u++) {
            Unit unit = units.get(u);
            int from = unitStarts.get(u);
            int to = u + 1 < units.size() ? unitStarts.get(u + 1) : n;

            boolean anyWrong = false;
            boolean allDropped = true;
            StringBuilder heardHere = new StringBuilder();
            for (int k = from; k < to; k++) {
                // Extras at a word's edges are left alone — alignment can't tell whether
                // they belong to this word or its neighbour, and a stray "えっと" between words
                // isn't a misreading of either. Extras inside a word are.
                if (k > from && !insertedBefore[k].isEmpty()) {
                    anyWrong = true;
                    heardHere.append(insertedBefore[k]);
                }
                if (wrong[k]) anyWrong = true;
                if (heardAt[k] != 0) {
                    allDropped = false;
                    heardHere.append(heardAt[k]);
                }
            }
            if (!anyWrong) continue;
            if (isAcceptedVariant(heardHere.toString(), unit)) continue;
            // Alignment puts an extra sound before a word rather than after its neighbour, so
            // こんにち for 今日 arrives as こ + んにち. Harmless to ignore when judging, but the
            // word is already wrong here and "heard" should show the whole of it.
            heardHere.insert(0, insertedBefore[from]);

            misreads.add(
                    new MisreadSpan(
                            unit.start(),
                            unit.start() + unit.surface().length(),
                            unit.surface(),
                            TokenizerService.toHiragana(unit.say()),
                            heardHere.toString(),
                            allDropped ? "skipped" : "misread"));
        }
        return new Score(misreads, units.size());
    }

    /**
     * Readings that differ from Kuromoji's pronunciation without being wrong: the word said as
     * spelled, and 言う said ゆう — how everyone says it, though IPADIC records it as いう.
     */
    private static boolean isAcceptedVariant(String heard, Unit unit) {
        String spelled = lengthen(unit.spelled());
        return heard.equals(spelled) || heard.equals(lengthen(unit.spelled().replace("いう", "ゆう")));
    }

    /** Katakana to hiragana, drops everything that isn't kana, folds spellings of one sound. */
    static String fold(String text) {
        if (text == null) return "";
        String hiragana = TokenizerService.toHiragana(text);
        StringBuilder out = new StringBuilder(hiragana.length());
        for (int k = 0; k < hiragana.length(); k++) {
            char c = hiragana.charAt(k);
            if (c == 'ー') {
                out.append(c);
                continue;
            }
            if (c < 'ぁ' || c > 'ゖ') continue;
            out.append(
                    switch (c) {
                        case 'ぢ' -> 'じ';
                        case 'づ' -> 'ず';
                        case 'を' -> 'お';
                        case 'は' -> 'わ';
                        case 'へ' -> 'え';
                        default -> c;
                    });
        }
        return out.toString();
    }

    /**
     * Writes every lengthened vowel as ー, so the spellings of one long sound compare equal: a
     * vowel repeating the one before it, う after an o-sound (とう), い after an e-sound (せい).
     */
    static String lengthen(String kana) {
        StringBuilder out = new StringBuilder(kana.length());
        char previousVowel = 0;
        for (int k = 0; k < kana.length(); k++) {
            char c = kana.charAt(k);
            char vowel = vowelOf(c);
            boolean isPlainVowel = "あいうえお".indexOf(c) >= 0;
            if (c == 'ー'
                    || (isPlainVowel
                            && previousVowel != 0
                            && (vowel == previousVowel
                                    || (c == 'う' && previousVowel == 'o')
                                    || (c == 'い' && previousVowel == 'e')))) {
                out.append('ー');
                // The vowel carries on through the lengthening.
                continue;
            }
            out.append(c);
            previousVowel = vowel;
        }
        return out.toString();
    }

    private static final String[] VOWEL_ROWS = {
        "あかさたなはまやらわがざだばぱぁゃゎ",
        "いきしちにひみりぎじぢびぴぃ",
        "うくすつぬふむゆるぐずづぶぷぅゅゔ",
        "えけせてねへめれげぜでべぺぇ",
        "おこそとのほもよろをごぞどぼぽぉょ",
    };
    private static final char[] VOWELS = {'a', 'i', 'u', 'e', 'o'};

    /** The vowel a kana ends on — 0 for っ and ん, which don't have one. */
    static char vowelOf(char c) {
        for (int row = 0; row < VOWEL_ROWS.length; row++) {
            if (VOWEL_ROWS[row].indexOf(c) >= 0) return VOWELS[row];
        }
        return 0;
    }

    private static boolean hasKanaOrKanji(String text) {
        return text.codePoints()
                .anyMatch(cp -> (cp >= 0x3040 && cp <= 0x30FF) || (cp >= 0x3400 && cp <= 0x9FFF));
    }
}
