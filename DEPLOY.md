# Going live: credentials and deployment

## Put it on Vercel (5 minutes, no credentials needed)

1. On GitHub, open the repo → **Settings → General → Default branch** and make sure it's `main`.
2. Click **Deploy with Vercel** at the top of the README, or go to [vercel.com/new](https://vercel.com/new) and import `AyanBhardwaj1/AITX-MLOps-Hack`.
3. Keep the defaults (Framework: Next.js; no environment variables needed) and click **Deploy**.
4. When it finishes, open the URL: the public site is at `/` and the product at `/app`. The demo company, Autopilot, the Inbox and Copilot's instant answers all work straight away. `https://<your-app>.vercel.app/api/health` should return `{"status":"ok",...}`.

After that, every push to `main` redeploys automatically and other branches get preview URLs. The rest of this page switches on the optional pieces.

The app runs with no credentials at all (demo company, in-memory decisions, template memos). Each credential below switches on one more piece. Add them in two places:
- **Vercel** → Project → Settings → Environment Variables, then **Redeploy**.
- **`.env.local`** on your machine, for `npm run verify:live` and `npm run db:migrate`.

Never commit `.env.local`; it's gitignored.

| Variable | Turns on | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Copilot chat, GPT-written memos, AI labels for unknown vendors | platform.openai.com → API keys. **Set a monthly budget first** (Settings → Limits). |
| `OPENAI_MODEL_FAST` / `OPENAI_MODEL_AGENT` | Model choice (optional) | Defaults: `gpt-6-luna` / `gpt-6.1-sol` |
| `DATABASE_URL` | Early-access signups, decisions, Inbox and run history saved permanently (**set this before sharing the site**, or signups are lost on restart) | Supabase → **Connect** → *Transaction pooler* URI (port 6543), with your database password filled in |
| `DATABASE_CA_CERT` | Verified TLS to Supabase | Supabase → Project Settings → Database → **SSL Configuration → Download certificate**. Paste the whole PEM (including `-----BEGIN CERTIFICATE-----`). |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Accounts:** founders sign in by email link, get their own company, and upload bank exports. Needs `DATABASE_URL`. See [Accounts](#accounts-sign-in-and-uploads). | Supabase → Project Settings → API: the Project URL and the `anon` *public* key. Never use the `service_role` key here. |
| `SIGNUPS` | Who can create an account: `invite` (default; emails you invite from the waitlist) or `open` (anyone) | See [Inviting founders](#inviting-founders) |
| `APP_PASSWORD` | Password prompt on the app (`/app` and its APIs; any username) for a single-company deployment. Ignored once accounts are on. The public site, legal pages, grader and signup stay open. | Pick one, at least 8 characters. **Required before using a real Rho account.** |
| `RHO_BASE_URL` / `RHO_API_TOKEN` | Your real Rho account instead of the sandbox | Rho → Settings → API. Production URL: `https://rhoapi.rho.co/api/v1`; tokens start with `rhobat_`. |
| `CRON_SECRET` | Daily 8 AM (Austin) Autopilot run | Any random string of 16+ characters, e.g. `openssl rand -hex 24` |
| `AUTOPILOT_CRON_MODE` | Which data the daily run and the Monday digest review | `demo` (default) or `sandbox` (the configured Rho feed; skipped once accounts are on) |
| `SLACK_WEBHOOK_URL` | Monday digest in Slack (13:30 UTC, about 8 AM in Austin; needs `CRON_SECRET`); "Send to Slack now" also needs `APP_PASSWORD` | Slack → Apps → Incoming Webhooks → add to a channel. Must start with `https://hooks.slack.com/services/` |
| `CONTACT_EMAIL` | The contact address shown on the privacy, security and terms pages | An inbox you read, e.g. `hello@yourdomain.com`. Without it the pages point to GitHub issues and replies. |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | "Approve & file" creates a Jira issue | `https://<site>.atlassian.net`, your Atlassian email, id.atlassian.com → Security → API tokens, and the project key (e.g. `RUN`) |

## Steps

1. **Database (once).** Put `DATABASE_URL` (and `DATABASE_CA_CERT`) in `.env.local`, then run:
   ```bash
   npm install
   npm run db:migrate
   ```
   - For migrations you can also use the *Session pooler* URI (port 5432).
   - Re-running is safe; applied migrations are skipped.
   - **No terminal?** Paste each file in `supabase/migrations/` into Supabase → SQL Editor, in filename order.
2. **Check everything.**
   ```bash
   npm run verify:live
   ```
   Every configured integration should print `PASS`. Unconfigured ones print `SKIP`, and nothing permanent is created.
3. **Vercel.**
   - Add the same variables, then **Redeploy**.
   - The crons in `vercel.json` (daily Autopilot, Monday digest) register automatically on deploy. They only run if `CRON_SECRET` is set.
4. **Smoke test on the live URL:**
   - `/api/health` returns `"status":"ok"` and `"database":"ok"` (or `"not_configured"` without `DATABASE_URL`).
   - The site loads at `/`, and joining early access with a test email answers "You're on the list". In Supabase → Table Editor → `waitlist` the row appears (delete it afterwards).
   - The dashboard loads at `/app`.
   - `/s/demo` shows the sample investor link without a password; with your account connected, **Share with investors** creates a private link that opens without the password and stops working when revoked.
   - **Autopilot → Run now** produces a memo and drafts in the **Inbox**.
   - Approving a ticket files it in Jira, if configured.
   - With an OpenAI key, Copilot answers "Get me to 14 months without touching payroll".

## Accounts (sign-in and uploads)

With `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `DATABASE_URL` set, Runway serves many companies: a founder signs in with an email link, gets a private company, uploads CSV exports from their bank and cards plus today's cash at `/app/upload`, and sees their own dashboard at `/app?mode=company`. The demo at `/app` stays public. Design notes: [docs/adr/0001-accounts-and-uploaded-data.md](docs/adr/0001-accounts-and-uploaded-data.md).

In **Supabase**:
1. **Authentication → URL Configuration:** set **Site URL** to your app (e.g. `https://runway-for-rho.vercel.app`) and add `https://runway-for-rho.vercel.app/auth/callback` under **Redirect URLs** (add `http://localhost:3000/auth/callback` too for local development).
2. **Authentication → Sign In / Providers → Email:** keep Email enabled, **Allow new users to sign up** on, and **Confirm email** on. Runway only trusts an email Supabase has confirmed (team invites and invite-only sign-up key on it), so with Confirm email off, people signing up with a password would get no company at all. Runway decides who may create an account (`SIGNUPS`), and checks it again on the server when a company is created, so a sign-up made directly against Supabase doesn't get a company.
3. **Authentication → Emails → SMTP Settings:** add your own SMTP sender before real users arrive. Supabase's built-in sender is for testing and allows only a few emails an hour.
4. Run the migrations (`npm run db:migrate`).
5. Check it: with the Supabase and database values in `.env.local`, `npm run verify:live` reads your project's public Auth settings and fails if email sign-in or new sign-ups are off, or if "Confirm email" is off (which would let someone claim an invited address with a password sign-up). It also checks every migration is applied. The redirect URL can't be checked from outside; sign in once to confirm it.

In **Vercel**: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and `SIGNUPS` if you want `open`), then **Redeploy**: `NEXT_PUBLIC_*` values are built into the app, so a redeploy is required. The `service_role` key is never needed and must not be added.

With accounts on: the env Rho feed (`sandbox` mode) is off, since companies connect by uploading exports until Rho partner sign-in exists; app-initiated Slack sends and Jira filing are off, because those webhooks belong to your team, not to the companies using the app; the daily Autopilot also reviews every company that has uploaded data (needs `CRON_SECRET`), least recently reviewed first within the cron's 60-second limit; each company can connect its own Slack (an incoming webhook, in `/app/settings`) and gets its own Monday digest there, while your `SLACK_WEBHOOK_URL` only ever receives the `AUTOPILOT_CRON_MODE=demo` digest.

Founders invite their own teammates from `/app/settings` (no email is sent; the teammate signs in at `/login` with the invited address). A company invite counts as an invitation to Runway, so teammates don't need a waitlist invite. Run `npm run db:migrate` so the `company_invites` table exists.

### Inviting founders

In invite mode, a sign-in link creates an account only for an email you've invited. In Supabase → SQL Editor:
```sql
insert into public.waitlist (email, invited_at) values ('founder@company.com', now())
on conflict (email) do update set invited_at = now();
```
Emails are stored lowercase. To see who is waiting: `select email, role, bank, created_at from waitlist where invited_at is null order by created_at;`

## Safety notes

- With accounts on, each company's data is read and written only for the company of the verified session (the proxy checks the session with Supabase on every request and strips any client-sent identity header). Founders can delete their uploads, and everything derived from them, on the upload page.
- On a single-company deployment (no Supabase Auth), a real Rho token is **refused unless `APP_PASSWORD` is set**, and the password then protects the app and its APIs.
- Early-access emails are personal data. Read them in Supabase (the table has row-level security on with no policies, so the public and signed-in API roles can't); export with `select email, role, bank, created_at from waitlist order by created_at;` in the SQL Editor.
- Agents only ever create **drafts**. The database itself rejects anything else, and a person approves each one in the Inbox.
- Rotate any key that was ever pasted into a chat or committed anywhere.
