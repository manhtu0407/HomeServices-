begin;

create table public.stage1_source_deployment_attestations (
  deployment_id text primary key check (
    deployment_id ~ '^[a-z0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[1-9][0-9]*$'
  ),
  environment text not null check (environment in ('staging', 'production')),
  release_id text not null references public.harness_releases(release_id) on delete restrict,
  function_name text not null check (function_name in ('mobile-api', 'kael-matching-maintainer')),
  edge_version integer not null check (edge_version > 0),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  hosted_bundle_sha256 text not null check (hosted_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_configuration_sha256 text not null check (runtime_configuration_sha256 ~ '^[0-9a-f]{64}$'),
  verify_jwt boolean not null,
  import_map boolean not null,
  entrypoint_path text not null check (
    length(entrypoint_path) between 1 and 240 and entrypoint_path !~ '\.\.' and
    entrypoint_path ~ '^[A-Za-z0-9_./-]+$'
  ),
  import_map_path text check (
    (import_map and import_map_path is not null and length(import_map_path) between 1 and 240 and
      import_map_path !~ '\.\.' and import_map_path ~ '^[A-Za-z0-9_./-]+$')
    or (not import_map and import_map_path is null)
  ),
  proof_sha256 text not null unique check (proof_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (environment, release_id, function_name, edge_version),
  unique (function_name, deployment_id),
  check (deployment_id ~ ('_' || edge_version::text || '$'))
);

alter table public.stage1_source_deployment_attestations enable row level security;
revoke all on public.stage1_source_deployment_attestations from public, anon, authenticated;
grant select on public.stage1_source_deployment_attestations to service_role;

create trigger stage1_source_deployment_attestations_append_only
before update or delete on public.stage1_source_deployment_attestations
for each row execute function public.reject_stage1_release_evidence_mutation();

create table public.stage1_smoke_deployment_attestations (
  smoke_receipt_id uuid not null references public.stage1_synthetic_smoke_receipts(id) on delete restrict,
  function_name text not null check (function_name in ('mobile-api', 'kael-matching-maintainer')),
  deployment_id text not null,
  proof_sha256 text not null check (proof_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (smoke_receipt_id, function_name),
  foreign key (function_name, deployment_id)
    references public.stage1_source_deployment_attestations(function_name, deployment_id)
    on delete restrict
);

alter table public.stage1_smoke_deployment_attestations enable row level security;
revoke all on public.stage1_smoke_deployment_attestations from public, anon, authenticated;
grant select on public.stage1_smoke_deployment_attestations to service_role;

create trigger stage1_smoke_deployment_attestations_append_only
before update or delete on public.stage1_smoke_deployment_attestations
for each row execute function public.reject_stage1_release_evidence_mutation();

create or replace function public.attest_stage1_source_deployment(
  p_environment text,
  p_release_id text,
  p_function_name text,
  p_deployment_id text,
  p_edge_version integer,
  p_source_sha256 text,
  p_hosted_bundle_sha256 text,
  p_runtime_configuration_sha256 text,
  p_verify_jwt boolean,
  p_import_map boolean,
  p_entrypoint_path text,
  p_import_map_path text,
  p_proof_sha256 text
) returns table(
  deployment_id text,
  release_id text,
  source_sha256 text,
  runtime_configuration_sha256 text,
  proof_sha256 text,
  attested boolean
)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_project_ref text;
  v_existing public.stage1_source_deployment_attestations%rowtype;
begin
  v_project_ref := case p_environment
    when 'staging' then 'xyylanuyflrjzbjzhqfl'
    when 'production' then 'iwevizmsedyqozxlawwl'
    else null
  end;
  if v_project_ref is null
    or p_release_id !~ '^harness-[0-9a-f]{12}-[0-9a-f]{12}$'
    or p_function_name not in ('mobile-api', 'kael-matching-maintainer')
    or p_edge_version is null or p_edge_version < 1
    or p_deployment_id !~ (
      '^' || v_project_ref || '_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_' ||
      p_edge_version::text || '$'
    )
    or p_source_sha256 !~ '^[0-9a-f]{64}$'
    or p_hosted_bundle_sha256 !~ '^[0-9a-f]{64}$'
    or p_runtime_configuration_sha256 !~ '^[0-9a-f]{64}$'
    or p_verify_jwt is null or p_import_map is null
    or p_entrypoint_path is null or length(p_entrypoint_path) not between 1 and 240
    or p_entrypoint_path ~ '\.\.' or p_entrypoint_path !~ '^[A-Za-z0-9_./-]+$'
    or (p_import_map and (
      p_import_map_path is null or length(p_import_map_path) not between 1 and 240 or
      p_import_map_path ~ '\.\.' or p_import_map_path !~ '^[A-Za-z0-9_./-]+$'
    ))
    or (not p_import_map and p_import_map_path is not null)
    or p_proof_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'STAGE1_SOURCE_ATTESTATION_INVALID';
  end if;
  if not exists (
    select 1
    from public.harness_releases release
    where release.release_id = p_release_id
      and release.environment = p_environment
      and release.edge_function_digests ->> p_function_name = p_source_sha256
      and release.release_artifact -> 'edgeRuntimeConfigurations' -> p_function_name ->> 'sha256' = p_runtime_configuration_sha256
      and (release.release_artifact -> 'edgeRuntimeConfigurations' -> p_function_name ->> 'verifyJwt')::boolean = p_verify_jwt
      and (release.release_artifact -> 'edgeRuntimeConfigurations' -> p_function_name ->> 'importMap')::boolean = p_import_map
  ) then
    raise exception using errcode = '23514', message = 'STAGE1_SOURCE_RELEASE_DIGEST_MISMATCH';
  end if;
  if not exists (
    select 1
    from public.stage1_release_controls control
    where control.environment = p_environment
      and (control.candidate_release_id = p_release_id or control.active_release_id = p_release_id)
  ) then
    raise exception using errcode = '55000', message = 'STAGE1_SOURCE_RELEASE_NOT_CONTROLLED';
  end if;

  insert into public.stage1_source_deployment_attestations(
    deployment_id, environment, release_id, function_name, edge_version,
    source_sha256, hosted_bundle_sha256, runtime_configuration_sha256,
    verify_jwt, import_map, entrypoint_path, import_map_path, proof_sha256
  ) values (
    p_deployment_id, p_environment, p_release_id, p_function_name, p_edge_version,
    p_source_sha256, p_hosted_bundle_sha256, p_runtime_configuration_sha256,
    p_verify_jwt, p_import_map, p_entrypoint_path, p_import_map_path, p_proof_sha256
  ) on conflict (deployment_id) do nothing;

  select * into strict v_existing
  from public.stage1_source_deployment_attestations attestation
  where attestation.deployment_id = p_deployment_id;
  if v_existing.environment <> p_environment
    or v_existing.release_id <> p_release_id
    or v_existing.function_name <> p_function_name
    or v_existing.edge_version <> p_edge_version
    or v_existing.source_sha256 <> p_source_sha256
    or v_existing.hosted_bundle_sha256 <> p_hosted_bundle_sha256
    or v_existing.runtime_configuration_sha256 <> p_runtime_configuration_sha256
    or v_existing.verify_jwt <> p_verify_jwt
    or v_existing.import_map <> p_import_map
    or v_existing.entrypoint_path <> p_entrypoint_path
    or v_existing.import_map_path is distinct from p_import_map_path
    or v_existing.proof_sha256 <> p_proof_sha256
  then
    raise exception using errcode = '23505', message = 'STAGE1_SOURCE_ATTESTATION_COLLISION';
  end if;
  return query select v_existing.deployment_id, v_existing.release_id,
    v_existing.source_sha256, v_existing.runtime_configuration_sha256,
    v_existing.proof_sha256, true;
end;
$func$;

create or replace function public.record_stage1_attested_synthetic_smoke(
  p_release_id text,
  p_environment text,
  p_cohort_id text,
  p_run_id text,
  p_sequence smallint,
  p_auto_quote_passed boolean,
  p_rfq_or_inspection_passed boolean,
  p_recovery_passed boolean,
  p_release_identity_match boolean,
  p_terminal_reconcile_passed boolean,
  p_synthetic_leak_count integer,
  p_duplicate_job_count integer,
  p_duplicate_broadcast_count integer,
  p_safe_error_code_ratio numeric,
  p_confirm_acceptance_ms integer,
  p_worker_offer_visible_ms integer,
  p_support_trace_count integer,
  p_receipt_generated_at text,
  p_receipt_sha256 text,
  p_mobile_deployment_id text,
  p_mobile_source_proof_sha256 text,
  p_maintainer_deployment_id text,
  p_maintainer_source_proof_sha256 text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_receipt_id uuid;
begin
  if (
    select count(*)
    from public.stage1_source_deployment_attestations attestation
    where attestation.environment = p_environment
      and attestation.release_id = p_release_id
      and (
        (attestation.function_name = 'mobile-api' and
          attestation.deployment_id = p_mobile_deployment_id and
          attestation.proof_sha256 = p_mobile_source_proof_sha256)
        or (attestation.function_name = 'kael-matching-maintainer' and
          attestation.deployment_id = p_maintainer_deployment_id and
          attestation.proof_sha256 = p_maintainer_source_proof_sha256)
      )
  ) <> 2 then
    raise exception using errcode = '23514', message = 'STAGE1_SMOKE_SOURCE_NOT_ATTESTED';
  end if;

  v_receipt_id := public.record_stage1_synthetic_smoke(
    p_release_id, p_environment, p_cohort_id, p_run_id, p_sequence,
    p_auto_quote_passed, p_rfq_or_inspection_passed, p_recovery_passed,
    p_release_identity_match, p_terminal_reconcile_passed,
    p_synthetic_leak_count, p_duplicate_job_count, p_duplicate_broadcast_count,
    p_safe_error_code_ratio, p_confirm_acceptance_ms, p_worker_offer_visible_ms,
    p_support_trace_count, p_receipt_generated_at, p_receipt_sha256
  );

  insert into public.stage1_smoke_deployment_attestations(
    smoke_receipt_id, function_name, deployment_id, proof_sha256
  ) values
    (v_receipt_id, 'mobile-api', p_mobile_deployment_id, p_mobile_source_proof_sha256),
    (v_receipt_id, 'kael-matching-maintainer', p_maintainer_deployment_id, p_maintainer_source_proof_sha256)
  on conflict (smoke_receipt_id, function_name) do nothing;

  if (
    select count(*)
    from public.stage1_smoke_deployment_attestations evidence
    where evidence.smoke_receipt_id = v_receipt_id
      and (
        (evidence.function_name = 'mobile-api' and
          evidence.deployment_id = p_mobile_deployment_id and
          evidence.proof_sha256 = p_mobile_source_proof_sha256)
        or (evidence.function_name = 'kael-matching-maintainer' and
          evidence.deployment_id = p_maintainer_deployment_id and
          evidence.proof_sha256 = p_maintainer_source_proof_sha256)
      )
  ) <> 2 then
    raise exception using errcode = '23505', message = 'STAGE1_SMOKE_DEPLOYMENT_COLLISION';
  end if;
  return v_receipt_id;
end;
$func$;

create or replace function public.resolve_stage1_release_lane_attested(
  p_environment text,
  p_release_id text,
  p_session_id uuid,
  p_deployment_id text
) returns text
language plpgsql
security definer
set search_path = ''
stable
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
  v_cohort_id text;
begin
  if not exists (
    select 1
    from public.stage1_source_deployment_attestations attestation
    where attestation.environment = p_environment
      and attestation.release_id = p_release_id
      and attestation.function_name = 'mobile-api'
      and attestation.deployment_id = p_deployment_id
  ) then
    return 'previous';
  end if;
  select * into v_control
  from public.stage1_release_controls control
  where control.environment = p_environment;
  if not found then return 'previous'; end if;
  if v_control.active_release_id = p_release_id then return 'active'; end if;
  if v_control.candidate_release_id <> p_release_id then return 'previous'; end if;
  select session.synthetic_cohort_id into v_cohort_id
  from public.kael_chat_sessions session
  where session.id = p_session_id;
  if v_cohort_id = v_control.candidate_cohort_id then return 'candidate'; end if;
  return 'previous';
end;
$func$;

create or replace function public.promote_stage1_release_attested_atomic(
  p_environment text,
  p_release_id text,
  p_cohort_id text,
  p_expected_revision bigint,
  p_packet_sha256 text,
  p_mobile_deployment_id text,
  p_mobile_source_proof_sha256 text,
  p_maintainer_deployment_id text,
  p_maintainer_source_proof_sha256 text
) returns table(active_release_id text, previous_active_release_id text, revision bigint)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found
    or v_control.revision <> p_expected_revision
    or v_control.candidate_release_id <> p_release_id
    or v_control.candidate_cohort_id <> p_cohort_id
    or v_control.candidate_packet_sha256 <> p_packet_sha256
  then
    raise exception using errcode = '40001', message = 'STAGE1_PROMOTION_STATE_CHANGED';
  end if;
  if (
    select count(*)
    from public.stage1_source_deployment_attestations attestation
    where attestation.environment = p_environment
      and attestation.release_id = p_release_id
      and (
        (attestation.function_name = 'mobile-api' and
          attestation.deployment_id = p_mobile_deployment_id and
          attestation.proof_sha256 = p_mobile_source_proof_sha256)
        or (attestation.function_name = 'kael-matching-maintainer' and
          attestation.deployment_id = p_maintainer_deployment_id and
          attestation.proof_sha256 = p_maintainer_source_proof_sha256)
      )
  ) <> 2 then
    raise exception using errcode = '23514', message = 'STAGE1_PROMOTION_SOURCE_NOT_ATTESTED';
  end if;
  if (
    select count(*) from (
      select receipt.id
      from public.stage1_synthetic_smoke_receipts receipt
      join public.stage1_smoke_deployment_attestations evidence
        on evidence.smoke_receipt_id = receipt.id
      where receipt.release_id = p_release_id
        and receipt.environment = p_environment
        and receipt.cohort_id = p_cohort_id
        and receipt.sequence in (1, 2, 3)
        and (
          (evidence.function_name = 'mobile-api' and
            evidence.deployment_id = p_mobile_deployment_id and
            evidence.proof_sha256 = p_mobile_source_proof_sha256)
          or (evidence.function_name = 'kael-matching-maintainer' and
            evidence.deployment_id = p_maintainer_deployment_id and
            evidence.proof_sha256 = p_maintainer_source_proof_sha256)
        )
      group by receipt.id
      having count(*) = 2
    ) passed_smoke
  ) <> 3 then
    raise exception using errcode = '23514', message = 'STAGE1_THREE_ATTESTED_SMOKES_REQUIRED';
  end if;

  update public.stage1_release_controls control
  set previous_active_release_id = control.active_release_id,
      active_release_id = control.candidate_release_id,
      candidate_release_id = null,
      candidate_cohort_id = null,
      candidate_packet_sha256 = null,
      candidate_started_at = null,
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment
  returning * into v_control;

  insert into public.stage1_release_control_events(
    environment, release_id, event_type, cohort_id, evidence_sha256, revision,
    safe_metadata
  ) values (
    p_environment, p_release_id, 'promoted', p_cohort_id,
    p_packet_sha256, v_control.revision,
    jsonb_build_object(
      'mobile_deployment_id', p_mobile_deployment_id,
      'mobile_source_proof_sha256', p_mobile_source_proof_sha256,
      'maintainer_deployment_id', p_maintainer_deployment_id,
      'maintainer_source_proof_sha256', p_maintainer_source_proof_sha256
    )
  );
  return query select v_control.active_release_id,
    v_control.previous_active_release_id, v_control.revision;
end;
$func$;

revoke execute on function public.record_stage1_synthetic_smoke(
  text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,numeric,integer,integer,integer,text,text
) from service_role;
revoke execute on function public.promote_stage1_release_atomic(
  text,text,text,bigint,text
) from service_role;
revoke execute on function public.resolve_stage1_release_lane(
  text,text,uuid
) from service_role;

revoke execute on function public.attest_stage1_source_deployment(
  text, text, text, text, integer, text, text, text, boolean, boolean, text, text, text
) from public, anon, authenticated;
revoke execute on function public.record_stage1_attested_synthetic_smoke(
  text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,numeric,integer,integer,integer,text,text,text,text,text,text
) from public, anon, authenticated;
revoke execute on function public.promote_stage1_release_attested_atomic(
  text,text,text,bigint,text,text,text,text,text
) from public, anon, authenticated;
revoke execute on function public.resolve_stage1_release_lane_attested(
  text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.attest_stage1_source_deployment(
  text, text, text, text, integer, text, text, text, boolean, boolean, text, text, text
) to service_role;
grant execute on function public.record_stage1_attested_synthetic_smoke(
  text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,
  integer,integer,integer,numeric,integer,integer,integer,text,text,text,text,text,text
) to service_role;
grant execute on function public.promote_stage1_release_attested_atomic(
  text,text,text,bigint,text,text,text,text,text
) to service_role;
grant execute on function public.resolve_stage1_release_lane_attested(
  text, text, uuid, text
) to service_role;

comment on table public.stage1_source_deployment_attestations is
  'Append-only binding between a provider-owned DENO deployment identity and the byte-verified immutable release source.';
comment on table public.stage1_smoke_deployment_attestations is
  'Append-only proof that every accepted production smoke ran against one exact attested Edge deployment.';
comment on function public.resolve_stage1_release_lane_attested(text, text, uuid, text) is
  'Returns candidate or active only when the exact runtime deployment was attested for the same immutable release.';

commit;
