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
npx tsx scripts/demo/seed.ts
set -a
. ./.env.test
set +a
exec npx next dev -p 3100
