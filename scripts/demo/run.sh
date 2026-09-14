#!/usr/bin/env bash
# A throwaway copy of the portal with made-up data, to click around in.
#
#   npm run demo        then open http://localhost:3100
#
# It wipes and reseeds the local test stack each time. It never touches the
# hosted database: .env.test points only at localhost, and the seed refuses
# anything else.
set -euo pipefail
cd "$(dirname "$0")/../.."
scripts/test/prepare-stack.sh

set -a
. ./.env.test
# Your own address for the demo's treasurer, kept out of git: put
# DEMO_TREASURER_EMAIL="…" in .env.local. It becomes exco on first sign-in.
DEMO_TREASURER_EMAIL="$(grep -E '^DEMO_TREASURER_EMAIL=' .env.local 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
if [ -n "$DEMO_TREASURER_EMAIL" ]; then
  BOOTSTRAP_EXCO_EMAILS="$BOOTSTRAP_EXCO_EMAILS,$DEMO_TREASURER_EMAIL"
fi
# Emails go to Mailpit, not real inboxes; the sign-in page links to it.
LOCAL_MAILBOX_URL="http://localhost:58025"
set +a

npx tsx scripts/demo/seed.ts
exec npx next dev -p 3100
