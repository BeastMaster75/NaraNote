package com.naranote.kanji;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
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
 * One-off loader for the kanji reference data. Not part of normal startup — run it
 * explicitly:
 *
 * <pre>./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-kanji</pre>
 *
 * Both sources are re-runnable: rows are upserted on the literal, so a newer
 * KANJIDIC2 release can be loaded over an existing database without truncating it.
 */
@Component
public class KanjiImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KanjiImporter.class);
    private static final int BATCH_SIZE = 1000;

    /** KanjiVG names files by zero-padded hex code point; anything else is a variant form. */
    private static final Pattern SVG_FILENAME = Pattern.compile("^[0-9a-f]{5}\\.svg$");

    private static final Pattern KVG_ATTRIBUTE = Pattern.compile("\\s+kvg:[a-zA-Z]+=\"[^\"]*\"");

    private static final String ATTRIBUTION =
            "<!-- Stroke order from KanjiVG, (c) 2009-2011 Ulrich Apel, CC BY-SA 3.0."
                    + " http://kanjivg.tagaini.net -->";

    private final JdbcTemplate jdbc;
    private final Path dataDir;
    private final ConfigurableApplicationContext context;

    public KanjiImporter(
            JdbcTemplate jdbc,
            // Injected as String, not Path: Spring's PathEditor resolves through the
            // servlet context and rejects a relative path like ../data outright.
            @Value("${naranote.data-dir:../data}") String dataDir,
            ConfigurableApplicationContext context) {
        this.jdbc = jdbc;
        this.dataDir = Path.of(dataDir);
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!args.containsOption("import-kanji")) {
            return;
        }
        log.info("Importing kanji reference data from {}", dataDir.toAbsolutePath());
        importCharacters(findKanjidicFile());
        importStrokeOrder(dataDir.resolve("kanji"));
        log.info("Kanji import complete");

        // This is a job, not a server. Shut down rather than leaving Tomcat listening.
        System.exit(SpringApplication.exit(context, () -> 0));
    }

    private Path findKanjidicFile() throws IOException {
        try (Stream<Path> files = Files.list(dataDir)) {
            return files.filter(p -> p.getFileName().toString().startsWith("kanjidic2-en"))
                    .filter(p -> p.getFileName().toString().endsWith(".json"))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException(
                            "No kanjidic2-en*.json in " + dataDir.toAbsolutePath()
                                    + " — see docs/development.md"));
        }
    }

    /**
     * Streams the characters array rather than reading the whole document: the file is
     * ~15 MB of JSON, which balloons well past that as an in-memory tree.
     */
    private void importCharacters(Path jsonFile) throws IOException {
        // FAIL_ON_TRAILING_TOKENS is on by default in Jackson 3. It's meant for
        // "parse this whole document as one value", and here it's wrong: we read
        // one array element at a time and the rest of the array is legitimately
        // still ahead of us.
        ObjectMapper mapper = JsonMapper.builder()
                .disable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .build();
        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        int total = 0;

        try (JsonParser parser = mapper.createParser(jsonFile.toFile())) {
            while (parser.nextToken() != null) {
                if (!"characters".equals(parser.currentName())
                        || parser.nextToken() != JsonToken.START_ARRAY) {
                    continue;
                }
                while (parser.nextToken() == JsonToken.START_OBJECT) {
                    batch.add(toRow(mapper.readTree(parser)));
                    if (batch.size() == BATCH_SIZE) {
                        total += flushCharacters(batch);
                        batch.clear();
                    }
                }
                break;
            }
        }
        total += flushCharacters(batch);
        log.info("Imported {} characters from {}", total, jsonFile.getFileName());
    }

    private Object[] toRow(JsonNode character) {
        JsonNode misc = character.path("misc");
        JsonNode readingMeaning = character.path("readingMeaning");

        List<String> meanings = new ArrayList<>();
        List<String> onReadings = new ArrayList<>();
        List<String> kunReadings = new ArrayList<>();

        for (JsonNode group : readingMeaning.path("groups")) {
            for (JsonNode reading : group.path("readings")) {
                String type = reading.path("type").asText();
                if ("ja_on".equals(type)) {
                    onReadings.add(reading.path("value").asText());
                } else if ("ja_kun".equals(type)) {
                    kunReadings.add(reading.path("value").asText());
                }
            }
            for (JsonNode meaning : group.path("meanings")) {
                // The -en file still carries other languages for some entries.
                if ("en".equals(meaning.path("lang").asText())) {
                    meanings.add(meaning.path("value").asText());
                }
            }
        }

        List<String> nanori = new ArrayList<>();
        readingMeaning.path("nanori").forEach(n -> nanori.add(n.asText()));

        return new Object[] {
            character.path("literal").asText(),
            intOrNull(misc.path("strokeCounts").path(0)),
            intOrNull(misc.path("grade")),
            intOrNull(misc.path("jlptLevel")),
            intOrNull(misc.path("frequency")),
            meanings.toArray(String[]::new),
            onReadings.toArray(String[]::new),
            kunReadings.toArray(String[]::new),
            nanori.toArray(String[]::new)
        };
    }

    private static Integer intOrNull(JsonNode node) {
        return node.isMissingNode() || node.isNull() ? null : node.asInt();
    }

    private int flushCharacters(List<Object[]> batch) {
        if (batch.isEmpty()) {
            return 0;
        }
        jdbc.batchUpdate(
                """
                insert into kanji (literal, stroke_count, grade, jlpt_level, frequency,
                                   meanings, on_readings, kun_readings, nanori)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (literal) do update set
                    stroke_count = excluded.stroke_count,
                    grade        = excluded.grade,
                    jlpt_level   = excluded.jlpt_level,
                    frequency    = excluded.frequency,
                    meanings     = excluded.meanings,
                    on_readings  = excluded.on_readings,
                    kun_readings = excluded.kun_readings,
                    nanori       = excluded.nanori
                """,
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        Object[] row = batch.get(i);
                        ps.setString(1, (String) row[0]);
                        setIntOrNull(ps, 2, (Integer) row[1]);
                        setIntOrNull(ps, 3, (Integer) row[2]);
                        setIntOrNull(ps, 4, (Integer) row[3]);
                        setIntOrNull(ps, 5, (Integer) row[4]);
                        for (int col = 6; col <= 9; col++) {
                            ps.setArray(
                                    col,
                                    ps.getConnection()
                                            .createArrayOf("text", (String[]) row[col - 1]));
                        }
                    }

                    @Override
                    public int getBatchSize() {
                        return batch.size();
                    }
                });
        return batch.size();
    }

    private static void setIntOrNull(PreparedStatement ps, int index, Integer value)
            throws SQLException {
        if (value == null) {
            ps.setNull(index, java.sql.Types.INTEGER);
        } else {
            ps.setInt(index, value);
        }
    }

    /**
     * Loads KanjiVG drawings, recoloured on the way in so the diagram inherits the
     * card's text colour and the stroke numbers pick up the accent. Inline styles have
     * to be rewritten rather than overridden, because an inline style beats any rule a
     * stylesheet could apply.
     */
    private void importStrokeOrder(Path svgDir) throws IOException {
        if (!Files.isDirectory(svgDir)) {
            throw new IllegalStateException(
                    "No kanji/ directory in " + dataDir.toAbsolutePath()
                            + " — see docs/development.md");
        }

        // KanjiVG draws kana too (あ, カ), and KANJIDIC2 contains no kana — so a plain
        // insert would trip the foreign key partway through. Filter against what was
        // actually imported instead of discovering it as a constraint violation.
        Set<String> known = Set.copyOf(jdbc.queryForList("select literal from kanji", String.class));

        List<Object[]> batch = new ArrayList<>(BATCH_SIZE);
        int total = 0;
        int variants = 0;
        int notKanji = 0;

        try (Stream<Path> files = Files.list(svgDir)) {
            for (Path file : files.toList()) {
                String name = file.getFileName().toString();
                if (!SVG_FILENAME.matcher(name).matches()) {
                    variants++;
                    continue;
                }
                String literal =
                        new String(Character.toChars(Integer.parseInt(name.substring(0, 5), 16)));
                if (!known.contains(literal)) {
                    notKanji++;
                    continue;
                }
                String svg = transform(Files.readString(file, StandardCharsets.UTF_8));
                batch.add(new Object[] {literal, svg});
                if (batch.size() == BATCH_SIZE) {
                    total += flushStrokeOrder(batch);
                    batch.clear();
                }
            }
        }
        total += flushStrokeOrder(batch);
        log.info(
                "Imported {} stroke-order diagrams ({} variant files, {} not in KANJIDIC2)",
                total,
                variants,
                notKanji);
    }

    static String transform(String rawSvg) {
        // Drop the XML declaration, DOCTYPE and licence comment; the DOCTYPE in
        // particular declares the kvg: namespace and cannot be inlined into a page.
        int svgStart = rawSvg.indexOf("<svg");
        String svg = svgStart < 0 ? rawSvg : rawSvg.substring(svgStart);

        svg = KVG_ATTRIBUTE.matcher(svg).replaceAll("");
        svg = svg.replace("stroke:#000000", "stroke:currentColor");
        svg = svg.replace("fill:#808080", "fill:var(--nn-kaki)");

        // Attribution is a licence condition, so it travels with the artwork.
        return ATTRIBUTION + "\n" + svg.strip();
    }

    private int flushStrokeOrder(List<Object[]> batch) {
        if (batch.isEmpty()) {
            return 0;
        }
        jdbc.batchUpdate(
                """
                insert into kanji_stroke_order (literal, svg) values (?, ?)
                on conflict (literal) do update set svg = excluded.svg
                """,
                new BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        ps.setString(1, (String) batch.get(i)[0]);
                        ps.setString(2, (String) batch.get(i)[1]);
                    }

                    @Override
                    public int getBatchSize() {
                        return batch.size();
                    }
                });
        return batch.size();
    }
}
