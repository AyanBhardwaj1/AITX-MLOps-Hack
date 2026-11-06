-- The activity log records what the daily job told a company's Slack (budget and runway alerts).
alter table public.company_activity drop constraint company_activity_kind_check;
alter table public.company_activity add constraint company_activity_kind_check
  check (kind in ('upload', 'delete_account', 'clear', 'invite', 'revoke_invite', 'remove_member', 'leave', 'transfer', 'join', 'rename', 'slack', 'share_link', 'cash', 'budget', 'alert'));
