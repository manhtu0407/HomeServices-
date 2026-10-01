begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('fae10000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'capability-owner@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('fae10000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'capability-operator@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'admin'::public.user_role
where id = 'fae10000-0000-4000-8000-000000000001';

update public.profiles
set role = 'admin_operator'::public.user_role
where id = 'fae10000-0000-4000-8000-000000000002';

insert into public.admin_operator_accounts (
  user_id, baseline_role, capabilities, status, granted_by, last_changed_by
) values (
  'fae10000-0000-4000-8000-000000000002', 'customer',
  array['finance.read', 'system.read'], 'active',
  'fae10000-0000-4000-8000-000000000001',
  'fae10000-0000-4000-8000-000000000001'
);

do $verification$
declare
  v_owner constant uuid := 'fae10000-0000-4000-8000-000000000001';
  v_operator constant uuid := 'fae10000-0000-4000-8000-000000000002';
  v_all text[] := array[
    'operations.read', 'operations.triage', 'workers.read', 'workers.review',
    'workers.manage', 'workers.bonus.manage', 'workers.discipline.manage',
    'transactions.read', 'finance.read', 'finance.reconcile', 'finance.tax.manage',
    'payouts.read', 'payouts.process', 'team.read', 'system.read', 'system.manage'
  ];
  v_legacy text[];
  v_result record;
  v_id uuid;
begin
  if pg_catalog.has_function_privilege('anon',
      'public.admin_begin_operator_provisioning(uuid,text,text,text[])', 'execute')
    or pg_catalog.has_function_privilege('authenticated',
      'public.admin_begin_operator_provisioning(uuid,text,text,text[])', 'execute')
    or not pg_catalog.has_function_privilege('service_role',
      'public.admin_begin_operator_provisioning(uuid,text,text,text[])', 'execute')
  then
    raise exception 'operator provisioning must remain service-role only';
  end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'capability-full-test@gmail.com', 'Capability Full Test',
    pg_catalog.array_remove(v_all, 'operations.triage')
  );
  if v_result.ok is distinct from true then
    raise exception 'full capability provisioning was rejected: %', v_result.error_code;
  end if;
  v_id := v_result.provisioning_id;

  update public.admin_operator_provisioning
  set capabilities = v_all
  where id = v_id;
  if not found then
    raise exception 'full capability provisioning row was not persisted';
  end if;

  select pg_catalog.array_remove(pg_catalog.array_remove(v_all,
    'workers.bonus.manage'), 'workers.discipline.manage') into v_legacy;
  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'capability-legacy-test@gmail.com', 'Capability Legacy Test',
    pg_catalog.array_remove(v_legacy, 'operations.triage')
  );
  if v_result.ok is distinct from true then
    raise exception 'the 14-capability app payload was rejected: %', v_result.error_code;
  end if;
  update public.admin_operator_provisioning
  set capabilities = v_legacy
  where id = v_result.provisioning_id;

  select * into v_result from public.admin_set_sub_admin_access_v3_atomic(
    v_owner, v_operator, 'update', v_all, null, 1, gen_random_uuid()
  );
  if v_result.ok is distinct from true
    or pg_catalog.cardinality(v_result.capabilities_out) <> 16
    or v_result.version_out <> 2
  then
    raise exception 'updating all 16 operator capabilities failed: %', v_result.error_code;
  end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'capability-invalid-test@gmail.com', 'Capability Invalid Test',
    array['finance.read', 'system.read', 'unsupported.capability']
  );
  if v_result.ok is distinct from false or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'unsupported capability was accepted for provisioning';
  end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_owner, 'capability-dependency-test@gmail.com', 'Capability Dependency Test',
    array['finance.read', 'system.manage']
  );
  if v_result.ok is distinct from false or v_result.error_code <> 'INVALID_INPUT' then
    raise exception 'system.manage without system.read was accepted';
  end if;

  select * into v_result from public.admin_begin_operator_provisioning(
    v_operator, 'capability-forbidden-test@gmail.com', 'Capability Forbidden Test',
    array['finance.read', 'system.read']
  );
  if v_result.ok is distinct from false or v_result.error_code <> 'OWNER_REQUIRED' then
    raise exception 'non-owner provisioned an operator';
  end if;
end;
$verification$;

select jsonb_build_object(
  'legacy_and_current_capabilities', 'accepted',
  'unsupported_capability', 'rejected',
  'non_owner', 'rejected',
  'changes', 'rolled_back'
);

rollback;
