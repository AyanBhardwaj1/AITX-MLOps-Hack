-- The runway line (months) a company's Slack was last told runway dropped under, so each crossing posts once.
alter table public.company_integrations add column runway_alert_months smallint check (runway_alert_months in (3, 6, 12));
