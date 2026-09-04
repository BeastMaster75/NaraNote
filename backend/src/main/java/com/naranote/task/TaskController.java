package com.naranote.task;

import com.naranote.task.TaskDtos.CreateTask;
import com.naranote.task.TaskDtos.Suggestion;
import com.naranote.task.TaskDtos.TaskResponse;
import com.naranote.task.TaskDtos.UpdateTask;
import com.naranote.user.CurrentUser;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskRepository taskRepository;
    private final SuggestionService suggestionService;
    private final CurrentUser currentUser;

    public TaskController(
            TaskRepository taskRepository,
            SuggestionService suggestionService,
            CurrentUser currentUser) {
        this.taskRepository = taskRepository;
        this.suggestionService = suggestionService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<TaskResponse> list() {
        return taskRepository
                .findByUserIdOrderByDoneAscCreatedAtDesc(currentUser.id())
                .stream()
                .map(TaskResponse::of)
                .toList();
    }

    /** Computed prompts, not stored tasks. See {@link SuggestionService}. */
    @GetMapping("/suggestions")
    public List<Suggestion> suggestions() {
        return suggestionService.suggestions();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody CreateTask request) {
        Task task = new Task();
        task.setUserId(currentUser.id());
        task.setTitle(request.title().strip());
        task.setDueDate(request.dueDate());
        task.setKanji(toArray(request.kanji()));
        Task saved = taskRepository.save(task);
        return ResponseEntity.status(HttpStatus.CREATED).body(TaskResponse.of(saved));
    }

    @PatchMapping("/{id}")
    @Transactional
    public TaskResponse update(@PathVariable Long id, @RequestBody UpdateTask request) {
        Task task = owned(id);
        if (request.title() != null) task.setTitle(request.title().strip());
        if (request.dueDate() != null) task.setDueDate(request.dueDate());
        if (request.kanji() != null) task.setKanji(toArray(request.kanji()));
        if (request.done() != null && request.done() != task.isDone()) {
            task.setDone(request.done());
            // Timestamped so the calendar can eventually show what you finished when.
            task.setCompletedAt(request.done() ? Instant.now() : null);
        }
        return TaskResponse.of(taskRepository.save(task));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        taskRepository.delete(owned(id));
        return ResponseEntity.noContent().build();
    }

    /** Scoped by user, so one account can never touch another's task by guessing an id. */
    private Task owned(Long id) {
        return taskRepository
                .findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private static String[] toArray(List<String> values) {
        return values == null ? new String[0] : values.toArray(String[]::new);
    }
}
