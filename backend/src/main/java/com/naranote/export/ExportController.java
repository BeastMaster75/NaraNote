package com.naranote.export;

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

    @GetMapping("/anki")
    public ResponseEntity<byte[]> anki(
            @RequestParam(defaultValue = "NaraNote") String deck) {
        byte[] apkg;
        try {
            apkg = exportService.buildApkg(deck);
        } catch (IllegalStateException empty) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, empty.getMessage());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Export interrupted");
        } catch (Exception failed) {
            // The message carries the script's own output, which is the only
            // useful thing to show when a build fails.
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, failed.getMessage(), failed);
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("naranote.apkg").build().toString())
                .body(apkg);
    }

    /** A no-dependency fallback: works even when Python isn't available. */
    @GetMapping("/csv")
    public ResponseEntity<byte[]> tsv() {
        byte[] body = exportService.buildTsv().getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "tab-separated-values", StandardCharsets.UTF_8))
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename("naranote-vocab.tsv")
                                .build()
                                .toString())
                .body(body);
    }
}
