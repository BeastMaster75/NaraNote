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

The kanji dictionary and stroke-order diagrams aren't in the repo — they're third-party
CC BY-SA data, fetched into a gitignored `data/`. Grab the latest release assets:

- `kanjidic2-en-*.json.zip` from
  [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified/releases) (~1 MB)
- `kanjivg-*-main.zip` from
  [KanjiVG/kanjivg](https://github.com/KanjiVG/kanjivg/releases) (~12 MB)

Extract both into `data/`, so you have `data/kanjidic2-en-*.json` and `data/kanji/*.svg`. Then
load them:

```bash
cd backend
./mvnw spring-boot:run -Dspring-boot.run.arguments=--import-kanji
```

The importer upserts and exits when finished, so it's safe to re-run against a newer release.
Expect ~10,400 characters and ~6,400 diagrams — the gap is real, roughly a third of the
characters KANJIDIC2 knows have no KanjiVG drawing, plus ~290 KanjiVG files that are kana and
have no KANJIDIC2 entry at all.

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

**Attribution is a licence condition**, not a courtesy. KANJIDIC2 (EDRDG) and KanjiVG
(© Ulrich Apel) are both CC BY-SA and are credited in the app footer. The KanjiVG credit is
also embedded in each stored SVG by the importer, so it survives being copied around.

**Stroke-order SVGs are recoloured at import time**, not in CSS: strokes become
`currentColor` and the stroke numbers `var(--nn-kaki)`. KanjiVG sets those as inline styles,
and an inline style beats any rule a stylesheet could apply.
