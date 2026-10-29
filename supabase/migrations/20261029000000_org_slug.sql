-- One organization per data scope (e.g. "demo", "rho_sandbox", "rho"), created on first use.
-- The unique slug lets the server create it race-free with ON CONFLICT.
alter table public.organizations add column slug text;
create unique index organizations_slug_key on public.organizations (slug);

-- Autopilot run summaries show how many findings each run produced.
alter table public.agent_runs add column findings_count integer not null default 0;
