package com.naranote.search;

import com.naranote.dictionary.DictionaryDtos.EntryMatch;
import com.naranote.dictionary.DictionaryDtos.Sense;
import com.naranote.search.SearchDtos.KanjiHit;
import com.naranote.search.SearchDtos.SearchResponse;
import java.sql.Array;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "I don't know the character" — the other direction from {@code KanjiController}'s
 * single-literal lookup. Two independent queries, kept tightly capped: this is a results list,
 * not a dump.
 */
@Service
public class SearchService {

    private static final int MAX_KANJI = 12;
    private static final int MAX_WORDS = 20;

    private final JdbcTemplate jdbc;

    public SearchService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public SearchResponse search(String query) {
        return new SearchResponse(searchKanji(query), searchWords(query));
    }

    /**
     * A reading (checked against both reading arrays as typed — on-readings are
     * conventionally katakana, kun-readings hiragana, and the query is matched as-is
     * against both rather than guessing which the user meant) or an English meaning.
     */
    private List<KanjiHit> searchKanji(String query) {
        return jdbc.query(
                """
                select literal, meanings, on_readings, kun_readings
                from kanji
                where ? = any(on_readings)
                   or ? = any(kun_readings)
                   or exists (select 1 from unnest(meanings) m where m ilike '%' || ? || '%')
                order by frequency asc nulls last
                limit ?
                """,
                (rs, row) ->
                        new KanjiHit(
                                rs.getString("literal"),
                                textArray(rs.getArray("meanings")),
                                textArray(rs.getArray("on_readings")),
                                textArray(rs.getArray("kun_readings"))),
                query,
                query,
                query,
                MAX_KANJI);
    }

    private List<EntryMatch> searchWords(String query) {
        record EntryRow(String id, boolean common) {}
        List<EntryRow> entries =
                jdbc.query(
                        """
                        select distinct de.id, de.common
                        from dict_sense ds
                        join dict_entry de on de.id = ds.entry_id
                        where nn_immutable_glosses_text(ds.glosses) ilike '%' || ? || '%'
                        order by de.common desc
                        limit ?
                        """,
                        (rs, row) -> new EntryRow(rs.getString("id"), rs.getBoolean("common")),
                        query,
                        MAX_WORDS);
        if (entries.isEmpty()) {
            return List.of();
        }
        String[] entryIds = entries.stream().map(EntryRow::id).toArray(String[]::new);
        Map<String, Boolean> commonByEntry = new LinkedHashMap<>();
        entries.forEach(e -> commonByEntry.put(e.id(), e.common()));

        record FormRow(String entryId, String text, boolean kana) {}
        List<FormRow> formRows =
                jdbc.query(
                        """
                        select entry_id, text, is_kana from dict_form
                        where entry_id = any(?)
                        order by entry_id, common desc, is_kana
                        """,
                        (rs, row) ->
                                new FormRow(
                                        rs.getString("entry_id"),
                                        rs.getString("text"),
                                        rs.getBoolean("is_kana")),
                        (Object) entryIds);
        Map<String, String> kanjiByEntry = new LinkedHashMap<>();
        Map<String, String> readingByEntry = new LinkedHashMap<>();
        for (FormRow row : formRows) {
            if (row.kana()) {
                readingByEntry.putIfAbsent(row.entryId(), row.text());
            } else {
                kanjiByEntry.putIfAbsent(row.entryId(), row.text());
            }
        }

        record SenseRow(String entryId, List<String> partOfSpeech, List<String> glosses) {}
        List<SenseRow> senseRows =
                jdbc.query(
                        """
                        select entry_id, part_of_speech, glosses from dict_sense
                        where entry_id = any(?)
                        order by entry_id, ord
                        """,
                        (rs, row) ->
                                new SenseRow(
                                        rs.getString("entry_id"),
                                        textArray(rs.getArray("part_of_speech")),
                                        textArray(rs.getArray("glosses"))),
                        (Object) entryIds);
        Map<String, List<Sense>> sensesByEntry = new LinkedHashMap<>();
        for (SenseRow row : senseRows) {
            sensesByEntry
                    .computeIfAbsent(row.entryId(), k -> new ArrayList<>())
                    .add(new Sense(row.partOfSpeech(), row.glosses()));
        }

        return entries.stream()
                .map(
                        e ->
                                new EntryMatch(
                                        e.id(),
                                        commonByEntry.getOrDefault(e.id(), false),
                                        kanjiByEntry.get(e.id()),
                                        readingByEntry.get(e.id()),
                                        sensesByEntry.getOrDefault(e.id(), List.of())))
                .filter(match -> !match.senses().isEmpty())
                .toList();
    }

    private static List<String> textArray(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((String[]) array.getArray());
    }
}
