package com.naranote.library;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Composite key: a library entry is one character belonging to one user. */
@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class KanjiLibraryId implements Serializable {

    @Column(name = "user_id")
    private Long userId;

    private String literal;
}
