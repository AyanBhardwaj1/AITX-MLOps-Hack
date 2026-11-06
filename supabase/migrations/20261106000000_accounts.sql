-- Self-serve accounts. Invite-only sign-up reads this flag on the early-access list; set it with
--   update public.waitlist set invited_at = now() where email = 'founder@example.com';
alter table public.waitlist add column invited_at timestamptz;

-- Uploaded bank exports are a connection of their own.
alter table public.connections drop constraint connections_provider_check;
alter table public.connections add constraint connections_provider_check check (provider in ('rho', 'rho_sandbox', 'demo', 'csv'));
