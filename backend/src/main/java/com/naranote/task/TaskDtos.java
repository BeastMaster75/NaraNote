package com.naranote.task;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public final class TaskDtos {

    private TaskDtos() {}

    public record TaskResponse(
            Long id,
            String title,
            LocalDate dueDate,
            List<String> kanji,
            boolean done) {

        static TaskResponse of(Task task) {
            return new TaskResponse(
                    task.getId(),
                    task.getTitle(),
                    task.getDueDate(),
                    task.getKanji() == null ? List.of() : List.of(task.getKanji()),
                    task.isDone());
        }
    }

    public record CreateTask(
            @NotBlank @Size(max = 200) String title,
            LocalDate dueDate,
            List<String> kanji) {
    }

    /** Partial update — any null field is left alone. */
    public record UpdateTask(String title, LocalDate dueDate, List<String> kanji, Boolean done) {
    }

    /**
     * A prompt derived from real state rather than stored. It disappears when the
     * condition behind it clears, so it can never become stale or nag about
     * something already handled.
     *
     * @param kind stable identifier for the frontend to key and route on
     * @param count how many characters it concerns
     */
    public record Suggestion(String kind, String title, String detail, int count, String action) {
    }
}
