package com.naranote.reading;

import com.naranote.mining.MiningDtos.AnalyzeResponse;
import com.naranote.mining.MiningService;
import com.naranote.reading.ReadingDtos.ExtractResponse;
import com.naranote.reading.ReadingDtos.ReadingAnalyzeRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;

/**
 * A custom Read passage — file upload or pasted text — is analyzed for one
 * session and handed straight back to the client, never persisted server-side.
 * The same way Mining never keeps a passage either, only what's explicitly
 * saved out of it.
 */
@RestController
@RequestMapping("/api/reading")
public class ReadingContentController {

    private static final int MAX_CHARS = 40000;

    private final ContentExtractionService extraction;
    private final MiningService miningService;

    public ReadingContentController(ContentExtractionService extraction, MiningService miningService) {
        this.extraction = extraction;
        this.miningService = miningService;
    }

    @PostMapping("/extract")
    public ExtractResponse extract(@RequestParam("file") MultipartFile file) {
        return new ExtractResponse(extraction.extract(file));
    }

    @PostMapping("/analyze")
    public AnalyzeResponse analyze(@Valid @RequestBody ReadingAnalyzeRequest request) {
        return miningService.analyze(truncateAtSentenceBoundary(request.text(), MAX_CHARS));
    }

    private static String truncateAtSentenceBoundary(String text, int maxChars) {
        if (text.length() <= maxChars) {
            return text;
        }
        String cut = text.substring(0, maxChars);
        int lastBoundary =
                Math.max(
                        Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！')),
                        Math.max(cut.lastIndexOf('？'), cut.lastIndexOf('\n')));
        return lastBoundary > 0 ? cut.substring(0, lastBoundary + 1) : cut;
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    @ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
    public String handleTooLarge() {
        return "That file is too large — the limit is 20MB.";
    }
}
