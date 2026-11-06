-- A company's own Slack incoming webhook for its Monday digest. The URL is a secret: only the
-- server's privileged role reads it, and it goes with the company.
create table public.company_integrations (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  slack_webhook_url text check (slack_webhook_url is null or slack_webhook_url like 'https://hooks.slack.com/services/%'),
  updated_at timestamptz not null default now()
);
alter table public.company_integrations enable row level security;
revoke all on public.company_integrations from anon, authenticated;
