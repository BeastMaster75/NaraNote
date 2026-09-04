package com.naranote.vocab;

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

@Entity
@Table(name = "vocab_item")
@Getter
@Setter
@NoArgsConstructor
public class VocabItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Dictionary form — what "already saved?" compares against. */
    private String term;

    private String reading;

    /** Editable: JMdict offers many senses and usually only one fits your sentence. */
    private String meaning;

    @Column(name = "dict_entry_id")
    private String dictEntryId;

    /** The sentence this was met in. The reason the word is worth remembering. */
    private String sentence;

    private String source;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
