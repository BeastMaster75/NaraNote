package com.naranote.dictionary;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * One-off loader for JMdict. Run explicitly:
 *
 * <pre>./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-dictionary</pre>
 *
 * The source file is ~118 MB of JSON, so the words array is streamed one entry at
 * a time rather than read as a tree.
 */
@Component
public class DictionaryImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DictionaryImporter.class);
    private static final int BATCH_SIZE = 2000;

    private final JdbcTemplate jdbc;
    private final Path dataDir;
    private final ConfigurableApplicationContext context;

    public DictionaryImporter(
            JdbcTemplate jdbc,
            @Value("${naranote.data-dir:../data}") String dataDir,
            ConfigurableApplicationContext context) {
        this.jdbc = jdbc;
        this.dataDir = Path.of(dataDir);
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption("import-dictionary")) {
            return;
        }
        Path file = findFile();
        log.info("Importing dictionary from {}", file);

        // Rebuilt wholesale rather than upserted: entry ids are stable but forms
        // and senses are not, so a stale sense from an older release would linger
        // with no way to notice. Cascades clear forms and senses.
        jdbc.update("delete from dict_entry");

        List<Object[]> entries = new ArrayList<>(BATCH_SIZE);
        List<Object[]> forms = new ArrayList<>(BATCH_SIZE);
        List<Object[]> senses = new ArrayList<>(BATCH_SIZE);
        int entryCount = 0;
        int formCount = 0;
        int senseCount = 0;

        ObjectMapper mapper =
                JsonMapper.builder()
                        .disable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                        .build();

        try (JsonParser parser = mapper.createParser(file.toFile())) {
            while (parser.nextToken() != null) {
                if (!"words".equals(parser.currentName())
                        || parser.nextToken() != JsonToken.START_ARRAY) {
                    continue;
                }
                while (parser.nextToken() == JsonToken.START_OBJECT) {
                    JsonNode word = mapper.readTree(parser);
                    String id = word.path("id").asText();

                    boolean anyCommon = false;
                    List<Object[]> wordForms = new ArrayList<>();
                    for (JsonNode k : word.path("kanji")) {
                        boolean common = k.path("common").asBoolean(false);
                        anyCommon |= common;
                        wordForms.add(new Object[] {id, k.path("text").asText(), false, common});
                    }
                    for (JsonNode k : word.path("kana")) {
                        boolean common = k.path("common").asBoolean(false);
                        anyCommon |= common;
                        wordForms.add(new Object[] {id, k.path("text").asText(), true, common});
                    }

                    forms.addAll(wordForms);

                    int wordSenses = 0;
                    int ord = 0;
                    for (JsonNode sense : word.path("sense")) {
                        List<String> glosses = new ArrayList<>();
                        for (JsonNode gloss : sense.path("gloss")) {
                            if ("eng".equals(gloss.path("lang").asText())) {
                                glosses.add(gloss.path("text").asText());
                            }
                        }
                        if (glosses.isEmpty()) {
                            continue;
                        }
                        wordSenses++;
                        senses.add(
                                new Object[] {
                                    id,
                                    ord++,
                                    strings(sense.path("partOfSpeech")),
                                    glosses.toArray(String[]::new),
                                    strings(sense.path("misc"))
                                });
                    }

                    entries.add(new Object[] {id, anyCommon, wordSenses});

                    if (entries.size() >= BATCH_SIZE) {
                        entryCount += flushEntries(entries);
                        formCount += flushForms(forms);
                        senseCount += flushSenses(senses);
                    }
                }
                break;
            }
        }
        entryCount += flushEntries(entries);
        formCount += flushForms(forms);
        senseCount += flushSenses(senses);

        log.info(
                "Imported {} entries, {} forms, {} senses",
                entryCount,
                formCount,
                senseCount);

        System.exit(SpringApplication.exit(context, () -> 0));
    }

    private Path findFile() throws IOException {
        try (Stream<Path> files = Files.list(dataDir)) {
            return files.filter(p -> p.getFileName().toString().startsWith("jmdict-eng"))
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .findFirst()
                    .orElseThrow(
                            () ->
                                    new IllegalStateException(
                                            "No jmdict-eng*.json in "
                                                    + dataDir.toAbsolutePath()
                                                    + " — see docs/development.md"));
        }
    }

    private static String[] strings(JsonNode array) {
        List<String> out = new ArrayList<>();
        array.forEach(node -> out.add(node.asText()));
        return out.toArray(String[]::new);
    }

    private int flushEntries(List<Object[]> batch) {
        int n = batch.size();
        if (n == 0) return 0;
        jdbc.batchUpdate(
                "insert into dict_entry (id, common, sense_count) values (?, ?, ?)",
                setter(batch, (ps, row) -> {
                    ps.setString(1, (String) row[0]);
                    ps.setBoolean(2, (Boolean) row[1]);
                    ps.setInt(3, (Integer) row[2]);
                }));
        batch.clear();
        return n;
    }

    private int flushForms(List<Object[]> batch) {
        int n = batch.size();
        if (n == 0) return 0;
        jdbc.batchUpdate(
                """
                insert into dict_form (entry_id, text, is_kana, common) values (?, ?, ?, ?)
                on conflict do nothing
                """,
                setter(batch, (ps, row) -> {
                    ps.setString(1, (String) row[0]);
                    ps.setString(2, (String) row[1]);
                    ps.setBoolean(3, (Boolean) row[2]);
                    ps.setBoolean(4, (Boolean) row[3]);
                }));
        batch.clear();
        return n;
    }

    private int flushSenses(List<Object[]> batch) {
        int n = batch.size();
        if (n == 0) return 0;
        jdbc.batchUpdate(
                """
                insert into dict_sense (entry_id, ord, part_of_speech, glosses, misc)
                values (?, ?, ?, ?, ?)
                """,
                setter(batch, (ps, row) -> {
                    ps.setString(1, (String) row[0]);
                    ps.setInt(2, (Integer) row[1]);
                    for (int col = 3; col <= 5; col++) {
                        ps.setArray(
                                col,
                                ps.getConnection().createArrayOf("text", (String[]) row[col - 1]));
                    }
                }));
        batch.clear();
        return n;
    }

    private interface RowSetter {
        void set(PreparedStatement ps, Object[] row) throws SQLException;
    }

    private static BatchPreparedStatementSetter setter(List<Object[]> batch, RowSetter rowSetter) {
        List<Object[]> snapshot = List.copyOf(batch);
        return new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                rowSetter.set(ps, snapshot.get(i));
            }

            @Override
            public int getBatchSize() {
                return snapshot.size();
            }
        };
    }
}
