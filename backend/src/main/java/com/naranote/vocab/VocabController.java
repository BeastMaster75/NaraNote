package com.naranote.vocab;

import com.naranote.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/vocab")
public class VocabController {

    public record SaveVocab(
            @NotBlank @Size(max = 100) String term,
            @Size(max = 200) String reading,
            @NotBlank @Size(max = 500) String meaning,
            @Size(max = 20) String dictEntryId,
            @Size(max = 1000) String sentence,
            @Size(max = 200) String source) {}

    public record VocabResponse(
            Long id,
            String term,
            String reading,
            String meaning,
            String sentence,
            String source,
            Instant createdAt) {

        static VocabResponse of(VocabItem item) {
            return new VocabResponse(
                    item.getId(),
                    item.getTerm(),
                    item.getReading(),
                    item.getMeaning(),
                    item.getSentence(),
                    item.getSource(),
                    item.getCreatedAt());
        }
    }

    private final VocabRepository vocabRepository;
    private final CurrentUser currentUser;

    public VocabController(VocabRepository vocabRepository, CurrentUser currentUser) {
        this.vocabRepository = vocabRepository;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<VocabResponse> list() {
        return vocabRepository.findByUserIdOrderByCreatedAtDesc(currentUser.id()).stream()
                .map(VocabResponse::of)
                .toList();
    }

    /**
     * Saving a word you already have updates it rather than failing — re-mining the
     * same word from a better sentence should be allowed to improve the entry.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<VocabResponse> save(@Valid @RequestBody SaveVocab request) {
        VocabItem item =
                vocabRepository
                        .findByUserIdAndTerm(currentUser.id(), request.term())
                        .orElseGet(
                                () -> {
                                    VocabItem fresh = new VocabItem();
                                    fresh.setUserId(currentUser.id());
                                    fresh.setTerm(request.term());
                                    return fresh;
                                });
        boolean isNew = item.getId() == null;

        item.setReading(request.reading());
        item.setMeaning(request.meaning());
        item.setDictEntryId(request.dictEntryId());
        item.setSentence(request.sentence());
        item.setSource(request.source());

        VocabItem saved = vocabRepository.save(item);
        return ResponseEntity.status(isNew ? HttpStatus.CREATED : HttpStatus.OK)
                .body(VocabResponse.of(saved));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        VocabItem item =
                vocabRepository
                        .findByIdAndUserId(id, currentUser.id())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        vocabRepository.delete(item);
        return ResponseEntity.noContent().build();
    }
}
