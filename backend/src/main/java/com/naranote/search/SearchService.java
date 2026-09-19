package com.naranote.search;

import com.naranote.dictionary.DictionaryDtos.EntryMatch;
import com.naranote.dictionary.DictionaryDtos.Sense;
import com.naranote.search.SearchDtos.KanjiHit;
import com.naranote.search.SearchDtos.SearchResponse;
import java.sql.Array;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
        // A relevance score, computed per gloss and reduced to the single best (lowest) score
        // an entry achieves across all its senses. Three components, most significant first:
        //   tier   — 0 if the gloss, minus a trailing "(qualifier)", is exactly the query
        //            (水's "water (esp. cool or cold)" strips to "water"; 岩's "rock" already
        //            is); 1 if the query merely appears as a whole word (給水's "water supply"
        //            — bounded by a space, not a substring of a longer word); 2 for anything
        //            else the WHERE clause let through (e.g. "water" inside "seawater" with no
        //            word boundary, or buried in an unrelated parenthetical four senses deep).
        //   ord    — which sense the match is in; a word's first, primary sense outranks its
        //            fourth or fifth.
        //   idx    — position within that sense's own gloss list; 石's "rock" is its second
        //            listed translation (after "stone"), 岩's is its first.
        // These three must be measured on the *same* matching (sense, gloss) pair and combined
        // into one number before taking MIN() — three separate MIN()s over tier, ord and idx
        // independently could each come from a different row, synthesizing a "best case" combo
        // that never actually occurred on any single gloss. Without this whole scheme, "water"
        // ranked サーバ's incidental "(water) dispenser" sense above 水 itself, and "rock" put
        // 石 (whose primary translation is "stone", "rock" only second) ahead of 岩.
        String escapedQuery = escapeRegex(query);
        record EntryRow(String id, boolean common) {}

        // Exact written-form match — the query IS the word, whether that's a kana reading
        // (はな) or a kanji spelling. dict_form holds both kinds of form undifferentiated, so
        // one equality check covers "every word read はな" the same way it covers "every word
        // written 花" — no separate kana-vs-kanji branch needed. This used to be entirely
        // missing: searchWords only ever matched English glosses, so a kana reading query
        // matched nothing (no English gloss contains Japanese text) regardless of how many
        // words actually had that reading in dict_form.
        List<EntryRow> formMatches =
                jdbc.query(
                        """
                        select distinct de.id, de.common
                        from dict_form df
                        join dict_entry de on de.id = df.entry_id
                        where df.text = ?
                        order by de.common desc
                        limit ?
                        """,
                        (rs, row) -> new EntryRow(rs.getString("id"), rs.getBoolean("common")),
                        query,
                        MAX_WORDS);

        List<EntryRow> glossMatches =
                jdbc.query(
                        """
                        select de.id, de.common
                        from dict_sense ds
                        join dict_entry de on de.id = ds.entry_id
                        cross join lateral unnest(ds.glosses) with ordinality as g(text, idx)
                        where nn_immutable_glosses_text(ds.glosses) ilike '%' || ? || '%'
                        group by de.id, de.common
                        order by
                          min(
                            (case
                               when regexp_replace(lower(g.text), '\\s*\\([^)]*\\)\\s*$', '') = lower(?)
                                 then 0
                               when g.text ~* ('\\y' || ? || '\\y')
                                 then 1
                               else 2
                             end) * 100000 + ds.ord * 1000 + (g.idx - 1)
                          ) asc,
                          de.common desc
                        limit ?
                        """,
                        (rs, row) -> new EntryRow(rs.getString("id"), rs.getBoolean("common")),
                        query,
                        query,
                        escapedQuery,
                        MAX_WORDS);

        // Exact form matches first — typing the word itself is the most unambiguous search
        // there is — then gloss matches filling whatever room is left, entries deduplicated
        // rather than shown twice if a word happens to match both ways.
        Map<String, EntryRow> merged = new LinkedHashMap<>();
        for (EntryRow row : formMatches) {
            merged.put(row.id(), row);
        }
        for (EntryRow row : glossMatches) {
            if (merged.size() >= MAX_WORDS) break;
            merged.putIfAbsent(row.id(), row);
        }
        List<EntryRow> entries = List.copyOf(merged.values());
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
        // The entry query above matched on *any* sense's glosses, but the client only ever
        // shows senses().get(0) — without this, a word whose matching sense is its third or
        // fourth meaning displays an unrelated first gloss with no visible connection to what
        // was searched. A stable sort keeps every other ordering (ord, i.e. dictionary sense
        // order) intact; it only pulls whichever sense actually matched to the front.
        String needle = query.toLowerCase(Locale.ROOT);
        for (List<Sense> senses : sensesByEntry.values()) {
            senses.sort(Comparator.comparing(sense -> matches(sense, needle) ? 0 : 1));
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

    /** Escapes POSIX advanced-regex metacharacters so a query can be dropped into a Postgres
     *  {@code ~*} pattern (here, wrapped between two {@code \y} word-boundary markers) without
     *  a stray {@code (} or {@code .} in what someone typed changing what the pattern means. */
    private static String escapeRegex(String query) {
        return query.replaceAll("([\\\\^$.|?*+()\\[\\]{}])", "\\\\$1");
    }

    private static boolean matches(Sense sense, String needleLower) {
        return sense.glosses().stream().anyMatch(g -> g.toLowerCase(Locale.ROOT).contains(needleLower));
    }

    private static List<String> textArray(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((String[]) array.getArray());
    }
}
