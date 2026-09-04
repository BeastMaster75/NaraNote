package com.naranote.export;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Writes an Anki package.
 *
 * <p>An {@code .apkg} is a zip holding {@code collection.anki2} — a SQLite
 * database in Anki's schema 11 — plus a {@code media} file mapping numbered media
 * to filenames. NaraNote exports carry no media, so that map is always empty.
 *
 * <p>The layout here was derived by generating the same deck with genanki and
 * reading the result, then matched field by field: schema, the JSON blobs in
 * {@code col}, id assignment, and the sentinel values Anki expects
 * ({@code usn = -1} on unsynced rows, {@code tags} as two spaces, {@code due} of
 * zero for a new card). Schema 11 is the long-standing import format and current
 * Anki still reads it.
 */
final class ApkgWriter {

    /** Anki's schema 11. Kept verbatim — column order is part of the format. */
    private static final String[] SCHEMA = {
        """
        CREATE TABLE col (
            id integer primary key, crt integer not null, mod integer not null,
            scm integer not null, ver integer not null, dty integer not null,
            usn integer not null, ls integer not null, conf text not null,
            models text not null, decks text not null, dconf text not null,
            tags text not null
        )
        """,
        """
        CREATE TABLE notes (
            id integer primary key, guid text not null, mid integer not null,
            mod integer not null, usn integer not null, tags text not null,
            flds text not null, sfld integer not null, csum integer not null,
            flags integer not null, data text not null
        )
        """,
        """
        CREATE TABLE cards (
            id integer primary key, nid integer not null, did integer not null,
            ord integer not null, mod integer not null, usn integer not null,
            type integer not null, queue integer not null, due integer not null,
            ivl integer not null, factor integer not null, reps integer not null,
            lapses integer not null, left integer not null, odue integer not null,
            odid integer not null, flags integer not null, data text not null
        )
        """,
        """
        CREATE TABLE revlog (
            id integer primary key, cid integer not null, usn integer not null,
            ease integer not null, ivl integer not null, lastIvl integer not null,
            factor integer not null, time integer not null, type integer not null
        )
        """,
        "CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null)",
        "CREATE INDEX ix_notes_usn on notes (usn)",
        "CREATE INDEX ix_cards_usn on cards (usn)",
        "CREATE INDEX ix_revlog_usn on revlog (usn)",
        "CREATE INDEX ix_cards_nid on cards (nid)",
        "CREATE INDEX ix_cards_sched on cards (did, queue, due)",
        "CREATE INDEX ix_notes_csum on notes (csum)",
        "CREATE INDEX ix_revlog_cid on revlog (cid)",
    };

    /** Fields are separated by the unit separator, not any printable character. */
    private static final char FIELD_SEPARATOR = '';

    /** A fixed collection creation time, as genanki uses — nothing depends on it. */
    private static final long COLLECTION_CREATED = 1_411_124_400L;

    private ApkgWriter() {}

    record Note(String guid, List<String> fields) {}

    /**
     * @param modelJson the note type, keyed by its id
     * @param decksJson the deck table, which must always include the Default deck
     */
    static void write(
            Path output,
            long modelId,
            long deckId,
            String modelJson,
            String decksJson,
            String confJson,
            String dconfJson,
            int templateCount,
            List<Note> notes)
            throws IOException, SQLException {

        Path database = Files.createTempFile("naranote-anki2-", ".db");
        try {
            Files.deleteIfExists(database);
            buildDatabase(
                    database,
                    modelId,
                    deckId,
                    modelJson,
                    decksJson,
                    confJson,
                    dconfJson,
                    templateCount,
                    notes);
            zip(output, database);
        } finally {
            Files.deleteIfExists(database);
        }
    }

    private static void buildDatabase(
            Path database,
            long modelId,
            long deckId,
            String modelJson,
            String decksJson,
            String confJson,
            String dconfJson,
            int templateCount,
            List<Note> notes)
            throws SQLException {

        try (Connection connection =
                DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath())) {
            connection.setAutoCommit(false);

            try (Statement statement = connection.createStatement()) {
                for (String ddl : SCHEMA) {
                    statement.executeUpdate(ddl);
                }
            }

            long nowMillis = System.currentTimeMillis();
            long nowSeconds = nowMillis / 1000;

            try (PreparedStatement col =
                    connection.prepareStatement(
                            "insert into col values (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')")) {
                col.setLong(1, COLLECTION_CREATED);
                col.setLong(2, nowMillis);
                col.setLong(3, nowMillis);
                col.setString(4, confJson);
                col.setString(5, modelJson);
                col.setString(6, decksJson);
                col.setString(7, dconfJson);
                col.executeUpdate();
            }

            // Ids double as creation timestamps and must be unique. A running
            // counter from the current millisecond gives both, and matches how
            // genanki lays a package out: note, then its cards, then the next note.
            long nextId = nowMillis;

            try (PreparedStatement note =
                            connection.prepareStatement(
                                    "insert into notes values (?, ?, ?, ?, -1, '  ', ?, ?, 0, 0, '')");
                    PreparedStatement card =
                            connection.prepareStatement(
                                    "insert into cards values"
                                            + " (?, ?, ?, ?, ?, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')")) {

                for (Note entry : notes) {
                    long noteId = nextId++;
                    String joined = String.join(String.valueOf(FIELD_SEPARATOR), entry.fields());

                    note.setLong(1, noteId);
                    note.setString(2, entry.guid());
                    note.setLong(3, modelId);
                    note.setLong(4, nowSeconds);
                    note.setString(5, joined);
                    // The sort field: Anki sorts and shows the browser column by it.
                    note.setString(6, entry.fields().isEmpty() ? "" : entry.fields().getFirst());
                    note.executeUpdate();

                    for (int ordinal = 0; ordinal < templateCount; ordinal++) {
                        card.setLong(1, nextId++);
                        card.setLong(2, noteId);
                        card.setLong(3, deckId);
                        card.setInt(4, ordinal);
                        card.setLong(5, nowSeconds);
                        card.executeUpdate();
                    }
                }
            }

            connection.commit();
        }
    }

    /** Entries are stored uncompressed, as Anki's own exporter writes them. */
    private static void zip(Path output, Path database) throws IOException {
        byte[] collection = Files.readAllBytes(database);
        byte[] media = "{}".getBytes(StandardCharsets.UTF_8);

        try (ZipOutputStream zip =
                new ZipOutputStream(Files.newOutputStream(output), StandardCharsets.UTF_8)) {
            zip.setMethod(ZipOutputStream.STORED);
            putStored(zip, "collection.anki2", collection);
            putStored(zip, "media", media);
        }
    }

    private static void putStored(ZipOutputStream zip, String name, byte[] content)
            throws IOException {
        ZipEntry entry = new ZipEntry(name);
        entry.setMethod(ZipEntry.STORED);
        entry.setSize(content.length);
        entry.setCompressedSize(content.length);
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(content);
        entry.setCrc(crc.getValue());
        zip.putNextEntry(entry);
        zip.write(content);
        zip.closeEntry();
    }
}
