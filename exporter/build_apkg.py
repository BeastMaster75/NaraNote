"""Build an Anki package from NaraNote vocabulary.

Usage:  python build_apkg.py <input.json> <output.apkg>

Input is {"deckName": str, "notes": [{"id", "term", "reading", "meaning",
"sentence", "source"}]}. Called by the backend rather than run by hand.

Deliberately separate from the 日本語 Anki Decks pipeline: that one takes a
lesson number and sources its own images and audio, and its content is
personal-use only. This takes a list of notes and nothing else.
"""

import json
import sys

import genanki

# Fixed ids so re-exporting updates the same deck and note type rather than
# creating duplicates. They must never collide with the ids used by the
# separate 日本語 Anki Decks pipeline (1607392319 / 1937004821).
MODEL_ID = 1748291043
DECK_ID = 1748291044

# NaraNote's own palette rather than the other deck's indigo and jade, so cards
# from here are recognisably from here and the two decks stay distinct.
CSS = """
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
"""

RECOGNITION_FRONT = """
<div class="nn-term">{{Term}}</div>
"""

RECOGNITION_BACK = """
<div class="nn-term">{{Term}}</div>
{{#Reading}}<div class="nn-reading">{{Reading}}</div>{{/Reading}}
<div class="nn-rule"></div>
<div class="nn-meaning">{{Meaning}}</div>
{{#Sentence}}<div class="nn-sentence">{{Sentence}}</div>{{/Sentence}}
{{#Source}}<div class="nn-source">{{Source}}</div>{{/Source}}
"""

RECALL_FRONT = """
<div class="nn-prompt">Write the Japanese</div>
<div class="nn-meaning">{{Meaning}}</div>
"""

RECALL_BACK = """
<div class="nn-term">{{Term}}</div>
{{#Reading}}<div class="nn-reading">{{Reading}}</div>{{/Reading}}
<div class="nn-rule"></div>
<div class="nn-meaning">{{Meaning}}</div>
{{#Sentence}}<div class="nn-sentence">{{Sentence}}</div>{{/Sentence}}
"""

MODEL = genanki.Model(
    MODEL_ID,
    "NaraNote Vocab",
    # Any new field must be appended last, or existing field ordinals shift and
    # Anki scrambles notes instead of updating them in place.
    fields=[
        {"name": "Term"},
        {"name": "Reading"},
        {"name": "Meaning"},
        {"name": "Sentence"},
        {"name": "Source"},
    ],
    templates=[
        {
            "name": "Recognition JP-EN",
            "qfmt": RECOGNITION_FRONT,
            "afmt": RECOGNITION_BACK,
        },
        {
            "name": "Recall EN-JP",
            "qfmt": RECALL_FRONT,
            "afmt": RECALL_BACK,
        },
    ],
    css=CSS,
)


class StableNote(genanki.Note):
    """GUID derived from NaraNote's own row id.

    Not from the term and not from a list position: either would orphan every
    card and dump its review history the moment a word was edited or reordered.
    """

    def __init__(self, note_id, fields):
        super().__init__(model=MODEL, fields=fields)
        self._note_id = note_id

    @property
    def guid(self):
        return genanki.guid_for("naranote-vocab", self._note_id)


def build(payload, output_path):
    deck = genanki.Deck(DECK_ID, payload.get("deckName") or "NaraNote")

    for note in payload.get("notes", []):
        deck.add_note(
            StableNote(
                note["id"],
                [
                    note.get("term") or "",
                    note.get("reading") or "",
                    note.get("meaning") or "",
                    note.get("sentence") or "",
                    note.get("source") or "",
                ],
            )
        )

    genanki.Package(deck).write_to_file(output_path)
    return len(deck.notes)


def main():
    if len(sys.argv) != 3:
        print("usage: build_apkg.py <input.json> <output.apkg>", file=sys.stderr)
        return 2

    with open(sys.argv[1], encoding="utf-8") as handle:
        payload = json.load(handle)

    count = build(payload, sys.argv[2])
    print(f"wrote {count} notes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
