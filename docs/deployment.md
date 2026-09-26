# Deployment

NaraNote ships as one Docker Compose stack, `docker-compose.prod.yml`:

| Service    | What it does                                                                    |
| ---------- | ------------------------------------------------------------------------------- |
| `caddy`    | The only public entry point. Obtains and renews TLS certificates, redirects http → https and `www` → apex |
| `app`      | The Spring Boot jar with the built frontend embedded — serves both the app and `/api` |
| `db`       | PostgreSQL 16                                                                   |
| `backup`   | `pg_dump` at start-up and every 24 hours into `./backups`                        |
| `voicevox` | Self-hosted Japanese text-to-speech engine                                      |

Only Caddy publishes ports (80 and 443). The app, database and speech engine are reachable only
inside the Compose network.

## Requirements

- A Linux server with Docker Engine and the Compose plugin. 2 GB of RAM is a comfortable
  minimum — VOICEVOX and the JVM are the two largest consumers.
- A domain with `A`/`AAAA` records for both `example.com` and `www.example.com` pointing at the
  server, and ports 80 and 443 open. Caddy needs both to issue certificates.
- An SMTP account that can send from your domain (for verification and password-reset mail).
- Optional: a Google OAuth client, for "Sign in with Google".

## First deploy

**1. Get the code.**

```bash
git clone https://github.com/BeastMaster75/NaraNote.git
cd NaraNote
```

**2. Configure.** Copy the template and fill in every value:

```bash
cp .env.example .env
openssl rand -base64 24   # → POSTGRES_PASSWORD
openssl rand -base64 32   # → NARANOTE_ENCRYPTION_KEY
```

Compose refuses to start while any required value is missing, and names the one it's missing.

> **Keep a copy of `NARANOTE_ENCRYPTION_KEY` somewhere safe, off the server.** It encrypts
> users' saved Gemini keys. Losing it makes every saved key unreadable, and a database backup
> can't bring them back.

For Google sign-in, create an OAuth client of type *Web application* in the Google Cloud console
with the authorised redirect URI `https://<NARANOTE_DOMAIN>/api/auth/google/callback`, then set
`NARANOTE_GOOGLE_CLIENT_ID` and `NARANOTE_GOOGLE_CLIENT_SECRET`. Leave them empty and the button
is simply hidden.

**3. Start the stack.**

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Flyway creates the schema on first start. Watch it come up with:

```bash
docker compose -f docker-compose.prod.yml logs -f app caddy
```

**4. Import the reference data** (once). Download the dictionary, kanji, radical and
stroke-order files into `./data` exactly as described in
[development.md → Reference data](development.md#running-it), then run each importer as a
one-off container. Each one exits when it's done:

```bash
compose="docker compose -f docker-compose.prod.yml"
$compose run --rm app --import-kanji --spring.main.web-application-type=none
$compose run --rm app --import-dictionary --spring.main.web-application-type=none
$compose run --rm app --import-jlpt --spring.main.web-application-type=none
```

The importers are safe to re-run later against newer releases of the data.

## Upgrading

```bash
docker compose -f docker-compose.prod.yml run --rm backup once   # a fresh backup first
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Database migrations run automatically when the new `app` container starts. They only ever move
forward, which is why the backup comes first.

## Backups

The `backup` service writes a compressed `pg_dump` to `./backups` on start-up and every 24
hours, keeping `NARANOTE_BACKUP_KEEP_DAYS` days (default 14). Cached speech audio is left out;
it's regenerated on demand.

Take one on demand with:

```bash
docker compose -f docker-compose.prod.yml run --rm backup once
```

These dumps live on the same disk as the database, so they protect against mistakes and
corruption, not against losing the server. **Copy `./backups` somewhere else too** — for
example, a nightly `rsync` or `rclone` to other storage.

## Restoring

```bash
./deploy/restore.sh backups/naranote-20261001-030000.dump
```

The script asks for confirmation, stops the app, takes one more backup of the current state (so
restoring the wrong file is itself undoable), restores in a single transaction and starts the
app again. If the dump is from an older version, Flyway migrates it forward on start-up.

## Operational notes

- **Logs** are capped at 5 × 10 MB per service, so they can't fill the disk.
- **Security headers** are set by the app itself, not by Caddy, so they are versioned and tested
  with the code.
- **Don't put another proxy in front of Caddy** (such as Cloudflare's proxied mode) without
  configuring Caddy's `trusted_proxies`. Otherwise every visitor appears to come from the same
  address and the login rate limiter treats them as one.
- **Guest notebooks** that can no longer be reached (no live session) are removed by a nightly
  job, along with expired sessions.
- **Caddy's volumes** hold its certificates and ACME account. Deleting them means re-issuing
  every certificate, and Let's Encrypt rate-limits that.
