package com.naranote.kanji;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "kanji")
@Getter
@NoArgsConstructor
public class Kanji {

    @Id
    private String literal;

    @Column(name = "stroke_count")
    private Integer strokeCount;

    private Integer grade;

    @Column(name = "jlpt_level")
    private Integer jlptLevel;

    /** Rank in a corpus of newspaper text; 1 is the most common. Null for rare characters. */
    private Integer frequency;

    @JdbcTypeCode(SqlTypes.ARRAY)
    private String[] meanings;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "on_readings")
    private String[] onReadings;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "kun_readings")
    private String[] kunReadings;

    /** Readings used only in names, which are frequently unguessable from the standard ones. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    private String[] nanori;
}
