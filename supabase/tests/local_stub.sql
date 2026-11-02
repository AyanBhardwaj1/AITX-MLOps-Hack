-- Minimal stand-in for what Supabase provides, so the migration can be tested on plain Postgres.
-- Never run this against a real Supabase project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Like Supabase: new tables in public are granted to the API roles by default, so migrations must
-- revoke what they don't want exposed (RLS then decides which rows a granted role sees).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
