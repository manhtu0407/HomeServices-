begin;

create table public.harness_releases (
  release_id text primary key,
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  git_sha text not null check (git_sha ~ '^[0-9a-f]{40}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  migration_inventory_sha256 text not null check (migration_inventory_sha256 ~ '^[0-9a-f]{64}$'),
  database_types_sha256 text not null check (database_types_sha256 ~ '^[0-9a-f]{64}$'),
  prompt_bundle_sha256 text not null check (prompt_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  policy_bundle_sha256 text not null check (policy_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_configuration_sha256 text not null check (runtime_configuration_sha256 ~ '^[0-9a-f]{64}$'),
  evaluation_suite_version text not null,
  evaluation_suite_sha256 text not null check (evaluation_suite_sha256 ~ '^[0-9a-f]{64}$'),
  capability_registry_sha256 text not null check (capability_registry_sha256 ~ '^[0-9a-f]{64}$'),
  access_matrix_sha256 text not null check (access_matrix_sha256 ~ '^[0-9a-f]{64}$'),
  reliability_policy_sha256 text not null check (reliability_policy_sha256 ~ '^[0-9a-f]{64}$'),
  promotion_policy_sha256 text not null check (promotion_policy_sha256 ~ '^[0-9a-f]{64}$'),
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  edge_function_digests jsonb not null check (jsonb_typeof(edge_function_digests) = 'object'),
  release_artifact jsonb not null check (jsonb_typeof(release_artifact) = 'object'),
  previous_release_id text references public.harness_releases(release_id),
  created_by text not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.harness_release_events (
  id bigint generated always as identity primary key,
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('local', 'preview', 'staging', 'production')),
  event_type text not null check (event_type in ('built', 'evaluated', 'promoted', 'rolled_back', 'rejected')),
  actor_role text not null check (actor_role in ('admin', 'system')),
  approval_id text,
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.harness_releases enable row level security;
alter table public.harness_release_events enable row level security;

create policy harness_releases_admin_read
  on public.harness_releases for select to authenticated
  using (private.is_admin());

create policy harness_release_events_admin_read
  on public.harness_release_events for select to authenticated
  using (private.is_admin());

revoke all on public.harness_releases from public, anon, authenticated;
revoke all on public.harness_release_events from public, anon, authenticated;
grant select on public.harness_releases to authenticated;
grant select on public.harness_release_events to authenticated;
grant select, insert on public.harness_releases to service_role;
grant select, insert on public.harness_release_events to service_role;
grant usage, select on sequence public.harness_release_events_id_seq to service_role;

create or replace function public.reject_harness_release_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'HARNESS_RELEASE_APPEND_ONLY';
end;
$$;

revoke all on function public.reject_harness_release_mutation() from public, anon, authenticated;
grant execute on function public.reject_harness_release_mutation() to service_role;

drop trigger if exists harness_releases_append_only on public.harness_releases;
create trigger harness_releases_append_only
before update or delete on public.harness_releases
for each row execute function public.reject_harness_release_mutation();

drop trigger if exists harness_release_events_append_only on public.harness_release_events;
create trigger harness_release_events_append_only
before update or delete on public.harness_release_events
for each row execute function public.reject_harness_release_mutation();

create or replace function public.register_harness_release(
  p_release_id text,
  p_environment text,
  p_git_sha text,
  p_manifest_sha256 text,
  p_migration_inventory_sha256 text,
  p_database_types_sha256 text,
  p_prompt_bundle_sha256 text,
  p_policy_bundle_sha256 text,
  p_runtime_configuration_sha256 text,
  p_evaluation_suite_version text,
  p_evaluation_suite_sha256 text,
  p_capability_registry_sha256 text,
  p_access_matrix_sha256 text,
  p_reliability_policy_sha256 text,
  p_promotion_policy_sha256 text,
  p_bundle_sha256 text,
  p_edge_function_digests jsonb,
  p_release_artifact jsonb,
  p_previous_release_id text,
  p_created_by text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns public.harness_releases
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing public.harness_releases%rowtype;
  created public.harness_releases%rowtype;
begin
  select * into existing
    from public.harness_releases
    where release_id = p_release_id;

  if found then
    if existing.git_sha is distinct from p_git_sha
       or existing.manifest_sha256 is distinct from p_manifest_sha256
       or existing.migration_inventory_sha256 is distinct from p_migration_inventory_sha256
       or existing.database_types_sha256 is distinct from p_database_types_sha256
       or existing.prompt_bundle_sha256 is distinct from p_prompt_bundle_sha256
       or existing.policy_bundle_sha256 is distinct from p_policy_bundle_sha256
       or existing.runtime_configuration_sha256 is distinct from p_runtime_configuration_sha256
       or existing.evaluation_suite_version is distinct from p_evaluation_suite_version
       or existing.evaluation_suite_sha256 is distinct from p_evaluation_suite_sha256
       or existing.capability_registry_sha256 is distinct from p_capability_registry_sha256
       or existing.access_matrix_sha256 is distinct from p_access_matrix_sha256
       or existing.reliability_policy_sha256 is distinct from p_reliability_policy_sha256
       or existing.promotion_policy_sha256 is distinct from p_promotion_policy_sha256
       or existing.bundle_sha256 is distinct from p_bundle_sha256
       or existing.edge_function_digests is distinct from p_edge_function_digests
       or existing.release_artifact is distinct from p_release_artifact then
      raise exception 'HARNESS_RELEASE_ID_COLLISION';
    end if;
    return existing;
  end if;

  insert into public.harness_releases (
    release_id,
    environment,
    git_sha,
    manifest_sha256,
    migration_inventory_sha256,
    database_types_sha256,
    prompt_bundle_sha256,
    policy_bundle_sha256,
    runtime_configuration_sha256,
    evaluation_suite_version,
    evaluation_suite_sha256,
    capability_registry_sha256,
    access_matrix_sha256,
    reliability_policy_sha256,
    promotion_policy_sha256,
    bundle_sha256,
    edge_function_digests,
    release_artifact,
    previous_release_id,
    created_by,
    safe_metadata
  ) values (
    p_release_id,
    p_environment,
    p_git_sha,
    p_manifest_sha256,
    p_migration_inventory_sha256,
    p_database_types_sha256,
    p_prompt_bundle_sha256,
    p_policy_bundle_sha256,
    p_runtime_configuration_sha256,
    p_evaluation_suite_version,
    p_evaluation_suite_sha256,
    p_capability_registry_sha256,
    p_access_matrix_sha256,
    p_reliability_policy_sha256,
    p_promotion_policy_sha256,
    p_bundle_sha256,
    p_edge_function_digests,
    p_release_artifact,
    p_previous_release_id,
    p_created_by,
    coalesce(p_safe_metadata, '{}'::jsonb)
  ) returning * into created;

  insert into public.harness_release_events (
    release_id,
    environment,
    event_type,
    actor_role,
    safe_metadata
  ) values (
    created.release_id,
    created.environment,
    'built',
    'system',
    '{}'::jsonb
  );

  return created;
end;
$function$;

revoke execute on function public.register_harness_release(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.register_harness_release(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, jsonb
) to service_role;

comment on table public.harness_releases is
  'Immutable source and behavior bundle registered before environment promotion.';
comment on table public.harness_release_events is
  'Append-only promotion, rejection, and rollback evidence for Harness releases.';

commit;
