-- People's own fixes to how a vendor is categorised, per organization. They override the catalog
-- and LLM labels in every calculation. Written only by the server's privileged role; members read
-- their own org's rows.
create table public.vendor_corrections (
  org_id uuid not null references public.organizations (id) on delete cascade,
  vendor_key text not null check (vendor_key ~ '^[a-z0-9_]{1,80}$'),
  category text not null check (category in (
    'payroll', 'rent', 'software', 'cloud', 'ai_api', 'marketing', 'travel', 'meals', 'contractors',
    'legal_accounting', 'insurance', 'hardware', 'fees', 'revenue', 'transfer', 'other'
  )),
  job text check (job ~ '^[a-z_]{2,40}$'),
  -- Only tools have a job-to-be-done (used to spot overlapping tools).
  constraint vendor_corrections_job_needs_tool check (job is null or category in ('software', 'cloud', 'ai_api')),
  updated_at timestamptz not null default now(),
  primary key (org_id, vendor_key)
);

alter table public.vendor_corrections enable row level security;
create policy vendor_corrections_member_read on public.vendor_corrections for select to authenticated
  using (org_id in (select private.user_org_ids()));
revoke all on public.vendor_corrections from anon, authenticated;
grant select on public.vendor_corrections to authenticated;
