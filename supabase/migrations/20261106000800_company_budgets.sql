-- Monthly budgets per spending category, set by a company's team. Server only.
create table public.company_budgets (
  org_id uuid not null references public.organizations (id) on delete cascade,
  category text not null check (category in ('payroll', 'rent', 'software', 'cloud', 'ai_api', 'marketing', 'travel', 'meals', 'contractors', 'legal_accounting', 'insurance', 'hardware', 'fees', 'other')),
  monthly_minor bigint not null check (monthly_minor > 0 and monthly_minor < 10000000000000),
  updated_at timestamptz not null default now(),
  primary key (org_id, category)
);
alter table public.company_budgets enable row level security;
revoke all on public.company_budgets from anon, authenticated;

-- The activity log records budget changes too.
alter table public.company_activity drop constraint company_activity_kind_check;
alter table public.company_activity add constraint company_activity_kind_check
  check (kind in ('upload', 'delete_account', 'clear', 'invite', 'revoke_invite', 'remove_member', 'leave', 'transfer', 'join', 'rename', 'slack', 'share_link', 'cash', 'budget'));
