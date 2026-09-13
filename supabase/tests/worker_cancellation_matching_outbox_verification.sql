-- @pillar id: P84-worker-cancellation-matching-outbox
-- @pillar invariant: approved cancellation atomically queues one durable replacement, preserves cohort isolation and Customer selection, and stale dispatch cannot overwrite newer matching
-- @pillar authority: approved Production Agentic Transaction Readiness plan | governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260905102000_worker_cancellation_matching_outbox.sql
-- @pillar layer: sql
-- @pillar siblings: P83-worker-cancellation-recovery
-- @pillar mutation: remove the cancellation trigger, idempotent identity, eligibility join or stale-operation guard; the atomicity, duplicate, cross-cohort and superseded-settlement assertions fail

begin;

insert into public.synthetic_matching_cohorts(cohort_id)
values ('synthetic-cancellation-p84'), ('synthetic-cancellation-foreign-p84');

do $fixtures$
declare
  v_actor uuid;
begin
  for i in 1..7 loop
    v_actor := ('d8400000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'replacement-p84-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    if i <> 6 then
      insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
      values (case when i = 5 then 'synthetic-cancellation-foreign-p84' else 'synthetic-cancellation-p84' end,
        v_actor, case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    end if;
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts,
        problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status,
        synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, i <> 7, 'Replacement fixture ' || i, '1990-01-01', 'approved',
        case when i = 6 then null when i = 5 then 'synthetic-cancellation-foreign-p84' else 'synthetic-cancellation-p84' end);
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d8400000-0000-4000-8000-000000000001', 'Replacement fixture building', 'P84', 'q7')
on conflict (id) do nothing;

insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status,
  quote_mode, apartment_access_state)
values
  ('d8400000-0000-4000-8000-000000000101', 'd8400000-0000-4000-8000-000000000001',
    'd8400000-0000-4000-8000-000000000002', 'plumbing', 'Durable replacement RFQ fixture', 'q7',
    'worker_on_way', 'rfq', '{"access_granted":true}'),
  ('d8400000-0000-4000-8000-000000000102', 'd8400000-0000-4000-8000-000000000001',
    'd8400000-0000-4000-8000-000000000007', 'plumbing', 'Legacy replacement recovery fixture', 'q7',
    'worker_on_way', null, '{}');

insert into public.kael_chat_sessions(id, customer_id, service_type, status, case_phase, safe_metadata)
values ('d8400000-0000-4000-8000-000000000201', 'd8400000-0000-4000-8000-000000000001',
  'plumbing', 'active', 'matching', '{}');
insert into public.confirmation_operations(id, idempotency_key, session_id, customer_id, job_id, quote_mode,
  confirmation_kind, state, support_code, synthetic_cohort_id)
values ('d8400000-0000-4000-8000-000000000301', 'replacement-operation-p84-101',
  'd8400000-0000-4000-8000-000000000201', 'd8400000-0000-4000-8000-000000000001',
  'd8400000-0000-4000-8000-000000000101', 'rfq', 'rfq_request', 'official_match', 'P8400101', 'synthetic-cancellation-p84');
insert into public.matching_operations(id, confirmation_operation_id, job_id, state, synthetic_cohort_id)
values ('d8400000-0000-4000-8000-000000000401', 'd8400000-0000-4000-8000-000000000301',
  'd8400000-0000-4000-8000-000000000101', 'official_match', 'synthetic-cancellation-p84');
insert into public.workflow_outbox(operation_id, event_type, status)
values ('d8400000-0000-4000-8000-000000000301', 'matching_requested', 'completed');
insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
  district_code, status, held_at, expires_at, synthetic_cohort_id)
values ('d8400000-0000-4000-8000-000000000301', 'd8400000-0000-4000-8000-000000000101',
  'd8400000-0000-4000-8000-000000000002', 'plumbing', 'q7', 'offered', now(), now() + interval '5 minutes', 'synthetic-cancellation-p84');

do $replacement$
declare
  v_cancel record;
  v_recovered record;
  v_claim record;
  v_reclaim record;
  v_outbox public.workflow_outbox%rowtype;
  v_receipt jsonb;
  v_repeat jsonb;
  v_candidate record;
  v_late_candidate record;
  v_selected uuid;
  v_second_worker uuid;
  v_second_broadcast uuid;
  v_new_matching uuid;
begin
  select * into strict v_cancel from public.request_worker_cancellation_atomic(
    'd8400000-0000-4000-8000-000000000101', 'd8400000-0000-4000-8000-000000000002',
    'Unexpected vehicle breakdown prevents continuing', array[]::text[]);
  if not v_cancel.ok or v_cancel.cancellation_status <> 'approved' then
    raise exception 'P84 cancellation command failed: %', row_to_json(v_cancel);
  end if;
  set constraints worker_cancellation_durable_replacement immediate;
  set constraints worker_cancellation_durable_replacement deferred;
  select * into strict v_outbox from public.workflow_outbox where worker_cancellation_id = v_cancel.cancellation_id;
  if v_outbox.operation_id is not null or v_outbox.status <> 'queued' or v_outbox.event_type <> 'matching_reconcile' then
    raise exception 'P84 committed cancellation lacks its own durable replacement identity';
  end if;
  if (select worker_id from public.jobs where id = v_cancel.job_id_out) is not null
    or (select apartment_access_state from public.jobs where id = v_cancel.job_id_out) <> '{}'::jsonb
    or exists (select 1 from public.matching_capacity_reservations where worker_id = v_cancel.worker_id_out and status in ('held', 'offered')) then
    raise exception 'P84 cancellation retained old assignment/access/capacity';
  end if;
  for i in 1..100 loop
    select * into strict v_recovered from public.recover_worker_cancellation_replacement(v_cancel.cancellation_id, v_cancel.worker_id_out);
    if v_recovered.replacement_state <> 'queued' or v_recovered.broadcast_sent then
      raise exception 'P84 recovery invented a recipient before durable activation';
    end if;
  end loop;
  if (select count(*) from public.workflow_outbox where worker_cancellation_id = v_cancel.cancellation_id) <> 1
    or (select count(*) from public.matching_operations where job_id = v_cancel.job_id_out and state = 'queued') <> 1 then
    raise exception 'P84 duplicate cancellation recovery created extra durable work';
  end if;
  begin
    perform * from public.recover_worker_cancellation_replacement(v_cancel.cancellation_id, 'd8400000-0000-4000-8000-000000000003');
    raise exception 'P84 another Worker recovered a cancellation they do not own';
  exception when insufficient_privilege then null;
  end;
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('sql:p84-replacement', 1, 45);
  if v_claim.outbox_id <> v_outbox.id then raise exception 'P84 claim skipped replacement work'; end if;
  if exists (select 1 from public.claim_worker_replacement_outbox_batch('sql:p84-competing', 1, 45)) then
    raise exception 'P84 another dispatcher stole an active replacement lease';
  end if;
  if public.activate_worker_replacement_outbox_claim(v_claim.outbox_id, gen_random_uuid())->>'state' <> 'lease_lost' then
    raise exception 'P84 invalid lease activated replacement';
  end if;
  v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id, v_claim.lease_token);
  if v_receipt->>'state' <> 'broadcasting' or jsonb_array_length(v_receipt->'targets') <> 2 then
    raise exception 'P84 replacement did not select exactly same-cohort eligible Workers: %', v_receipt;
  end if;
  if exists (select 1 from public.job_broadcasts where job_id = v_cancel.job_id_out and worker_id not in (
      'd8400000-0000-4000-8000-000000000003', 'd8400000-0000-4000-8000-000000000004'))
    or exists (select 1 from public.matching_recipient_deliveries where job_id = v_cancel.job_id_out and synthetic_cohort_id is distinct from 'synthetic-cancellation-p84') then
    raise exception 'P84 replacement leaked real/foreign/cancelled Worker across cohort boundary';
  end if;
  if exists (select 1 from public.matching_recipient_deliveries as delivery join public.job_broadcasts as broadcast on broadcast.id = delivery.broadcast_id
    where delivery.operation_id = v_outbox.replacement_matching_operation_id and delivery.expires_at - broadcast.sent_at <> interval '5 minutes') then
    raise exception 'P84 replacement TTL is not exactly five minutes';
  end if;
  for i in 1..100 loop
    v_repeat := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id, v_claim.lease_token);
    if v_repeat->'targets' <> v_receipt->'targets' then raise exception 'P84 retry changed persisted recipient identity'; end if;
  end loop;
  if (select count(*) from public.job_broadcasts where job_id = v_cancel.job_id_out) <> 2
    or (select count(distinct batch_id) from public.job_broadcasts where job_id = v_cancel.job_id_out) <> 1 then
    raise exception 'P84 duplicate activation created extra recipient/batch';
  end if;

  -- A lost process leaves its batch durable; a new lease recovers the exact receipt.
  update public.workflow_outbox set lease_expires_at = now() - interval '1 second' where id = v_claim.outbox_id;
  select * into strict v_reclaim from public.claim_worker_replacement_outbox_batch('sql:p84-restarted', 1, 45);
  if public.settle_worker_replacement_outbox_claim(v_claim.outbox_id, v_claim.lease_token, 'broadcasting') <> 'lease_lost' then
    raise exception 'P84 expired lease settled another dispatcher work';
  end if;
  v_repeat := public.activate_worker_replacement_outbox_claim(v_reclaim.outbox_id, v_reclaim.lease_token);
  if v_repeat->'targets' <> v_receipt->'targets' then raise exception 'P84 restart lost persisted batch'; end if;
  if (select worker_id from public.jobs where id = v_cancel.job_id_out) is not null then
    raise exception 'P84 replacement bypassed Customer official-selection gate';
  end if;

  v_selected := (v_receipt#>>'{targets,0,worker_id}')::uuid;
  v_second_worker := (v_receipt#>>'{targets,1,worker_id}')::uuid;
  v_second_broadcast := (v_receipt#>>'{targets,1,broadcast_id}')::uuid;
  begin
    update public.matching_capacity_reservations set status = 'released', released_at = now()
      where job_id = v_cancel.job_id_out and worker_id = v_selected;
    perform * from public.submit_worker_matching_proposal_atomic(v_cancel.job_id_out,
      (v_receipt#>>'{targets,0,broadcast_id}')::uuid, v_selected, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
    raise exception 'P84 Worker proposed after losing its capacity reservation';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE' then raise; end if;
  end;
  select * into strict v_candidate from public.submit_worker_matching_proposal_atomic(v_cancel.job_id_out,
    (v_receipt#>>'{targets,0,broadcast_id}')::uuid, v_selected, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
  if not v_candidate.ok or (select worker_id from public.jobs where id = v_cancel.job_id_out) is not null then
    raise exception 'P84 Worker proposal did not preserve Customer confirmation: %', row_to_json(v_candidate);
  end if;
  select * into strict v_late_candidate from public.submit_worker_matching_proposal_atomic(v_cancel.job_id_out,
    v_second_broadcast, v_second_worker, 'Kiểm tra và báo giá xử lý rò nước.', 300000, 500000);
  if v_late_candidate.ok then raise exception 'P84 competing Worker bypassed candidate race'; end if;
  if public.settle_worker_replacement_outbox_claim(v_reclaim.outbox_id, v_reclaim.lease_token, 'broadcasting') <> 'completed'
    or (select state from public.confirmation_operations where job_id = v_cancel.job_id_out) <> 'candidate_ready' then
    raise exception 'P84 delayed broadcasting settlement regressed candidate state';
  end if;

  begin
    update public.matching_capacity_reservations set held_at = now() - interval '10 minutes',
      expires_at = now() - interval '5 minutes' where job_id = v_cancel.job_id_out and worker_id = v_selected;
    perform * from public.confirm_worker_matching_proposal_atomic(
      v_cancel.job_id_out, v_candidate.candidate_id, 'd8400000-0000-4000-8000-000000000001');
    raise exception 'P84 Customer assigned replacement after capacity expired';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'MATCHING_REPLACEMENT_CAPACITY_UNAVAILABLE' then raise; end if;
  end;
  select * into strict v_candidate from public.confirm_worker_matching_proposal_atomic(
    v_cancel.job_id_out, v_candidate.candidate_id, 'd8400000-0000-4000-8000-000000000001');
  if not v_candidate.ok then raise exception 'P84 Customer could not confirm replacement: %', row_to_json(v_candidate); end if;
  select * into strict v_cancel from public.request_worker_cancellation_atomic(
    v_cancel.job_id_out, v_selected, 'Unexpected vehicle breakdown prevents continuing', array[]::text[]);
  if not v_cancel.ok then raise exception 'P84 second cancellation failed: %', row_to_json(v_cancel); end if;
  set constraints worker_cancellation_durable_replacement immediate;
  set constraints worker_cancellation_durable_replacement deferred;
  select replacement_matching_operation_id into strict v_new_matching from public.workflow_outbox
    where worker_cancellation_id = v_cancel.cancellation_id;
  update public.workflow_outbox set status = 'processing', lease_token = v_reclaim.lease_token,
    lease_expires_at = now() + interval '45 seconds' where id = v_outbox.id;
  if public.activate_worker_replacement_outbox_claim(v_outbox.id, v_reclaim.lease_token)->>'state' <> 'stopped'
    or public.settle_worker_replacement_outbox_claim(v_outbox.id, v_reclaim.lease_token, 'recovery_required', 'SIMULATED_RESTART') <> 'completed'
    or (select state from public.matching_operations where id = v_new_matching) <> 'queued'
    or (select state from public.confirmation_operations where job_id = v_cancel.job_id_out) <> 'matching_queued' then
    raise exception 'P84 old replacement clobbered newer cancellation receipt';
  end if;
end;
$replacement$;

do $legacy_and_boundary$
declare
  v_cancel record;
  v_claim record;
  v_receipt jsonb;
  v_seen_legacy boolean := false;
begin
  select * into strict v_cancel from public.request_worker_cancellation_atomic(
    'd8400000-0000-4000-8000-000000000102', 'd8400000-0000-4000-8000-000000000007',
    'Unexpected emergency prevents continuing the job', array[]::text[]);
  set constraints worker_cancellation_durable_replacement immediate;
  set constraints worker_cancellation_durable_replacement deferred;
  for v_claim in select * from public.claim_worker_replacement_outbox_batch('sql:p84-final', 10, 45) loop
    v_receipt := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id, v_claim.lease_token);
    if (select worker_cancellation_id from public.workflow_outbox where id = v_claim.outbox_id) = v_cancel.cancellation_id then
      v_seen_legacy := true;
      if v_receipt->>'error_code' <> 'LEGACY_MATCHING_REQUIRES_REVIEW'
        or public.settle_worker_replacement_outbox_claim(v_claim.outbox_id, v_claim.lease_token,
          'recovery_required', 'LEGACY_MATCHING_REQUIRES_REVIEW') <> 'dead_letter' then
        raise exception 'P84 legacy job invented confirmation instead of audited recovery';
      end if;
    elsif v_receipt->>'state' <> 'no_reachable_worker' then
      raise exception 'P84 prior recipients were unexpectedly reassigned: %', v_receipt;
    end if;
  end loop;
  if not v_seen_legacy then raise exception 'P84 dispatcher skipped legacy cancellation receipt'; end if;
  if exists (select 1 from public.confirmation_operations where job_id = 'd8400000-0000-4000-8000-000000000102') then
    raise exception 'P84 legacy cancellation fabricated Customer confirmation';
  end if;
  if has_function_privilege('authenticated', 'public.recover_worker_cancellation_replacement(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.activate_worker_replacement_outbox_claim(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_worker_replacement_outbox_batch(text,integer,integer)', 'EXECUTE') then
    raise exception 'P84 client can mutate server-owned replacement work';
  end if;
end;
$legacy_and_boundary$;

rollback;
