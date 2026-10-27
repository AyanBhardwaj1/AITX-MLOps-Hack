-- Runway schema. Tenant-ready from day one: every row carries org_id, RLS is on everywhere,
-- users only read; writes happen server-side (service role) or through checked RPCs.
-- Money is bigint minor units (cents) + ISO currency; negative amount = money out (Rho's convention).

create schema if not exists private;

-- Tenancy --------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Bank data --------------------------------------------------------------------

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('rho', 'rho_sandbox', 'demo')),
  -- Production tokens live in Supabase Vault; only the secret id is stored here.
  vault_secret_id uuid,
  -- Rho forbids storing cursors: sync resumes from a date watermark with a lookback.
  watermark date,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create index connections_org_idx on public.connections (org_id);

create table public.accounts (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  provider_account_id text not null,
  name text,
  account_type text not null check (account_type in ('checking', 'credit', 'savings', 'investment', 'rewards')),
  balance_minor bigint not null,
  currency char(3) not null default 'USD',
  synced_at timestamptz not null default now(),
  unique (connection_id, provider_account_id)
);
create index accounts_org_idx on public.accounts (org_id);

create table public.transactions (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.connections (id) on delete cascade,
  -- Rho ids repeat across legs of one money movement; (account, id) is unique.
  provider_account_id text not null,
  provider_txn_id text not null,
  posted_on date not null,
  amount_minor bigint not null,
  currency char(3) not null default 'USD',
  description text not null,
  txn_type text not null check (txn_type in ('card', 'ach', 'wire', 'transfer', 'fee', 'other')),
  status text not null check (status in ('posted', 'pending')),
  cardholder text,
  vendor_key text not null,
  raw jsonb not null,
  -- Upserts skip rows whose payload hash is unchanged, so re-syncs are cheap no-ops.
  raw_hash text not null,
  removed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (connection_id, provider_account_id, provider_txn_id)
);
create index transactions_org_date_idx on public.transactions (org_id, posted_on);
create index transactions_org_vendor_idx on public.transactions (org_id, vendor_key);

-- Vendor labels: global cache keyed by cleaned merchant key and prompt version, so each
-- vendor costs at most one LLM call per prompt version. No tenant data beyond the merchant key.
create table public.vendor_labels (
  merchant_key text not null,
  prompt_version text not null,
  vendor_key text not null,
  name text not null,
  category text not null,
  job text,
  source text not null check (source in ('catalog', 'llm', 'fallback', 'user')),
  model text,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (merchant_key, prompt_version)
);

-- Findings and actions -----------------------------------------------------------

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Deterministic id from the detector (e.g. "duplicate_tools:video_meetings").
  -- Unique per org so a re-run updates the row and never revives a dismissed finding.
  fingerprint text not null,
  kind text not null check (kind in ('zombie', 'duplicate_tools', 'price_creep', 'duplicate_charge')),
  title text not null,
  detail text not null,
  vendor_keys text[] not null default '{}',
  monthly_savings_minor bigint not null default 0 check (monthly_savings_minor >= 0),
  one_time_minor bigint not null default 0 check (one_time_minor >= 0),
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  evidence_txn_ids text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (org_id, fingerprint)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  finding_id uuid references public.findings (id) on delete set null,
  kind text not null check (kind in ('cancel_email', 'downgrade_request', 'card_limit_checklist', 'jira_ticket')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'rejected')),
  payload jsonb not null,
  -- e.g. the Jira issue key once filed.
  external_ref text,
  fingerprint text not null,
  created_by text not null check (created_by in ('copilot', 'autopilot', 'user')),
  created_at timestamptz not null default now(),
  unique (org_id, fingerprint)
);

-- Agents may only ever create drafts. Approval is a human transition via set_action_status().
create function private.actions_insert_must_be_draft() returns trigger
language plpgsql as $$
begin
  if new.status <> 'draft' then
    raise exception 'actions must be created as draft (got %)', new.status;
  end if;
  return new;
end;
$$;
create trigger actions_insert_must_be_draft before insert on public.actions
for each row execute function private.actions_insert_must_be_draft();

-- Agent telemetry (shaped after OpenTelemetry GenAI spans) --------------------------

create table public.model_prices (
  model text primary key,
  input_micro_usd_per_mtok bigint not null,
  output_micro_usd_per_mtok bigint not null
);
-- Third-party list prices (Oct 2026); verify against OpenAI's pricing page.
insert into public.model_prices values
  ('gpt-6-luna', 100000, 500000),
  ('gpt-6.1-sol', 2000000, 10000000);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  agent text not null check (agent in ('copilot', 'autopilot')),
  trigger text not null check (trigger in ('manual', 'cron', 'chat')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_micro_usd bigint not null default 0,
  error text
);
create index agent_runs_org_idx on public.agent_runs (org_id, started_at desc);

create table public.agent_steps (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  seq integer not null,
  name text not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_micro_usd bigint not null default 0,
  detail jsonb not null default '{}',
  unique (run_id, seq)
);
create index agent_steps_org_idx on public.agent_steps (org_id);

create table public.memos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid references public.agent_runs (id) on delete set null,
  period text not null,
  body_md text not null,
  created_at timestamptz not null default now()
);
create index memos_org_idx on public.memos (org_id, created_at desc);

-- Append-only audit trail for human decisions.
create table public.entity_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('finding', 'action')),
  entity_id uuid not null,
  from_status text,
  to_status text not null,
  actor uuid,
  note text,
  at timestamptz not null default now()
);
create index entity_events_org_idx on public.entity_events (org_id, at desc);

-- Analytics -------------------------------------------------------------------------

-- security_invoker so the view respects the caller's RLS instead of the owner's.
create view public.monthly_flows with (security_invoker = true) as
select
  org_id,
  to_char(posted_on, 'YYYY-MM') as month,
  sum(amount_minor) filter (where amount_minor > 0) as inflow_minor,
  -sum(amount_minor) filter (where amount_minor < 0) as outflow_minor
from public.transactions
where status = 'posted' and txn_type <> 'transfer' and removed_at is null
group by org_id, to_char(posted_on, 'YYYY-MM');

-- Row-level security ------------------------------------------------------------------

create function private.user_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.memberships where user_id = (select auth.uid())
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'memberships', 'connections', 'accounts', 'transactions', 'vendor_labels',
    'findings', 'actions', 'model_prices', 'agent_runs', 'agent_steps', 'memos', 'entity_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Members can read their org's rows. No insert/update/delete policies: writes go through
  -- the service role (server jobs) or the security-definer RPCs below.
  foreach t in array array[
    'connections', 'accounts', 'transactions', 'findings', 'actions', 'agent_runs', 'agent_steps', 'memos', 'entity_events'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id in (select private.user_org_ids()))',
      t || '_member_read', t
    );
  end loop;
end;
$$;

create policy organizations_member_read on public.organizations for select to authenticated
  using (id in (select private.user_org_ids()));
create policy memberships_self_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy model_prices_read on public.model_prices for select to authenticated using (true);

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.user_org_ids() to authenticated;
grant select on all tables in schema public to authenticated;

-- Human decisions: validated transitions that also write the audit trail --------------

create function public.set_finding_status(p_finding_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_from text;
begin
  select org_id, status into v_org, v_from from public.findings where id = p_finding_id for update;
  if v_org is null or v_org not in (select private.user_org_ids()) then
    raise exception 'finding not found';
  end if;
  if p_status not in ('open', 'accepted', 'dismissed', 'resolved') then
    raise exception 'invalid finding status %', p_status;
  end if;
  update public.findings set status = p_status where id = p_finding_id;
  insert into public.entity_events (org_id, entity_type, entity_id, from_status, to_status, actor, note)
  values (v_org, 'finding', p_finding_id, v_from, p_status, (select auth.uid()), p_note);
end;
$$;

create function public.set_action_status(p_action_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_from text;
begin
  select org_id, status into v_org, v_from from public.actions where id = p_action_id for update;
  if v_org is null or v_org not in (select private.user_org_ids()) then
    raise exception 'action not found';
  end if;
  -- Approving spend-related actions is an owner decision.
  if not exists (
    select 1 from public.memberships m
    where m.org_id = v_org and m.user_id = (select auth.uid()) and m.role = 'owner'
  ) then
    raise exception 'only org owners can approve or reject actions';
  end if;
  -- Humans approve or reject drafts. Marking "sent" is the server's job after it delivers.
  if not (v_from = 'draft' and p_status in ('approved', 'rejected')) then
    raise exception 'cannot move action from % to %', v_from, p_status;
  end if;
  update public.actions set status = p_status where id = p_action_id;
  insert into public.entity_events (org_id, entity_type, entity_id, from_status, to_status, actor, note)
  values (v_org, 'action', p_action_id, v_from, p_status, (select auth.uid()), p_note);
end;
$$;

revoke execute on function public.set_finding_status(uuid, text, text) from public, anon;
revoke execute on function public.set_action_status(uuid, text, text) from public, anon;
grant execute on function public.set_finding_status(uuid, text, text) to authenticated;
grant execute on function public.set_action_status(uuid, text, text) to authenticated;
