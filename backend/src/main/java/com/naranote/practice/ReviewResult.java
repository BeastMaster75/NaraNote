package com.naranote.practice;

import java.time.Instant;

/** What happened to the card after a rating: when it comes back, and in what state. */
public record ReviewResult(String literal, String state, Instant due, long remainingDue) {
}
