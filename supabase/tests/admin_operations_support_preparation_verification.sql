begin;

do $structure$
declare
  v_table text;
  v_function regprocedure;
  v_definition text;
begin
  foreach v_table in array array[
    'admin_support_case_preparations',
    'admin_support_case_notes'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class
      where oid = ('public.' || v_table)::regclass and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;

    if pg_catalog.has_table_privilege('anon', ('public.' || v_table)::regclass, 'select')
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'select')
      or pg_catalog.has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'insert')
      or not pg_catalog.has_table_privilege('service_role', ('public.' || v_table)::regclass, 'select') then
      raise exception 'support table access is not service-owned for public.%', v_table;
    end if;
  end loop;

  foreach v_function in array array[
    'public.admin_update_support_case_preparation_atomic(uuid,text,uuid,integer,uuid,text,text,jsonb,text)'::regprocedure,
    'public.admin_set_sub_admin_access_v2_atomic(uuid,uuid,text,text[],text)'::regprocedure
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_proc
      where oid = v_function and prosecdef and proconfig = array['search_path=""']::text[]
    ) then
      raise exception 'support RPC % is not a locked-path definer', v_function;
    end if;

    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
      or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'support RPC % is not service-only', v_function;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.admin_support_case_notes'::regclass
      and tgname = 'admin_support_case_notes_append_only'
      and not tgisinternal
  ) then
    raise exception 'support notes append-only trigger is missing';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(
    'public.admin_update_support_case_preparation_atomic(uuid,text,uuid,integer,uuid,text,text,jsonb,text)'::regprocedure
  );
  if v_definition like '%update public.disputes%'
    or v_definition like '%update public.kael_admin_queue%'
    or v_definition like '%admin_decide_dispute_atomic%'
    or v_definition like '%resolve_kael_admin_queue%'
  then
    raise exception 'preparation RPC may not mutate or resolve a source workflow';
  end if;
end;
$structure$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f6200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'support-owner@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f6200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'support-manager@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f6200000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'support-reader@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f6200000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'support-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'admin'::public.user_role
where id = 'f6200000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin_operator'::public.user_role
where id in (
  'f6200000-0000-4000-8000-000000000002',
  'f6200000-0000-4000-8000-000000000003'
);
update public.profiles
set full_name = 'Khach Hang Bao Mat', phone = '0909000000'
where id = 'f6200000-0000-4000-8000-000000000004';

insert into public.admin_operator_accounts (
  user_id, baseline_role, capabilities, status, granted_by, last_changed_by
) values
  (
    'f6200000-0000-4000-8000-000000000002', 'customer',
    array['operations.read', 'operations.triage'], 'active',
    'f6200000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001'
  ),
  (
    'f6200000-0000-4000-8000-000000000003', 'customer',
    array['operations.read'], 'active',
    'f6200000-0000-4000-8000-000000000001', 'f6200000-0000-4000-8000-000000000001'
  );

insert into public.jobs (
  id, customer_id, service_type, description, status, address_building, address_unit
) values (
  'f6300000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000004',
  'plumbing',
  'Support preparation verification job',
  'cancelled',
  'Chung cu Bao Mat',
  'Can 1201'
);

insert into public.kael_admin_queue (
  id, actor_id, actor_role, job_id, queue_type, priority, status,
  escalation_level, reason_code, response_summary, safe_metadata
) values (
  'f6400000-0000-4000-8000-000000000001',
  'f6200000-0000-4000-8000-000000000004',
  'customer',
  'f6300000-0000-4000-8000-000000000001',
  'demanding_customer',
  'high',
  'open',
  'hard',
  'support_verification',
  'Neutral support verification case',
  '{}'
);

do $behavior$
declare
  v_result record;
  v_replay record;
  v_conflict record;
  v_forbidden record;
  v_note text;
  v_note_count integer;
begin
  select * into strict v_result
  from public.admin_update_support_case_preparation_atomic(
    'f6200000-0000-4000-8000-000000000002',
    'queue',
    'f6400000-0000-4000-8000-000000000001',
    0,
    'f6500000-0000-4000-8000-000000000001',
    'claim',
    'in_review',
    '{"opening_request_reviewed":true}'::jsonb,
    'Liên hệ Khach Hang Bao Mat tại Chung cu Bao Mat, Can 1201, 0909000000 hoặc owner@example.test.'
  );

  if not v_result.ok
    or v_result.version_out <> 1
    or v_result.assigned_to_out <> 'f6200000-0000-4000-8000-000000000002'::uuid
    or v_result.status_out <> 'in_review'
    or (v_result.checklist_out ->> 'opening_request_reviewed')::boolean is not true
  then
    raise exception 'triage preparation update did not persist atomically';
  end if;

  select * into strict v_replay
  from public.admin_update_support_case_preparation_atomic(
    'f6200000-0000-4000-8000-000000000002',
    'queue',
    'f6400000-0000-4000-8000-000000000001',
    0,
    'f6500000-0000-4000-8000-000000000001',
    'claim',
    'in_review',
    '{"opening_request_reviewed":true}'::jsonb,
    'Liên hệ Khach Hang Bao Mat tại Chung cu Bao Mat, Can 1201, 0909000000 hoặc owner@example.test.'
  );

  select count(*), min(body) into v_note_count, v_note
  from public.admin_support_case_notes
  where source_kind = 'queue'
    and source_id = 'f6400000-0000-4000-8000-000000000001';

  if not v_replay.ok
    or v_replay.version_out <> 1
    or v_note_count <> 1
    or v_note like '%0909000000%'
    or v_note like '%owner@example.test%'
    or v_note like '%Khach Hang Bao Mat%'
    or v_note like '%Chung cu Bao Mat%'
    or v_note like '%Can 1201%'
  then
    raise exception 'idempotency or server PII scrub failed';
  end if;

  select * into strict v_conflict
  from public.admin_update_support_case_preparation_atomic(
    'f6200000-0000-4000-8000-000000000002',
    'queue',
    'f6400000-0000-4000-8000-000000000001',
    0,
    'f6500000-0000-4000-8000-000000000002',
    'keep',
    'acknowledged',
    '{}'::jsonb,
    null
  );
  if v_conflict.ok or v_conflict.error_code <> 'VERSION_CONFLICT' then
    raise exception 'expected_version conflict was not rejected';
  end if;

  select * into strict v_forbidden
  from public.admin_update_support_case_preparation_atomic(
    'f6200000-0000-4000-8000-000000000003',
    'queue',
    'f6400000-0000-4000-8000-000000000001',
    1,
    'f6500000-0000-4000-8000-000000000003',
    'keep',
    'acknowledged',
    '{}'::jsonb,
    null
  );
  if v_forbidden.ok or v_forbidden.error_code <> 'OPERATIONS_TRIAGE_REQUIRED' then
    raise exception 'operations.read was allowed to write without operations.triage';
  end if;

  begin
    update public.admin_support_case_notes set body = 'mutated'
    where source_kind = 'queue'
      and source_id = 'f6400000-0000-4000-8000-000000000001';
    raise exception 'append-only note unexpectedly allowed update';
  exception
    when sqlstate 'P0001' then null;
  end;
end;
$behavior$;

do $capability$
declare
  v_result record;
  v_invalid record;
begin
  select * into strict v_result
  from public.admin_set_sub_admin_access_v2_atomic(
    'f6200000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000003',
    'update',
    array['operations.read', 'operations.triage'],
    null
  );
  if not v_result.ok
    or not ('operations.read' = any(v_result.capabilities_out))
    or not ('operations.triage' = any(v_result.capabilities_out))
  then
    raise exception 'Owner could not grant the coupled triage capability';
  end if;

  select * into strict v_invalid
  from public.admin_set_sub_admin_access_v2_atomic(
    'f6200000-0000-4000-8000-000000000001',
    'f6200000-0000-4000-8000-000000000003',
    'update',
    array['operations.triage'],
    null
  );
  if v_invalid.ok or v_invalid.error_code <> 'INVALID_INPUT' then
    raise exception 'operations.triage was accepted without operations.read';
  end if;
end;
$capability$;

select jsonb_build_object(
  'service_role_only', true,
  'triage_requires_read', true,
  'optimistic_conflict_checked', true,
  'notes_append_only', true,
  'source_workflows_unchanged', true
);

rollback;
