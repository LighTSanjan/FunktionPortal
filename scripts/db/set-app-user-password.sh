#!/usr/bin/env bash
#
# Give app_user a login credential, and wire APP_USER_DATABASE_URL to match.
#
# The password is generated here, on your machine. It is written into the
# gitignored env files and printed once as a SQL statement for you to paste
# into the Supabase SQL editor — it is never committed, and never travels
# through anything but your own clipboard.
#
# Why the SQL half is manual: changing a role's password needs CREATEROLE and
# ADMIN OPTION on that role. Prisma migrates as funktion_migrate, which has
# neither, so no migration and no script connecting as that role can do it.
# The Supabase SQL editor runs as postgres, which can.
#
#   ./scripts/db/set-app-user-password.sh              # prompts for one
#   ./scripts/db/set-app-user-password.sh --generate    # makes one up
#
# app_user is the least-privileged role in the database, not an admin account:
# no CREATEROLE, no TRUNCATE, and RLS filters every row it reads. It is not
# your Supabase dashboard login and not the postgres password. It does sit in
# plaintext in .env.local, so give it a password you use nowhere else.
#
# Safe to re-run: it rotates the password. Paste the new statement afterwards
# or the app stops connecting.

set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }

# Read the pooler host and project ref off the existing connection string, so
# the generated URL cannot drift from the project the app actually talks to.
eval "$(
  python3 - "$ENV_FILE" <<'PY'
import re, sys, urllib.parse as u
env = {}
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    k, v = line.split('=', 1)
    env[k.strip()] = v.strip().strip('"').strip("'")

src = env.get('DATABASE_URL') or env.get('DIRECT_URL')
if not src:
    sys.exit('error: neither DATABASE_URL nor DIRECT_URL is set')

p = u.urlparse(src)
# Pooler usernames are "<role>.<project-ref>"; keep the ref, swap the role.
ref = p.username.split('.', 1)[1] if '.' in (p.username or '') else ''
print(f'HOST={p.hostname}')
print(f'PORT={p.port or 5432}')
print(f'DBNAME={p.path.lstrip("/") or "postgres"}')
print(f'QUERY={u.quote(p.query, safe="=&")}')
print(f'REF={ref}')
PY
)"

if [ "${1:-}" = "--generate" ]; then
  # Bounded input rather than streaming /dev/urandom into `head`: head closing
  # the pipe early sends SIGPIPE to tr, which under `set -o pipefail` fails the
  # whole script with 141.
  PASSWORD="$(LC_ALL=C head -c 256 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-32)"
else
  # -s so it is not echoed, and never passed as an argument — an argument shows
  # up in your shell history and in `ps` while the script runs.
  printf 'Password for app_user: ' >&2
  read -rs PASSWORD; printf '\n' >&2
  printf 'Again: ' >&2
  read -rs CONFIRM; printf '\n' >&2

  [ -n "$PASSWORD" ] || { echo "error: empty password" >&2; exit 1; }
  [ "$PASSWORD" = "$CONFIRM" ] || { echo "error: they do not match" >&2; exit 1; }

  # These would need percent-encoding inside the connection URL, and a URL that
  # silently mis-parses is a worse afternoon than retyping a password.
  case $PASSWORD in
    *[/@:?\#\&%]*) echo "error: avoid / @ : ? # & % — they break the connection URL" >&2; exit 1 ;;
  esac
  # Doubling is how a literal quote survives into the SQL string below.
  SQL_PASSWORD=${PASSWORD//\'/\'\'}
fi
SQL_PASSWORD="${SQL_PASSWORD:-$PASSWORD}"
USERNAME="app_user${REF:+.$REF}"
URL="postgresql://${USERNAME}:${PASSWORD}@${HOST}:${PORT}/${DBNAME}${QUERY:+?$QUERY}"

# Replace the line if present, append it if not. Both .env.local (what Next.js
# reads) and .env (what the db:* npm scripts source) need it.
for f in .env.local .env; do
  [ -f "$f" ] || continue
  if grep -q '^APP_USER_DATABASE_URL=' "$f"; then
    python3 - "$f" "$URL" <<'PY'
import sys
path, url = sys.argv[1], sys.argv[2]
lines = open(path).read().splitlines(keepends=True)
with open(path, 'w') as fh:
    for line in lines:
        fh.write(f'APP_USER_DATABASE_URL="{url}"\n' if line.startswith('APP_USER_DATABASE_URL=') else line)
PY
  else
    printf '\nAPP_USER_DATABASE_URL="%s"\n' "$URL" >> "$f"
  fi
  echo "updated APP_USER_DATABASE_URL in $f"
done

cat <<EOF

Now paste this into the Supabase SQL editor and run it:

  ALTER ROLE app_user WITH LOGIN PASSWORD '${SQL_PASSWORD}';

That grants LOGIN and sets the password in one statement, so the role goes
from unusable to working in a single step.

Then check it connects:

  npm run db:verify-rls

EOF
