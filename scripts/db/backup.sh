#!/usr/bin/env bash
# Download the live database and its stored files to this computer.
#
#   scripts/db/backup.sh            once a day: does nothing if today's copy exists
#   scripts/db/backup.sh --force    another copy now regardless
#
# The live project is on Supabase's free plan, which keeps no backups, so this
# is the only copy of the club's records outside Supabase. Run at login and
# every evening by scripts/db/install-backup-agent.sh.
#
# What it saves:
#   - the public schema, which is every portal table, as a pg_dump
#     custom-format file (restore with pg_restore). It reads as the migration
#     role, which owns the tables and so is not filtered by row-level security;
#   - the storage bucket's files (signatures, payment screenshots, photos,
#     printed PDFs), mirrored into storage/ by backup-storage.ts.
# Not included: Supabase's own auth schema. People sign in again.
#
# Copies hold members' personal data, so the folder is private to this user
# and is outside the repository. Coach bank details are stored encrypted and
# stay encrypted in the copy.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${FUNKTION_BACKUP_DIR:-$HOME/Backups/FunktionPortal}"
KEEP="${FUNKTION_BACKUP_KEEP:-30}"
LOG="$BACKUP_DIR/backup.log"

# launchd starts in / with a bare PATH. The storage step is a Node script
# that reads .env.local relative to the working directory.
cd "$REPO"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# pg_dump has to be at least the server's version (17). Homebrew's libpq is
# current; its postgresql@14 is not.
PG_BIN=/opt/homebrew/opt/libpq/bin
[ -x "$PG_BIN/pg_dump" ] || PG_BIN="$(dirname "$(command -v pg_dump)")"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

fail() {
  log "FAILED: $*"
  /usr/bin/osascript -e "display notification \"$*\" with title \"FUNKtion backup failed\"" >/dev/null 2>&1 || true
  exit 1
}

today="$(date +%Y-%m-%d)"
if [ "${1:-}" != "--force" ] && ls "$BACKUP_DIR"/funktion-"$today"_*.dump >/dev/null 2>&1; then
  exit 0
fi

# The live connection, from the same file the app reads. Prisma-only
# parameters such as connection_limit make libpq refuse the URL.
env_file="$REPO/.env.local"
[ -f "$env_file" ] || env_file="$REPO/.env"
url="$(grep -E '^DIRECT_URL=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"'"'")"
[ -n "$url" ] || fail "no DIRECT_URL in $env_file"
url="$(printf '%s' "$url" | sed -E 's/[?&](connection_limit|pgbouncer|pool_timeout|connect_timeout|schema)=[^&]*//g; s/^([^?]*)&/\1?/')"

# At login the network is often not up yet.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  "$PG_BIN/pg_isready" -d "$url" -t 10 >/dev/null 2>&1 && break
  [ "$attempt" = 10 ] && fail "the database could not be reached"
  sleep 30
done

stamp="$(date +%Y-%m-%d_%H%M%S)"
final="$BACKUP_DIR/funktion-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

"$PG_BIN/pg_dump" --dbname="$url" --schema=public --format=custom --no-owner --no-privileges \
  --file="$partial" 2>>"$LOG" || fail "pg_dump stopped partway"

# A file that pg_restore cannot list is not a backup.
tables="$("$PG_BIN/pg_restore" --list "$partial" 2>>"$LOG" | grep -c ' TABLE DATA ' || true)"
[ "${tables:-0}" -gt 0 ] || fail "the copy has no table data in it"

mv "$partial" "$final"
log "saved $(basename "$final") ($(du -h "$final" | cut -f1 | tr -d ' '), $tables tables)"

# Keep the newest $KEEP copies.
ls -1t "$BACKUP_DIR"/funktion-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f "$old"
  log "removed $(basename "$old")"
done

# The files, after the database so a storage hiccup never costs the dump.
"$REPO/node_modules/.bin/tsx" "$REPO/scripts/db/backup-storage.ts" "$BACKUP_DIR/storage" >>"$LOG" 2>&1 \
  || fail "the database was saved, but not every stored file could be copied"
