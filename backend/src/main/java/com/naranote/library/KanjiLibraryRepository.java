package com.naranote.library;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KanjiLibraryRepository
        extends JpaRepository<KanjiLibraryEntry, KanjiLibraryId> {

    List<KanjiLibraryEntry> findByIdUserIdOrderByAddedAtDesc(Long userId);

    boolean existsByIdUserIdAndIdLiteral(Long userId, String literal);

    void deleteByIdUserIdAndIdLiteral(Long userId, String literal);
}
