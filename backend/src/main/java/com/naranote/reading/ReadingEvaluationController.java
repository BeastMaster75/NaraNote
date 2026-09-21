package com.naranote.reading;

import com.naranote.reading.ReadingDtos.EvaluateResponse;
import com.naranote.user.CurrentUser;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/reading")
public class ReadingEvaluationController {

    private final ReadingEvaluationService evaluationService;
    private final CurrentUser currentUser;

    public ReadingEvaluationController(
            ReadingEvaluationService evaluationService, CurrentUser currentUser) {
        this.evaluationService = evaluationService;
        this.currentUser = currentUser;
    }

    @PostMapping("/evaluate")
    public EvaluateResponse evaluate(
            @RequestParam("audio") MultipartFile audio,
            @RequestParam("expectedText") String expectedText) {
        if (expectedText.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing expected text.");
        }
        try {
            return evaluationService.evaluate(
                    currentUser.id(), expectedText, audio.getBytes(), audio.getContentType());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Couldn't read that recording.");
        }
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public String handleTooLarge() {
        return "That recording is too large.";
    }
}
