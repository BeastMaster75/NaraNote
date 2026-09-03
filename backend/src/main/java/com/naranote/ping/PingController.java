package com.naranote.ping;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PingController {

    private final PingRepository pingRepository;

    public PingController(PingRepository pingRepository) {
        this.pingRepository = pingRepository;
    }

    @GetMapping("/ping")
    public PingResponse ping() {
        Ping ping = pingRepository.findAll().stream()
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("ping table is empty"));
        return new PingResponse(ping.getMessage(), ping.getCreatedAt());
    }
}
