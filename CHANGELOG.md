# Changelog

## 2026-11-06: Self-serve companies

Runway now serves many companies from one deployment. A founder signs in with an email link, gets a
private company, uploads exports from their bank and cards, and sees their own dashboard. The public
demo, the free grader and the public site work exactly as before.

### For founders

- **Sign in with an email link.** No password. Invite-only during early access. Sign-in brings you
  back to the page you asked for, and a signed-in founder opening `/login` goes straight to their company.
- **Upload bank and card exports.** Files are read in your browser and previewed before anything is
  sent. Most layouts work: Posting/Transaction Date, Payee/Merchant, Amount or separate
  Debit/Credit columns, a summary block above the header, files with no header row, cards that list
  charges as positive (detected, or flip a file by hand), trailing minus signs, day-first dates.
  Amounts in other currencies are refused rather than guessed. Re-uploading an overlapping export
  adds nothing twice. No data yet? "Fill in a sample export" shows how it works.
- **Update today's cash without a file.** Cash moves daily and exports don't; anyone on the team can
  type the new balance on the upload page and the runway uses it at once. The page shows when cash was
  last entered, and the dashboard asks for a fresh figure once it's a week old.
- **Transactions page.** Search every transaction by vendor, the bank's description or cardholder;
  filter by category, month and money in or out, with totals for the whole match, and download
  exactly what matched as a CSV. "Most spent with" ranks the vendors behind the totals, and a
  vendor's own view lets you fix its category right there. Works on the demo too.
- **Monthly budgets.** Set a budget per spending category. The dashboard shows this month so far,
  where it's heading (recurring bills still due plus one-off spend at its pace) and last month, and
  the Monday digest names any budget that's over or heading over. The card also says what runway
  the budgets would buy if spending came down to them. Copilot answers "Are we on
  budget this month?" from the same numbers. The demo has a sample set.
- **Plans you can send.** The "default alive" planner keeps its settings in the address, so a
  plan (hires, a raise, growth, cuts) can be bookmarked or sent to a cofounder with "Copy link to
  this plan".
- **Your data, your call.** See what's stored per account, delete one account's rows or everything,
  and download it all as a CSV that uploads back cleanly. Settings downloads a copy of everything
  the company holds (team, transactions, cash, budgets, fixes, decisions, drafts, links, activity)
  as one JSON file, secrets left out.
- **Teams.** Invite up to nine teammates by email; they see and work on the same data. The owner can
  hand the company to a teammate; members can leave. Every accepted or dismissed finding shows who
  decided it and when.
- **Company settings.** Rename or delete the company (deletion removes everything in it).
- **Activity log.** Settings shows who uploaded, deleted, invited, changed settings, updated the cash
  or handed the company on, and when.
- **Monday digest in your own Slack.** Connect an incoming webhook in settings (a test message is sent
  first; the address is never shown in full). The digest says up front when your data is two weeks
  old or more.
- **Daily Autopilot for every company.** Each company's Inbox gets fresh drafts every morning.
- **Getting started** checklist on a new company's dashboard, and a nudge when the uploaded data
  gets old, or when one account's export stops two weeks or more before the others (its spending
  since would be missing from burn).
- **Faster.** A company with ~18,000 transactions loads its dashboard in about 0.3 s (was 1.3 s), with
  identical numbers.

### For whoever runs it

- New settings: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (accounts), `SIGNUPS`
  (`invite` or `open`), `OPERATOR_EMAILS` (who gets `/admin` to invite founders from the
  waitlist with a button instead of SQL; operators need no invite themselves). `DATABASE_URL` is required with accounts. See DEPLOY.md, "Accounts".
- New migrations (run `npm run db:migrate`): accounts, teams, decision actor, rate limits, company
  Slack, digest order, company activity, activity cash, company budgets.
- `npm run verify:live` now checks the Supabase Auth settings (email sign-in on, sign-ups allowed,
  Confirm email on) and that every migration is applied.
- `npm run test:e2e` runs browser suites for sign-in, isolation, settings, teams and uploads against
  a local stand-in for Supabase Auth and a throwaway Postgres. CI runs them on every push.
- With accounts on, the operator's own Slack and Jira are never used for a company's data, and the
  env Rho feed is off (companies connect by uploading exports).

### Security

- Every company read and write is scoped by the company from the verified session; the proxy strips
  any client-sent identity header. Only an email Supabase has confirmed is trusted.
- Owner-only: rename, delete, delete uploaded data, manage the team, investor links, choose the Slack
  channel. Ownership changes are
  race-safe (tested with concurrent requests on Postgres).
- Sign-in and signup rate limits are shared across server instances, keyed by HMAC (no email or IP
  stored).
- Uploaded file contents never appear in logs (checked by the browser suites).
- Nine independent security reviews ran during this release; every critical, high and medium
  finding was fixed with a regression test.
