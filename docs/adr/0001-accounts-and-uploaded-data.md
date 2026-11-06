# ADR-0001: Self-serve accounts with uploaded bank data

Date: 2026-11-06 · Status: accepted

## Context

Runway served one company per deployment: the demo company, or a Rho feed configured by env vars
behind one shared `APP_PASSWORD`. Founders on the waitlist had nothing to sign in to. The schema
already had `organizations`, `memberships`, `connections`, `accounts` and `transactions` with
row-level security keyed on `auth.uid()`, unused by the app.

## Decision

- **Sign-in:** Supabase Auth email magic link (PKCE) through `@supabase/ssr`. The request for a link
  and the code exchange both run on the server (`/api/auth/login`, `/auth/callback`), so the
  browser never talks to Supabase and the content security policy stays `connect-src 'self'`.
- **One session check per request:** the proxy refreshes the session cookie, asks Supabase who the
  user is (`auth.getUser()`, verified by Supabase), and forwards the user id to the app in an
  internal request header. It deletes any copy of that header a client sends first, on every
  route it runs on (all but static assets), so the header can't be forged.
- **Data modes:** `demo` (public, unchanged), `company` (signed in: the user's own organization)
  and `sandbox` (the env-configured Rho feed for single-company deployments, available only when
  accounts are not configured).
- **Companies:** the first sign-in creates an organization (slug `org_<uuid>`) and an owner
  membership in one transaction. Every company read and write is scoped by the org found from the
  session's user id, never from the request.
- **Uploaded data:** bank CSVs are parsed in the browser with the grader's importer and sent as
  rows (never as files); the server re-validates every row, gives each a content-derived id
  (date, description, amount, the file's account and its occurrence within the file; files without
  an Account column get an account name from the file name that the founder can edit, so the same
  charge on two cards is kept twice), and inserts with
  `on conflict do nothing`, so overlapping exports don't duplicate. Card payoffs are resolved at
  read time over everything uploaded, as the grader does. Today's cash is entered with each upload.

- **Invites and integrations (after review):** invite-only is enforced when a company is created,
  not only when the link is sent, since anyone with the public anon key can create a Supabase user.
  With accounts on, app-initiated Slack sends and Jira filing are off: those are the operator's
  tools. Deleting uploads also deletes everything derived from them, share links included.

- **Teams (after the second review):** an owner invites teammates by email; the invite is honoured
  only for an email Supabase has confirmed, and inside the same transaction that would otherwise
  create a company. Someone who already has a company accepts explicitly, and only once theirs holds
  no data (it's deleted on the way). A company's `org_` scope is only ever created at sign-in, so a
  late write can't bring a deleted company back.

## Later in the same release

- **Teams and roles.** One owner, up to nine members per company (pending invites count). Members
  work on the data; only the owner renames or deletes the company, deletes uploaded data, manages
  the team, creates or revokes investor links and chooses the Slack channel. Ownership can be handed
  to a member; the change re-checks both roles row by row inside a transaction, so concurrent
  transfers or a transfer racing an invite acceptance can't leave zero or two owners.
- **Work outside a request.** The daily Autopilot and the Monday digest run per company from the
  server's own list of companies with uploaded rows (never from request input), least recently served
  first, within a time budget. Each company's digest goes only to the Slack webhook its owner
  connected (stored server-side, never shown in full, hooks.slack.com only, no redirects); a webhook
  Slack reports gone is disconnected.
- **Rate limits** for sign-in links and signups are shared through Postgres (fixed window, one upsert),
  keyed by an HMAC under a secret derived from `DATABASE_URL`, after a per-instance check, and fall
  back to the per-instance limit if the database is slow.
- **Row identity** keeps the sign: changing the id scheme would make every stored row look new. Signs
  are corrected explicitly (delete the account's rows, re-upload with "charges are positive").
- **Verification.** `npm run test:e2e` drives sign-in, isolation, settings, teams and uploads in a real
  browser against a local stand-in for Supabase Auth; it runs in CI.

## Alternatives

- Browser Supabase client: simpler, but needs `connect-src` to Supabase and puts auth calls in the
  browser. Rejected for the stricter CSP.
- Re-checking the session in every route: one Supabase round trip per check; the proxy header gives
  one per request.
- Uploading raw files to the server: hits Vercel's 4.5 MB request limit and puts parsing of
  untrusted files on the server; parsed rows are smaller and are still validated server-side.

## Consequences

- A deployment with accounts needs `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the Supabase redirect URL configured.
- The env Rho token mode is off when accounts are on; a company connects by CSV until Rho partner
  OAuth exists.
- Risk: the proxy is now part of the authorization path. Mitigation: tests for header stripping and
  for every route resolving the org from the session, and an end-to-end test against a fake Auth
  server.
