begin;

create table if not exists public.harness_evaluation_runs (
  evaluation_id uuid primary key,
  release_id text not null references public.harness_releases(release_id),
  git_sha text not null check (git_sha ~ '^[0-9a-f]{40}$'),
  evidence_class text not null check (evidence_class in ('static', 'deterministic', 'simulation', 'live_shadow', 'production_observation')),
  evaluator_id text not null,
  evaluator_kind text not null check (evaluator_kind in ('deterministic', 'live', 'tool_call')),
  evaluator_version text not null,
  prompt_bundle_sha256 text not null check (prompt_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  policy_bundle_sha256 text not null check (policy_bundle_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'running' check (status in ('running', 'passed', 'failed', 'cancelled')),
  sample_count integer not null default 0 check (sample_count >= 0),
  metrics jsonb not null default '{}'::jsonb,
  variance jsonb not null default '{}'::jsonb,
  artifact_sha256 text check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint harness_evaluation_metrics_bound check (octet_length(metrics::text) <= 16384),
  constraint harness_evaluation_variance_bound check (octet_length(variance::text) <= 8192),
  constraint harness_evaluation_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create table if not exists public.harness_evaluation_samples (
  sample_id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.harness_evaluation_runs(evaluation_id) on delete cascade,
  case_id text not null,
  case_class text not null check (case_class in ('golden', 'adversarial', 'counterfactual', 'tool_call', 'safety', 'authorization', 'confirmation')),
  repetition integer not null check (repetition > 0),
  success boolean not null,
  provider text,
  resolved_model text,
  provider_attempt_id uuid,
  tool_call_correct boolean,
  critical_safety_failure boolean not null default false,
  authorization_bypass boolean not null default false,
  confirmation_bypass boolean not null default false,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cost_usd numeric(14, 8) check (cost_usd is null or cost_usd >= 0),
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint harness_evaluation_sample_unique unique (evaluation_id, case_id, repetition),
  constraint harness_evaluation_sample_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create index if not exists harness_evaluation_release_idx
  on public.harness_evaluation_runs(release_id, evidence_class, started_at desc);
create index if not exists harness_evaluation_sample_run_idx
  on public.harness_evaluation_samples(evaluation_id, case_id, repetition);

alter table public.harness_evaluation_runs enable row level security;
alter table public.harness_evaluation_samples enable row level security;

create policy harness_evaluation_runs_admin_read
  on public.harness_evaluation_runs for select to authenticated
  using (private.is_admin());
create policy harness_evaluation_samples_admin_read
  on public.harness_evaluation_samples for select to authenticated
  using (private.is_admin());

grant select on public.harness_evaluation_runs to authenticated;
grant select on public.harness_evaluation_samples to authenticated;

drop trigger if exists harness_evaluation_samples_append_only on public.harness_evaluation_samples;
create trigger harness_evaluation_samples_append_only
before update or delete on public.harness_evaluation_samples
for each row execute function public.reject_harness_append_only_mutation();

create or replace function public.begin_harness_evaluation(
  p_evaluation_id uuid,
  p_release_id text,
  p_git_sha text,
  p_evidence_class text,
  p_evaluator_id text,
  p_evaluator_kind text,
  p_evaluator_version text,
  p_prompt_bundle_sha256 text,
  p_policy_bundle_sha256 text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.harness_releases
    where release_id = p_release_id
      and git_sha = p_git_sha
  ) then
    raise exception using errcode = '22023', message = 'HARNESS_RELEASE_GIT_SHA_MISMATCH';
  end if;
  if p_evidence_class in ('live_shadow', 'production_observation') and p_evaluator_kind <> 'live' then
    raise exception using errcode = '22023', message = 'HARNESS_LIVE_EVALUATOR_REQUIRED';
  end if;
  if p_evidence_class not in ('live_shadow', 'production_observation') and p_evaluator_kind = 'live' then
    raise exception using errcode = '22023', message = 'HARNESS_DETERMINISTIC_EVIDENCE_MISLABELED';
  end if;
  insert into public.harness_evaluation_runs (
    evaluation_id, release_id, git_sha, evidence_class,
    evaluator_id, evaluator_kind, evaluator_version,
    prompt_bundle_sha256, policy_bundle_sha256, safe_metadata
  ) values (
    p_evaluation_id, p_release_id, p_git_sha, p_evidence_class,
    left(p_evaluator_id, 120), p_evaluator_kind, left(p_evaluator_version, 40),
    p_prompt_bundle_sha256, p_policy_bundle_sha256, coalesce(p_safe_metadata, '{}'::jsonb)
  ) on conflict (evaluation_id) do nothing;
  return found;
end;
$$;

create or replace function public.append_harness_evaluation_sample(
  p_sample_id uuid,
  p_evaluation_id uuid,
  p_case_id text,
  p_case_class text,
  p_repetition integer,
  p_success boolean,
  p_provider text,
  p_resolved_model text,
  p_provider_attempt_id uuid,
  p_tool_call_correct boolean,
  p_critical_safety_failure boolean,
  p_authorization_bypass boolean,
  p_confirmation_bypass boolean,
  p_latency_ms integer,
  p_cost_usd numeric,
  p_error_code text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_sample_id, gen_random_uuid());
  v_inserted_id uuid;
begin
  if not exists (
    select 1
    from public.harness_evaluation_runs
    where evaluation_id = p_evaluation_id
      and status = 'running'
  ) then
    raise exception using errcode = '22023', message = 'HARNESS_EVALUATION_NOT_RUNNING';
  end if;
  insert into public.harness_evaluation_samples (
    sample_id, evaluation_id, case_id, case_class, repetition, success,
    provider, resolved_model, provider_attempt_id, tool_call_correct,
    critical_safety_failure, authorization_bypass, confirmation_bypass,
    latency_ms, cost_usd, error_code, safe_metadata
  ) values (
    v_id, p_evaluation_id, left(p_case_id, 160), p_case_class,
    greatest(coalesce(p_repetition, 1), 1), coalesce(p_success, false),
    nullif(left(coalesce(p_provider, ''), 80), ''),
    nullif(left(coalesce(p_resolved_model, ''), 160), ''),
    p_provider_attempt_id, p_tool_call_correct,
    coalesce(p_critical_safety_failure, false),
    coalesce(p_authorization_bypass, false),
    coalesce(p_confirmation_bypass, false),
    greatest(coalesce(p_latency_ms, 0), 0),
    greatest(coalesce(p_cost_usd, 0), 0),
    nullif(left(coalesce(p_error_code, ''), 120), ''),
    coalesce(p_safe_metadata, '{}'::jsonb)
  ) on conflict (evaluation_id, case_id, repetition) do nothing
  returning sample_id into v_inserted_id;
  return v_inserted_id;
end;
$$;

create or replace function public.finish_harness_evaluation(
  p_evaluation_id uuid,
  p_status text,
  p_sample_count integer,
  p_metrics jsonb,
  p_variance jsonb,
  p_artifact_sha256 text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('passed', 'failed', 'cancelled') then
    raise exception using errcode = '22023', message = 'HARNESS_EVALUATION_TERMINAL_STATUS_REQUIRED';
  end if;
  if p_sample_count <> (
    select count(*)
    from public.harness_evaluation_samples
    where evaluation_id = p_evaluation_id
  ) then
    raise exception using errcode = '22023', message = 'HARNESS_EVALUATION_SAMPLE_COUNT_MISMATCH';
  end if;
  update public.harness_evaluation_runs
  set status = p_status,
      sample_count = greatest(coalesce(p_sample_count, 0), 0),
      metrics = coalesce(p_metrics, '{}'::jsonb),
      variance = coalesce(p_variance, '{}'::jsonb),
      artifact_sha256 = p_artifact_sha256,
      safe_metadata = safe_metadata || coalesce(p_safe_metadata, '{}'::jsonb),
      finished_at = now()
  where evaluation_id = p_evaluation_id and status = 'running';
  return found;
end;
$$;

revoke all on function public.begin_harness_evaluation(uuid,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.append_harness_evaluation_sample(uuid,uuid,text,text,integer,boolean,text,text,uuid,boolean,boolean,boolean,boolean,integer,numeric,text,jsonb) from public, anon, authenticated;
revoke all on function public.finish_harness_evaluation(uuid,text,integer,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.begin_harness_evaluation(uuid,text,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.append_harness_evaluation_sample(uuid,uuid,text,text,integer,boolean,text,text,uuid,boolean,boolean,boolean,boolean,integer,numeric,text,jsonb) to service_role;
grant execute on function public.finish_harness_evaluation(uuid,text,integer,jsonb,jsonb,text,jsonb) to service_role;

commit;
