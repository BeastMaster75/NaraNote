package com.naranote.library;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "kanji_library")
@Getter
@NoArgsConstructor
public class KanjiLibraryEntry {

    @EmbeddedId
    private KanjiLibraryId id;

    @Column(name = "added_at", insertable = false, updatable = false)
    private Instant addedAt;

    /** How the character got here — MANUAL today, MINING once that exists. */
    private String source;

    KanjiLibraryEntry(long userId, String literal, String source) {
        this.id = new KanjiLibraryId(userId, literal);
        this.source = source;
    }
}
