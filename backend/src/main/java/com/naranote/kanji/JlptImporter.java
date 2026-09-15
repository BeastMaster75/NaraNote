package com.naranote.kanji;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * One-off loader replacing KANJIDIC2's {@code jlpt_level} — that field is the pre-2010
 * 4-level JLPT scale, frozen since the test's 2010 revision to the current 5-level N1–N5
 * system, which is why it mislabels beginner kanji "N4" and has no N5 at all. This source
 * (davidluzgouveia/kanji-data, MIT, built from Jonathan Waller's JLPT resources) carries the
 * actual modern scale. Not part of normal startup — run it explicitly:
 *
 * <pre>./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-jlpt</pre>
 *
 * Clears every row first rather than only overwriting matches: a kanji this source doesn't
 * cover was never validly JLPT-tagged to begin with, so a stale old-scale value shouldn't
 * survive under it.
 */
@Component
public class JlptImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(JlptImporter.class);
    private static final int BATCH_SIZE = 1000;

    private final JdbcTemplate jdbc;
    private final Path dataDir;
    private final ConfigurableApplicationContext context;

    public JlptImporter(
            JdbcTemplate jdbc,
            @Value("${naranote.data-dir:../data}") String dataDir,
            ConfigurableApplicationContext context) {
        this.jdbc = jdbc;
        this.dataDir = Path.of(dataDir);
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption("import-jlpt")) {
            return;
        }
        log.info("Importing JLPT levels from {}", dataDir.toAbsolutePath());
        jdbc.update("update kanji set jlpt_level = null");

        Set<String> known = Set.copyOf(jdbc.queryForList("select literal from kanji", String.class));
        JsonNode root = new ObjectMapper().readTree(findDataFile().toFile());

        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        int total = 0;
        int skipped = 0;

        for (var entries = root.properties().iterator(); entries.hasNext(); ) {
            var entry = entries.next();
            String literal = entry.getKey();
            JsonNode level = entry.getValue().path("jlpt_new");
            if (level.isMissingNode() || level.isNull()) {
                continue;
            }
            if (!known.contains(literal)) {
                skipped++;
                continue;
            }
            batch.add(new Object[] {level.asInt(), literal});
            if (batch.size() == BATCH_SIZE) {
                total += flush(batch);
                batch.clear();
            }
        }
        total += flush(batch);
        log.info("Imported {} JLPT levels ({} not in kanji table)", total, skipped);

        // This is a job, not a server. Shut down rather than leaving Tomcat listening.
        System.exit(SpringApplication.exit(context, () -> 0));
    }

    private Path findDataFile() throws IOException {
        try (Stream<Path> files = Files.list(dataDir)) {
            return files.filter(p -> p.getFileName().toString().startsWith("jlpt-kanji-data"))
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException(
                            "No jlpt-kanji-data*.json in " + dataDir.toAbsolutePath()
                                    + " — see docs/development.md"));
        }
    }

    private int flush(List<Object[]> batch) {
        if (batch.isEmpty()) {
            return 0;
        }
        jdbc.batchUpdate(
                "update kanji set jlpt_level = ? where literal = ?",
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        Object[] row = batch.get(i);
                        ps.setInt(1, (Integer) row[0]);
                        ps.setString(2, (String) row[1]);
                    }

                    @Override
                    public int getBatchSize() {
                        return batch.size();
                    }
                });
        return batch.size();
    }
}
