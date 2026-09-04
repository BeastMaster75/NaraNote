package com.naranote.export;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.ObjectMapper;

/**
 * The note type NaraNote exports into, and the JSON blobs Anki's {@code col} table
 * expects.
 *
 * <p>Ids are fixed so re-exporting updates the same deck and note type rather than
 * accumulating copies. They must never collide with the ids used by the separate
 * 日本語 Anki Decks pipeline (1607392319 and 1937004821), or NaraNote notes would
 * land in that deck's note type with empty Audio and Image fields and render as
 * broken cards.
 */
final class NaraNoteDeck {

    static final long MODEL_ID = 1_748_291_043L;
    static final long DECK_ID = 1_748_291_044L;
    static final List<String> FIELDS =
            List.of("Term", "Reading", "Meaning", "Sentence", "Source");
    static final int TEMPLATE_COUNT = 2;

    /**
     * Anki's own base91 alphabet, in its own order. Not standard base91 and not
     * sorted — the order is part of the format.
     */
    private static final char[] BASE91 =
            ("abcdefghijklmnopqrstuvwxyz"
                            + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                            + "0123456789"
                            + "!#$%&()*+,-./:;<=>?@[]^_`{|}~")
                    .toCharArray();

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private NaraNoteDeck() {}

    /**
     * Reproduces genanki's {@code guid_for}: sha256 of the values joined by a
     * double underscore, first eight bytes read big-endian, rendered in Anki's
     * base91.
     *
     * <p>Matched deliberately rather than invented. A different scheme would give
     * every note a new GUID, and any deck already imported would be orphaned —
     * duplicate cards, and the review history stranded on the old ones.
     */
    static String guidFor(String namespace, Object value) {
        byte[] digest;
        try {
            digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest((namespace + "__" + value).getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }

        BigInteger number = BigInteger.ZERO;
        for (int i = 0; i < 8; i++) {
            number = number.shiftLeft(8).add(BigInteger.valueOf(digest[i] & 0xFF));
        }

        BigInteger base = BigInteger.valueOf(BASE91.length);
        StringBuilder reversed = new StringBuilder();
        while (number.signum() > 0) {
            reversed.append(BASE91[number.mod(base).intValue()]);
            number = number.divide(base);
        }
        return reversed.reverse().toString();
    }

    static String modelJson() {
        List<Map<String, Object>> fields = new java.util.ArrayList<>();
        for (int i = 0; i < FIELDS.size(); i++) {
            fields.add(
                    Map.of(
                            "name", FIELDS.get(i),
                            "ord", i,
                            "font", "Liberation Sans",
                            "media", List.of(),
                            "rtl", false,
                            "size", 20,
                            "sticky", false));
        }

        Map<String, Object> model =
                Map.ofEntries(
                        Map.entry("id", String.valueOf(MODEL_ID)),
                        Map.entry("name", "NaraNote Vocab"),
                        Map.entry("type", 0),
                        Map.entry("mod", System.currentTimeMillis() / 1000),
                        Map.entry("usn", -1),
                        Map.entry("sortf", 0),
                        Map.entry("did", DECK_ID),
                        Map.entry("tags", List.of()),
                        Map.entry("vers", List.of()),
                        Map.entry("css", CSS),
                        Map.entry("latexPre", LATEX_PRE),
                        Map.entry("latexPost", "\\end{document}"),
                        Map.entry("latexsvg", false),
                        Map.entry("flds", fields),
                        Map.entry(
                                "tmpls",
                                List.of(
                                        template(0, "Recognition JP-EN", RECOGNITION_FRONT, RECOGNITION_BACK),
                                        template(1, "Recall EN-JP", RECALL_FRONT, RECALL_BACK))),
                        // Which field must be non-empty for each template to
                        // generate a card: Recognition needs Term (0), Recall
                        // needs Meaning (2).
                        Map.entry(
                                "req",
                                List.of(
                                        List.of(0, "all", List.of(0)),
                                        List.of(1, "all", List.of(2)))));

        return MAPPER.writeValueAsString(Map.of(String.valueOf(MODEL_ID), model));
    }

    private static Map<String, Object> template(int ord, String name, String front, String back) {
        // A HashMap rather than Map.of: "did" is genuinely null here — the
        // template inherits the model's deck — and Map.of rejects null values.
        Map<String, Object> template = new java.util.HashMap<>();
        template.put("name", name);
        template.put("ord", ord);
        template.put("qfmt", front);
        template.put("afmt", back);
        template.put("bqfmt", "");
        template.put("bafmt", "");
        template.put("bfont", "");
        template.put("bsize", 0);
        template.put("did", null);
        return template;
    }

    /** The Default deck must be present or Anki rejects the collection. */
    static String decksJson(String deckName) {
        return MAPPER.writeValueAsString(
                Map.of(
                        "1", deck(1, "Default"),
                        String.valueOf(DECK_ID), deck(DECK_ID, deckName)));
    }

    private static Map<String, Object> deck(long id, String name) {
        List<Integer> zeroPair = List.of(0, 0);
        return Map.ofEntries(
                Map.entry("id", id),
                Map.entry("name", name),
                Map.entry("desc", ""),
                Map.entry("conf", 1),
                Map.entry("dyn", 0),
                Map.entry("collapsed", false),
                Map.entry("extendNew", 10),
                Map.entry("extendRev", 50),
                Map.entry("mod", System.currentTimeMillis() / 1000),
                Map.entry("usn", -1),
                Map.entry("lrnToday", zeroPair),
                Map.entry("newToday", zeroPair),
                Map.entry("revToday", zeroPair),
                Map.entry("timeToday", zeroPair));
    }

    static String confJson() {
        return MAPPER.writeValueAsString(
                Map.ofEntries(
                        Map.entry("activeDecks", List.of(1)),
                        Map.entry("addToCur", true),
                        Map.entry("collapseTime", 1200),
                        Map.entry("curDeck", 1),
                        Map.entry("curModel", String.valueOf(MODEL_ID)),
                        Map.entry("dueCounts", true),
                        Map.entry("estTimes", true),
                        Map.entry("newBury", true),
                        Map.entry("newSpread", 0),
                        Map.entry("nextPos", 1),
                        Map.entry("sortBackwards", false),
                        Map.entry("sortType", "noteFld"),
                        Map.entry("timeLim", 0)));
    }

    static String dconfJson() {
        return MAPPER.writeValueAsString(
                Map.of(
                        "1",
                        Map.ofEntries(
                                Map.entry("id", 1),
                                Map.entry("name", "Default"),
                                Map.entry("mod", 0),
                                Map.entry("usn", 0),
                                Map.entry("maxTaken", 60),
                                Map.entry("autoplay", true),
                                Map.entry("replayq", true),
                                Map.entry("timer", 0),
                                Map.entry(
                                        "new",
                                        Map.of(
                                                "bury", true,
                                                "delays", List.of(1, 10),
                                                "initialFactor", 2500,
                                                "ints", List.of(1, 4, 7),
                                                "order", 1,
                                                "perDay", 20,
                                                "separate", true)),
                                Map.entry(
                                        "lapse",
                                        Map.of(
                                                "delays", List.of(10),
                                                "leechAction", 0,
                                                "leechFails", 8,
                                                "minInt", 1,
                                                "mult", 0)),
                                Map.entry(
                                        "rev",
                                        Map.of(
                                                "bury", true,
                                                "ease4", 1.3,
                                                "fuzz", 0.05,
                                                "ivlFct", 1,
                                                "maxIvl", 36500,
                                                "minSpace", 1,
                                                "perDay", 100)))));
    }

    private static final String LATEX_PRE =
            """
            \\documentclass[12pt]{article}
            \\special{papersize=3in,5in}
            \\usepackage[utf8]{inputenc}
            \\usepackage{amssymb,amsmath}
            \\pagestyle{empty}
            \\setlength{\\parindent}{0in}
            \\begin{document}
            """;

    // NaraNote's own palette rather than the other deck's indigo and jade, so
    // cards from here are recognisably from here and the two stay distinct.
    private static final String CSS =
            """
            .card {
              font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif;
              background: #f7f2e6;
              color: #231f1a;
              text-align: center;
              padding: 24px 18px;
            }
            .nn-term {
              font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
              font-size: 46px;
              line-height: 1.5;
              color: #141110;
            }
            .nn-reading { font-size: 22px; color: #141110; opacity: .8; margin-top: 6px; }
            .nn-meaning { font-size: 20px; color: #231f1a; margin-top: 14px; }
            .nn-rule { height: 1px; background: #ddd1b9; margin: 18px auto; max-width: 420px; }
            /* The sentence the word was met in — the reason it is worth remembering. */
            .nn-sentence {
              font-size: 19px;
              line-height: 1.9;
              color: #141110;
              background: #efe6d2;
              border-left: 3px solid #d9541f;
              border-radius: 10px;
              padding: 12px 14px;
              margin: 14px auto 0;
              max-width: 460px;
              text-align: left;
            }
            .nn-source { font-size: 12px; color: #8d8371; margin-top: 10px; }
            .nn-prompt { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: #8d8371; }

            /* Anki's night mode. Mirrors the app's 墨 ground. */
            .nightMode .card, .card.nightMode { background: #1b1815; color: #f2e9d7; }
            .nightMode .nn-term, .nightMode .nn-reading, .nightMode .nn-sentence { color: #fdf8ec; }
            .nightMode .nn-meaning { color: #f2e9d7; }
            .nightMode .nn-sentence { background: #141210; border-left-color: #f0793c; }
            .nightMode .nn-rule { background: #3b342b; }
            .nightMode .nn-source, .nightMode .nn-prompt { color: #867c6b; }
            """;

    private static final String RECOGNITION_FRONT = "<div class=\"nn-term\">{{Term}}</div>";

    private static final String RECOGNITION_BACK =
            """
            <div class="nn-term">{{Term}}</div>
            {{#Reading}}<div class="nn-reading">{{Reading}}</div>{{/Reading}}
            <div class="nn-rule"></div>
            <div class="nn-meaning">{{Meaning}}</div>
            {{#Sentence}}<div class="nn-sentence">{{Sentence}}</div>{{/Sentence}}
            {{#Source}}<div class="nn-source">{{Source}}</div>{{/Source}}
            """;

    private static final String RECALL_FRONT =
            """
            <div class="nn-prompt">Write the Japanese</div>
            <div class="nn-meaning">{{Meaning}}</div>
            """;

    private static final String RECALL_BACK =
            """
            <div class="nn-term">{{Term}}</div>
            {{#Reading}}<div class="nn-reading">{{Reading}}</div>{{/Reading}}
            <div class="nn-rule"></div>
            <div class="nn-meaning">{{Meaning}}</div>
            {{#Sentence}}<div class="nn-sentence">{{Sentence}}</div>{{/Sentence}}
            """;
}
