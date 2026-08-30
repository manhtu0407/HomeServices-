begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'ba100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'opportunity-worker-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'ba100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'opportunity-worker-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'ba100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'opportunity-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'ba100000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'opportunity-admin@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id in (
  'ba100000-0000-4000-8000-000000000001',
  'ba100000-0000-4000-8000-000000000002'
);

update public.profiles
set role = 'admin'
where id = 'ba100000-0000-4000-8000-000000000004';

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district,
  status, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max
) values (
  'ba150000-0000-4000-8000-000000000001',
  'ba100000-0000-4000-8000-000000000003',
  'ba100000-0000-4000-8000-000000000001',
  'cleaning',
  'Verify existing job-scoped intake remains unchanged',
  'q7',
  'repairing',
  'home-cleaning-general',
  'medium',
  300000,
  450000
);

insert into public.kael_worker_chat_sessions (
  id, worker_id, job_id, chat_mode, status, client_request_id,
  total_turns, total_cost_usd, safe_metadata
) values
  (
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    null,
    'intake',
    'active',
    'ba300000-0000-4000-8000-000000000001',
    0,
    0,
    '{"source":"opportunity-intake-verification"}'::jsonb
  ),
  (
    'ba200000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000001',
    null,
    'normal',
    'active',
    'ba300000-0000-4000-8000-000000000002',
    0,
    0,
    '{"source":"normal-regression-verification"}'::jsonb
  ),
  (
    'ba200000-0000-4000-8000-000000000003',
    'ba100000-0000-4000-8000-000000000001',
    'ba150000-0000-4000-8000-000000000001',
    'intake',
    'active',
    'ba300000-0000-4000-8000-000000000003',
    0,
    0,
    '{"source":"job-intake-regression-verification"}'::jsonb
  );

do $$
declare
  v_constraint text;
begin
  begin
    insert into public.kael_worker_chat_sessions (
      worker_id, job_id, chat_mode, status, client_request_id
    ) values (
      'ba100000-0000-4000-8000-000000000001',
      null,
      'normal',
      'active',
      'ba300000-0000-4000-8000-000000000002'
    );
    raise exception 'normal chat idempotency index admitted a duplicate request';
  exception when unique_violation then null;
  end;

  begin
    insert into public.kael_worker_chat_sessions (
      worker_id, job_id, chat_mode, status, client_request_id
    ) values (
      'ba100000-0000-4000-8000-000000000001',
      'ba150000-0000-4000-8000-000000000001',
      'normal',
      'active',
      'ba300000-0000-4000-8000-000000000099'
    );
    raise exception 'normal chat admitted a job id';
  exception when check_violation then null;
  end;

  begin
    insert into public.kael_worker_chat_sessions (
      worker_id, job_id, chat_mode, status, client_request_id
    ) values (
      'ba100000-0000-4000-8000-000000000001',
      null,
      'intake',
      'active',
      'ba300000-0000-4000-8000-000000000001'
    );
    raise exception 'opportunity intake idempotency index admitted a duplicate request';
  exception when unique_violation then null;
  end;

  begin
    insert into public.kael_worker_chat_sessions (
      worker_id, job_id, chat_mode, status, client_request_id
    ) values (
      'ba100000-0000-4000-8000-000000000001',
      'ba150000-0000-4000-8000-000000000001',
      'intake',
      'active',
      'ba300000-0000-4000-8000-000000000003'
    );
    raise exception 'job intake idempotency index admitted a duplicate request';
  exception when unique_violation then null;
  end;

  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
    into v_constraint
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.kael_worker_chat_sessions'::regclass
      and constraint_row.conname = 'kael_worker_chat_sessions_chat_mode_check';
  if v_constraint is null
    or v_constraint !~* 'chat_mode.*normal.*job_id IS NULL.*chat_mode.*intake'
  then
    raise exception 'chat-mode constraint does not preserve normal-without-job and intake-with-optional-job';
  end if;
end;
$$;

do $$
declare
  v_media record;
  v_claim record;
  v_retry record;
  v_conflict record;
  v_completed record;
  v_completed_retry record;
  v_normal_media record;
  v_normal_claim record;
  v_normal_release record;
  v_job_claim record;
  v_job_release record;
begin
  select * into v_media
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000099',
    'ba500000-0000-4000-8000-000000000099',
    'photo_attached',
    'Private media must remain unavailable without a job.',
    array['supabase://job-media/ba600000-0000-4000-8000-000000000099/kael_reference/ref.jpg']
  );
  if v_media.ok is not false or v_media.error_code <> 'INVALID_INPUT' then
    raise exception 'jobless opportunity intake accepted media';
  end if;

  select * into v_claim
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    'ba500000-0000-4000-8000-000000000001',
    'text',
    'Show the active cleaning opportunities.',
    '{}'::text[]
  );
  if v_claim.ok is not true or v_claim.claimed is not true
    or v_claim.completed is true or v_claim.worker_turn_index <> 1
  then
    raise exception 'opportunity intake did not claim its first turn atomically';
  end if;

  select * into v_retry
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    'ba500000-0000-4000-8000-000000000002',
    'text',
    'Show the active cleaning opportunities.',
    '{}'::text[]
  );
  if v_retry.ok is not false or v_retry.error_code <> 'REQUEST_IN_PROGRESS' then
    raise exception 'opportunity intake retry acquired a second provider claim';
  end if;

  select * into v_conflict
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    'ba500000-0000-4000-8000-000000000003',
    'text',
    'A different payload reused the same request id.',
    '{}'::text[]
  );
  if v_conflict.ok is not false or v_conflict.error_code <> 'IDEMPOTENCY_CONFLICT' then
    raise exception 'opportunity intake request id did not bind the full payload';
  end if;

  select * into v_completed
  from public.complete_worker_kael_general_turn_atomic(
    v_claim.request_id,
    'ba500000-0000-4000-8000-000000000001',
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    v_claim.worker_turn_id,
    'text',
    'Open each opportunity and decide in the app.',
    '{"schema_version":"worker_assist_answer.v1","redirect_scope_change":false,"fallback_used":false}'::jsonb,
    null,
    null,
    null,
    0,
    '{"latest_redirect_scope_change":false,"latest_fallback_used":false}'::jsonb
  );
  if v_completed.ok is not true or v_completed.applied is not true
    or v_completed.assistant_turn_index <> 2
  then
    raise exception 'opportunity intake completion was not applied atomically';
  end if;
  if (
    select count(*)
    from public.kael_worker_chat_turns
    where session_id = 'ba200000-0000-4000-8000-000000000001'
  ) <> 2 or not exists (
    select 1
    from public.kael_worker_chat_turns
    where id = v_completed.assistant_turn_id
      and source_turn_id = v_claim.worker_turn_id
  ) then
    raise exception 'opportunity intake completion duplicated turns or lost source-turn provenance';
  end if;

  select * into v_completed_retry
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000001',
    'ba500000-0000-4000-8000-000000000004',
    'text',
    'Show the active cleaning opportunities.',
    '{}'::text[]
  );
  if v_completed_retry.ok is not true or v_completed_retry.completed is not true
    or v_completed_retry.claimed is true
    or v_completed_retry.assistant_turn_id <> v_completed.assistant_turn_id
  then
    raise exception 'completed opportunity intake retry did not converge';
  end if;

  select * into v_normal_media
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000098',
    'ba500000-0000-4000-8000-000000000098',
    'photo_attached',
    'Normal jobless chat must also reject media.',
    array['supabase://job-media/ba600000-0000-4000-8000-000000000098/kael_reference/ref.jpg']
  );
  if v_normal_media.ok is not false or v_normal_media.error_code <> 'INVALID_INPUT' then
    raise exception 'normal jobless chat accepted media';
  end if;

  select * into v_normal_claim
  from public.claim_worker_kael_general_turn_atomic(
    'ba200000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000002',
    'ba500000-0000-4000-8000-000000000005',
    'text',
    'Keep normal chat available.',
    '{}'::text[]
  );
  if v_normal_claim.ok is not true or v_normal_claim.claimed is not true then
    raise exception 'normal chat regressed after opportunity intake support';
  end if;

  select * into v_normal_release
  from public.release_worker_kael_chat_turn_claim_atomic(
    v_normal_claim.request_id,
    'ba500000-0000-4000-8000-000000000005',
    'ba200000-0000-4000-8000-000000000002',
    'ba100000-0000-4000-8000-000000000001',
    true
  );
  if v_normal_release.released is not true or v_normal_release.discarded is not true then
    raise exception 'normal chat claim could not be discarded after regression check';
  end if;

  select * into v_job_claim
  from public.claim_worker_kael_chat_turn_atomic(
    'ba200000-0000-4000-8000-000000000003',
    'ba150000-0000-4000-8000-000000000001',
    'ba100000-0000-4000-8000-000000000001',
    'ba400000-0000-4000-8000-000000000003',
    'ba500000-0000-4000-8000-000000000006',
    'text',
    'Keep job-scoped intake unchanged.',
    '{}'::text[]
  );
  if v_job_claim.ok is not true or v_job_claim.claimed is not true then
    raise exception 'job-scoped intake regressed after opportunity intake support';
  end if;

  select * into v_job_release
  from public.release_worker_kael_chat_turn_claim_atomic(
    v_job_claim.request_id,
    'ba500000-0000-4000-8000-000000000006',
    'ba200000-0000-4000-8000-000000000003',
    'ba100000-0000-4000-8000-000000000001',
    true
  );
  if v_job_release.released is not true or v_job_release.discarded is not true then
    raise exception 'job-scoped intake claim could not be discarded after regression check';
  end if;
end;
$$;

do $$
declare
  v_signature text;
  v_signatures text[] := array[
    'public.claim_worker_kael_general_turn_atomic(uuid, uuid, uuid, uuid, text, text, text[], timestamptz)',
    'public.complete_worker_kael_general_turn_atomic(uuid, uuid, uuid, uuid, uuid, text, text, jsonb, public.api_provider, text, int, numeric, jsonb, timestamptz)'
  ];
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
  end loop;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'ba100000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if exists (
    select 1
    from public.kael_worker_chat_sessions
    where worker_id = 'ba100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'worker B read worker A opportunity-intake sessions';
  end if;
  if exists (
    select 1
    from public.kael_worker_chat_turns
    where session_id = 'ba200000-0000-4000-8000-000000000001'
  ) then
    raise exception 'worker B read worker A opportunity-intake turns';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'ba100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if (
    select count(*)
    from public.kael_worker_chat_sessions
    where worker_id = 'ba100000-0000-4000-8000-000000000001'
  ) <> 3 then
    raise exception 'worker A could not read all owned chat scopes';
  end if;
  if (
    select count(*)
    from public.kael_worker_chat_turns
    where session_id = 'ba200000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'worker A could not read owned opportunity-intake turns';
  end if;
end;
$$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = 'ba100000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if exists (
    select 1
    from public.kael_worker_chat_sessions
    where worker_id = 'ba100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'customer read worker opportunity-intake sessions';
  end if;
  if exists (
    select 1
    from public.kael_worker_chat_turns
    where session_id = 'ba200000-0000-4000-8000-000000000001'
  ) then
    raise exception 'customer read worker opportunity-intake turns';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'ba100000-0000-4000-8000-000000000004';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if (
    select count(*)
    from public.kael_worker_chat_sessions
    where worker_id = 'ba100000-0000-4000-8000-000000000001'
  ) <> 3 then
    raise exception 'existing admin read behavior changed';
  end if;
  if (
    select count(*)
    from public.kael_worker_chat_turns
    where session_id = 'ba200000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'existing admin turn-read behavior changed';
  end if;
end;
$$;

reset role;
set local role anon;

do $$
begin
  begin
    perform count(*) from public.kael_worker_chat_sessions;
    raise exception 'anon read worker opportunity-intake sessions';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select pg_catalog.jsonb_build_object(
  'constraint_matrix', true,
  'opportunity_idempotency', true,
  'jobless_media_rejected', true,
  'atomic_claim_complete', true,
  'normal_regression', true,
  'job_intake_regression', true,
  'service_role_only', true,
  'worker_isolation', true,
  'customer_anon_isolation', true,
  'admin_policy_regression', true
) as worker_kael_opportunity_intake_verification;

rollback;
