#!/usr/bin/env bash
# Bring up the throwaway test stack and make it ready for the tests: roles,
# migrations, and GoTrue answering. Safe to run again on a stack that is
# already up.
#
#   npm run test:stack
#
# Everything here is local. The keys in scripts/test/env.test are the public
# self-hosted demo keys from .env.example, signed with a secret that exists
# nowhere but this compose file.
set -euo pipefail
cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -p funktion-test -f docker-compose.yml -f docker-compose.test.yml)

if [ ! -f .env.test ]; then
  cp scripts/test/env.test .env.test
  echo "Created .env.test from scripts/test/env.test"
fi

"${COMPOSE[@]}" up -d

echo "Waiting for Postgres…"
for _ in $(seq 1 60); do
  if docker exec funktion-test-db pg_isready -U postgres -d funktion >/dev/null 2>&1; then break; fi
  sleep 1
done

psql_db() { docker exec -i funktion-test-db psql -v ON_ERROR_STOP=1 -U postgres -d funktion "$@"; }

# On hosted Supabase these are created by hand once (README, Deployment). The
# migration role exists there already; locally the migrations run as postgres,
# so it only has to exist for create-app-user.sql's GRANT to succeed.
psql_db -q <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'funktion_migrate') THEN
    CREATE ROLE funktion_migrate NOLOGIN;
  END IF;
END
$$;
SQL
psql_db -q < scripts/db/create-app-user.sql >/dev/null

echo "Waiting for GoTrue to create its schema…"
for _ in $(seq 1 90); do
  if psql_db -tAc "SELECT to_regclass('auth.identities') IS NOT NULL" | grep -q t; then break; fi
  sleep 1
done

set -a
# shellcheck disable=SC1091
. ./.env.test
set +a
npx prisma migrate deploy

echo "Waiting for the API gateway…"
for _ in $(seq 1 60); do
  if curl -fsS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" >/dev/null 2>&1; then
    echo "Test stack ready."
    exit 0
  fi
  sleep 1
done
echo "GoTrue did not answer through Kong in time." >&2
"${COMPOSE[@]}" logs --tail 50 gotrue kong >&2
exit 1
