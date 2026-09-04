package com.naranote.vocab;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VocabRepository extends JpaRepository<VocabItem, Long> {

    List<VocabItem> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<VocabItem> findByUserIdAndTerm(Long userId, String term);

    Optional<VocabItem> findByIdAndUserId(Long id, Long userId);
}
