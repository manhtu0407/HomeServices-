begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'b8100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'worker-kael-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b8100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'worker-kael-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'b8100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  description,
  address_district,
  status,
  kael_problem_identified,
  kael_complexity,
  kael_price_min,
  kael_price_max
) values (
  'b8200000-0000-4000-8000-000000000001',
  'b8100000-0000-4000-8000-000000000001',
  'b8100000-0000-4000-8000-000000000002',
  'electrical',
  'Verify atomic worker Kael turns',
  'q1',
  'repairing',
  'electrical-general',
  'medium',
  200000,
  400000
);

insert into public.kael_worker_chat_sessions (
  id, worker_id, job_id, status, total_turns, total_cost_usd, safe_metadata
) values (
  'b8300000-0000-4000-8000-000000000001',
  'b8100000-0000-4000-8000-000000000002',
  'b8200000-0000-4000-8000-000000000001',
  'active',
  0,
  0,
  '{"source":"verification"}'::jsonb
);

do $$
declare
  v_invalid_media record;
  v_first record;
  v_in_flight record;
  v_conflict record;
  v_released record;
  v_reclaimed record;
  v_invalid_completion record;
  v_completed record;
  v_completed_retry record;
  v_corrupt_completed record;
  v_second record;
  v_other_blocked record;
  v_discarded record;
  v_other_claimed record;
  v_qa record;
  v_turn_count integer;
  v_qa_count integer;
  v_index integer;
begin
  select * into v_invalid_media
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000099',
    'b8500000-0000-4000-8000-000000000099',
    'photo_attached',
    'A public workflow photo must not enter private Kael context.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/before/ref-a.jpg']
  );
  if v_invalid_media.ok is not false or v_invalid_media.error_code <> 'INVALID_INPUT' then
    raise exception 'worker Kael accepted media outside the private kael_reference stage';
  end if;

  select * into v_first
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000001',
    'photo_attached',
    'The breaker terminal is visibly scorched.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/kael_reference/ref-a.jpg']
  );
  if v_first.ok is not true or v_first.claimed is not true
    or v_first.completed is true or v_first.worker_turn_index <> 1
  then
    raise exception 'first worker Kael request was not claimed atomically';
  end if;

  select * into v_in_flight
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000002',
    'photo_attached',
    'The breaker terminal is visibly scorched.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/kael_reference/ref-a.jpg']
  );
  if v_in_flight.ok is not false
    or v_in_flight.error_code <> 'REQUEST_IN_PROGRESS'
    or v_in_flight.claimed is true
  then
    raise exception 'concurrent retry acquired a second provider claim';
  end if;

  select * into v_conflict
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000003',
    'text',
    'A different payload reused the durable request id.',
    '{}'::text[]
  );
  if v_conflict.ok is not false or v_conflict.error_code <> 'IDEMPOTENCY_CONFLICT' then
    raise exception 'worker Kael request id did not bind the full source payload';
  end if;

  select * into v_released
  from public.release_worker_kael_chat_turn_claim_atomic(
    v_first.request_id,
    'b8500000-0000-4000-8000-000000000001',
    'b8300000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    false
  );
  if v_released.released is not true or v_released.discarded is true then
    raise exception 'failed provider claim was not released for retry';
  end if;

  select * into v_reclaimed
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000004',
    'photo_attached',
    'The breaker terminal is visibly scorched.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/kael_reference/ref-a.jpg']
  );
  if v_reclaimed.claimed is not true
    or v_reclaimed.worker_turn_id <> v_first.worker_turn_id
  then
    raise exception 'retry did not reuse the durable worker source turn';
  end if;

  select * into v_invalid_completion
  from public.complete_worker_kael_chat_turn_atomic(
    v_reclaimed.request_id,
    'b8500000-0000-4000-8000-000000000004',
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    v_reclaimed.worker_turn_id,
    'guidance',
    'This completion carries inconsistent response metadata.',
    '{"schema_version":"worker_assist.v1","redirect_scope_change":false,"fallback_used":false}'::jsonb,
    'deepseek'::public.api_provider,
    'verification-model',
    120,
    0.001,
    '{"latest_redirect_scope_change":true,"latest_fallback_used":false}'::jsonb
  );
  if v_invalid_completion.ok is not false
    or v_invalid_completion.error_code <> 'INVALID_INPUT'
  then
    raise exception 'worker Kael completion accepted inconsistent session metadata';
  end if;

  select * into v_completed
  from public.complete_worker_kael_chat_turn_atomic(
    v_reclaimed.request_id,
    'b8500000-0000-4000-8000-000000000004',
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    v_reclaimed.worker_turn_id,
    'guidance',
    'Isolate power and submit a scope change before replacing extra wiring.',
    '{"schema_version":"worker_assist.v1","redirect_scope_change":true,"fallback_used":false}'::jsonb,
    'deepseek'::public.api_provider,
    'verification-model',
    120,
    0.001,
    '{"latest_redirect_scope_change":true,"latest_fallback_used":false}'::jsonb
  );
  if v_completed.ok is not true or v_completed.applied is not true
    or v_completed.assistant_turn_index <> 2
  then
    raise exception 'assistant answer was not applied atomically';
  end if;

  select * into v_completed_retry
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000005',
    'photo_attached',
    'The breaker terminal is visibly scorched.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/kael_reference/ref-a.jpg']
  );
  if v_completed_retry.ok is not true
    or v_completed_retry.completed is not true
    or v_completed_retry.claimed is true
    or v_completed_retry.assistant_turn_id <> v_completed.assistant_turn_id
  then
    raise exception 'completed request retry did not converge without another provider claim';
  end if;

  update public.kael_worker_chat_turns
    set source_turn_id = null
    where id = v_completed.assistant_turn_id;
  select * into v_corrupt_completed
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000001',
    'b8500000-0000-4000-8000-000000000009',
    'photo_attached',
    'The breaker terminal is visibly scorched.',
    array['supabase://job-media/b8200000-0000-4000-8000-000000000001/kael_reference/ref-a.jpg']
  );
  if v_corrupt_completed.ok is not false
    or v_corrupt_completed.error_code <> 'SOURCE_TURN_INVALID'
  then
    raise exception 'completed retry ignored a broken assistant source binding';
  end if;
  update public.kael_worker_chat_turns
    set source_turn_id = v_reclaimed.worker_turn_id
    where id = v_completed.assistant_turn_id;

  select * into v_second
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000002',
    'b8500000-0000-4000-8000-000000000006',
    'text',
    'Can I continue with the original scope?',
    '{}'::text[]
  );
  select * into v_other_blocked
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000003',
    'b8500000-0000-4000-8000-000000000007',
    'text',
    'This must wait for the active turn.',
    '{}'::text[]
  );
  if v_second.claimed is not true
    or v_second.worker_turn_index <> 3
    or v_other_blocked.error_code <> 'SESSION_TURN_IN_PROGRESS'
  then
    raise exception 'session admitted overlapping worker-assist turns';
  end if;

  select * into v_discarded
  from public.release_worker_kael_chat_turn_claim_atomic(
    v_second.request_id,
    'b8500000-0000-4000-8000-000000000006',
    'b8300000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    true
  );
  if v_discarded.discarded is not true then
    raise exception 'unspent rate-limited turn was not discarded safely';
  end if;

  select * into v_other_claimed
  from public.claim_worker_kael_chat_turn_atomic(
    'b8300000-0000-4000-8000-000000000001',
    'b8200000-0000-4000-8000-000000000001',
    'b8100000-0000-4000-8000-000000000002',
    'b8400000-0000-4000-8000-000000000003',
    'b8500000-0000-4000-8000-000000000008',
    'text',
    'This must wait for the active turn.',
    '{}'::text[]
  );
  if v_other_claimed.claimed is not true or v_other_claimed.worker_turn_index <> 3 then
    raise exception 'discard did not restore the serialized session turn index';
  end if;

  select count(*) into v_turn_count
  from public.kael_worker_chat_turns
  where session_id = 'b8300000-0000-4000-8000-000000000001';
  if v_turn_count <> 3 then
    raise exception 'atomic worker turn lifecycle left duplicate or orphan turns';
  end if;

  for v_index in 1..4 loop
    select * into v_qa
    from public.record_worker_kael_qa_atomic(
      'b8200000-0000-4000-8000-000000000001',
      'b8100000-0000-4000-8000-000000000002',
      'Question ' || v_index || ' for the atomic cap?',
      pg_catalog.jsonb_build_object(
        'schema_version', 'worker_qa_answer.v1',
        'text', 'Verified answer ' || v_index,
        'safety_notes', pg_catalog.jsonb_build_array('Stay within scope.')
      )
    );
    if v_index <= 3 and v_qa.ok is not true then
      raise exception 'atomic worker Q&A rejected allowed question %', v_index;
    end if;
    if v_index = 4 and (
      v_qa.ok is not false
      or v_qa.error_code <> 'KAEL_QA_LIMIT_REACHED'
      or v_qa.remaining_questions <> 0
    ) then
      raise exception 'atomic worker Q&A cap admitted a fourth question';
    end if;
  end loop;

  select count(*) into v_qa_count
  from public.kael_worker_qa_log
  where job_id = 'b8200000-0000-4000-8000-000000000001'
    and worker_id = 'b8100000-0000-4000-8000-000000000002';
  if v_qa_count <> 3 then
    raise exception 'atomic worker Q&A cap persisted % rows instead of 3', v_qa_count;
  end if;
end;
$$;

do $$
declare
  v_signature text;
  v_signatures text[] := array[
    'public.claim_worker_kael_chat_turn_atomic(uuid, uuid, uuid, uuid, uuid, text, text, text[], timestamptz)',
    'public.complete_worker_kael_chat_turn_atomic(uuid, uuid, uuid, uuid, uuid, uuid, text, text, jsonb, public.api_provider, text, int, numeric, jsonb, timestamptz)',
    'public.release_worker_kael_chat_turn_claim_atomic(uuid, uuid, uuid, uuid, boolean, timestamptz)',
    'public.record_worker_kael_qa_atomic(uuid, uuid, text, jsonb, timestamptz)'
  ];
  v_security_definer boolean;
  v_config text[];
begin
  foreach v_signature in array v_signatures loop
    if not pg_catalog.has_function_privilege('service_role', v_signature, 'execute') then
      raise exception 'service_role must execute %', v_signature;
    end if;
    if pg_catalog.has_function_privilege('authenticated', v_signature, 'execute')
      or pg_catalog.has_function_privilege('anon', v_signature, 'execute')
    then
      raise exception 'client roles must not execute %', v_signature;
    end if;
    select function_row.prosecdef, function_row.proconfig
      into v_security_definer, v_config
      from pg_catalog.pg_proc as function_row
      where function_row.oid = pg_catalog.to_regprocedure(v_signature);
    if v_security_definer is distinct from true
      or v_config is distinct from array['search_path=""']::text[]
    then
      raise exception 'unsafe worker Kael RPC configuration on %', v_signature;
    end if;
  end loop;
end;
$$;

select pg_catalog.jsonb_build_object(
  'source_payload_bound', true,
  'single_provider_claim', true,
  'lease_retryable', true,
  'assistant_source_bound', true,
  'completed_source_revalidated', true,
  'completion_metadata_consistent', true,
  'completed_retry_idempotent', true,
  'session_turn_serialized', true,
  'qa_hard_cap_atomic', true,
  'private_media_stage_only', true,
  'service_role_only', true
) as worker_kael_atomic_turns_verification;

rollback;
