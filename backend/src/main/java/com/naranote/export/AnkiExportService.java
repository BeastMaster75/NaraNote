package com.naranote.export;

import com.naranote.user.CurrentUser;
import com.naranote.vocab.VocabItem;
import com.naranote.vocab.VocabRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Builds an Anki package by handing the notes to a Python script.
 *
 * <p>genanki has no Java equivalent and the {@code collection.anki2} schema is
 * undocumented and shifts between Anki versions, so reimplementing it here would
 * be the easiest thing in the app to get quietly wrong — and the failure mode is
 * corrupting someone's collection.
 *
 * <p>A script rather than a long-running service: exports are occasional, so
 * there is nothing to gain from a second process holding a port open.
 */
@Service
public class AnkiExportService {

    private static final Logger log = LoggerFactory.getLogger(AnkiExportService.class);
    private static final long TIMEOUT_SECONDS = 60;

    private final VocabRepository vocabRepository;
    private final CurrentUser currentUser;
    private final String python;
    private final Path script;
    private final ObjectMapper mapper = new ObjectMapper();

    public AnkiExportService(
            VocabRepository vocabRepository,
            CurrentUser currentUser,
            @Value("${naranote.python:python}") String python,
            @Value("${naranote.exporter-script:../exporter/build_apkg.py}") String script) {
        this.vocabRepository = vocabRepository;
        this.currentUser = currentUser;
        this.python = python;
        this.script = Path.of(script);
    }

    @Transactional(readOnly = true)
    public List<VocabItem> words() {
        return vocabRepository.findByUserIdOrderByCreatedAtDesc(currentUser.id());
    }

    /** Returns the .apkg bytes, or throws if the script failed. */
    public byte[] buildApkg(String deckName) throws IOException, InterruptedException {
        List<VocabItem> items = words();
        if (items.isEmpty()) {
            throw new IllegalStateException("Nothing to export");
        }

        Path input = Files.createTempFile("naranote-export-", ".json");
        Path output = Files.createTempFile("naranote-export-", ".apkg");
        try {
            List<Map<String, Object>> notes = new ArrayList<>(items.size());
            for (VocabItem item : items) {
                Map<String, Object> note = new java.util.HashMap<>();
                // The row id, not the term: a GUID derived from the word itself
                // would orphan the card and lose its history the moment the word
                // was edited.
                note.put("id", item.getId());
                note.put("term", item.getTerm());
                note.put("reading", item.getReading());
                note.put("meaning", item.getMeaning());
                note.put("sentence", item.getSentence());
                note.put("source", item.getSource());
                notes.add(note);
            }
            Files.writeString(
                    input,
                    mapper.writeValueAsString(Map.of("deckName", deckName, "notes", notes)),
                    StandardCharsets.UTF_8);

            run(input, output);
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(input);
            Files.deleteIfExists(output);
        }
    }

    /**
     * Finds a usable interpreter. The command differs by platform and install —
     * "python" on a Windows installer, "python3" on most Linux and macOS, "py"
     * via the Windows launcher — so try the likely ones rather than making the
     * feature depend on one PATH entry.
     */
    private String resolvePython() {
        List<String> candidates = new ArrayList<>();
        candidates.add(python);
        for (String fallback : List.of("python3", "py", "python")) {
            if (!candidates.contains(fallback)) {
                candidates.add(fallback);
            }
        }

        for (String candidate : candidates) {
            try {
                Process probe =
                        new ProcessBuilder(candidate, "--version")
                                .redirectErrorStream(true)
                                .start();
                if (probe.waitFor(10, TimeUnit.SECONDS) && probe.exitValue() == 0) {
                    return candidate;
                }
            } catch (IOException | InterruptedException ignored) {
                if (ignored instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                // Not this one; try the next.
            }
        }
        throw new IllegalStateException(
                "No Python interpreter found. Set naranote.python to its full path, "
                        + "or use the plain-text export instead.");
    }

    private void run(Path input, Path output) throws IOException, InterruptedException {
        ProcessBuilder builder =
                new ProcessBuilder(
                        resolvePython(),
                        script.toAbsolutePath().toString(),
                        input.toAbsolutePath().toString(),
                        output.toAbsolutePath().toString());
        builder.redirectErrorStream(true);
        // Without this, a Python traceback containing Japanese dies on the
        // Windows console's default code page and the real error is lost.
        builder.environment().put("PYTHONUTF8", "1");
        builder.environment().put("PYTHONIOENCODING", "utf-8");

        Process process = builder.start();
        String out;
        try (var stream = process.getInputStream()) {
            out = new String(stream.readAllBytes(), StandardCharsets.UTF_8).strip();
        }
        if (!process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Anki export timed out");
        }
        if (process.exitValue() != 0) {
            // The script's own output is the only useful diagnostic here —
            // usually a missing genanki, or malformed input.
            throw new IllegalStateException("Anki export failed: " + out);
        }
        if (!Files.exists(output) || Files.size(output) == 0) {
            throw new IllegalStateException("Anki export produced no file: " + out);
        }
        log.info("Anki export: {}", out);
    }

    /**
     * Tab-separated rather than comma-separated: meanings routinely contain
     * commas ("river; stream, brook") and quoting them correctly for every
     * importer is more fragile than avoiding the problem.
     */
    public String buildTsv() {
        StringBuilder tsv = new StringBuilder("Term\tReading\tMeaning\tSentence\tSource\n");
        for (VocabItem item : words()) {
            tsv.append(cell(item.getTerm()))
                    .append('\t')
                    .append(cell(item.getReading()))
                    .append('\t')
                    .append(cell(item.getMeaning()))
                    .append('\t')
                    .append(cell(item.getSentence()))
                    .append('\t')
                    .append(cell(item.getSource()))
                    .append('\n');
        }
        return tsv.toString();
    }

    private static String cell(String value) {
        return value == null ? "" : value.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
    }
}
