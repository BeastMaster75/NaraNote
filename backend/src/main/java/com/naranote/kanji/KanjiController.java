package com.naranote.kanji;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
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
        // Count code points, not chars: a few CJK characters live outside the Basic
        // Multilingual Plane and arrive as two-char surrogate pairs in Java.
        if (literal.codePointCount(0, literal.length()) != 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Expected exactly one character");
        }
        return kanjiService
                .find(literal)
                .orElseThrow(() ->
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "No such kanji"));
    }
}
