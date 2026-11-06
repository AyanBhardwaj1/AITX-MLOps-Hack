-- The month (YYYY-MM) each budget's "over budget" Slack alert last went out for, so it goes once.
alter table public.company_budgets add column alerted_month text check (alerted_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
