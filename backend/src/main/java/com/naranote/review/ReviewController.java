package com.naranote.review;

import com.naranote.deck.DeckRef;
import com.naranote.review.ReviewDtos.DueWord;
import com.naranote.review.ReviewDtos.ReviewRequest;
import com.naranote.review.ReviewDtos.ReviewResult;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/review")
public class ReviewController {

    private final VocabReviewService reviewService;

    public ReviewController(VocabReviewService reviewService) {
        this.reviewService = reviewService;
    }

    /** {@code deck} is a deck id from /api/decks; absent means everything due. */
    @GetMapping("/due")
    public List<DueWord> due(
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String deck) {
        return reviewService.due(Math.clamp(limit, 1, 100), DeckRef.parse(deck));
    }

    @GetMapping("/due/count")
    public Map<String, Long> dueCount() {
        return Map.of("due", reviewService.dueCount());
    }

    @PostMapping("/{id}")
    public ReviewResult review(@PathVariable long id, @Valid @RequestBody ReviewRequest request) {
        return reviewService
                .review(id, request.rating())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
