package com.naranote.mining;

import com.naranote.mining.MiningDtos.AnalyzeRequest;
import com.naranote.mining.MiningDtos.AnalyzeResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mining")
public class MiningController {

    private final MiningService miningService;

    public MiningController(MiningService miningService) {
        this.miningService = miningService;
    }

    /** POST rather than GET: the input is a passage of text, not a query parameter. */
    @PostMapping("/analyze")
    public AnalyzeResponse analyze(@Valid @RequestBody AnalyzeRequest request) {
        return miningService.analyze(request.text());
    }
}
