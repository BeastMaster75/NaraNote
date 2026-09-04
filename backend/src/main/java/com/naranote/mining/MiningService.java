package com.naranote.mining;

import com.naranote.dictionary.DictionaryDtos.EntryMatch;
import com.naranote.dictionary.DictionaryService;
import com.naranote.mining.MiningDtos.AnalyzeResponse;
import com.naranote.mining.MiningDtos.AnalyzedSentence;
import com.naranote.mining.MiningDtos.AnalyzedToken;
import com.naranote.mining.TokenizerService.Token;
import com.naranote.user.CurrentUser;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MiningService {

    private final TokenizerService tokenizer;
    private final DictionaryService dictionary;
    private final JdbcTemplate jdbc;
    private final CurrentUser currentUser;

    public MiningService(
            TokenizerService tokenizer,
            DictionaryService dictionary,
            JdbcTemplate jdbc,
            CurrentUser currentUser) {
        this.tokenizer = tokenizer;
        this.dictionary = dictionary;
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public AnalyzeResponse analyze(String text) {
        List<List<Token>> sentences =
                splitSentences(text).stream().map(tokenizer::tokenize).toList();

        Set<String> forms = new LinkedHashSet<>();
        // The reading Kuromoji assigned in context, which disambiguates entries that
        // share a spelling — 家 read いえ against 家 read うち.
        Map<String, String> readings = new LinkedHashMap<>();
        for (List<Token> sentence : sentences) {
            for (Token token : sentence) {
                if (token.content()) {
                    forms.add(token.baseForm());
                    if (token.reading() != null && !token.reading().isBlank()) {
                        readings.putIfAbsent(token.baseForm(), token.reading());
                    }
                }
            }
        }

        Map<String, List<EntryMatch>> matches = dictionary.lookup(forms, readings);
        Set<String> saved = savedTerms(forms);

        List<AnalyzedSentence> out = new ArrayList<>(sentences.size());
        int contentWords = 0;
        int known = 0;

        for (List<Token> sentence : sentences) {
            List<AnalyzedToken> tokens = new ArrayList<>(sentence.size());
            for (Token token : sentence) {
                boolean isSaved = token.content() && saved.contains(token.baseForm());
                if (token.content()) {
                    contentWords++;
                    if (isSaved) {
                        known++;
                    }
                }
                tokens.add(
                        new AnalyzedToken(
                                token.surface(),
                                token.reading(),
                                token.baseForm(),
                                token.content(),
                                isSaved,
                                token.content()
                                        ? matches.getOrDefault(token.baseForm(), List.of())
                                        : List.of()));
            }
            out.add(new AnalyzedSentence(tokens));
        }

        return new AnalyzeResponse(out, contentWords, known, contentWords - known);
    }

    private Set<String> savedTerms(Set<String> forms) {
        if (forms.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(
                jdbc.queryForList(
                        "select term from vocab_item where user_id = ? and term = any(?)",
                        String.class,
                        currentUser.id(),
                        forms.toArray(String[]::new)));
    }

    /**
     * Splits on Japanese and Latin sentence-enders, keeping the punctuation with the
     * sentence it closes so the text still reads as written.
     */
    static List<String> splitSentences(String text) {
        List<String> sentences = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\n' || c == '\r') {
                flush(sentences, current);
                continue;
            }
            current.append(c);
            if (c == '。' || c == '！' || c == '？' || c == '!' || c == '?') {
                flush(sentences, current);
            }
        }
        flush(sentences, current);
        return sentences;
    }

    private static void flush(List<String> sentences, StringBuilder current) {
        String sentence = current.toString().strip();
        if (!sentence.isEmpty()) {
            sentences.add(sentence);
        }
        current.setLength(0);
    }
}
