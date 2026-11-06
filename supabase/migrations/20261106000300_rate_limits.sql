-- Rate limits shared by every server instance (sign-in links, early-access signups). Keys are
-- SHA-256 hashes, never the email or IP itself. Only the server's privileged role touches it.
create table public.rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count integer not null check (count >= 0)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
