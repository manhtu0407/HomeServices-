-- P60: the Dev-review note exists only for the exact release currently active
-- in Production after normal-UI, three-smoke, source, and cleanup proof.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d6000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'p60-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'p60-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

update public.profiles set role = 'worker'::public.user_role
where id = 'd6000000-0000-4000-8000-000000000002';

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d6000000-0000-4000-8000-000000000001', 'P60 Building', 'P60', 'q7')
on conflict (id) do update set district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values (
  'd6000000-0000-4000-8000-000000000002', array['electrical']::public.service_type[],
  array['electrical']::public.service_type[], 7, array['q7'], array['electrical_installation']::text[],
  true, true, 'P60 Synthetic Worker', '1990-01-01', 'approved'
) on conflict (id) do update set
  service_types = excluded.service_types,
  selected_service_types = excluded.selected_service_types,
  years_experience = excluded.years_experience,
  districts = excluded.districts,
  problem_specializations = excluded.problem_specializations,
  is_approved = excluded.is_approved,
  is_available = excluded.is_available,
  legal_name = excluded.legal_name,
  date_of_birth = excluded.date_of_birth,
  verification_status = excluded.verification_status;

select * from public.bind_synthetic_matching_cohort(
  'synthetic-stage1-777777777777-888888888888-sql',
  array['d6000000-0000-4000-8000-000000000001']::uuid[],
  array['d6000000-0000-4000-8000-000000000002']::uuid[]
);

do $test$
declare
  v_release constant text := 'harness-777777777777-888888888888';
  v_cohort constant text := 'synthetic-stage1-777777777777-888888888888-sql';
  v_packet constant text := repeat('7', 64);
  v_ui_source constant text := repeat('6', 64);
  v_generated_at constant text := '2026-08-23T00:00:00.000Z';
  v_mobile_deployment constant text := 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000060_7';
  v_maintainer_deployment constant text := 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000061_8';
  v_mobile_proof constant text := repeat('4', 64);
  v_maintainer_proof constant text := repeat('5', 64);
  v_ui_receipt text;
  v_cleanup_receipt text;
  v_smoke_receipt text;
  v_sequence smallint;
  v_control record;
  v_promoted record;
  v_note record;
  v_rolled_back record;
begin
  if to_regclass('public.stage1_production_acceptance_notes') is null
    or to_regclass('public.stage1_current_production_acceptance') is null
  then raise exception 'Production acceptance note surface is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.stage1_production_acceptance_notes'::regclass)
    or has_table_privilege('anon', 'public.stage1_production_acceptance_notes', 'SELECT')
    or has_table_privilege('authenticated', 'public.stage1_production_acceptance_notes', 'SELECT')
    or not has_table_privilege('service_role', 'public.stage1_production_acceptance_notes', 'SELECT')
    or has_table_privilege('service_role', 'public.stage1_production_acceptance_notes', 'INSERT')
    or has_table_privilege('service_role', 'public.stage1_production_acceptance_notes', 'UPDATE')
    or has_table_privilege('service_role', 'public.stage1_production_acceptance_notes', 'DELETE')
    or has_function_privilege(
      'authenticated',
      'public.record_stage1_production_acceptance_note(text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.record_stage1_production_acceptance_note(text,text,text,integer,integer,text,text,text,integer,integer,integer,text,text,text,text)',
      'EXECUTE'
    )
  then raise exception 'Production acceptance evidence is not service-role read/RPC only'; end if;

  insert into public.harness_releases (
    release_id, environment, git_sha, manifest_sha256, migration_inventory_sha256,
    database_types_sha256, prompt_bundle_sha256, policy_bundle_sha256,
    runtime_configuration_sha256, evaluation_suite_version, evaluation_suite_sha256,
    capability_registry_sha256, access_matrix_sha256, reliability_policy_sha256,
    promotion_policy_sha256, bundle_sha256, edge_function_digests,
    release_artifact, created_by
  ) values (
    v_release, 'production', repeat('7', 40), repeat('1', 64), repeat('2', 64),
    repeat('3', 64), repeat('4', 64), repeat('5', 64), repeat('6', 64),
    'harness-eval.1.0.0', repeat('7', 64), repeat('8', 64), repeat('9', 64),
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    jsonb_build_object('mobile-api', repeat('d', 64), 'kael-matching-maintainer', repeat('e', 64)),
    jsonb_build_object(
      'productionUiSourceSha256', v_ui_source,
      'edgeRuntimeConfigurations', jsonb_build_object(
        'mobile-api', jsonb_build_object('sha256', repeat('1', 64), 'verifyJwt', false, 'importMap', true),
        'kael-matching-maintainer', jsonb_build_object('sha256', repeat('2', 64), 'verifyJwt', false, 'importMap', true)
      )
    ),
    'sql-test'
  ) on conflict do nothing;

  insert into public.stage1_release_controls(environment)
  values ('production') on conflict (environment) do nothing;
  update public.stage1_release_controls
  set active_release_id = null, previous_active_release_id = null,
      candidate_release_id = null, candidate_cohort_id = null,
      candidate_packet_sha256 = null, candidate_started_at = null,
      revision = 0, updated_at = now()
  where environment = 'production';

  select * into v_control from public.configure_stage1_release_canary(
    'production', v_release, v_cohort, null, v_packet
  );
  perform public.attest_stage1_source_deployment(
    'production', v_release, 'mobile-api', v_mobile_deployment, 7,
    repeat('d', 64), repeat('a', 64), repeat('1', 64),
    false, true, 'index.ts', 'deno.json', v_mobile_proof
  );
  perform public.attest_stage1_source_deployment(
    'production', v_release, 'kael-matching-maintainer', v_maintainer_deployment, 8,
    repeat('e', 64), repeat('b', 64), repeat('2', 64),
    false, true, 'index.ts', 'deno.json', v_maintainer_proof
  );

  for v_sequence in 1..3 loop
    v_smoke_receipt := encode(extensions.digest(convert_to(concat_ws(E'\n',
      '1.0.0', v_release, 'production', v_cohort, 'sql-run',
      v_sequence::text, 'true', 'true', 'true', 'true', 'true',
      '0', '0', '0', '1', '100', '200', '1', v_generated_at
    ), 'UTF8'), 'sha256'), 'hex');
    perform public.record_stage1_attested_synthetic_smoke(
      v_release, 'production', v_cohort, 'sql-run', v_sequence::smallint,
      true, true, true, true, true, 0, 0, 0, 1::numeric,
      100, 200, 1, v_generated_at, v_smoke_receipt,
      v_mobile_deployment, v_mobile_proof,
      v_maintainer_deployment, v_maintainer_proof
    );
  end loop;

  select * into v_promoted from public.promote_stage1_release_attested_atomic(
    'production', v_release, v_cohort, v_control.revision, v_packet,
    v_mobile_deployment, v_mobile_proof,
    v_maintainer_deployment, v_maintainer_proof
  );

  v_ui_receipt := encode(extensions.digest(convert_to(concat_ws(E'\n',
    'stage1-production-ui-normality.v1', 'passed', v_ui_source,
    '519', '23819', '0', v_generated_at
  ), 'UTF8'), 'sha256'), 'hex');
  v_cleanup_receipt := encode(extensions.digest(convert_to(concat_ws(E'\n',
    'stage1-synthetic-cleanup.v1', 'cleaned', v_release, v_cohort,
    'sql-run-final', '2', '1', '1', '0', '0', v_generated_at
  ), 'UTF8'), 'sha256'), 'hex');

  select * into v_note from public.record_stage1_production_acceptance_note(
    v_release, v_cohort, v_ui_source, 519, 23819, v_generated_at, v_ui_receipt,
    'sql-run-final', 2, 1, 1, v_generated_at, v_cleanup_receipt,
    repeat('8', 64), v_packet
  );
  if v_note.release_id <> v_release or v_note.acceptance_status <> 'verified'
    or v_note.production_ui_receipt_sha256 <> v_ui_receipt
    or v_note.cleanup_receipt_sha256 <> v_cleanup_receipt
    or v_note.summary_vi !~ 'Production'
    or not exists (select 1 from public.stage1_current_production_acceptance current_note
      where current_note.release_id = v_release)
  then raise exception 'Final Supabase Production acceptance note is incomplete'; end if;

  select * into v_note from public.record_stage1_production_acceptance_note(
    v_release, v_cohort, v_ui_source, 519, 23819, v_generated_at, v_ui_receipt,
    'sql-run-final', 2, 1, 1, v_generated_at, v_cleanup_receipt,
    repeat('8', 64), v_packet
  );
  if v_note.release_id <> v_release then raise exception 'Acceptance note retry is not idempotent'; end if;

  begin
    perform public.record_stage1_production_acceptance_note(
      v_release, v_cohort, v_ui_source, 519, 23819, v_generated_at, repeat('0', 64),
      'sql-run-final', 2, 1, 1, v_generated_at, v_cleanup_receipt,
      repeat('8', 64), v_packet
    );
    raise exception 'Tampered Production UI receipt was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.stage1_production_acceptance_notes
    set summary_vi = summary_vi
    where release_id = v_release;
    raise exception 'Production acceptance note accepted mutation';
  exception when object_not_in_prerequisite_state then null;
  end;

  select * into v_rolled_back from public.rollback_stage1_active_release_atomic(
    'production', v_release, null, v_promoted.revision, repeat('9', 64)
  );
  if v_rolled_back.active_release_id is not null
    or exists (select 1 from public.stage1_current_production_acceptance)
  then raise exception 'Rolled-back release remained on the current Dev-review surface'; end if;
end;
$test$;

rollback;
