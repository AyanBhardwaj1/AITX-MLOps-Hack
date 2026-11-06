-- Who did what in a company (uploads, deletions, team and settings changes), for its team to see.
-- Descriptions are written by the server (counts and names, never transaction contents). Kept when
-- the data is cleared; deleted with the company. Server only.
create table public.company_activity (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  actor_email text check (actor_email is null or length(actor_email) between 3 and 254),
  kind text not null check (kind in ('upload', 'delete_account', 'clear', 'invite', 'revoke_invite', 'remove_member', 'leave', 'transfer', 'join', 'rename', 'slack', 'share_link')),
  detail text not null check (length(detail) between 1 and 300)
);
create index company_activity_org_idx on public.company_activity (org_id, at desc);
alter table public.company_activity enable row level security;
revoke all on public.company_activity from anon, authenticated;
