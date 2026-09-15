package com.naranote.mining;

import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.apache.lucene.analysis.ja.JapaneseTokenizer;
import org.apache.lucene.analysis.ja.tokenattributes.BaseFormAttribute;
import org.apache.lucene.analysis.ja.tokenattributes.PartOfSpeechAttribute;
import org.apache.lucene.analysis.ja.tokenattributes.ReadingAttribute;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.springframework.stereotype.Service;

/**
 * Splits Japanese text into words.
 *
 * <p>Uses {@code Mode.NORMAL}, not {@code SEARCH}. Search mode deliberately breaks
 * compounds apart so both halves are indexable — it would turn 山吹色 into 山吹 and
 * 色. For mining you want the longest real word, because that's the thing you'd
 * look up and save.
 */
@Service
public class TokenizerService {

    /**
     * Parts of speech that are grammar rather than vocabulary. Still returned, so
     * the sentence renders complete, but flagged so the UI can leave them alone.
     */
    private static final Set<String> FUNCTION_WORDS =
            Set.of("助詞", "助動詞", "記号", "補助記号", "接続詞", "フィラー", "その他");

    public record Token(
            String surface,
            String baseForm,
            /** Hiragana, converted from Kuromoji's katakana output. */
            String reading,
            String partOfSpeech,
            boolean content) {}

    public List<Token> tokenize(String text) {
        List<Token> tokens = new ArrayList<>();

        // JapaneseTokenizer is not thread-safe, so one per call. The dictionary
        // behind it is static and shared, so construction is cheap.
        try (JapaneseTokenizer tokenizer =
                new JapaneseTokenizer(null, false, JapaneseTokenizer.Mode.NORMAL)) {

            CharTermAttribute surface = tokenizer.addAttribute(CharTermAttribute.class);
            BaseFormAttribute baseForm = tokenizer.addAttribute(BaseFormAttribute.class);
            ReadingAttribute reading = tokenizer.addAttribute(ReadingAttribute.class);
            PartOfSpeechAttribute pos = tokenizer.addAttribute(PartOfSpeechAttribute.class);

            tokenizer.setReader(new StringReader(text));
            tokenizer.reset();
            while (tokenizer.incrementToken()) {
                String form = surface.toString();
                String base = baseForm.getBaseForm();
                String partOfSpeech = pos.getPartOfSpeech();
                tokens.add(
                        new Token(
                                form,
                                base == null ? form : base,
                                toHiragana(reading.getReading()),
                                partOfSpeech,
                                isContent(partOfSpeech, form)));
            }
            tokenizer.end();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return tokens;
    }

    private static boolean isContent(String partOfSpeech, String surface) {
        if (partOfSpeech == null) {
            return false;
        }
        String top = partOfSpeech.split("-")[0];
        if (FUNCTION_WORDS.contains(top)) {
            return false;
        }
        // 非自立 marks a word that can't stand alone — the いる in 漏れていた, or the
        // こと in ことにしている. Kuromoji applies it contextually, so 事 is still
        // offered when it genuinely means "thing"; this only drops the grammar uses.
        if (partOfSpeech.contains("非自立")) {
            return false;
        }
        // Suffixes are deliberately NOT excluded. 色 in 山吹色, 時 in 六時 and 沿い in
        // 川沿い are all tagged 接尾 in context, but each is a word a learner may well
        // want to save. Over-offering costs a glance; hiding costs the word.
        // Whitespace and anything with no Japanese in it is not worth offering.
        return surface.codePoints().anyMatch(TokenizerService::isJapanese);
    }

    private static boolean isJapanese(int codePoint) {
        return (codePoint >= 0x3040 && codePoint <= 0x30FF) // kana
                || (codePoint >= 0x3400 && codePoint <= 0x9FFF) // CJK ideographs
                || (codePoint >= 0xFF66 && codePoint <= 0xFF9D); // half-width katakana
    }

    /**
     * Kuromoji returns readings in katakana; furigana is written in hiragana. The
     * two blocks are laid out identically 0x60 apart, so the shift is exact for
     * every character that has a hiragana counterpart.
     */
    public static String toHiragana(String katakana) {
        if (katakana == null) {
            return null;
        }
        StringBuilder out = new StringBuilder(katakana.length());
        katakana
                .codePoints()
                .forEach(
                        cp -> {
                            boolean convertible = cp >= 0x30A1 && cp <= 0x30F6;
                            out.appendCodePoint(convertible ? cp - 0x60 : cp);
                        });
        return out.toString();
    }
}
