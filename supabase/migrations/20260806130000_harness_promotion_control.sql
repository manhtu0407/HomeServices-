begin;

create table public.harness_promotions (
  promotion_id uuid primary key default gen_random_uuid(),
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('preview', 'staging', 'production')),
  state text not null default 'assembled' check (state in ('assembled', 'verified', 'staging', 'shadow', 'canary', 'production', 'aborted', 'rolled_back')),
  rollback_release_id text references public.harness_releases(release_id),
  evaluation_report_id uuid,
  human_approval_id text,
  cohort text,
  observation_window_minutes integer check (observation_window_minutes is null or observation_window_minutes > 0),
  packet_sha256 text not null check (packet_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (release_id, environment)
);

create table public.harness_promotion_events (
  event_id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.harness_promotions(promotion_id) on delete cascade,
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('preview', 'staging', 'production')),
  previous_state text,
  next_state text not null,
  result text not null check (result in ('accepted', 'rejected', 'aborted', 'rolled_back')),
  actor_role text not null check (actor_role in ('admin', 'system')),
  actor_id uuid,
  approval_id text,
  evidence_sha256 text check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 8192),
  occurred_at timestamptz not null default now()
);

create table public.harness_kill_switches (
  environment text not null check (environment in ('preview', 'staging', 'production')),
  switch_id text not null check (switch_id in ('global_ai', 'provider_anthropic', 'provider_perplexity', 'provider_deepseek', 'tool_market_lookup', 'tool_vision', 'learning_promotion', 'payment_sepay')),
  enabled boolean not null default false,
  reason_code text,
  release_id text references public.harness_releases(release_id),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 4096),
  primary key (environment, switch_id)
);

create table public.harness_kill_switch_events (
  event_id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('preview', 'staging', 'production')),
  switch_id text not null,
  previous_enabled boolean not null,
  enabled boolean not null,
  reason_code text,
  release_id text references public.harness_releases(release_id),
  actor_id uuid not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 4096),
  occurred_at timestamptz not null default now()
);

create table public.harness_slo_observations (
  observation_id uuid primary key default gen_random_uuid(),
  slo_id text not null,
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('staging', 'production')),
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  target numeric not null check (target > 0 and target <= 1),
  actual numeric not null check (actual >= 0 and actual <= 1),
  passed boolean generated always as (actual >= target) stored,
  owner text not null,
  runbook text not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object' and octet_length(safe_metadata::text) <= 4096),
  created_at timestamptz not null default now(),
  check (window_ended_at > window_started_at)
);

create index harness_promotion_events_release_idx on public.harness_promotion_events(release_id, occurred_at desc);
create index harness_kill_switch_events_idx on public.harness_kill_switch_events(environment, switch_id, occurred_at desc);
create index harness_slo_release_idx on public.harness_slo_observations(release_id, created_at desc);

alter table public.harness_promotions enable row level security;
alter table public.harness_promotion_events enable row level security;
alter table public.harness_kill_switches enable row level security;
alter table public.harness_kill_switch_events enable row level security;
alter table public.harness_slo_observations enable row level security;

create policy harness_promotions_admin_read on public.harness_promotions for select to authenticated using (private.is_admin());
create policy harness_promotion_events_admin_read on public.harness_promotion_events for select to authenticated using (private.is_admin());
create policy harness_kill_switches_admin_read on public.harness_kill_switches for select to authenticated using (private.is_admin());
create policy harness_kill_switch_events_admin_read on public.harness_kill_switch_events for select to authenticated using (private.is_admin());
create policy harness_slo_observations_admin_read on public.harness_slo_observations for select to authenticated using (private.is_admin());

grant select on public.harness_promotions, public.harness_promotion_events, public.harness_kill_switches, public.harness_kill_switch_events, public.harness_slo_observations to authenticated;
revoke all on public.harness_kill_switches, public.harness_kill_switch_events from service_role;
grant select on public.harness_kill_switches, public.harness_kill_switch_events to service_role;

drop trigger if exists harness_promotion_events_append_only on public.harness_promotion_events;
create trigger harness_promotion_events_append_only before update or delete on public.harness_promotion_events
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists harness_kill_switch_events_append_only on public.harness_kill_switch_events;
create trigger harness_kill_switch_events_append_only before update or delete on public.harness_kill_switch_events
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists harness_slo_observations_append_only on public.harness_slo_observations;
create trigger harness_slo_observations_append_only before update or delete on public.harness_slo_observations
for each row execute function public.reject_harness_append_only_mutation();

create or replace function public.transition_harness_promotion(
  p_release_id text,
  p_environment text,
  p_expected_state text,
  p_next_state text,
  p_packet_sha256 text,
  p_evaluation_report_id uuid,
  p_rollback_release_id text,
  p_approval_id text,
  p_actor_id uuid,
  p_reason_code text default null,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns table (ok boolean, error_code text, promotion_id uuid, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promotion public.harness_promotions%rowtype;
  v_release public.harness_releases%rowtype;
  v_rollback public.harness_releases%rowtype;
  v_admin boolean := false;
  v_allowed boolean := false;
begin
  if p_release_id is null
     or nullif(trim(p_release_id), '') is null
     or char_length(p_release_id) > 160
     or p_environment not in ('preview', 'staging', 'production')
     or p_packet_sha256 is null
     or p_packet_sha256 !~ '^[0-9a-f]{64}$'
     or p_expected_state is null or p_next_state is null
     or jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object'
     or coalesce(p_safe_metadata, '{}'::jsonb)::text ~* '(token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp)' then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::text;
    return;
  end if;
  if p_actor_id is not null then
    select exists(select 1 from public.profiles profile where profile.id = p_actor_id and profile.role = 'admin'::public.user_role) into v_admin;
  end if;
  if p_next_state not in ('verified') and (
    not v_admin
    or nullif(trim(coalesce(p_approval_id, '')), '') is null
    or char_length(trim(coalesce(p_approval_id, ''))) > 120
  ) then
    return query select false, 'HUMAN_APPROVAL_REQUIRED'::text, null::uuid, null::text;
    return;
  end if;
  v_allowed := (p_expected_state, p_next_state) in (
    ('assembled','verified'), ('verified','staging'), ('staging','shadow'),
    ('shadow','canary'), ('canary','production'), ('staging','aborted'),
    ('shadow','aborted'), ('canary','aborted'), ('production','rolled_back'),
    ('aborted','rolled_back')
  );
  if not v_allowed then
    return query select false, 'INVALID_TRANSITION'::text, null::uuid, null::text;
    return;
  end if;
  if p_next_state in ('canary', 'production', 'rolled_back') and p_rollback_release_id is null then
    return query select false, 'ROLLBACK_RELEASE_REQUIRED'::text, null::uuid, null::text;
    return;
  end if;
  select * into v_release
  from public.harness_releases release
  where release.release_id = p_release_id and release.environment = p_environment;
  if not found then
    return query select false, 'RELEASE_ENVIRONMENT_MISMATCH'::text, null::uuid, null::text;
    return;
  end if;
  if p_next_state = 'verified' and (p_evaluation_report_id is null or not exists (
    select 1 from public.harness_evaluation_runs evaluation
    where evaluation.evaluation_id = p_evaluation_report_id
      and evaluation.release_id = p_release_id
      and evaluation.git_sha = v_release.git_sha
      and evaluation.prompt_bundle_sha256 = v_release.prompt_bundle_sha256
      and evaluation.policy_bundle_sha256 = v_release.policy_bundle_sha256
      and evaluation.status = 'passed'
  )) then
    return query select false, 'PASSING_EVALUATION_REQUIRED'::text, null::uuid, null::text;
    return;
  end if;
  if p_rollback_release_id is not null then
    select * into v_rollback
    from public.harness_releases rollback
    where rollback.release_id = p_rollback_release_id
      and rollback.environment = p_environment;
    if not found then
      return query select false, 'ROLLBACK_RELEASE_ENVIRONMENT_MISMATCH'::text, null::uuid, null::text;
      return;
    end if;
    if v_rollback.release_id = v_release.release_id
       or v_rollback.migration_inventory_sha256 <> v_release.migration_inventory_sha256
       or v_rollback.database_types_sha256 <> v_release.database_types_sha256 then
      return query select false, 'ROLLBACK_RELEASE_INCOMPATIBLE'::text, null::uuid, null::text;
      return;
    end if;
  end if;
  if p_next_state = 'production' and exists (
    select 1
    from (values
      ('mobile-api-availability'),
      ('kael-confirmation-integrity'),
      ('provider-cost-reconciliation'),
      ('promotion-drift-free')
    ) as required(slo_id)
    where not exists (
      select 1 from public.harness_slo_observations observation
      where observation.release_id = p_release_id
        and observation.environment = p_environment
        and observation.slo_id = required.slo_id
        and observation.passed
        and observation.created_at >= now() - interval '24 hours'
    )
  ) then
    return query select false, 'SLO_GATE_FAILED'::text, null::uuid, null::text;
    return;
  end if;
  if not exists (
    select 1 from public.harness_promotions promotion
    where promotion.release_id = p_release_id and promotion.environment = p_environment
  ) and p_expected_state <> 'assembled' then
    return query select false, 'STALE_PROMOTION_STATE'::text, null::uuid, null::text;
    return;
  end if;

  insert into public.harness_promotions (
    release_id, environment, state, rollback_release_id,
    evaluation_report_id, human_approval_id, cohort, observation_window_minutes,
    packet_sha256, safe_metadata
  ) values (
    p_release_id, p_environment, p_next_state, p_rollback_release_id,
    p_evaluation_report_id, p_approval_id,
    nullif(left(coalesce(p_safe_metadata->>'cohort', ''), 120), ''),
    case when coalesce(p_safe_metadata->>'observation_window_minutes', '') ~ '^[0-9]+$'
      then greatest((p_safe_metadata->>'observation_window_minutes')::integer, 1) else null end,
    p_packet_sha256, coalesce(p_safe_metadata, '{}'::jsonb)
  ) on conflict (release_id, environment) do update
    set state = excluded.state,
        rollback_release_id = coalesce(excluded.rollback_release_id, public.harness_promotions.rollback_release_id),
        evaluation_report_id = coalesce(excluded.evaluation_report_id, public.harness_promotions.evaluation_report_id),
        human_approval_id = coalesce(excluded.human_approval_id, public.harness_promotions.human_approval_id),
        cohort = coalesce(excluded.cohort, public.harness_promotions.cohort),
        observation_window_minutes = coalesce(excluded.observation_window_minutes, public.harness_promotions.observation_window_minutes),
        packet_sha256 = excluded.packet_sha256,
        safe_metadata = public.harness_promotions.safe_metadata || excluded.safe_metadata,
        updated_at = now()
    where public.harness_promotions.state = p_expected_state
  returning * into v_promotion;

  if not found then
    return query select false, 'STALE_PROMOTION_STATE'::text, null::uuid, null::text;
    return;
  end if;

  insert into public.harness_promotion_events (
    promotion_id, release_id, environment, previous_state, next_state,
    result, actor_role, actor_id, approval_id, evidence_sha256, reason_code, safe_metadata
  ) values (
    v_promotion.promotion_id, p_release_id, p_environment, p_expected_state, p_next_state,
    case when p_next_state = 'aborted' then 'aborted' when p_next_state = 'rolled_back' then 'rolled_back' else 'accepted' end,
    case when v_admin then 'admin' else 'system' end, p_actor_id, p_approval_id,
    p_packet_sha256, nullif(left(coalesce(p_reason_code, ''), 120), ''),
    coalesce(p_safe_metadata, '{}'::jsonb)
  );

  insert into public.harness_release_events (
    release_id, environment, event_type, actor_role, approval_id, evidence_sha256, safe_metadata
  ) values (
    p_release_id, p_environment,
    case
      when p_next_state = 'verified' then 'evaluated'
      when p_next_state = 'rolled_back' then 'rolled_back'
      when p_next_state = 'aborted' then 'rejected'
      else 'promoted'
    end,
    case when v_admin then 'admin' else 'system' end, p_approval_id, p_packet_sha256,
    jsonb_build_object('previous_state', p_expected_state, 'next_state', p_next_state)
  );

  return query select true, null::text, v_promotion.promotion_id, v_promotion.state;
end;
$$;

create or replace function public.record_harness_slo_observation(
  p_slo_id text,
  p_release_id text,
  p_environment text,
  p_window_started_at timestamptz,
  p_window_ended_at timestamptz,
  p_actual numeric,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target numeric;
  v_owner text;
  v_runbook text;
  v_id uuid;
begin
  select definition.target, definition.owner, definition.runbook
  into v_target, v_owner, v_runbook
  from (values
    ('mobile-api-availability', 0.995::numeric, 'platform', 'docs/ops/harness/mobile-api-incident.md'),
    ('kael-confirmation-integrity', 1.0::numeric, 'ai-runtime', 'docs/ops/harness/confirmation-integrity.md'),
    ('provider-cost-reconciliation', 0.999::numeric, 'ai-runtime', 'docs/ops/harness/provider-cost.md'),
    ('promotion-drift-free', 1.0::numeric, 'release-engineering', 'docs/ops/harness/release-drift.md')
  ) as definition(slo_id, target, owner, runbook)
  where definition.slo_id = p_slo_id;

  if v_target is null
     or p_environment not in ('staging', 'production')
     or p_window_ended_at <= p_window_started_at
     or p_actual < 0 or p_actual > 1
     or not exists (
       select 1 from public.harness_releases release
       where release.release_id = p_release_id and release.environment = p_environment
     )
     or jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object'
     or coalesce(p_safe_metadata, '{}'::jsonb)::text ~* '(token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp)' then
    raise exception using errcode = '22023', message = 'HARNESS_SLO_OBSERVATION_INVALID';
  end if;

  insert into public.harness_slo_observations (
    slo_id, release_id, environment, window_started_at, window_ended_at,
    target, actual, owner, runbook, safe_metadata
  ) values (
    p_slo_id, p_release_id, p_environment, p_window_started_at, p_window_ended_at,
    v_target, p_actual, v_owner, v_runbook, coalesce(p_safe_metadata, '{}'::jsonb)
  ) returning observation_id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_harness_kill_switch(
  p_environment text,
  p_switch_id text,
  p_enabled boolean,
  p_reason_code text,
  p_release_id text,
  p_actor_id uuid,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous boolean := false;
begin
  if p_environment not in ('preview', 'staging', 'production')
     or p_switch_id not in ('global_ai', 'provider_anthropic', 'provider_perplexity', 'provider_deepseek', 'tool_market_lookup', 'tool_vision', 'learning_promotion', 'payment_sepay')
     or p_enabled is null
     or p_actor_id is null
     or jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object'
     or coalesce(p_safe_metadata, '{}'::jsonb)::text ~* '(token|secret|password|authorization|cookie|credential|api[_-]?key|service[_-]?role|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp)'
     or (p_release_id is not null and not exists (
       select 1 from public.harness_releases release
       where release.release_id = p_release_id and release.environment = p_environment
     ))
     or not exists (select 1 from public.profiles profile where profile.id = p_actor_id and profile.role = 'admin'::public.user_role) then
    return false;
  end if;
  select switch.enabled into v_previous
  from public.harness_kill_switches switch
  where switch.environment = p_environment and switch.switch_id = p_switch_id;
  v_previous := coalesce(v_previous, false);

  insert into public.harness_kill_switches (
    environment, switch_id, enabled, reason_code, release_id, changed_by, safe_metadata
  ) values (
    p_environment, p_switch_id, p_enabled,
    nullif(left(coalesce(p_reason_code, ''), 120), ''), p_release_id,
    p_actor_id, coalesce(p_safe_metadata, '{}'::jsonb)
  ) on conflict (environment, switch_id) do update
    set enabled = excluded.enabled, reason_code = excluded.reason_code,
        release_id = excluded.release_id, changed_by = excluded.changed_by,
        changed_at = now(), safe_metadata = excluded.safe_metadata;

  insert into public.harness_kill_switch_events (
    environment, switch_id, previous_enabled, enabled, reason_code,
    release_id, actor_id, safe_metadata
  ) values (
    p_environment, p_switch_id, v_previous, p_enabled,
    nullif(left(coalesce(p_reason_code, ''), 120), ''),
    p_release_id, p_actor_id, coalesce(p_safe_metadata, '{}'::jsonb)
  );
  return true;
end;
$$;

create or replace function public.read_harness_kill_switch(
  p_environment text,
  p_switch_id text
)
returns table (enabled boolean, reason_code text)
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(switch.enabled, false), switch.reason_code
  from (select 1) seed
  left join public.harness_kill_switches switch
    on switch.environment = p_environment and switch.switch_id = p_switch_id;
$$;

revoke all on function public.transition_harness_promotion(text,text,text,text,text,uuid,text,text,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.record_harness_slo_observation(text,text,text,timestamptz,timestamptz,numeric,jsonb) from public, anon, authenticated;
revoke all on function public.set_harness_kill_switch(text,text,boolean,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.read_harness_kill_switch(text,text) from public, anon, authenticated;
grant execute on function public.transition_harness_promotion(text,text,text,text,text,uuid,text,text,uuid,text,jsonb) to service_role;
grant execute on function public.record_harness_slo_observation(text,text,text,timestamptz,timestamptz,numeric,jsonb) to service_role;
grant execute on function public.set_harness_kill_switch(text,text,boolean,text,text,uuid,jsonb) to service_role;
grant execute on function public.read_harness_kill_switch(text,text) to service_role;

comment on table public.harness_promotions is 'Stateful promotion controller for one immutable Harness release and environment.';
comment on table public.harness_kill_switches is 'Narrow environment-scoped containment switches; no secret values.';
comment on table public.harness_kill_switch_events is 'Append-only audit trail for every containment switch transition.';

commit;
