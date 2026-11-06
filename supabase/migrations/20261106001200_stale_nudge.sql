-- The export date (its latest transaction) a company's Slack was last reminded to refresh, so each stale export is mentioned once.
alter table public.company_integrations add column stale_nudged_for date;
