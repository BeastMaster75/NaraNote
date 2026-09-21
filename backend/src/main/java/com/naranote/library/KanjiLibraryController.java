package com.naranote.library;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/library")
public class KanjiLibraryController {

    private final KanjiLibraryService libraryService;

    public KanjiLibraryController(KanjiLibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping
    public List<LibraryEntryResponse> list() {
        return libraryService.list();
    }

    /** PUT rather than POST: adding a character you already have should be a no-op. */
    @PutMapping("/{literal}")
    public ResponseEntity<Void> add(@PathVariable String literal) {
        if (!libraryService.add(literal)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such kanji");
        }
        return ResponseEntity.noContent().build();
    }

    /** @param source where these characters came from; must be BATCH or READING if given —
     *  MANUAL is reserved for the single-character add above. Defaults to BATCH. */
    public record BatchRequest(@NotEmpty List<String> literals, String source) {}

    private static final List<String> ALLOWED_BATCH_SOURCES = List.of("BATCH", "READING");

    /** Add many characters at once. Idempotent: duplicates and already-saved are counted, not rejected. */
    @PutMapping("/batch")
    public KanjiLibraryService.BatchResult addBatch(@Valid @RequestBody BatchRequest request) {
        String source = request.source() == null || request.source().isBlank() ? "BATCH" : request.source();
        if (!ALLOWED_BATCH_SOURCES.contains(source)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid source");
        }
        return libraryService.addBatch(request.literals(), source);
    }

    @DeleteMapping("/{literal}")
    public ResponseEntity<Void> remove(@PathVariable String literal) {
        libraryService.remove(literal);
        return ResponseEntity.noContent().build();
    }
}
