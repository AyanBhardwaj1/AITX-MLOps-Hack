#!/usr/bin/env bash
# Browser end-to-end tests for accounts: sign-in (against e2e/fake-gotrue.mjs, a local stand-in for
# Supabase Auth), companies, teams and uploads, on a production build and a throwaway Postgres.
# Needs: a local Postgres reachable with the PG* env vars (as for npm run test:integration) and
# Chromium for Playwright (npx playwright install chromium). Rebuilds .next with test settings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DB="runway_e2e_$$"
APP_PORT="${E2E_APP_PORT:-3100}"
AUTH_PORT="${E2E_AUTH_PORT:-9999}"
LOG_DIR="$(mktemp -d)"
DB_URL="postgresql://${PGUSER:-postgres}:${PGPASSWORD:-}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
PIDS=()

cleanup() {
  # Each server runs in its own process group: stop the whole group, or the real next-server
  # outlives its npx wrapper and the next run talks to a stale server.
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for port in "$APP_PORT" "$AUTH_PORT"; do
  if curl -s -o /dev/null "http://localhost:$port/"; then
    echo "Port $port is already in use; stop whatever is running there (or set E2E_APP_PORT / E2E_AUTH_PORT)."
    exit 1
  fi
done

createdb "$DB"
cat supabase/tests/local_stub.sql supabase/migrations/*.sql | psql -q -X -v ON_ERROR_STOP=1 -d "$DB"
# Invited founders (ops@ is the operator); "waiting@" is on the list but not invited.
psql -q -X -d "$DB" -c "insert into public.waitlist (email, invited_at) values ('founder-a@acme.example', now()), ('founder-b@globex.example', now()), ('uploader@umbrella.example', now()), ('ops@runway.example', now()), ('outsider@stark.example', now()), ('waiting@initech.example', null);"

PORT="$AUTH_PORT" setsid node e2e/fake-gotrue.mjs >"$LOG_DIR/auth.log" 2>&1 &
PIDS+=($!)

export NEXT_PUBLIC_SUPABASE_URL="http://localhost:$AUTH_PORT"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="e2e-anon-key-not-a-secret-000000"
echo "Building..."
npx next build >"$LOG_DIR/build.log" 2>&1 || { tail -30 "$LOG_DIR/build.log"; exit 1; }
DATABASE_URL="$DB_URL" SIGNUPS=invite OPERATOR_EMAILS=ops@runway.example setsid npx next start -p "$APP_PORT" >"$LOG_DIR/app.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do curl -sf "http://localhost:$APP_PORT/api/health" >/dev/null && break; sleep 1; done

export E2E_APP="http://localhost:$APP_PORT" E2E_AUTH="http://localhost:$AUTH_PORT"
status=0
for spec in e2e/*.e2e.mjs; do
  # Each suite starts with no companies and fresh rate limits.
  psql -q -X -d "$DB" -c "delete from public.organizations where slug like 'org\_%'; delete from public.company_invites; delete from public.rate_limits;"
  node "$spec" || status=1
done
if grep -iE "gusto|payroll|slack technologies" "$LOG_DIR/app.log" >/dev/null; then
  echo "FAIL  uploaded file contents appeared in the server log"
  status=1
fi
[ "$status" -eq 0 ] && echo "All browser suites passed." || echo "Server log: $LOG_DIR/app.log"
exit "$status"
