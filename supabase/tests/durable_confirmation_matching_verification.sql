-- P48-P50: rollback-only proof for confirmation idempotency, five-minute durable delivery,
-- recipient eligibility, proposal races, least privilege, and synthetic cohort isolation.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d4800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'durable-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d4800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'durable-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d4800000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'durable-beta-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d4800000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
    'durable-beta-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker'
where id in ('d4800000-0000-4000-8000-000000000002', 'd4800000-0000-4000-8000-000000000004');
insert into public.customer_profiles(id, building_name, unit_number, district)
values
  ('d4800000-0000-4000-8000-000000000001', 'Durable Building', 'D48', 'q7'),
  ('d4800000-0000-4000-8000-000000000003', 'Durable Beta Building', 'B48', 'q7')
on conflict (id) do nothing;
insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status, synthetic_cohort_id,
  matching_foreground_active_until
) values (
  'd4800000-0000-4000-8000-000000000002', array['plumbing']::public.service_type[],
  array['plumbing']::public.service_type[], 5, array['q7'],
  array['leak_and_flow_diagnosis','pipe_and_fixture_repair']::text[],
  true, true, 'Durable Worker', '1990-01-01', 'approved', null, null
), (
  'd4800000-0000-4000-8000-000000000004', array['plumbing']::public.service_type[],
  array['plumbing']::public.service_type[], 4, array['q7'], array[]::text[],
  true, true, 'Durable Beta Worker', '1991-01-01', 'approved', null, null
);

select * from public.bind_synthetic_matching_cohort(
  'synthetic-p48-alpha',
  array['d4800000-0000-4000-8000-000000000001']::uuid[],
  array['d4800000-0000-4000-8000-000000000002']::uuid[]
);
select * from public.record_worker_matching_heartbeat(
  'd4800000-0000-4000-8000-000000000002', now()
);

do $$
declare v_scope jsonb := jsonb_build_object(
  'worker_requirements',
  jsonb_build_array('leak_and_flow_diagnosis', 'pipe_and_fixture_repair')
);
begin
  if private.worker_meets_job_matching_requirements(
    'rfq', v_scope, null, array[]::text[]
  ) then raise exception 'zero-capability worker passed governed requirements'; end if;
  if private.worker_meets_job_matching_requirements(
    'rfq', v_scope, null, array['leak_and_flow_diagnosis']::text[]
  ) then raise exception 'partial-capability worker passed governed requirements'; end if;
  if not private.worker_meets_job_matching_requirements(
    'rfq', v_scope, null,
    array['leak_and_flow_diagnosis','pipe_and_fixture_repair']::text[]
  ) then raise exception 'complete-capability worker failed governed requirements'; end if;
  if not private.worker_meets_job_matching_requirements(
    null, v_scope, null, array[]::text[]
  ) then raise exception 'expand-window legacy job lost compatibility'; end if;
end;
$$;
select * from public.bind_synthetic_matching_cohort(
  'synthetic-p48-beta',
  array['d4800000-0000-4000-8000-000000000003']::uuid[],
  array['d4800000-0000-4000-8000-000000000004']::uuid[]
);

do $$
declare v_problem_id uuid;
begin
  select id into strict v_problem_id from public.service_problems
    where service_type = 'plumbing' and slug = 'plumbing-general' and is_active;
  update public.service_intake_policies set quote_mode = 'rfq'
    where service_problem_id = v_problem_id and status = 'active';
  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope,
    scheduled_at, safe_metadata, synthetic_cohort_id
  ) values (
    'd4800000-0000-4000-8000-000000000010',
    'd4800000-0000-4000-8000-000000000001', 'plumbing', 'active', 'offer_review',
    jsonb_build_object(
      'version', 1, 'service_type', 'plumbing', 'profile_id', 'plumbing-diagnose',
      'case_phase', 'offer_review', 'facts', '{}'::jsonb, 'missing_facts', '[]'::jsonb,
      'evidence', '[]'::jsonb, 'scope_summary', 'Kiểm tra và báo giá sửa đường ống đang rò nước.',
      'quote_ready', false, 'quote_blockers', '["worker_quote_required"]'::jsonb,
      'worker_requirements',
        '["leak_and_flow_diagnosis","pipe_and_fixture_repair"]'::jsonb,
      'next_action', '{"kind":"request_worker_quote"}'::jsonb
    ),
    now() + interval '1 day',
    jsonb_build_object('address_district', 'q7', 'address_label', 'Durable Building D48',
      'problem_chips', jsonb_build_array('pipe_leak')),
    null
  );
  insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
  values ('d4800000-0000-4000-8000-000000000010', 1, 'kael', 'analysis',
    jsonb_build_object('service_problem_id', v_problem_id));
  insert into public.kael_chat_sessions(
    id, customer_id, service_type, status, case_phase, diagnosis_scope,
    scheduled_at, safe_metadata, synthetic_cohort_id
  ) select
    'd4800000-0000-4000-8000-000000000011', customer_id, service_type,
    status, case_phase, diagnosis_scope, now() - interval '1 minute', safe_metadata,
    synthetic_cohort_id
  from public.kael_chat_sessions
  where id = 'd4800000-0000-4000-8000-000000000010';
  insert into public.kael_chat_turns(session_id, turn_index, role, content_type, safe_metadata)
  values ('d4800000-0000-4000-8000-000000000011', 1, 'kael', 'analysis',
    jsonb_build_object('service_problem_id', v_problem_id));
end;
$$;

do $$
begin
  begin
    perform public.confirm_kael_chat_durable_atomic_v2(
      'd4800000-0000-4000-8000-000000000011',
      'd4800000-0000-4000-8000-000000000001',
      'kael-confirm:d4800000-0000-4000-8000-000000000011:d4800000-0000-4000-8000-000000000001',
      'rfq_request', null
    );
    raise exception 'elapsed appointment accepted for first confirmation';
  exception when sqlstate '22023' then
    if sqlerrm not like '%KAEL_SCHEDULE_INVALID%' then raise; end if;
  end;
  if exists (
    select 1 from public.confirmation_operations
    where session_id = 'd4800000-0000-4000-8000-000000000011'
  ) then raise exception 'elapsed appointment left a partial confirmation operation'; end if;
end;
$$;

do $$
declare v_result record; v_claim record; v_index integer; v_job_id uuid;
  v_second_claim_count integer;
begin
  for v_index in 1..100 loop
    select * into v_result from public.confirm_kael_chat_durable_atomic(
      'd4800000-0000-4000-8000-000000000010',
      'd4800000-0000-4000-8000-000000000001',
      'kael-confirm:d4800000-0000-4000-8000-000000000010:d4800000-0000-4000-8000-000000000001',
      'rfq_request', null
    );
    if not v_result.ok then raise exception 'duplicate confirmation refused: %', v_result.error_code; end if;
    if v_index = 1 then v_job_id := v_result.job_id;
    elsif v_result.job_id is distinct from v_job_id or not v_result.already_applied then
      raise exception 'duplicate confirmation did not recover the same job';
    end if;
  end loop;
  if (select count(*) from public.confirmation_operations
      where session_id = 'd4800000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.confirmation_operation_receipts receipt
      join public.confirmation_operations operation on operation.id = receipt.operation_id
      where operation.session_id = 'd4800000-0000-4000-8000-000000000010') <> 1
    or (select count(*) from public.jobs where id = v_job_id) <> 1
    or (select count(*) from public.matching_operations where job_id = v_job_id
      and state in ('queued','broadcasting','candidate_ready','recovery_required')) <> 1
  then raise exception 'confirmation durability cardinality violated'; end if;
  if (select count(*) from public.workflow_outbox outbox
      join public.confirmation_operations operation on operation.id = outbox.operation_id
      where operation.session_id = 'd4800000-0000-4000-8000-000000000010') <> 2
  then raise exception 'confirmation outbox cardinality violated'; end if;
  select * into v_claim from public.claim_confirmation_matching_outbox_batch(
    'sql-dispatcher:p48', 1, 30
  );
  if v_claim.outbox_id is null or v_claim.lease_token is null
  then raise exception 'queued outbox was not leased'; end if;
  select count(*) into v_second_claim_count from public.claim_confirmation_matching_outbox_batch(
    'sql-dispatcher:p48-second', 1, 30
  );
  if v_second_claim_count <> 0 then raise exception 'active outbox lease was claimed twice'; end if;
  update public.workflow_outbox set lease_expires_at = now() - interval '1 second'
    where operation_id = v_result.operation_id and event_type = 'matching_requested';
  select * into v_claim from public.claim_confirmation_matching_outbox_batch(
    'sql-dispatcher:p48-recovery', 1, 30
  );
  if v_claim.outbox_id is null or v_claim.lease_token is null then
    raise exception 'expired restart lease did not resume queued matching';
  end if;
  update public.jobs set status = 'broadcasting' where id = v_job_id;
end;
$$;

savepoint before_worker_decision;

do $$
declare v_job_id uuid; v_delivery record; v_candidate record; v_confirm record;
  v_recovery record; v_recipient_count integer; v_sent_at timestamptz;
  v_settlement text;
begin
  select job_id into strict v_job_id from public.kael_chat_sessions
    where id = 'd4800000-0000-4000-8000-000000000010';
  -- This suite invokes the legacy confirmation RPC; the capacity-aware RPC owns this lease in current traffic.
  insert into public.matching_capacity_reservations(operation_id, job_id, worker_id, service_type,
    district_code, held_at, expires_at, synthetic_cohort_id)
  select id, v_job_id, 'd4800000-0000-4000-8000-000000000002', 'plumbing', 'q7',
    now(), now() + interval '5 minutes', synthetic_cohort_id
  from public.confirmation_operations where job_id = v_job_id;
  v_sent_at := date_trunc('milliseconds', now());
  update public.worker_profiles set problem_specializations = array[]::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select count(*) into v_recipient_count
    from public.activate_job_broadcast_batch_durable_atomic(
      v_job_id, array['d4800000-0000-4000-8000-000000000002']::uuid[], gen_random_uuid(),
      v_sent_at, v_sent_at + interval '5 minutes'
    );
  if v_recipient_count <> 0
  then raise exception 'zero-capability worker passed durable fan-out'; end if;
  update public.worker_profiles
    set problem_specializations = array['leak_and_flow_diagnosis']::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select count(*) into v_recipient_count
    from public.activate_job_broadcast_batch_durable_atomic(
      v_job_id, array['d4800000-0000-4000-8000-000000000002']::uuid[], gen_random_uuid(),
      v_sent_at, v_sent_at + interval '5 minutes'
    );
  if v_recipient_count <> 0
  then raise exception 'partial-capability worker passed durable fan-out'; end if;
  update public.worker_profiles set problem_specializations =
      array['leak_and_flow_diagnosis','pipe_and_fixture_repair']::text[],
    matching_foreground_active_until = null,
    matching_push_proven_at = now() - interval '2 days'
    where id = 'd4800000-0000-4000-8000-000000000002';
  select count(*) into v_recipient_count
    from public.activate_job_broadcast_batch_durable_atomic(
      v_job_id, array['d4800000-0000-4000-8000-000000000002']::uuid[], gen_random_uuid(),
      v_sent_at, v_sent_at + interval '5 minutes'
    );
  if v_recipient_count <> 0
  then raise exception 'stale push proof passed durable fan-out'; end if;
  perform public.record_worker_matching_heartbeat(
    'd4800000-0000-4000-8000-000000000002', now()
  );
  v_sent_at := date_trunc('milliseconds', now());
  select * into v_delivery from public.activate_job_broadcast_batch_durable_atomic(
    v_job_id, array['d4800000-0000-4000-8000-000000000002']::uuid[], gen_random_uuid(),
    v_sent_at, v_sent_at + interval '5 minutes'
  );
  if v_delivery.id is null or v_delivery.delivery_id is null
    or v_delivery.confirmed_recipient_count <> 1
  then raise exception 'durable recipient was not confirmed'; end if;
  if (select delivery.expires_at - broadcast.sent_at
      from public.matching_recipient_deliveries delivery
      join public.job_broadcasts broadcast on broadcast.id = delivery.broadcast_id
      where delivery.id = v_delivery.delivery_id) <> interval '5 minutes'
  then raise exception 'delivery TTL is not server-owned five minutes'; end if;
  update public.confirmation_operations set state = 'recovery_required',
    last_error_code = 'SIMULATED_RESTART', retry_after_ms = 1000
    where job_id = v_job_id;
  update public.matching_operations set state = 'recovery_required'
    where job_id = v_job_id;
  update public.workflow_outbox set status = 'failed', next_attempt_at = now(),
    lease_expires_at = null, lease_token = null, leased_by = null,
    last_error_code = 'SIMULATED_RESTART'
    where operation_id = (select id from public.confirmation_operations where job_id = v_job_id)
      and event_type = 'matching_requested';
  select * into v_recovery from public.claim_confirmation_matching_outbox_batch(
    'sql-dispatcher:p48-broadcast-recovery', 1, 30
  );
  v_settlement := public.settle_confirmation_matching_outbox_claim(
    v_recovery.outbox_id, v_recovery.lease_token, v_recovery.operation_id,
    'broadcasting', null
  );
  if v_settlement <> 'completed'
    or (select status from public.workflow_outbox where id = v_recovery.outbox_id) <> 'completed'
    or (select state from public.confirmation_operations where id = v_recovery.operation_id) <> 'broadcasting'
  then raise exception 'restart after durable fan-out did not reconcile as broadcasting'; end if;
  perform public.mark_matching_delivery_seen(v_delivery.id,
    'd4800000-0000-4000-8000-000000000002');
  if (select status from public.matching_recipient_deliveries
      where id = v_delivery.delivery_id) <> 'seen'
  then raise exception 'delivery seen transition failed'; end if;
  update public.worker_profiles set problem_specializations = array[]::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job_id, v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Phạm vi không hợp lệ vì thiếu năng lực.', 300000, 500000
  );
  if v_candidate.ok or v_candidate.error_code <> 'WORKER_NOT_ELIGIBLE'
  then raise exception 'zero-capability worker passed proposal transition'; end if;
  update public.worker_profiles
    set problem_specializations = array['leak_and_flow_diagnosis']::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job_id, v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Phạm vi không hợp lệ vì thiếu một năng lực.', 300000, 500000
  );
  if v_candidate.ok or v_candidate.error_code <> 'WORKER_NOT_ELIGIBLE'
  then raise exception 'partial-capability worker passed proposal transition'; end if;
  update public.worker_profiles set problem_specializations =
      array['leak_and_flow_diagnosis','pipe_and_fixture_repair']::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job_id, v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Kiểm tra điểm rò và thay đoạn ống bị hỏng.', null, null
  );
  if v_candidate.ok or v_candidate.error_code <> 'PRICE_REQUIRED'
  then raise exception 'RFQ accepted a proposal without a price range'; end if;
  update public.jobs set quote_mode = 'inspection_only' where id = v_job_id;
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job_id, v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Kiểm tra hiện trạng trước khi xác định giá.', 300000, 500000
  );
  if v_candidate.ok or v_candidate.error_code <> 'PRICE_NOT_ALLOWED'
  then raise exception 'inspection-only accepted a priced proposal'; end if;
  update public.jobs set quote_mode = 'rfq' where id = v_job_id;
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_job_id, v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Kiểm tra điểm rò và thay đoạn ống bị hỏng.', 300000, 500000
  );
  if not v_candidate.ok then raise exception 'worker proposal failed: %', v_candidate.error_code; end if;
  select * into v_candidate from public.submit_worker_matching_proposal_atomic(
    v_delivery.id, 'd4800000-0000-4000-8000-000000000002',
    'Kiểm tra điểm rò và thay đoạn ống bị hỏng.', 300000, 500000
  );
  if not v_candidate.ok or not v_candidate.already_applied
  then raise exception 'worker proposal retry was not idempotent'; end if;
  -- Each refusal retires its candidate; a subtransaction restores the independent fixture.
  begin
  update public.worker_profiles set problem_specializations = array[]::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_confirm from public.confirm_worker_matching_proposal_atomic(
    v_job_id, v_candidate.candidate_id, 'd4800000-0000-4000-8000-000000000001'
  );
  if v_confirm.ok or v_confirm.error_code <> 'WORKER_NOT_ELIGIBLE'
  then raise exception 'zero-capability worker passed customer confirmation transition'; end if;
  raise sqlstate 'ZX001' using message = 'rollback verified zero-capability refusal';
  exception when sqlstate 'ZX001' then null;
  end;
  begin
  update public.worker_profiles
    set problem_specializations = array['leak_and_flow_diagnosis']::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_confirm from public.confirm_worker_matching_proposal_atomic(
    v_job_id, v_candidate.candidate_id, 'd4800000-0000-4000-8000-000000000001'
  );
  if v_confirm.ok or v_confirm.error_code <> 'WORKER_NOT_ELIGIBLE'
  then raise exception 'partial-capability worker passed customer confirmation transition'; end if;
  raise sqlstate 'ZX002' using message = 'rollback verified partial-capability refusal';
  exception when sqlstate 'ZX002' then null;
  end;
  update public.worker_profiles set problem_specializations =
      array['leak_and_flow_diagnosis','pipe_and_fixture_repair']::text[]
    where id = 'd4800000-0000-4000-8000-000000000002';
  select * into v_confirm from public.confirm_worker_matching_proposal_atomic(
    v_job_id, v_candidate.candidate_id, 'd4800000-0000-4000-8000-000000000001'
  );
  if not v_confirm.ok or v_confirm.job_status <> 'worker_matched'
  then raise exception 'customer proposal confirmation failed'; end if;
  select * into v_confirm from public.confirm_worker_matching_proposal_atomic(
    v_job_id, v_candidate.candidate_id, 'd4800000-0000-4000-8000-000000000001'
  );
  if not v_confirm.ok or not v_confirm.already_applied
  then raise exception 'customer proposal retry was not idempotent'; end if;
end;
$$;

-- Retry failure is a separate unresolved-job scenario, not a reversal of Customer selection.
rollback to before_worker_decision;

do $$
declare
  v_outbox_id uuid;
  v_operation_id uuid;
  v_lease_token uuid;
  v_outcome text;
  v_retry_started_at timestamptz;
  v_retry_at timestamptz;
  v_health record;
begin
  select outbox.id, outbox.operation_id
  into strict v_outbox_id, v_operation_id
  from public.workflow_outbox outbox
  join public.confirmation_operations operation on operation.id = outbox.operation_id
  where operation.session_id = 'd4800000-0000-4000-8000-000000000010'
    and outbox.event_type = 'matching_requested';

  v_lease_token := gen_random_uuid();
  update public.workflow_outbox
  set status = 'processing', attempt_count = 2, lease_token = v_lease_token,
    leased_by = 'sql-dispatcher:p48-retry', lease_expires_at = now() + interval '1 minute',
    dead_lettered_at = null, last_error_code = null
  where id = v_outbox_id;
  v_retry_started_at := clock_timestamp();
  v_outcome := public.settle_confirmation_matching_outbox_claim(
    v_outbox_id, v_lease_token, v_operation_id, 'recovery_required', 'SIMULATED_RETRY'
  );
  select outbox.next_attempt_at
  into strict v_retry_at
  from public.workflow_outbox outbox where outbox.id = v_outbox_id;
  if v_outcome <> 'retry_scheduled' or v_retry_at < v_retry_started_at + interval '4 seconds'
    or v_retry_at > clock_timestamp() + interval '4 seconds'
    or (select last_error_code from public.workflow_outbox where id = v_outbox_id) <> 'SIMULATED_RETRY'
  then raise exception 'outbox exponential retry settlement failed'; end if;

  v_lease_token := gen_random_uuid();
  update public.workflow_outbox
  set status = 'processing', attempt_count = 8, lease_token = v_lease_token,
    leased_by = 'sql-dispatcher:p48-dead-letter', lease_expires_at = now() + interval '1 minute'
  where id = v_outbox_id;
  v_outcome := public.settle_confirmation_matching_outbox_claim(
    v_outbox_id, v_lease_token, v_operation_id, 'recovery_required', 'RETRY_EXHAUSTED'
  );
  if v_outcome <> 'dead_letter'
    or (select dead_lettered_at is null from public.workflow_outbox where id = v_outbox_id)
  then raise exception 'outbox terminal dead-letter settlement failed'; end if;
  if public.settle_confirmation_matching_outbox_claim(
    v_outbox_id, v_lease_token, v_operation_id, 'broadcasting', null
  ) <> 'lease_lost'
  then raise exception 'stale outbox lease was accepted'; end if;

  select * into strict v_health from public.get_confirmation_matching_outbox_health();
  if v_health.dead_letter_count < 1 or not exists (
    select 1 from public.list_confirmation_matching_outbox_incidents(100) incident
    where incident.outbox_id = v_outbox_id
      and incident.last_error_code = 'RETRY_EXHAUSTED'
      and incident.dead_lettered_at is not null
  ) then raise exception 'outbox health or incident evidence is incomplete'; end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.confirmation_operations', 'insert')
    or has_table_privilege('authenticated', 'public.workflow_outbox', 'select')
    or has_table_privilege('anon', 'public.matching_recipient_deliveries', 'select')
    or has_function_privilege('authenticated',
      'public.confirm_kael_chat_durable_atomic(uuid,uuid,text,text,text)', 'execute')
    or has_function_privilege('authenticated',
      'public.begin_harness_authorized_request(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean,text,text,text)', 'execute')
    or has_function_privilege('authenticated',
      'public.finish_harness_authorized_request(uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer)', 'execute')
    or not has_function_privilege('service_role',
      'public.begin_harness_authorized_request(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean,text,text,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.finish_harness_authorized_request(uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer)', 'execute')
    or has_function_privilege('service_role',
      'private.guard_kael_confirmation_schedule()', 'execute')
    or has_function_privilege('authenticated',
      'public.cleanup_synthetic_matching_cohort(text)', 'execute')
    or has_function_privilege('authenticated',
      'public.claim_confirmation_matching_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('authenticated',
      'public.claim_confirmation_matching_outbox_batch(text,integer,integer)', 'execute')
    or not has_function_privilege('service_role',
      'public.claim_confirmation_matching_outbox_batch(text,integer,integer)', 'execute')
    or has_function_privilege('authenticated',
      'public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)', 'execute')
    or has_function_privilege('authenticated',
      'public.get_confirmation_matching_outbox_health()', 'execute')
    or has_function_privilege('authenticated',
      'public.list_confirmation_matching_outbox_incidents(integer)', 'execute')
    or not has_function_privilege('service_role',
      'public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.get_confirmation_matching_outbox_health()', 'execute')
    or not has_function_privilege('service_role',
      'public.list_confirmation_matching_outbox_incidents(integer)', 'execute')
    or has_function_privilege('service_role',
      'public.claim_confirmation_matching_outbox(uuid,uuid,integer)', 'execute')
    or has_function_privilege('authenticated',
      'public.submit_worker_matching_proposal_atomic(uuid,uuid,text,integer,integer)', 'execute')
    or has_function_privilege('authenticated',
      'public.accept_priced_broadcast_durable_atomic(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('authenticated',
      'public.price_evidence_has_quorum(jsonb)', 'execute')
    or has_function_privilege('anon',
      'public.price_evidence_has_quorum(jsonb)', 'execute')
    or not has_function_privilege('service_role',
      'public.price_evidence_has_quorum(jsonb)', 'execute')
    or has_function_privilege('authenticated',
      'public.verify_kael_matching_maintainer_secret(text)', 'execute')
    or has_function_privilege('anon',
      'public.verify_kael_matching_maintainer_secret(text)', 'execute')
    or not has_function_privilege('service_role',
      'public.verify_kael_matching_maintainer_secret(text)', 'execute')
  then raise exception 'durability least-privilege gate failed'; end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger item
    where item.tgname = 'confirmation_operations_schedule_guard'
      and item.tgrelid = 'public.confirmation_operations'::regclass
      and not item.tgisinternal
  ) then raise exception 'first-confirmation schedule guard trigger missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger item
    where item.tgname = 'workflow_outbox_kick_confirmation_dispatcher'
      and item.tgrelid = 'public.workflow_outbox'::regclass
      and not item.tgisinternal
  ) then raise exception 'immediate confirmation outbox wake-up trigger missing'; end if;
  if not exists (
    select 1
    from vault.decrypted_secrets secret
    where secret.name = 'kael_matching_maintainer_secret'
      and public.verify_kael_matching_maintainer_secret(secret.decrypted_secret)
  ) or public.verify_kael_matching_maintainer_secret(
    'invalid-maintainer-credential-00000000000000000000000000000000'
  ) then
    raise exception 'matching maintainer database-owned credential verification failed';
  end if;
end;
$$;

insert into public.jobs(
  id, customer_id, service_type, description, status, synthetic_cohort_id
) values (
  'd4800000-0000-4000-8000-000000000099',
  'd4800000-0000-4000-8000-000000000003', 'plumbing',
  'Other synthetic cohort must survive cleanup', 'draft', null
);

select * from public.cleanup_synthetic_matching_cohort('synthetic-p48-alpha');

do $$
begin
  if not exists (select 1 from public.jobs
    where id = 'd4800000-0000-4000-8000-000000000099' and synthetic_cohort_id = 'synthetic-p48-beta')
  then raise exception 'cohort cleanup crossed its exact boundary'; end if;
  begin
    perform public.cleanup_synthetic_matching_cohort('');
    raise exception 'unscoped cleanup was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

rollback;
