-- Teams: the owner invites teammates by email; they join the company when they first sign in.

-- So the owner can see who is in the company. Set by the server from the verified sign-in email.
alter table public.memberships add column email text check (email is null or (email = lower(btrim(email)) and length(email) between 3 and 254));

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  constraint company_invites_org_email_key unique (org_id, email)
);
create index company_invites_email_idx on public.company_invites (email);

-- Invites hold other people's emails: only the server's privileged role reads or writes them.
alter table public.company_invites enable row level security;
revoke all on public.company_invites from anon, authenticated;
