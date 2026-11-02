-- Early-access signups from the public site. Not tied to an organization: these are people who
-- don't have an account yet. Only the server's privileged role reads or writes it.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text check (role in ('founder', 'finance_lead', 'fractional_cfo', 'investor', 'other')),
  bank text check (bank in ('rho', 'mercury', 'brex', 'svb', 'chase', 'other')),
  source text check (source ~ '^[a-z0-9_-]{1,40}$'),
  created_at timestamptz not null default now(),
  constraint waitlist_email_key unique (email),
  constraint waitlist_email_normalized check (email = lower(btrim(email)) and length(email) between 3 and 254)
);

-- Emails are personal data: no policies, so anon and signed-in users can read nothing, and
-- Supabase's default grants on new public tables are taken back explicitly.
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
