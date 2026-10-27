#!/usr/bin/env bash
# Applies the Supabase migrations to a throwaway local Postgres database and runs the schema tests.
# Needs a local Postgres you can reach with createdb/psql (set PGUSER/PGHOST if needed).
set -euo pipefail
DB="runway_schema_test_$$"
cd "$(dirname "$0")/../supabase"
createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1' EXIT
cat tests/local_stub.sql migrations/*.sql tests/schema_test.sql | psql -q -X -v ON_ERROR_STOP=1 -d "$DB"
