# Going live: credentials and deployment

## Put it on Vercel (5 minutes, no credentials needed)

1. On GitHub, open the repo → **Settings → General → Default branch** and make sure it's `main`.
2. Click **Deploy with Vercel** at the top of the README, or go to [vercel.com/new](https://vercel.com/new) and import `AyanBhardwaj1/AITX-MLOps-Hack`.
3. Keep the defaults (Framework: Next.js; no environment variables needed) and click **Deploy**.
4. When it finishes, open the URL. The demo company, Autopilot, the Inbox and Copilot's instant answers all work straight away. `https://<your-app>.vercel.app/api/health` should return `{"status":"ok",...}`.

After that, every push to `main` redeploys automatically and other branches get preview URLs. The rest of this page switches on the optional pieces.

The app runs with no credentials at all (demo company, in-memory decisions, template memos). Each credential below switches on one more piece. Add them in two places:
- **Vercel** → Project → Settings → Environment Variables, then **Redeploy**.
- **`.env.local`** on your machine, for `npm run verify:live` and `npm run db:migrate`.

Never commit `.env.local`; it's gitignored.

| Variable | Turns on | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Copilot chat, GPT-written memos, AI labels for unknown vendors | platform.openai.com → API keys. **Set a monthly budget first** (Settings → Limits). |
| `OPENAI_MODEL_FAST` / `OPENAI_MODEL_AGENT` | Model choice (optional) | Defaults: `gpt-6-luna` / `gpt-6.1-sol` |
| `DATABASE_URL` | Decisions, Inbox and run history saved permanently | Supabase → **Connect** → *Transaction pooler* URI (port 6543), with your database password filled in |
| `DATABASE_CA_CERT` | Verified TLS to Supabase | Supabase → Project Settings → Database → **SSL Configuration → Download certificate**. Paste the whole PEM (including `-----BEGIN CERTIFICATE-----`). |
| `APP_PASSWORD` | Password prompt on the whole site (any username) | Pick one, at least 8 characters. **Required before using a real Rho account.** |
| `RHO_BASE_URL` / `RHO_API_TOKEN` | Your real Rho account instead of the sandbox | Rho → Settings → API. Production URL: `https://rhoapi.rho.co/api/v1`; tokens start with `rhobat_`. |
| `CRON_SECRET` | Daily 8 AM (Austin) Autopilot run | Any random string of 16+ characters, e.g. `openssl rand -hex 24` |
| `AUTOPILOT_CRON_MODE` | Which data the daily run reviews | `demo` (default) or `sandbox` (the configured Rho feed) |
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
   - The daily cron in `vercel.json` registers automatically on deploy. It only runs if `CRON_SECRET` is set.
4. **Smoke test on the live URL:**
   - `/api/health` returns `"status":"ok"` and `"database":"ok"` (or `"not_configured"` without `DATABASE_URL`).
   - The dashboard loads.
   - **Autopilot → Run now** produces a memo and drafts in the **Inbox**.
   - Approving a ticket files it in Jira, if configured.
   - With an OpenAI key, Copilot answers "Get me to 14 months without touching payroll".

## Safety notes

- There's no per-user login yet. With a real Rho token the app **refuses to show the account unless `APP_PASSWORD` is set**, and the password then protects every page and API.
- Agents only ever create **drafts**. The database itself rejects anything else, and a person approves each one in the Inbox.
- Rotate any key that was ever pasted into a chat or committed anywhere.
