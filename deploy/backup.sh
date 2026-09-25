#!/bin/sh
# Database backups for docker-compose.prod.yml's `backup` service.
#
# Runs in the stock postgres:16 image (the same one as the database, so pg_dump
# always matches the server version) and writes to /backups, which is ./backups
# on the host. With no argument it backs up immediately and then once every
# BACKUP_INTERVAL_SECONDS, forever, deleting dumps older than BACKUP_KEEP_DAYS.
#
#   docker compose -f docker-compose.prod.yml run --rm backup once
#
# takes one extra backup and exits — do that before any upgrade or restore.
#
# Connection details come from the standard libpq variables (PGHOST, PGUSER,
# PGPASSWORD, PGDATABASE), set by the compose file.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

backup() {
    stamp=$(date -u +%Y%m%d-%H%M%S)
    target="/backups/naranote-$stamp.dump"

    # Custom format: compressed, and pg_restore can pick individual tables out
    # of it. tts_audio's rows are left out — it's a cache of generated speech,
    # regenerated the next time a word is played. Its table is still created.
    # Written under a temporary name and renamed only once complete, so a dump
    # cut short by a crash never looks like a good one.
    if pg_dump --format=custom --exclude-table-data=tts_audio --file="$target.partial"; then
        mv "$target.partial" "$target"
        echo "backup: wrote $target ($(du -h "$target" | cut -f1))"
    else
        rm -f "$target.partial"
        echo "backup: FAILED at $stamp" >&2
        return 1
    fi

    find /backups -maxdepth 1 -name 'naranote-*.dump' -mtime +"$KEEP_DAYS" -print -delete |
        sed 's/^/backup: pruned /'
}

if [ "${1:-}" = "once" ]; then
    backup
    exit $?
fi

while true; do
    # A failed night is logged and the schedule carries on; exiting would just
    # have Docker restart the container into an immediate retry loop.
    backup || true
    sleep "$INTERVAL"
done
