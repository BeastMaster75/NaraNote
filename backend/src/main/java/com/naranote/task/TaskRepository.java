package com.naranote.task;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {

    /** Undone first, then newest — the order the panel wants to show them in. */
    List<Task> findByUserIdOrderByDoneAscCreatedAtDesc(Long userId);

    Optional<Task> findByIdAndUserId(Long id, Long userId);
}
