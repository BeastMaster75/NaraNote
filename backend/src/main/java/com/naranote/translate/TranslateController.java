package com.naranote.translate;

import com.naranote.user.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TranslateController {

    /** {@code toJapanese} false (or omitted) is Japanese to English; true is the reverse. */
    public record TranslateRequest(@NotBlank @Size(max = 4000) String text, boolean toJapanese) {}

    public record TranslateResponse(String translation) {}

    private final TranslateService translateService;
    private final CurrentUser currentUser;

    public TranslateController(TranslateService translateService, CurrentUser currentUser) {
        this.translateService = translateService;
        this.currentUser = currentUser;
    }

    @PostMapping("/api/mining/translate")
    public TranslateResponse translate(@Valid @RequestBody TranslateRequest request) {
        return new TranslateResponse(
                translateService.translate(currentUser.id(), request.text(), request.toJapanese()));
    }
}
