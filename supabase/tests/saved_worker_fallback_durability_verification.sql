-- @pillar id: P112-saved-worker-fallback-sql
-- @pillar invariant: Saved-worker fallback atomically queues one consent-bound durable continuation, never widening saved-only consent or claiming delivery before activation.
-- @pillar authority: governance/RULES.md #7 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260905170000_durable_saved_worker_fallback.sql
-- @pillar layer: sql
-- @pillar siblings: P110-matching-selection-sql, P103-customer-matching-retry-sql
-- @pillar mutation: Omit the atomic fallback command; the fallback call fails instead of returning a recoverable outbox receipt.

begin;
set local statement_timeout = '20s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-candidate-p112');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('d1120000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_actor, 'authenticated', 'authenticated', 'candidate-p112-' || i || '@example.test',
      '{"provider":"email","providers":["email"]}', '{}', now(), now());
    if i > 1 then update public.profiles set role = 'worker' where id = v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    values ('synthetic-candidate-p112', v_actor,
      case when i = 1 then 'customer'::public.user_role else 'worker'::public.user_role end);
    if i > 1 then
      insert into public.worker_profiles(id, service_types, selected_service_types, years_experience,
        districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth,
        verification_status, synthetic_cohort_id)
      values (v_actor, array['plumbing']::public.service_type[], array['plumbing']::public.service_type[],
        5, array['q7'], array[]::text[], true, true, 'Candidate fixture', '1990-01-01',
        'approved', 'synthetic-candidate-p112');
      perform public.record_worker_matching_heartbeat(v_actor, now());
    end if;
  end loop;
end;
$fixtures$;


insert into public.customer_favorite_workers(customer_id,worker_id)
values('d1120000-0000-4000-8000-000000000001','d1120000-0000-4000-8000-000000000002');

do $sessions$
declare v_problem uuid;
begin
  select id into strict v_problem from public.service_problems
    where service_type='plumbing' and is_active order by slug limit 1;
  update public.service_intake_policies set quote_mode='rfq'
    where service_problem_id=v_problem and status='active';
  for i in 1..4 loop
    insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase,
      diagnosis_scope,scheduled_at,safe_metadata)
    values(('d1120000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      'd1120000-0000-4000-8000-000000000001','plumbing','active','offer_review',
      jsonb_build_object('version',1,'service_type','plumbing','profile_id','plumbing-diagnose',
        'case_phase','offer_review','facts','{}'::jsonb,'missing_facts','[]'::jsonb,
        'evidence','[]'::jsonb,'scope_summary','Khảo sát và báo giá xử lý đường ống bị rò nước trong căn hộ.',
        'quote_ready',false,'quote_blockers','["worker_quote_required"]'::jsonb,
        'worker_requirements','[]'::jsonb,'next_action','{"kind":"request_worker_quote"}'::jsonb),
      now()+interval '1 day',
      jsonb_build_object('address_district','q7','address_label','Synthetic fixture q7',
        'problem_chips',jsonb_build_array('pipe_leak')));
    insert into public.kael_chat_turns(session_id,turn_index,role,content_type,safe_metadata)
    values(('d1120000-0000-4000-8000-'||lpad((200+i)::text,12,'0'))::uuid,
      1,'kael','analysis',jsonb_build_object('service_problem_id',v_problem));
  end loop;
end;
$sessions$;



savepoint fallback_base;
set local role service_role;
do $fallback$
declare
  v_customer constant uuid := 'd1120000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'd1120000-0000-4000-8000-000000000002';
  v_session constant uuid := 'd1120000-0000-4000-8000-000000000201';
  v_confirm record; v_claim record; v_selection jsonb; v_result jsonb; v_replay jsonb; v_activation jsonb;
  v_crashed_lease uuid;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    v_session,v_customer,'kael-confirm:'||v_session||':'||v_customer,'rfq_request',null,'prompt_if_saved');
  v_selection := public.request_job_matching_preference_atomic(v_confirm.job_id,v_customer,
    'saved_worker_first',v_worker,true,gen_random_uuid());
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('fallback-p112',50,45)
    where operation_id=v_confirm.operation_id;
  v_activation := public.activate_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id);
  perform public.settle_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,
    v_confirm.operation_id,'broadcasting',null);
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,v_worker);
  if (v_result->>'claimed')::boolean then raise exception 'P112_LIVE_SAVED_OFFER_WIDENED'; end if;
  update public.job_broadcasts set status='declined',responded_at=clock_timestamp()
    where job_id=v_confirm.job_id and worker_id=v_worker;
  if exists(select 1 from public.claim_saved_worker_fallback_atomic(v_confirm.job_id,'saved_worker_declined',v_worker)
    where claimed) then raise exception 'P112_LEGACY_CLAIM_CONSUMED_DURABLE_CONSENT'; end if;
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,
    'd1120000-0000-4000-8000-000000000003');
  if (v_result->>'claimed')::boolean then raise exception 'P112_FALLBACK_CHANGED_SAVED_TARGET'; end if;
  update public.worker_profiles set is_available=false where id='d1120000-0000-4000-8000-000000000003';
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,v_worker);
  if (v_result->>'claimed')::boolean or v_result->>'error_code'<>'COVERAGE_UNAVAILABLE'
    or exists(select 1 from public.job_matching_preferences where job_id=v_confirm.job_id and fallback_at is not null)
    or (select count(*) from public.matching_operations where job_id=v_confirm.job_id)<>1
  then raise exception 'P112_CAPACITY_FAILURE_CONSUMED_CONSENT: %',v_result; end if;
  update public.worker_profiles set is_available=true where id='d1120000-0000-4000-8000-000000000003';
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,v_worker);
  if not coalesce((v_result->>'claimed')::boolean,false) or v_result->>'state'<>'queued'
    or coalesce((v_result->>'broadcast_sent')::boolean,true)
    or (select count(*) from public.job_broadcasts where job_id=v_confirm.job_id)<>1
    or not exists(select 1 from public.matching_operations where id=(v_result->>'operation_id')::uuid
      and retry_source='saved_worker_fallback' and retry_parent_operation_id=(v_selection->>'operation_id')::uuid)
    or not exists(select 1 from public.workflow_outbox where retry_matching_operation_id=(v_result->>'operation_id')::uuid
      and status='queued' and attempt_count=0)
  then raise exception 'P112_FALLBACK_NOT_ATOMIC_OR_INVENTED_DELIVERY: %',v_result; end if;
  begin
    update public.matching_operations set retry_source='customer_explicit' where id=(v_result->>'operation_id')::uuid;
    raise exception 'P112_SYSTEM_FALLBACK_RELABELED_AS_CUSTOMER_ACTION';
  exception when check_violation then null; end;
  begin
    update public.job_matching_preferences set fallback_reason='saved_worker_expired' where job_id=v_confirm.job_id;
    raise exception 'P112_FALLBACK_REASON_REWRITTEN';
  exception when check_violation then null; end;
  for i in 1..100 loop
    v_replay := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,v_worker);
    if v_replay is distinct from v_result then raise exception 'P112_RESTART_LOST_OR_DUPLICATED_FALLBACK'; end if;
  end loop;
  v_replay := public.get_job_matching_preference_receipt(v_confirm.job_id,v_customer,(v_selection->>'request_id')::uuid);
  if v_replay->>'operation_id'<>v_selection->>'operation_id' or v_replay->>'state'<>'queued'
    or (v_replay->>'broadcast_sent')::boolean then
    raise exception 'P112_SELECTION_RECOVERY_REPORTS_STALE_PARENT: %',v_replay;
  end if;
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('fallback-p112',50,45)
    where outbox_id=(select id from public.workflow_outbox where retry_matching_operation_id=(v_result->>'operation_id')::uuid);
  v_activation := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_activation->>'state'<>'broadcasting' or v_activation->>'matching_reason'<>'saved_worker_fallback'
    or jsonb_array_length(v_activation->'targets')<>1
    or v_activation#>>'{targets,0,worker_id}'<>'d1120000-0000-4000-8000-000000000003'
  then raise exception 'P112_FALLBACK_WRONG_RECIPIENT_OR_ORIGIN: %',v_activation; end if;
  v_replay := public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_replay->'targets' is distinct from v_activation->'targets'
    or (select count(*) from public.job_broadcasts where job_id=v_confirm.job_id)<>2
  then raise exception 'P112_RESTART_DUPLICATED_BROADCAST'; end if;
  v_crashed_lease:=v_claim.lease_token;
  update public.workflow_outbox set lease_expires_at=clock_timestamp()-interval '1 microsecond'
    where id=v_claim.outbox_id;
  select * into strict v_claim from public.claim_worker_replacement_outbox_batch('fallback-p112-restarted',50,45)
    where outbox_id=(select id from public.workflow_outbox where retry_matching_operation_id=(v_result->>'operation_id')::uuid);
  v_replay:=public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_crashed_lease);
  if v_replay->>'state'<>'lease_lost' then raise exception 'P112_CRASHED_DISPATCHER_RETAINED_AUTHORITY'; end if;
  v_replay:=public.activate_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token);
  if v_replay->'targets' is distinct from v_activation->'targets'
    or (select count(*) from public.job_broadcasts where job_id=v_confirm.job_id)<>2
  then raise exception 'P112_LEASE_RECLAIM_DUPLICATED_OR_LOST_DELIVERY'; end if;
  perform public.settle_worker_replacement_outbox_claim(v_claim.outbox_id,v_claim.lease_token,'broadcasting',null);
end;
$fallback$;
rollback to fallback_base;

set local role service_role;
do $saved_only$
declare v_confirm record; v_claim record; v_result jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    'd1120000-0000-4000-8000-000000000201','d1120000-0000-4000-8000-000000000001',
    'kael-confirm:d1120000-0000-4000-8000-000000000201:d1120000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  perform public.request_job_matching_preference_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000001',
    'saved_worker_first','d1120000-0000-4000-8000-000000000002',false,gen_random_uuid());
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('fallback-p112',50,45)
    where operation_id=v_confirm.operation_id;
  perform public.activate_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id);
  perform public.settle_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id,'broadcasting',null);
  update public.job_broadcasts set status='declined',responded_at=clock_timestamp() where job_id=v_confirm.job_id;
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000002');
  if (v_result->>'claimed')::boolean
    or exists(select 1 from public.job_matching_preferences where job_id=v_confirm.job_id and fallback_at is not null)
    or (select count(*) from public.matching_operations where job_id=v_confirm.job_id)<>1
  then raise exception 'P112_SAVED_ONLY_CONSENT_WIDENED: %',v_result; end if;
  if has_function_privilege('anon','public.request_job_saved_worker_fallback_atomic(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.request_job_saved_worker_fallback_atomic(uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.request_job_saved_worker_fallback_atomic(uuid,uuid)','execute')
  then raise exception 'P112_FALLBACK_EXECUTE_AUTHORITY_INVALID'; end if;
end;
$saved_only$;

rollback to fallback_base;
set local role service_role;
do $expiry$
declare v_confirm record; v_claim record; v_result jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    'd1120000-0000-4000-8000-000000000201','d1120000-0000-4000-8000-000000000001',
    'kael-confirm:d1120000-0000-4000-8000-000000000201:d1120000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  perform public.request_job_matching_preference_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000001',
    'saved_worker_first','d1120000-0000-4000-8000-000000000002',true,gen_random_uuid());
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('fallback-p112',50,45)
    where operation_id=v_confirm.operation_id;
  perform public.activate_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id);
  perform public.settle_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id,'broadcasting',null);
  update public.job_broadcasts set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_confirm.job_id;
  update public.matching_recipient_deliveries set expires_at=clock_timestamp()-interval '1 microsecond' where job_id=v_confirm.job_id;
  v_result := public.request_job_saved_worker_fallback_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000002');
  if not (v_result->>'claimed')::boolean or v_result->>'reason'<>'saved_worker_expired'
    or v_result->>'state'<>'queued'
    or exists(select 1 from public.matching_recipient_deliveries where job_id=v_confirm.job_id and status<>'expired')
  then raise exception 'P112_SERVER_EXPIRY_NOT_DURABLY_CONTINUED: %',v_result; end if;
end;
$expiry$;

rollback to fallback_base;
set local role service_role;
do $unavailable_favorite$
declare v_confirm record; v_claim record; v_selection jsonb; v_result jsonb;
begin
  select * into strict v_confirm from public.confirm_kael_chat_durable_atomic_v4(
    'd1120000-0000-4000-8000-000000000201','d1120000-0000-4000-8000-000000000001',
    'kael-confirm:d1120000-0000-4000-8000-000000000201:d1120000-0000-4000-8000-000000000001',
    'rfq_request',null,'prompt_if_saved');
  update public.worker_profiles set is_available=false where id='d1120000-0000-4000-8000-000000000002';
  begin
    perform public.request_job_matching_preference_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000001',
      'saved_worker_first','d1120000-0000-4000-8000-000000000002',false,gen_random_uuid());
    raise exception 'P112_UNAVAILABLE_SAVED_ONLY_ACCEPTED';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE' then raise; end if;
  end;
  v_selection:=public.request_job_matching_preference_atomic(v_confirm.job_id,'d1120000-0000-4000-8000-000000000001',
    'saved_worker_first','d1120000-0000-4000-8000-000000000002',true,gen_random_uuid());
  select * into strict v_claim from public.claim_confirmation_matching_outbox_batch('fallback-p112',50,45)
    where operation_id=v_confirm.operation_id;
  v_result:=public.activate_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id);
  if v_result->>'state'<>'no_reachable_worker' or exists(select 1 from public.job_broadcasts where job_id=v_confirm.job_id)
  then raise exception 'P112_UNAVAILABLE_FAVORITE_RECEIVED_FAKE_OFFER'; end if;
  perform public.settle_confirmation_matching_outbox_claim(v_claim.outbox_id,v_claim.lease_token,v_confirm.operation_id,
    'no_reachable_worker',null);
  v_result:=public.get_job_matching_preference_receipt(v_confirm.job_id,'d1120000-0000-4000-8000-000000000001',
    (v_selection->>'request_id')::uuid);
  if v_result->>'state'<>'queued' or (v_result->>'broadcast_sent')::boolean
    or not exists(select 1 from public.workflow_outbox outbox join public.matching_operations matching
      on matching.id=outbox.retry_matching_operation_id
      where matching.job_id=v_confirm.job_id and matching.retry_source='saved_worker_fallback' and outbox.status='queued')
  then raise exception 'P112_SETTLEMENT_LOST_UNAVAILABLE_FAVORITE_CONTINUATION: %',v_result; end if;
end;
$unavailable_favorite$;


rollback;
