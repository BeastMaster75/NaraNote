package com.naranote.library;

import java.time.Instant;
import java.util.List;

public record LibraryEntryResponse(
        String literal,
        Integer strokeCount,
        Integer grade,
        Integer jlptLevel,
        Integer frequency,
        List<String> meanings,
        List<String> onReadings,
        List<String> kunReadings,
        Instant addedAt) {
}
