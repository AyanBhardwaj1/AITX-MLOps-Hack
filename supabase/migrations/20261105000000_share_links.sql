-- Read-only links a company sends to investors. The URL carries a random token; only its SHA-256
-- hash is stored. The payload is a frozen snapshot of headline numbers (no vendors, people or
-- transactions). Written only by the server's privileged role; members read their own org's rows.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  label text check (char_length(label) <= 80),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index share_links_org_idx on public.share_links (org_id, created_at desc);

alter table public.share_links enable row level security;
create policy share_links_member_read on public.share_links for select to authenticated
  using (org_id in (select private.user_org_ids()));
revoke all on public.share_links from anon, authenticated;
grant select on public.share_links to authenticated;
