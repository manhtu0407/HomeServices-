begin;

do $structure$
declare
  v_function regprocedure := 'public.admin_set_sub_admin_access_v3_atomic(uuid,uuid,text,text[],text,integer,uuid)'::regprocedure;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.admin_operator_accounts'::regclass
      and attname = 'version'
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'operator version column is missing or nullable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.admin_team_mutation_receipts'::regclass
      and relrowsecurity
  ) then
    raise exception 'team mutation receipts must have RLS enabled';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.admin_team_mutation_receipts', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.admin_team_mutation_receipts', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.admin_team_mutation_receipts', 'insert')
    or not pg_catalog.has_table_privilege('service_role', 'public.admin_team_mutation_receipts', 'select')
  then
    raise exception 'team mutation receipts are not service-owned';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = v_function
      and prosecdef
      and proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'team access v3 RPC is not a locked-path definer';
  end if;

  if pg_catalog.has_function_privilege('anon', v_function, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_function, 'execute')
  then
    raise exception 'team access v3 RPC is not service-only';
  end if;
end;
$structure$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('f6700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'team-owner@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f6700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'team-manager@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'admin'::public.user_role
where id = 'f6700000-0000-4000-8000-000000000001';

update public.profiles
set role = 'admin_operator'::public.user_role
where id = 'f6700000-0000-4000-8000-000000000002';

insert into public.admin_operator_accounts (
  user_id, baseline_role, capabilities, status, granted_by, last_changed_by
) values (
  'f6700000-0000-4000-8000-000000000002',
  'customer',
  array['finance.read', 'team.read'],
  'active',
  'f6700000-0000-4000-8000-000000000001',
  'f6700000-0000-4000-8000-000000000001'
);

do $behavior$
declare
  v_audit_count integer;
  v_conflict record;
  v_idempotency_conflict record;
  v_receipt_count integer;
  v_replay record;
  v_result record;
begin
  select * into strict v_result
  from public.admin_set_sub_admin_access_v3_atomic(
    'f6700000-0000-4000-8000-000000000001',
    'f6700000-0000-4000-8000-000000000002',
    'update',
    array['team.read', 'finance.read'],
    'Private 0909000000 team access reason',
    1,
    'f6800000-0000-4000-8000-000000000001'
  );

  if not v_result.ok
    or v_result.version_out <> 2
    or v_result.event_id_out is null
    or v_result.replayed_out
  then
    raise exception 'versioned team access update did not return a valid receipt';
  end if;

  select * into strict v_replay
  from public.admin_set_sub_admin_access_v3_atomic(
    'f6700000-0000-4000-8000-000000000001',
    'f6700000-0000-4000-8000-000000000002',
    'update',
    array['finance.read', 'team.read'],
    'Private 0909000000 team access reason',
    1,
    'f6800000-0000-4000-8000-000000000001'
  );

  select count(*) into v_receipt_count
  from public.admin_team_mutation_receipts
  where actor_id = 'f6700000-0000-4000-8000-000000000001'
    and client_request_id = 'f6800000-0000-4000-8000-000000000001';

  select count(*) into v_audit_count
  from public.kael_permission_audit
  where actor_id = 'f6700000-0000-4000-8000-000000000001'
    and purpose = 'admin_sub_admin_access'
    and safe_metadata ->> 'target_id' = 'f6700000-0000-4000-8000-000000000002';

  if not v_replay.ok
    or not v_replay.replayed_out
    or v_replay.version_out <> v_result.version_out
    or v_replay.event_id_out <> v_result.event_id_out
    or v_receipt_count <> 1
    or v_audit_count <> 1
  then
    raise exception 'exact replay was not idempotent';
  end if;

  if exists (
    select 1
    from public.admin_team_mutation_receipts
    where request::text like '%0909000000%'
      or response::text like '%0909000000%'
  ) then
    raise exception 'team mutation receipt leaked raw reason content';
  end if;

  select * into strict v_conflict
  from public.admin_set_sub_admin_access_v3_atomic(
    'f6700000-0000-4000-8000-000000000001',
    'f6700000-0000-4000-8000-000000000002',
    'update',
    array['finance.read', 'team.read'],
    null,
    1,
    'f6800000-0000-4000-8000-000000000002'
  );

  if v_conflict.ok or v_conflict.error_code <> 'VERSION_CONFLICT' or v_conflict.version_out <> 2 then
    raise exception 'stale team access update did not return VERSION_CONFLICT';
  end if;

  select * into strict v_idempotency_conflict
  from public.admin_set_sub_admin_access_v3_atomic(
    'f6700000-0000-4000-8000-000000000001',
    'f6700000-0000-4000-8000-000000000002',
    'update',
    array['finance.read', 'operations.read', 'team.read'],
    'Private 0909000000 team access reason',
    2,
    'f6800000-0000-4000-8000-000000000001'
  );

  if v_idempotency_conflict.ok or v_idempotency_conflict.error_code <> 'IDEMPOTENCY_CONFLICT' then
    raise exception 'reused idempotency key did not return IDEMPOTENCY_CONFLICT';
  end if;
end;
$behavior$;

rollback;
