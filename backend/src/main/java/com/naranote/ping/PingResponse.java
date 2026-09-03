package com.naranote.ping;

import java.time.Instant;

public record PingResponse(String message, Instant createdAt) {
}
