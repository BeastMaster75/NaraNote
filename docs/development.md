# Development

## Stack

- **Backend** — Spring Boot 4.1, Java 21, Maven (via the bundled `mvnw` wrapper)
- **Database** — PostgreSQL 16 in Docker, schema managed by Flyway
- **Frontend** — React + TypeScript, built with Vite

## Prerequisites

JDK 21, Node.js 20+, Docker Desktop.

## Running it

Three processes. Database first.

**1. Database**

```bash
docker compose up -d
```

> Published on host port **5433**, not 5432. A native PostgreSQL service already owns 5432 on
> the development machine, and Docker will happily report the port as mapped while `localhost`
> still resolves to the native one — which surfaces as a confusing `password authentication
> failed` from Spring, not as a port conflict.

**1b. Reference data** (once)

The dictionary, stroke-order diagrams and radical data aren't in the repo — they're third-party
CC BY-SA data, fetched into a gitignored `data/`. Grab the latest release assets:

- `kanjidic2-en-*.json.zip` from
  [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases) (~1 MB)
- `kradfile-*.json.zip` from the same release (~0.1 MB)
- `jmdict-eng-*.json.zip` from the same release (~11 MB) — the full English
  edition, not `jmdict-eng-common`: mining means pasting real text, and a
  dictionary that silently lacks uncommon words fails exactly when it's needed
- `kanjivg-*-main.zip` from
  [KanjiVG/kanjivg](https://github.com/KanjiVG/kanjivg/releases) (~12 MB)

Extract all four into `data/`, so you have `data/kanjidic2-en-*.json`,
`data/kradfile-*.json`, `data/jmdict-eng-*.json` and `data/kanji/*.svg`. Then run
both importers:

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-kanji
./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-dictionary
```

The dictionary import takes about half a minute and rebuilds wholesale — entry
ids are stable but forms and senses are not, so a stale sense from an older
release would otherwise linger with nothing to notice it. Expect ~218,000
entries, ~499,000 forms and ~253,000 senses.

The importer upserts and exits when finished, so it's safe to re-run against a newer release.
Expect roughly 10,400 characters, 6,400 stroke diagrams, and 43,700 radical links. The gaps are
real and not a bug: about a third of the characters KANJIDIC2 knows have no KanjiVG drawing,
~290 KanjiVG files are kana with no KANJIDIC2 entry, and KRADFILE covers ~2,200 characters
KANJIDIC2 doesn't. Each source is filtered against the kanji table rather than allowed to fail
on a foreign key partway through.

**2. Backend**

```bash
cd backend
./mvnw spring-boot:run
```

`http://localhost:8080`. Flyway applies pending migrations from
`src/main/resources/db/migration` on startup.

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:5173`. Requests to `/api/*` are proxied to the backend (`vite.config.ts`), so
the browser only ever talks to one origin and there is no CORS to configure.

## Things worth knowing

**Flyway owns the schema.** Hibernate runs with `ddl-auto: validate` — it checks that entities
match the real tables and refuses to start if they don't, but it never changes anything. Schema
changes go in a new migration file, never in an entity alone.

**Database credentials** default to `naranote` / `naranote` for local development. Override with
`POSTGRES_USER` / `POSTGRES_PASSWORD`, as environment variables or in a gitignored `.env` at the
repo root, which both Docker Compose and Spring Boot read.

**Design tokens are lifted, not authored.** `frontend/src/styles/tokens.css` is copied verbatim
from the Claude Design export. When the design changes, re-lift the whole file — don't edit
values in both places and let them drift.

**Japanese typography has rules.** Japanese text sits at full contrast (`--nn-jp`) and never
below 18px, because dense kanji become illegible at the sizes and contrast that suit Latin text.
The one exception is `--nn-jp-known`, the dimmed colour marking already-saved words. Use the
`.jp` / `.jp-sm` / `.jp-lg` helpers in `index.css` rather than setting fonts and sizes ad hoc.

**Client-side routes need a server fallback in production.** The frontend is a single-page app:
`/kanji/待` exists only in the browser, and the Vite dev server already knows to serve
`index.html` for any unmatched path. Once Spring Boot serves the built bundle, it will need the
same fallback — otherwise a deep link or a refresh on `/kanji/待` returns a 404 from Spring
instead of the app. Only `/api/**` should escape that fallback.

**Anki export is written in Java — no Python, no external tool.** An `.apkg` is a
zip holding `collection.anki2`, a SQLite database in Anki's schema 11, plus an
(always empty) media map. `ApkgWriter` writes it with `sqlite-jdbc`.

The format is undocumented, so it was derived rather than guessed: the same deck
was generated with genanki, its output read field by field, and the Java version
diffed against it until schema, indexes, the JSON blobs in `col`, note and card
column values, and every GUID matched. **If you change `ApkgWriter` or
`NaraNoteDeck`, re-run that comparison** — a subtly malformed package can fail to
import, or import badly.

The sentinel values matter and are not arbitrary: `usn = -1` marks rows as never
synced, `tags` is two spaces, new cards carry `due = 0`, and ids double as
creation timestamps so they must be unique and ascending. A plain-text export is
always available as a fallback.

**Exported GUIDs key on `vocab_item.id`.** Never on the term and never on a list
position: either would orphan every card and dump its review history the moment a
word was edited or reordered. Re-exporting is meant to *update* existing cards.

The GUID algorithm reproduces genanki's exactly — SHA-256 of the values joined by
a double underscore, first eight bytes big-endian, rendered in Anki's own base91
alphabet. That was matched deliberately rather than invented, so decks exported
before the Java rewrite keep working.

The export note type (`NaraNote Vocab`, model id 1748291043) is deliberately
distinct from the separate 日本語 Anki Decks pipeline's ids so the two decks never
collide — NaraNote notes landing in `JP Vocab (vault)` would render with empty
Audio and Image fields.

**Scheduling is scoped to handwriting on purpose.** FSRS
(`io.github.open-spaced-repetition:fsrs`) schedules kanji writing practice and nothing else.
Anki cannot check handwriting, so those reviews have nowhere else to live; vocabulary reviews
belong in Anki, which does them better and already holds the user's history. Scheduling
vocabulary here would make the export feature pointless and turn the app into a worse Anki.

**The task panel has two halves and only one is stored.** Suggestions ("4 due", "2 keep
catching you out") are computed from the library and review tables on every request, so they
resolve themselves and can never go stale. Only user-written tasks are persisted. Don't
"optimise" suggestions into a table — being uncachable is the point.

**Jackson 3, not Jackson 2.** Spring Boot 4 ships `tools.jackson`; `com.fasterxml.jackson` is
not on the classpath and must not be added back, since mixing the two skews module versions in
ways that compile fine and fail at runtime. Note that Jackson 3 enables `FAIL_ON_TRAILING_TOKENS`
by default, which breaks streaming a JSON array one element at a time — the kanji importer
disables it explicitly.

**Attribution is a licence condition**, not a courtesy. KANJIDIC2 (EDRDG) and KanjiVG
(© Ulrich Apel) are both CC BY-SA and are credited in the app footer. The KanjiVG credit is
also embedded in each stored SVG by the importer, so it survives being copied around.

**Stroke-order SVGs are recoloured at import time**, not in CSS: strokes become
`currentColor` and the stroke numbers `var(--nn-kaki)`. KanjiVG sets those as inline styles,
and an inline style beats any rule a stylesheet could apply.
