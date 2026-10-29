#!/usr/bin/env bash
# Creates a throwaway local Postgres database, applies the Supabase migrations, runs the
# integration tests against it, then drops it. Uses the standard PG* env vars to connect
# (e.g. PGHOST=localhost PGUSER=postgres PGPASSWORD=...).
set -euo pipefail
DB="runway_it_$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT
cat "$ROOT/supabase/tests/local_stub.sql" "$ROOT"/supabase/migrations/*.sql | psql -q -X -v ON_ERROR_STOP=1 -d "$DB"
cd "$ROOT"
TEST_DATABASE_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB" \
  npx vitest run --config vitest.integration.config.ts
