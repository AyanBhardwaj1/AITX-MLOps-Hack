-- When each company last got its Monday digest, so the companies that waited longest go first.
alter table public.company_integrations add column last_digest_at timestamptz;
