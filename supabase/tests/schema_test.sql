-- Run after local_stub.sql + migrations:  psql -v ON_ERROR_STOP=1 -f schema_test.sql
-- Each block raises on failure.

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B');
insert into public.memberships (org_id, user_id) values
  ('00000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111');
insert into public.connections (id, org_id, provider) values
  ('c0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'demo'),
  ('c0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'demo');
insert into public.transactions (org_id, connection_id, provider_account_id, provider_txn_id, posted_on, amount_minor, description, txn_type, status, vendor_key, raw, raw_hash) values
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'acc', 't1', '2026-09-05', -14990, 'ZOOM', 'card', 'posted', 'zoom', '{}', 'h1'),
  ('00000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000a', 'acc', 't2', '2026-09-28', -50000, 'CARD PAYMENT', 'transfer', 'posted', 'internal_transfer', '{}', 'h2'),
  ('00000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000b', 'acc', 't1', '2026-09-05', -99900, 'SECRET', 'card', 'posted', 'x', '{}', 'h3');
insert into public.findings (id, org_id, fingerprint, kind, title, detail, confidence) values
  ('f0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'duplicate_tools:video_meetings', 'duplicate_tools', 'A', 'a', 0.8),
  ('f0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'duplicate_tools:video_meetings', 'duplicate_tools', 'B', 'b', 0.8);
insert into public.actions (id, org_id, finding_id, kind, payload, fingerprint, created_by) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000a', 'cancel_email', '{}', 'cancel:webex', 'autopilot');

-- 1. Agents cannot create pre-approved actions.
do $$ begin
  begin
    insert into public.actions (org_id, kind, payload, fingerprint, created_by, status)
    values ('00000000-0000-0000-0000-00000000000a', 'jira_ticket', '{}', 'x', 'autopilot', 'approved');
    raise exception 'FAIL: approved action insert was allowed';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- 2. Re-running a detector upserts on the fingerprint and keeps a dismissal.
update public.findings set status = 'dismissed' where id = 'f0000000-0000-0000-0000-00000000000a';
insert into public.findings (org_id, fingerprint, kind, title, detail, confidence)
values ('00000000-0000-0000-0000-00000000000a', 'duplicate_tools:video_meetings', 'duplicate_tools', 'A2', 'a2', 0.8)
on conflict (org_id, fingerprint) do update set title = excluded.title, last_seen_at = now();
do $$ begin
  if (select status from public.findings where id = 'f0000000-0000-0000-0000-00000000000a') <> 'dismissed' then
    raise exception 'FAIL: re-run revived a dismissed finding';
  end if;
end $$;
update public.findings set status = 'open' where id = 'f0000000-0000-0000-0000-00000000000a';

-- Act as user 1 (member of Org A only).
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- 3. Tenant isolation on tables and the security_invoker view.
do $$ begin
  if (select count(*) from public.findings) <> 1 then raise exception 'FAIL: saw other org findings'; end if;
  if (select count(*) from public.transactions) <> 2 then raise exception 'FAIL: saw other org transactions'; end if;
  if (select count(*) from public.monthly_flows) <> 1 then raise exception 'FAIL: view leaked other orgs'; end if;
  if (select outflow_minor from public.monthly_flows) <> 14990 then raise exception 'FAIL: transfers counted as burn'; end if;
end $$;

-- 4. Users cannot write tables directly.
do $$ begin
  begin
    update public.findings set status = 'resolved';
    raise exception 'FAIL: direct update allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5. Transitions go through the RPC and are audited; other orgs are invisible.
select public.set_finding_status('f0000000-0000-0000-0000-00000000000a', 'accepted', 'cancelling Webex');
select public.set_action_status('a0000000-0000-0000-0000-00000000000a', 'approved');
do $$ begin
  if (select count(*) from public.entity_events) <> 2 then raise exception 'FAIL: audit events missing'; end if;
  begin
    perform public.set_finding_status('f0000000-0000-0000-0000-00000000000b', 'dismissed');
    raise exception 'FAIL: changed another org''s finding';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.set_action_status('a0000000-0000-0000-0000-00000000000a', 'sent');
    raise exception 'FAIL: user marked an action sent';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

reset role;
select 'ALL SCHEMA TESTS PASSED' as result;
