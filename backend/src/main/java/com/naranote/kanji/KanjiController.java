package com.naranote.kanji;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/kanji")
public class KanjiController {

    private final KanjiService kanjiService;

    public KanjiController(KanjiService kanjiService) {
        this.kanjiService = kanjiService;
    }

    @GetMapping("/{literal}")
    public KanjiResponse get(@PathVariable String literal) {
        requireSingleCharacter(literal);
        return kanjiService
                .find(literal)
                .orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "No such kanji"));
    }

    /**
     * Every sentence in the user's collection containing this character, newest
     * first. Unlike {@link KanjiResponse.Yours#words()} this is not capped: the
     * whole point of the page it feeds is to show all of them.
     */
    @GetMapping("/{literal}/sentences")
    public List<KanjiSentence> sentences(@PathVariable String literal) {
        requireSingleCharacter(literal);
        return kanjiService.sentencesContaining(literal);
    }

    /**
     * Files a sentence under this character and puts the character in the
     * library. The kanji-first half of mining: you pick the character you care
     * about in a passage, and the sentence follows it — rather than saving a word
     * and hoping its characters were the ones you wanted.
     */
    @PostMapping("/{literal}/sentences")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void fileSentence(@PathVariable String literal, @Valid @RequestBody FileSentence body) {
        requireSingleCharacter(literal);
        if (!kanjiService.fileSentence(literal, body.sentence(), body.source())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such kanji");
        }
    }

    /** @param source optional; where the passage came from. */
    public record FileSentence(@NotBlank String sentence, String source) {}

    /** Only sentences you filed yourself have an id, so only those can be unfiled. */
    @DeleteMapping("/sentences/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unfileSentence(@PathVariable long id) {
        if (!kanjiService.unfileSentence(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such sentence");
        }
    }

    /**
     * Count code points, not chars: a few CJK characters live outside the Basic
     * Multilingual Plane and arrive as two-char surrogate pairs in Java.
     */
    private static void requireSingleCharacter(String literal) {
        if (literal.codePointCount(0, literal.length()) != 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Expected exactly one character");
        }
    }
}
