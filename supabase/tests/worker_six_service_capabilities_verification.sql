begin;

do $$
declare
  v_worker constant uuid := '96000000-0000-4000-8000-000000000001';
  v_customer constant uuid := '96000000-0000-4000-8000-000000000002';
  v_before_ctid text;
  v_after_ctid text;
  v_result record;
  v_services constant public.service_type[] := array['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']::public.service_type[];
  v_capabilities constant text[] := array[
    'electrical_fault_isolation', 'fixed_wiring_and_panel_safety', 'device_repair_or_replacement', 'electrical_installation',
    'leak_and_flow_diagnosis', 'pipe_and_fixture_repair', 'drain_clearing', 'fixture_installation',
    'home_cleaning', 'deep_cleaning', 'surface_safe_cleaning', 'cleaning_equipment_operation',
    'hvac_cleaning', 'hvac_fault_diagnosis', 'hvac_electrical_and_control_repair', 'refrigerant_system_service', 'safe_height_access',
    'upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning', 'stain_and_odor_treatment',
    'minor_home_repairs', 'safe_drilling_and_mounting', 'small_fixture_and_furniture_installation', 'multi_task_scope_management'
  ];
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values
    (
      v_worker,
      'authenticated',
      'authenticated',
      'codex-worker-registration@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    ),
    (
      v_customer,
      'authenticated',
      'authenticated',
      'codex-worker-registration-customer@example.test',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      pg_catalog.now(),
      pg_catalog.now()
    );

  update public.profiles
  set role = 'worker'::public.user_role
  where id = v_worker;

  insert into storage.objects (bucket_id, name, owner, metadata) values
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    ),
    (
      'worker-verification',
      '96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
      v_worker,
      '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
    );

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker,
    v_worker,
    'Nguyen Van A',
    '1990-01-15'::date,
    'male',
    v_services,
    5,
    array['q1'],
    10.775,
    106.7,
    8,
    v_capabilities,
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789',
    'Vietcombank'
  );

  if v_result.ok is not true
     or v_result.verification_status_out <> 'submitted'::public.worker_verification_status
     or v_result.idempotent_out is true then
    raise exception 'six-service registration rejected 25 explicitly declared capabilities: %', row_to_json(v_result);
  end if;

  select ctid::text into v_before_ctid
  from public.worker_profiles
  where id = v_worker;

  select * into v_result
  from public.submit_worker_registration_atomic(
    v_worker,
    v_worker,
    'Nguyen Van A',
    '1990-01-15'::date,
    'male',
    v_services,
    5,
    array['q1'],
    10.775,
    106.7,
    8,
    v_capabilities,
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789',
    'Vietcombank'
  );

  select ctid::text into v_after_ctid
  from public.worker_profiles
  where id = v_worker;

  if v_result.ok is not true
     or v_result.idempotent_out is not true
     or v_after_ctid is distinct from v_before_ctid then
    raise exception 'idempotent replay performed a write';
  end if;

  if not exists (
    select 1 from public.worker_profiles worker
    where worker.id = v_worker and worker.service_types = v_services
      and worker.problem_specializations = v_capabilities
  ) then
    raise exception 'six-service registration lost declared services or capability keys';
  end if;

  select * into v_result from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    v_services, 5, array['q1'], 10.775, 106.7, 8,
    v_capabilities || array['oversized_extra_key'],
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789', 'Vietcombank'
  );
  if v_result.ok is true or v_result.error_code is distinct from 'INVALID_INPUT' then
    raise exception '26-capability declaration bypassed bounded input: %', row_to_json(v_result);
  end if;

  select * into v_result from public.submit_worker_registration_atomic(
    v_customer, v_worker, 'Nguyen Van A', '1990-01-15'::date, 'male',
    v_services, 5, array['q1'], 10.775, 106.7, 8, v_capabilities,
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-front/front.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/cccd-back/back.jpg',
    'supabase://worker-verification/96000000-0000-4000-8000-000000000001/selfie/selfie.jpg',
    '0123456789', 'Vietcombank'
  );
  if v_result.ok is true or v_result.error_code is distinct from 'NOT_OWNER' then
    raise exception 'six-service declaration bypassed ownership: %', row_to_json(v_result);
  end if;
  if pg_catalog.has_function_privilege(
    'anon',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.submit_worker_registration_atomic(uuid,uuid,text,date,text,public.service_type[],integer,text[],numeric,numeric,integer,text[],text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'service_role_only_rpc privilege contract failed';
  end if;
end $$;

rollback;
