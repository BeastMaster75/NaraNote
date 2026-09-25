#!/bin/sh
# Replace the live database with a backup made by deploy/backup.sh.
#
#   ./deploy/restore.sh backups/naranote-20261001-030000.dump
#
# Run from the repo root on the server. It stops the app, takes one more backup
# of the current state (so a restore of the wrong file is itself undoable),
# restores in a single transaction — any error leaves the database exactly as
# it was — and starts the app again. Flyway then migrates forward if the backup
# predates the running version.
set -eu

file="${1:?usage: ./deploy/restore.sh backups/naranote-<stamp>.dump}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

compose="docker compose -f docker-compose.prod.yml"

echo "This replaces everything in the live NaraNote database with:"
echo "  $file"
printf 'Type "restore" to continue: '
read -r answer
[ "$answer" = "restore" ] || { echo "Nothing changed."; exit 1; }

$compose stop app backup

echo "Backing up the current state first..."
$compose run --rm backup once

echo "Restoring $file..."
# Inside the db container, over its local socket, as the database owner. The
# dump is streamed in on stdin, so the file never has to be copied in.
$compose exec -T db sh -c \
    'pg_restore --clean --if-exists --no-owner --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "$file"

$compose start app backup
echo "Restored. The app is starting."
