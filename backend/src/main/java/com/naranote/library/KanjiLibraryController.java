package com.naranote.library;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
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

    @DeleteMapping("/{literal}")
    public ResponseEntity<Void> remove(@PathVariable String literal) {
        libraryService.remove(literal);
        return ResponseEntity.noContent().build();
    }
}
