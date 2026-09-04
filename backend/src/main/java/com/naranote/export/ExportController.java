package com.naranote.export;

import com.naranote.deck.DeckRef;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/export")
public class ExportController {

    private final AnkiExportService exportService;

    public ExportController(AnkiExportService exportService) {
        this.exportService = exportService;
    }

    /** {@code deck} is a deck id from /api/decks; absent exports every word. */
    @GetMapping("/anki")
    public ResponseEntity<byte[]> anki(@RequestParam(required = false) String deck) {
        DeckRef ref = DeckRef.parse(deck);
        byte[] apkg;
        try {
            apkg = exportService.buildApkg(ankiDeckName(ref), ref);
        } catch (IllegalStateException empty) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, empty.getMessage());
        } catch (Exception failed) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, failed.getMessage(), failed);
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition(ref, "apkg"))
                .body(apkg);
    }

    /** A no-dependency fallback: works even when Python isn't available. */
    @GetMapping("/csv")
    public ResponseEntity<byte[]> tsv(@RequestParam(required = false) String deck) {
        DeckRef ref = DeckRef.parse(deck);
        byte[] body = exportService.buildTsv(ref).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "tab-separated-values", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition(ref, "tsv"))
                .body(body);
    }

    /**
     * Anki reads "::" as a subdeck separator, so a per-deck export lands as
     * NaraNote::よつばと！ rather than as another top-level deck cluttering the
     * sidebar. Exporting everything keeps the flat "NaraNote" name it always had.
     */
    private static String ankiDeckName(DeckRef deck) {
        if (deck == null || deck.kind() != DeckRef.Kind.WORDS) return "NaraNote";
        return "NaraNote::" + (deck.isUnsorted() ? "Unsorted" : deck.source());
    }

    /**
     * Exporting three decks in a row should not give three files called
     * naranote.apkg. Encoded with the UTF-8 overload so a Japanese source name
     * survives in the filename instead of being mangled to question marks.
     */
    private static String disposition(DeckRef deck, String extension) {
        String stem = "naranote";
        if (deck != null && deck.kind() == DeckRef.Kind.WORDS) {
            stem += "-" + (deck.isUnsorted() ? "unsorted" : safe(deck.source()));
        }
        return ContentDisposition.attachment()
                .filename(stem + "." + extension, StandardCharsets.UTF_8)
                .build()
                .toString();
    }

    /** Source names are free text, so keep anything path-like out of a filename. */
    private static String safe(String value) {
        String cleaned = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").strip();
        return cleaned.isEmpty() ? "deck" : cleaned;
    }
}
