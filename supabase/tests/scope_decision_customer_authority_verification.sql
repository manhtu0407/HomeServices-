-- @pillar id: P87-scope-decision-customer-authority-sql
-- @pillar invariant: Only an owning Customer can atomically decide scope; changed roles, null actors, stale states and duplicate decisions leave job and scope state unchanged.
-- @pillar authority: governance/RULES.md #7; approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260905105000_scope_decision_customer_authority.sql
-- @pillar layer: sql
-- @pillar siblings: P87-scope-change-http-authority, P86-customer-completion-http
-- @pillar mutation: Remove the Customer-role guard; a retained job owner promoted to Admin can approve and the actor test fails.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d8700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'scope-authority-customer@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'scope-authority-worker@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'scope-authority-other@example.test', '{"provider":"email","providers":["email"]}', '{}');

update public.profiles set role = 'worker'
where id = 'd8700000-0000-4000-8000-000000000002';

insert into public.jobs(id, customer_id, worker_id, service_type, description,
  address_district, status, final_price)
values (
  'd8700000-0000-4000-8000-000000000101',
  'd8700000-0000-4000-8000-000000000001', 'd8700000-0000-4000-8000-000000000002',
  'plumbing', 'Scope decision authority verification', 'q7', 'scope_change_pending', 200000
);

insert into public.kael_job_incidents(id, job_id, opened_by, status,
  reported_description, reported_reason, evidence_status, revision,
  scope_price_quote_id, scope_price_quote, scope_price_quote_revision,
  scope_price_quote_expires_at, scope_price_quote_confirmed_at)
values (
  'd8700000-0000-4000-8000-000000000301',
  'd8700000-0000-4000-8000-000000000101', 'd8700000-0000-4000-8000-000000000002',
  'ready_for_scope_proposal', 'Scope decision fixture', 'Customer authority verification.', 'ready', 1,
  'd8700000-0000-4000-8000-000000000401',
  '{"schema_version":"scope_change_worker_quote.v1",
    "quote_id":"d8700000-0000-4000-8000-000000000401",
    "incident_id":"d8700000-0000-4000-8000-000000000301",
    "job_id":"d8700000-0000-4000-8000-000000000101",
    "selection_rule":"verified_neutral_midpoint_with_bilateral_confirmation",
    "customer_total":300000,"platform_fee":45000,"worker_net":255000,
    "commission_level":1,"commission_rate_bps":1500,
    "reference_price_min":240000,"reference_price_max":360000,
    "baseline_used":"plumbing:pipe_leak:medium:hcmc_all","baseline_source":"verified_test_baseline",
    "calculation":"Verified range midpoint: 300000 VND",
    "expires_at":"2099-09-05T00:15:00Z",
    "baseline_evidence":{"schema_version":"baseline_price_evidence_receipt.v1",
      "accepted_source_count":2,"aggregate_price_min":240000,"aggregate_price_max":360000,
      "high_trust_source_count":2,"quorum_met":true,"required_quorum":2,"unit":"per_visit",
      "sources":[
        {"domain":"source-a.example","url":"https://source-a.example/price","observed_at":"2026-09-05",
          "price_min":240000,"price_max":360000,"unit":"per_visit","effective_tier":1,"weight":1},
        {"domain":"source-b.example","url":"https://source-b.example/price","observed_at":"2026-09-05",
          "price_min":240000,"price_max":360000,"unit":"per_visit","effective_tier":1,"weight":1}]}}'::jsonb,
  1, now() + interval '15 minutes', '2026-09-05T00:00:00Z'
);

insert into public.scope_change_requests(id, job_id, worker_id,
  requested_description, reason, status, kael_computed_min, kael_computed_max,
  request_timing, resume_job_status, kael_review)
values (
  'd8700000-0000-4000-8000-000000000201',
  'd8700000-0000-4000-8000-000000000101', 'd8700000-0000-4000-8000-000000000002',
  'Scope decision fixture', 'The fixture requires Customer authority.',
  'waiting_customer_decision', 300000, 300000, 'on_site', 'inspecting',
  '{"price_source":"verified_baseline","pricing_mode":"full_scope_total",
    "selection_rule":"verified_neutral_midpoint_with_bilateral_confirmation",
    "baseline_used":"plumbing:pipe_leak:medium:hcmc_all","baseline_source":"verified_test_baseline",
    "reference_price_min":240000,"reference_price_max":360000,
    "baseline_evidence":{"schema_version":"baseline_price_evidence_receipt.v1",
      "accepted_source_count":2,"aggregate_price_min":240000,"aggregate_price_max":360000,
      "high_trust_source_count":2,"quorum_met":true,"required_quorum":2,"unit":"per_visit",
      "sources":[
        {"domain":"source-a.example","url":"https://source-a.example/price","observed_at":"2026-09-05",
          "price_min":240000,"price_max":360000,"unit":"per_visit","effective_tier":1,"weight":1},
        {"domain":"source-b.example","url":"https://source-b.example/price","observed_at":"2026-09-05",
          "price_min":240000,"price_max":360000,"unit":"per_visit","effective_tier":1,"weight":1}]},
    "worker_price_confirmation":{"confirmed":true,
      "quote_id":"d8700000-0000-4000-8000-000000000401","confirmed_at":"2026-09-05T00:00:00Z"},
    "stakeholder_balance":{"customer_total":300000,"platform_fee":45000,"worker_net":255000,
      "commission_level":1,"commission_rate_bps":1500,
      "customer_confirmation_required":true,"worker_confirmation_required":true}}'::jsonb
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $authority$
declare
  v_result record;
  v_role public.user_role;
  v_actor uuid;
  v_job_before jsonb;
  v_scope_before jsonb;
begin
  select to_jsonb(j) into v_job_before from public.jobs j
  where id = 'd8700000-0000-4000-8000-000000000101';
  select to_jsonb(sc) into v_scope_before from public.scope_change_requests sc
  where id = 'd8700000-0000-4000-8000-000000000201';

  foreach v_role in array array['admin', 'worker']::public.user_role[] loop
    update public.profiles set role = v_role
    where id = 'd8700000-0000-4000-8000-000000000001';
    select * into strict v_result from public.decide_scope_change_atomic(
      'd8700000-0000-4000-8000-000000000201',
      'd8700000-0000-4000-8000-000000000001', 'approve'
    );
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
      raise exception 'retained owner with role % bypassed Customer authority: %', v_role, row_to_json(v_result);
    end if;
  end loop;
  update public.profiles set role = 'customer'
  where id = 'd8700000-0000-4000-8000-000000000001';

  foreach v_actor in array array[
    null::uuid,
    'd8700000-0000-4000-8000-000000000002'::uuid,
    'd8700000-0000-4000-8000-000000000003'::uuid,
    'd8700000-0000-4000-8000-000000000099'::uuid
  ] loop
    select * into strict v_result from public.decide_scope_change_atomic(
      'd8700000-0000-4000-8000-000000000201', v_actor, 'approve'
    );
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND'
      or v_result.job_id_out is not null then
      raise exception 'invalid actor acquired scope ownership: %', row_to_json(v_result);
    end if;
  end loop;

  select * into strict v_result from public.decide_scope_change_atomic(
    'd8700000-0000-4000-8000-000000000201',
    'd8700000-0000-4000-8000-000000000001', null
  );
  if v_result.ok or v_result.error_code is distinct from 'INVALID_DECISION' then
    raise exception 'null decision was treated as rejection: %', row_to_json(v_result);
  end if;

  if v_job_before is distinct from (select to_jsonb(j) from public.jobs j
      where id = 'd8700000-0000-4000-8000-000000000101')
    or v_scope_before is distinct from (select to_jsonb(sc) from public.scope_change_requests sc
      where id = 'd8700000-0000-4000-8000-000000000201') then
    raise exception 'rejected actor or input mutated scope/job state';
  end if;

  update public.jobs set status = 'inspecting'
  where id = 'd8700000-0000-4000-8000-000000000101';
  select to_jsonb(j) into v_job_before from public.jobs j
  where id = 'd8700000-0000-4000-8000-000000000101';
  select * into strict v_result from public.decide_scope_change_atomic(
    'd8700000-0000-4000-8000-000000000201',
    'd8700000-0000-4000-8000-000000000001', 'approve'
  );
  if v_result.ok or v_result.error_code is distinct from 'INVALID_STATUS' then
    raise exception 'changed job state allowed a stale scope decision: %', row_to_json(v_result);
  end if;
  if v_job_before is distinct from (select to_jsonb(j) from public.jobs j
      where id = 'd8700000-0000-4000-8000-000000000101')
    or v_scope_before is distinct from (select to_jsonb(sc) from public.scope_change_requests sc
      where id = 'd8700000-0000-4000-8000-000000000201') then
    raise exception 'stale decision changed the competing workflow outcome';
  end if;
  update public.jobs set status = 'scope_change_pending'
  where id = 'd8700000-0000-4000-8000-000000000101';

  select * into strict v_result from public.decide_scope_change_atomic(
    'd8700000-0000-4000-8000-000000000201',
    'd8700000-0000-4000-8000-000000000001', 'approve'
  );
  if not v_result.ok or v_result.scope_status is distinct from 'approved_by_customer' then
    raise exception 'owning Customer could not approve scope: %', row_to_json(v_result);
  end if;
  if not exists (select 1 from public.jobs
    where id = 'd8700000-0000-4000-8000-000000000101'
      and status = 'repairing' and final_price = 300000
      and scope_change_customer_decision = 'approved') then
    raise exception 'Customer decision did not apply its final-price transition';
  end if;

  select to_jsonb(j) into v_job_before from public.jobs j
  where id = 'd8700000-0000-4000-8000-000000000101';
  select to_jsonb(sc) into v_scope_before from public.scope_change_requests sc
  where id = 'd8700000-0000-4000-8000-000000000201';
  select * into strict v_result from public.decide_scope_change_atomic(
    'd8700000-0000-4000-8000-000000000201',
    'd8700000-0000-4000-8000-000000000001', 'reject'
  );
  if v_result.ok or v_result.error_code is distinct from 'ALREADY_DECIDED' then
    raise exception 'late opposite decision was not refused: %', row_to_json(v_result);
  end if;
  if v_job_before is distinct from (select to_jsonb(j) from public.jobs j
      where id = 'd8700000-0000-4000-8000-000000000101')
    or v_scope_before is distinct from (select to_jsonb(sc) from public.scope_change_requests sc
      where id = 'd8700000-0000-4000-8000-000000000201') then
    raise exception 'duplicate decision repeated or reversed atomic effects';
  end if;
end;
$authority$;

do $privileges$
begin
  if has_function_privilege('anon', 'public.decide_scope_change_atomic(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.decide_scope_change_atomic(uuid,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.decide_scope_change_atomic(uuid,uuid,text)', 'execute') then
    raise exception 'scope decision no longer has a service-only execution boundary';
  end if;
end;
$privileges$;

reset role;
rollback;
