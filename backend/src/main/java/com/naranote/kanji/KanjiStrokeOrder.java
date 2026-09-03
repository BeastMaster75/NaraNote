package com.naranote.kanji;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A KanjiVG stroke-order diagram, stored already recoloured for the app: strokes
 * follow {@code currentColor} and the stroke numbers use the accent. Roughly a
 * third of the characters in {@link Kanji} have no row here.
 */
@Entity
@Table(name = "kanji_stroke_order")
@Getter
@NoArgsConstructor
public class KanjiStrokeOrder {

    @Id
    private String literal;

    private String svg;
}
