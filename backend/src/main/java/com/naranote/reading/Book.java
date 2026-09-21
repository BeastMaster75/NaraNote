package com.naranote.reading;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A curated Aozora Bunko work (see {@code V20__book.sql}). Difficulty and text
 * aren't known until first access — {@code cachedPlainText}/{@code computedJlptLevel}
 * stay null until {@link BookService} fetches and scores the work once.
 */
@Entity
@Table(name = "book")
@Getter
@Setter
@NoArgsConstructor
public class Book {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "aozora_url", nullable = false, unique = true)
    private String aozoraUrl;

    private String title;

    private String author;

    @Column(name = "char_count")
    private Integer charCount;

    /** 1 (N1, hardest) .. 5 (N5, easiest) — same scale as {@code kanji.jlpt_level}. */
    @Column(name = "computed_jlpt_level")
    private Integer computedJlptLevel;

    @Column(name = "cached_plain_text")
    private String cachedPlainText;

    @Column(name = "synced_at")
    private Instant syncedAt;
}
