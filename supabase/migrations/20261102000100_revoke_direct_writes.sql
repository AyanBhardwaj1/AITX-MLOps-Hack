-- Supabase grants the API roles (anon, authenticated) every privilege on new public tables by
-- default. Row-level security already stops their writes here (there are no write policies), but
-- the schema's rule is that members never write tables directly: reads go through RLS policies,
-- writes through the server's privileged role or the audited security-definer RPCs. Take the
-- write privileges back too, so the rule holds even if a write policy is ever added by mistake.
-- Nothing in the app uses the anon role, so it gets no table access at all.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
