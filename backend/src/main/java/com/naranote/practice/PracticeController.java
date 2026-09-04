package com.naranote.practice;

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
@RequestMapping("/api/practice")
public class PracticeController {

    private final PracticeService practiceService;

    public PracticeController(PracticeService practiceService) {
        this.practiceService = practiceService;
    }

    /** The session queue: characters that are new or whose interval has elapsed. */
    @GetMapping("/due")
    public List<DueCard> due(@RequestParam(defaultValue = "20") int limit) {
        return practiceService.due(Math.clamp(limit, 1, 100));
    }

    @GetMapping("/due/count")
    public Map<String, Long> dueCount() {
        return Map.of("due", practiceService.dueCount());
    }

    @PostMapping("/{literal}/review")
    public ReviewResult review(
            @PathVariable String literal, @Valid @RequestBody ReviewRequest request) {
        return practiceService
                .review(literal, request.rating(), request.strokesDrawn())
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Not in your library"));
    }
}
