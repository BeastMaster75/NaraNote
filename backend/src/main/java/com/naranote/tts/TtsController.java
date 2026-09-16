package com.naranote.tts;

import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TtsController {

    private final TtsService tts;

    public TtsController(TtsService tts) {
        this.tts = tts;
    }

    /**
     * A reading's audio never changes, so this is cacheable forever — the browser's own HTTP
     * cache then skips repeat fetches for a word seen again in the same or a later session.
     */
    @GetMapping("/api/tts")
    public ResponseEntity<byte[]> speak(@RequestParam String text) {
        return ResponseEntity.ok()
                .contentType(new MediaType("audio", "wav"))
                .cacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable())
                .body(tts.speak(text));
    }
}
