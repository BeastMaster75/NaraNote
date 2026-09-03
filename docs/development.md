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

## Temporary scaffolding

The `ping` table, its entity/repository/controller, and the type specimen in `App.tsx` exist
only to prove the stack is wired end to end. Delete them once the first real feature lands.
