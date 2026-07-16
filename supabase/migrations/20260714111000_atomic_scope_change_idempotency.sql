-- Make direct worker scope-change requests payload-bound and retry-safe before AI spend.

begin;

alter table public.scope_change_requests
  add column if not exists client_request_id uuid;

create unique index if not exists scope_change_requests_worker_client_request_uidx
  on public.scope_change_requests (worker_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.scope_change_request_commands (
  worker_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  new_description text not null check (pg_catalog.char_length(new_description) between 10 and 2000),
  reason text not null check (pg_catalog.char_length(reason) between 10 and 1000),
  evidence_photo_urls text[] not null default '{}'::text[],
  request_state text not null default 'in_flight'
    check (request_state in ('in_flight', 'retryable', 'completed')),
  claim_id uuid,
  claimed_at timestamptz,
  scope_change_id uuid unique references public.scope_change_requests(id) on delete cascade,
  response_payload jsonb,
  last_error_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (worker_id, client_request_id),
  constraint scope_change_request_commands_evidence_check check (
    pg_catalog.cardinality(evidence_photo_urls) <= 5
    and pg_catalog.array_position(evidence_photo_urls, null) is null
  ),
  constraint scope_change_request_commands_state_check check (
    (
      request_state = 'in_flight'
      and claim_id is not null
      and claimed_at is not null
      and scope_change_id is null
      and response_payload is null
    )
    or (
      request_state = 'retryable'
      and claim_id is null
      and claimed_at is null
      and scope_change_id is null
      and response_payload is null
    )
    or (
      request_state = 'completed'
      and claim_id is null
      and claimed_at is null
      and scope_change_id is not null
      and pg_catalog.jsonb_typeof(response_payload) = 'object'
    )
  )
);

create unique index if not exists scope_change_request_commands_active_job_uidx
  on public.scope_change_request_commands (job_id)
  where request_state = 'in_flight';

create index if not exists scope_change_request_commands_lease_idx
  on public.scope_change_request_commands (request_state, claimed_at, updated_at);

alter table public.scope_change_request_commands enable row level security;
revoke all on table public.scope_change_request_commands from public, anon, authenticated;
grant select, insert, update, delete on table public.scope_change_request_commands to service_role;

create table if not exists public.scope_change_request_effects (
  effect_id uuid primary key,
  worker_id uuid not null,
  client_request_id uuid not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  scope_change_id uuid not null references public.scope_change_requests(id) on delete cascade,
  effect_name text not null
    check (effect_name in ('database', 'learning', 'push')),
  effect_state text not null default 'pending'
    check (effect_state in ('pending', 'in_flight', 'completed')),
  payload jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(payload) = 'object'),
  claim_id uuid,
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (worker_id, client_request_id)
    references public.scope_change_request_commands(worker_id, client_request_id)
    on delete cascade,
  unique (worker_id, client_request_id, effect_name),
  constraint scope_change_request_effects_state_check check (
    (
      effect_state = 'pending'
      and claim_id is null
      and claimed_at is null
      and completed_at is null
    )
    or (
      effect_state = 'in_flight'
      and effect_name = 'push'
      and claim_id is not null
      and claimed_at is not null
      and completed_at is null
    )
    or (
      effect_state = 'completed'
      and claim_id is null
      and claimed_at is null
      and completed_at is not null
    )
  )
);

create index if not exists scope_change_request_effects_lease_idx
  on public.scope_change_request_effects (effect_state, claimed_at, updated_at);

alter table public.scope_change_request_effects enable row level security;
revoke all on table public.scope_change_request_effects from public, anon, authenticated;
grant select, insert, update, delete on table public.scope_change_request_effects to service_role;

create or replace function private.scope_change_effects_state(
  p_worker_id uuid,
  p_client_request_id uuid
) returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.jsonb_object_agg(
      effect.effect_name,
      pg_catalog.jsonb_build_object(
        'effect_id', effect.effect_id,
        'state', effect.effect_state,
        'attempt_count', effect.attempt_count
      )
    ),
    '{}'::jsonb
  )
  from public.scope_change_request_effects as effect
  where effect.worker_id = p_worker_id
    and effect.client_request_id = p_client_request_id;
$function$;

revoke execute on function private.scope_change_effects_state(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.request_scope_change_core_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[],
  p_kael_computed_min int,
  p_kael_computed_max int,
  p_kael_review jsonb
) returns table (
  ok boolean,
  error_code text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = ''
as $function$
declare
  v_job record;
  v_scope_change_id uuid;
  v_scope_created_at timestamptz;
  v_updated_job_id uuid;
  v_request_timing text;
begin
  if p_job_id is null
    or p_worker_id is null
    or p_new_description is null
    or pg_catalog.char_length(p_new_description) not between 10 and 2000
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 10 and 1000
    or pg_catalog.cardinality(coalesce(p_evidence_photo_urls, '{}'::text[])) > 5
    or pg_catalog.array_position(p_evidence_photo_urls, null) is not null
  then
    return query select false, 'INVALID_INPUT'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_kael_computed_min is null
    or p_kael_computed_max is null
    or p_kael_computed_min <= 0
    or p_kael_computed_max < p_kael_computed_min
  then
    return query select false, 'KAEL_PRICE_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if p_kael_review is null or pg_catalog.jsonb_typeof(p_kael_review) <> 'object' then
    return query select false, 'KAEL_REVIEW_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if pg_catalog.jsonb_typeof(p_kael_review -> 'price_min') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'price_max') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'confidence') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'problem_summary') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'complexity_assessment') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'disclaimer') is distinct from 'string'
    or (
      pg_catalog.jsonb_typeof(p_kael_review -> 'advisory') is distinct from 'null'
      and pg_catalog.jsonb_typeof(p_kael_review -> 'advisory') is distinct from 'string'
    )
    or pg_catalog.jsonb_typeof(p_kael_review -> 'fallback_used') is distinct from 'boolean'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'anti_fraud') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'worker_challenge') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_kael_review -> 'customer_card') is distinct from 'object'
  then
    return query select false, 'KAEL_REVIEW_MISSING'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  if (p_kael_review ->> 'price_min')::numeric is distinct from p_kael_computed_min::numeric
    or (p_kael_review ->> 'price_max')::numeric is distinct from p_kael_computed_max::numeric
    or (p_kael_review ->> 'confidence')::numeric not between 0 and 1
    or p_kael_review ->> 'complexity_assessment' not in ('small', 'medium', 'large')
    or pg_catalog.char_length(pg_catalog.btrim(p_kael_review ->> 'problem_summary')) not between 1 and 500
    or pg_catalog.char_length(pg_catalog.btrim(p_kael_review ->> 'disclaimer')) < 1
    or pg_catalog.char_length(coalesce(p_kael_review ->> 'advisory', '')) > 400
    or p_kael_review ->> 'fallback_used' is distinct from 'false'
  then
    return query select false, 'KAEL_REVIEW_MISMATCH'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select job.id, job.status, job.worker_id, job.kael_problem_identified
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;
  if v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status
  ) then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  v_request_timing := case
    when v_job.status in (
      'worker_matched'::public.job_status,
      'worker_on_way'::public.job_status,
      'arrived'::public.job_status
    ) then 'pre_arrival'
    else 'on_site'
  end;

  update public.jobs as job
    set status = 'scope_change_pending'::public.job_status,
        scope_change_description = p_new_description,
        scope_change_price_min = p_kael_computed_min,
        scope_change_price_max = p_kael_computed_max,
        scope_change_reason = p_reason
    where job.id = p_job_id
      and job.status = v_job.status
    returning job.id into v_updated_job_id;
  if v_updated_job_id is null then
    return query select false, 'STATUS_CHANGED'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  insert into public.scope_change_requests (
    job_id,
    worker_id,
    client_request_id,
    status,
    original_summary,
    requested_description,
    reason,
    price_min,
    price_max,
    kael_computed_min,
    kael_computed_max,
    kael_review,
    evidence_photo_urls,
    request_timing,
    resume_job_status
  ) values (
    p_job_id,
    p_worker_id,
    p_client_request_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_job.kael_problem_identified,
    p_new_description,
    p_reason,
    p_kael_computed_min,
    p_kael_computed_max,
    p_kael_computed_min,
    p_kael_computed_max,
    p_kael_review,
    coalesce(p_evidence_photo_urls, '{}'::text[]),
    v_request_timing,
    v_job.status
  ) returning id, created_at into v_scope_change_id, v_scope_created_at;

  return query select
    true,
    null::text,
    v_scope_change_id,
    'waiting_customer_decision'::public.scope_change_status,
    v_scope_created_at;
end;
$function$;

revoke execute on function private.request_scope_change_core_atomic(
  uuid, uuid, uuid, text, text, text[], int, int, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.claim_scope_change_request_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_claim_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[]
) returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  replayed boolean,
  request_state text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz,
  response_payload jsonb,
  side_effects_state jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_command public.scope_change_request_commands%rowtype;
  v_other public.scope_change_request_commands%rowtype;
  v_job record;
  v_scope record;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_evidence text[] := coalesce(p_evidence_photo_urls, '{}'::text[]);
begin
  if p_job_id is null
    or p_worker_id is null
    or p_client_request_id is null
    or p_claim_id is null
    or p_new_description is null
    or pg_catalog.char_length(p_new_description) not between 10 and 2000
    or p_reason is null
    or pg_catalog.char_length(p_reason) not between 10 and 1000
    or pg_catalog.cardinality(v_evidence) > 5
    or pg_catalog.array_position(p_evidence_photo_urls, null) is not null
  then
    return query select false, 'INVALID_INPUT'::text, false, false,
      null::text, null::uuid, null::public.scope_change_status,
      null::timestamptz, null::jsonb, null::jsonb;
    return;
  end if;

  select job.worker_id, job.status
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false,
      null::text, null::uuid, null::public.scope_change_status,
      null::timestamptz, null::jsonb, null::jsonb;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false,
      null::text, null::uuid, null::public.scope_change_status,
      null::timestamptz, null::jsonb, null::jsonb;
    return;
  end if;

  select command.*
    into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;

  if found then
    if v_command.job_id is distinct from p_job_id
      or v_command.new_description is distinct from p_new_description
      or v_command.reason is distinct from p_reason
      or v_command.evidence_photo_urls is distinct from v_evidence
    then
      return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, false,
        v_command.request_state, v_command.scope_change_id,
        null::public.scope_change_status, null::timestamptz, null::jsonb,
        null::jsonb;
      return;
    end if;

    if v_command.request_state = 'completed' then
      select scope.status, scope.created_at
        into v_scope
        from public.scope_change_requests as scope
        where scope.id = v_command.scope_change_id;
      if not found then
        raise exception using
          errcode = '23503',
          message = 'COMPLETED_SCOPE_CHANGE_COMMAND_MISSING_SCOPE';
      end if;
      return query select true, null::text, false, true,
        v_command.request_state, v_command.scope_change_id,
        v_scope.status::public.scope_change_status,
        v_scope.created_at::timestamptz,
        v_command.response_payload,
        private.scope_change_effects_state(p_worker_id, p_client_request_id);
      return;
    end if;

    if v_command.request_state = 'in_flight' then
      if v_command.claim_id = p_claim_id then
        return query select true, null::text, true, false,
          v_command.request_state, null::uuid,
          null::public.scope_change_status, null::timestamptz, null::jsonb,
          null::jsonb;
        return;
      end if;
      if v_command.claimed_at >= v_now - interval '5 minutes' then
        return query select false, 'REQUEST_IN_PROGRESS'::text, false, false,
          v_command.request_state, null::uuid,
          null::public.scope_change_status, null::timestamptz, null::jsonb,
          null::jsonb;
        return;
      end if;
      update public.scope_change_request_commands as command
        set request_state = 'retryable',
            claim_id = null,
            claimed_at = null,
            last_error_code = 'STALE_LEASE_RECLAIMED',
            updated_at = v_now
        where command.worker_id = p_worker_id
          and command.client_request_id = p_client_request_id;
    end if;
  end if;

  if v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status
  ) then
    return query select false, 'STATUS_CHANGED'::text, false, false,
      coalesce(v_command.request_state, 'new'), null::uuid,
      null::public.scope_change_status, null::timestamptz, null::jsonb,
      null::jsonb;
    return;
  end if;

  select command.*
    into v_other
    from public.scope_change_request_commands as command
    where command.job_id = p_job_id
      and command.request_state = 'in_flight'
      and (
        command.worker_id <> p_worker_id
        or command.client_request_id <> p_client_request_id
      )
    limit 1
    for update;
  if found then
    if v_other.claimed_at >= v_now - interval '5 minutes' then
      return query select false, 'REQUEST_IN_PROGRESS'::text, false, false,
        v_other.request_state, null::uuid,
        null::public.scope_change_status, null::timestamptz, null::jsonb,
        null::jsonb;
      return;
    end if;
    update public.scope_change_request_commands as command
      set request_state = 'retryable',
          claim_id = null,
          claimed_at = null,
          last_error_code = 'STALE_LEASE_RECLAIMED',
          updated_at = v_now
      where command.worker_id = v_other.worker_id
        and command.client_request_id = v_other.client_request_id;
  end if;

  insert into public.scope_change_request_commands (
    worker_id,
    client_request_id,
    job_id,
    new_description,
    reason,
    evidence_photo_urls,
    request_state,
    claim_id,
    claimed_at,
    last_error_code,
    created_at,
    updated_at
  ) values (
    p_worker_id,
    p_client_request_id,
    p_job_id,
    p_new_description,
    p_reason,
    v_evidence,
    'in_flight',
    p_claim_id,
    v_now,
    null,
    v_now,
    v_now
  ) on conflict (worker_id, client_request_id) do update
    set request_state = 'in_flight',
        claim_id = excluded.claim_id,
        claimed_at = excluded.claimed_at,
        last_error_code = null,
        updated_at = excluded.updated_at
  returning * into v_command;

  return query select true, null::text, true, false,
    v_command.request_state, null::uuid,
    null::public.scope_change_status, null::timestamptz, null::jsonb,
    null::jsonb;
end;
$function$;

create or replace function public.release_scope_change_request_claim_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_claim_id uuid,
  p_error_code text
) returns table (
  released boolean
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_released_job_id uuid;
begin
  if p_job_id is null
    or p_worker_id is null
    or p_client_request_id is null
    or p_claim_id is null
  then
    return query select false;
    return;
  end if;

  select job.id
    into v_released_job_id
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found then
    return query select false;
    return;
  end if;

  v_released_job_id := null;
  update public.scope_change_request_commands as command
    set request_state = 'retryable',
        claim_id = null,
        claimed_at = null,
        last_error_code = pg_catalog.left(
          coalesce(p_error_code, 'SCOPE_CHANGE_PROVIDER_FAILED'),
          120
        ),
        updated_at = pg_catalog.clock_timestamp()
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
      and command.job_id = p_job_id
      and command.request_state = 'in_flight'
      and command.claim_id = p_claim_id
    returning command.job_id into v_released_job_id;

  return query select v_released_job_id is not null;
end;
$function$;

drop function if exists public.request_scope_change_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb
);

create or replace function public.request_scope_change_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_claim_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[],
  p_kael_computed_min int,
  p_kael_computed_max int,
  p_kael_review jsonb,
  p_database_effect_id uuid default pg_catalog.gen_random_uuid(),
  p_database_effect_payload jsonb default '{"api_logs":[],"optimization_metrics":[]}'::jsonb,
  p_learning_effect_id uuid default pg_catalog.gen_random_uuid(),
  p_learning_effect_payload jsonb default '{"destination":"none"}'::jsonb,
  p_push_effect_id uuid default pg_catalog.gen_random_uuid()
) returns table (
  ok boolean,
  error_code text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz,
  replayed boolean,
  response_payload jsonb,
  side_effects_state jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_command public.scope_change_request_commands%rowtype;
  v_job record;
  v_scope record;
  v_response jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_evidence text[] := coalesce(p_evidence_photo_urls, '{}'::text[]);
begin
  if p_job_id is null
    or p_worker_id is null
    or p_client_request_id is null
    or p_claim_id is null
    or p_database_effect_id is null
    or p_learning_effect_id is null
    or p_push_effect_id is null
    or p_database_effect_id in (p_learning_effect_id, p_push_effect_id)
    or p_learning_effect_id = p_push_effect_id
    or pg_catalog.jsonb_typeof(p_database_effect_payload) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_database_effect_payload -> 'api_logs') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_database_effect_payload -> 'optimization_metrics') is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_database_effect_payload -> 'api_logs') > 16
    or pg_catalog.jsonb_array_length(p_database_effect_payload -> 'optimization_metrics') > 16
    or pg_catalog.jsonb_typeof(p_learning_effect_payload) is distinct from 'object'
    or p_learning_effect_payload ->> 'destination' is null
    or p_learning_effect_payload ->> 'destination' not in ('none', 'batch', 'lifecycle')
  then
    return query select false, 'INVALID_INPUT'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  select job.worker_id
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  select command.*
    into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found then
    return query select false, 'SCOPE_CLAIM_STALE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  if v_command.job_id is distinct from p_job_id
    or v_command.new_description is distinct from p_new_description
    or v_command.reason is distinct from p_reason
    or v_command.evidence_photo_urls is distinct from v_evidence
  then
    return query select false, 'IDEMPOTENCY_CONFLICT'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  if v_command.request_state = 'completed' then
    select scope.status, scope.created_at
      into v_scope
      from public.scope_change_requests as scope
      where scope.id = v_command.scope_change_id;
    return query select true, null::text,
      v_command.scope_change_id,
      v_scope.status::public.scope_change_status,
      v_scope.created_at::timestamptz,
      true,
      v_command.response_payload,
      private.scope_change_effects_state(p_worker_id, p_client_request_id);
    return;
  end if;

  if v_command.request_state <> 'in_flight'
    or v_command.claim_id is distinct from p_claim_id
    or v_command.claimed_at < v_now - interval '5 minutes'
  then
    return query select false, 'SCOPE_CLAIM_STALE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  select *
    into v_scope
    from private.request_scope_change_core_atomic(
      p_job_id,
      p_worker_id,
      p_client_request_id,
      p_new_description,
      p_reason,
      v_evidence,
      p_kael_computed_min,
      p_kael_computed_max,
      p_kael_review
    );
  if v_scope.ok is distinct from true then
    update public.scope_change_request_commands as command
      set request_state = 'retryable',
          claim_id = null,
          claimed_at = null,
          last_error_code = v_scope.error_code,
          updated_at = v_now
      where command.worker_id = p_worker_id
        and command.client_request_id = p_client_request_id;
    return query select false, v_scope.error_code::text,
      null::uuid, null::public.scope_change_status, null::timestamptz,
      false, null::jsonb, null::jsonb;
    return;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'scope_change_id', v_scope.scope_change_id,
    'job_id', p_job_id,
    'status', v_scope.scope_status,
    'created_at', v_scope.created_at_ts,
    'kael_estimate', pg_catalog.jsonb_build_object(
      'price_min', p_kael_review -> 'price_min',
      'price_max', p_kael_review -> 'price_max',
      'confidence', p_kael_review -> 'confidence',
      'problem_summary', p_kael_review -> 'problem_summary',
      'advisory', p_kael_review -> 'advisory',
      'complexity_assessment', p_kael_review -> 'complexity_assessment',
      'disclaimer', p_kael_review -> 'disclaimer',
      'fallback_used', p_kael_review -> 'fallback_used'
    ),
    'anti_fraud', coalesce(p_kael_review -> 'anti_fraud', '{}'::jsonb),
    'worker_challenge', coalesce(p_kael_review -> 'worker_challenge', '{}'::jsonb),
    'customer_card', coalesce(p_kael_review -> 'customer_card', '{}'::jsonb)
  );

  insert into public.scope_change_request_effects (
    effect_id,
    worker_id,
    client_request_id,
    job_id,
    scope_change_id,
    effect_name,
    effect_state,
    payload,
    created_at,
    updated_at
  ) values
    (
      p_database_effect_id,
      p_worker_id,
      p_client_request_id,
      p_job_id,
      v_scope.scope_change_id,
      'database',
      'pending',
      p_database_effect_payload,
      v_now,
      v_now
    ),
    (
      p_learning_effect_id,
      p_worker_id,
      p_client_request_id,
      p_job_id,
      v_scope.scope_change_id,
      'learning',
      'pending',
      p_learning_effect_payload,
      v_now,
      v_now
    ),
    (
      p_push_effect_id,
      p_worker_id,
      p_client_request_id,
      p_job_id,
      v_scope.scope_change_id,
      'push',
      'pending',
      '{}'::jsonb,
      v_now,
      v_now
    );

  update public.scope_change_request_commands as command
    set request_state = 'completed',
        claim_id = null,
        claimed_at = null,
        scope_change_id = v_scope.scope_change_id,
        response_payload = v_response,
        last_error_code = null,
        updated_at = v_now
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
      and command.request_state = 'in_flight'
      and command.claim_id = p_claim_id;
  if not found then
    raise exception using
      errcode = '40001',
      message = 'SCOPE_CHANGE_COMMAND_COMPLETION_RACE';
  end if;

  return query select true, null::text,
    v_scope.scope_change_id::uuid,
    v_scope.scope_status::public.scope_change_status,
    v_scope.created_at_ts::timestamptz,
    false,
    v_response,
    private.scope_change_effects_state(p_worker_id, p_client_request_id);
end;
$function$;

create or replace function public.apply_scope_change_database_effect_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_scope_change_id uuid,
  p_effect_id uuid
) returns table (
  ok boolean,
  error_code text,
  completed boolean,
  effect_id uuid
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_job record;
  v_command public.scope_change_request_commands%rowtype;
  v_scope public.scope_change_requests%rowtype;
  v_effect public.scope_change_request_effects%rowtype;
  v_api_logs jsonb;
  v_metrics jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or p_client_request_id is null
    or p_scope_change_id is null or p_effect_id is null
  then
    return query select false, 'INVALID_INPUT'::text, false, p_effect_id;
    return;
  end if;

  -- Keep the global lock order job -> command -> scope -> effect.
  select job.id, job.worker_id, job.customer_id, job.status
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found or v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, p_effect_id;
    return;
  end if;

  select command.*
    into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found
    or v_command.job_id is distinct from p_job_id
    or v_command.scope_change_id is distinct from p_scope_change_id
    or v_command.request_state <> 'completed'
  then
    return query select false, 'COMMAND_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;

  select scope.*
    into v_scope
    from public.scope_change_requests as scope
    where scope.id = p_scope_change_id
    for update;
  if not found
    or v_scope.job_id is distinct from p_job_id
    or v_scope.worker_id is distinct from p_worker_id
    or v_scope.client_request_id is distinct from p_client_request_id
    or v_scope.requested_description is distinct from v_command.new_description
    or v_scope.reason is distinct from v_command.reason
    or v_scope.evidence_photo_urls is distinct from v_command.evidence_photo_urls
    or v_command.response_payload ->> 'scope_change_id' is distinct from p_scope_change_id::text
    or v_command.response_payload ->> 'job_id' is distinct from p_job_id::text
    or (v_command.response_payload #>> '{kael_estimate,price_min}')::numeric
      is distinct from v_scope.kael_computed_min::numeric
    or (v_command.response_payload #>> '{kael_estimate,price_max}')::numeric
      is distinct from v_scope.kael_computed_max::numeric
  then
    return query select false, 'SCOPE_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;

  select effect.*
    into v_effect
    from public.scope_change_request_effects as effect
    where effect.effect_id = p_effect_id
      and effect.worker_id = p_worker_id
      and effect.client_request_id = p_client_request_id
      and effect.job_id = p_job_id
      and effect.scope_change_id = p_scope_change_id
      and effect.effect_name = 'database'
    for update;
  if not found then
    return query select false, 'EFFECT_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;
  if v_effect.effect_state = 'completed' then
    return query select true, null::text, true, v_effect.effect_id;
    return;
  end if;
  if v_effect.effect_state <> 'pending' then
    return query select false, 'EFFECT_IN_PROGRESS'::text, false, v_effect.effect_id;
    return;
  end if;

  v_api_logs := v_effect.payload -> 'api_logs';
  v_metrics := v_effect.payload -> 'optimization_metrics';
  if pg_catalog.jsonb_typeof(v_api_logs) is distinct from 'array'
    or pg_catalog.jsonb_typeof(v_metrics) is distinct from 'array'
    or pg_catalog.jsonb_array_length(v_api_logs) > 16
    or pg_catalog.jsonb_array_length(v_metrics) > 16
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_api_logs) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or item.value ->> 'job_id' is distinct from p_job_id::text
        or item.value ->> 'purpose' is distinct from 'scope_change'
        or item.value ->> 'provider' not in ('anthropic', 'perplexity', 'deepseek')
        or item.value ->> 'request_id' not like
          ('scope-effect:' || p_effect_id::text || ':%')
        or pg_catalog.jsonb_typeof(
          coalesce(item.value -> 'safe_metadata', '{}'::jsonb)
        ) <> 'object'
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_metrics) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'object'
        or item.value ->> 'job_id' is distinct from p_job_id::text
        or item.value ->> 'purpose' is distinct from 'scope_change'
        or item.value ->> 'provider' not in ('anthropic', 'perplexity', 'deepseek')
        or not exists (
          select 1
          from pg_catalog.jsonb_array_elements(v_api_logs) as api(value)
          where api.value ->> 'request_id' = item.value ->> 'request_id'
        )
    )
  then
    return query select false, 'EFFECT_PAYLOAD_INVALID'::text, false, v_effect.effect_id;
    return;
  end if;

  update public.scope_change_requests as scope
    set kael_progress = pg_catalog.jsonb_build_object(
      'current_stage', 'scope_estimating',
      'status', 'completed',
      'progress', 1,
      'failure_reason', null,
      'updated_at', v_now
    )
    where scope.id = p_scope_change_id;

  update public.jobs as job
    set kael_progress = pg_catalog.jsonb_build_object(
      'current_stage', 'scope_estimating',
      'status', 'completed',
      'progress', 1,
      'failure_reason', null,
      'updated_at', v_now
    )
    where job.id = p_job_id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status,
    safe_metadata, created_at
  ) values
    (
      p_job_id,
      p_worker_id,
      'worker'::public.user_role,
      'kael_scope_review_computed',
      null,
      null,
      pg_catalog.jsonb_build_object(
        'fallback_used', v_scope.kael_review -> 'fallback_used',
        'confidence', v_scope.kael_review -> 'confidence',
        'computed_min', v_scope.kael_computed_min,
        'computed_max', v_scope.kael_computed_max,
        'anti_fraud_score', v_scope.kael_review #> '{anti_fraud,score}',
        'challenge_required', v_scope.kael_review #> '{anti_fraud,challenge_required}',
        'scope_effect_id', p_effect_id
      ),
      v_now
    ),
    (
      p_job_id,
      p_worker_id,
      'worker'::public.user_role,
      'worker_requested_scope_change',
      null,
      'scope_change_pending'::public.job_status,
      pg_catalog.jsonb_build_object(
        'scope_change_id', p_scope_change_id,
        'scope_effect_id', p_effect_id
      ),
      v_now
    ),
    (
      p_job_id,
      p_worker_id,
      'worker'::public.user_role,
      'scope_change_notified',
      'scope_change_pending'::public.job_status,
      'scope_change_pending'::public.job_status,
      pg_catalog.jsonb_build_object(
        'scope_change_id', p_scope_change_id,
        'customer_confirmation_required', true,
        'scope_effect_id', p_effect_id
      ),
      v_now
    );

  insert into public.notifications (
    user_id, job_id, event_type, title, body, safe_metadata, created_at
  ) values (
    v_job.customer_id,
    p_job_id,
    'scope_change_requested',
    'Cần duyệt thay đổi phạm vi',
    'Thợ vừa gửi thay đổi phạm vi. Phần thay đổi đang tạm dừng đến khi bạn xác nhận hoặc giữ phạm vi cũ.',
    pg_catalog.jsonb_build_object(
      'scope_change_id', p_scope_change_id,
      'actor', 'worker',
      'customer_confirmation_required', true,
      'scope_effect_id', p_effect_id
    ),
    v_now
  );

  insert into public.api_logs (
    job_id, request_id, purpose, provider, model, input_tokens, output_tokens,
    cost_usd, latency_ms, success, error_code, prompt_version, fallback_used,
    safe_metadata, created_at
  )
  select
    row_data.job_id,
    row_data.request_id,
    row_data.purpose,
    row_data.provider::public.api_provider,
    row_data.model,
    row_data.input_tokens,
    row_data.output_tokens,
    row_data.cost_usd,
    row_data.latency_ms,
    row_data.success,
    row_data.error_code,
    row_data.prompt_version,
    coalesce(row_data.fallback_used, false),
    coalesce(row_data.safe_metadata, '{}'::jsonb),
    v_now
  from pg_catalog.jsonb_to_recordset(v_api_logs) as row_data(
    job_id uuid,
    request_id text,
    purpose text,
    provider text,
    model text,
    input_tokens int,
    output_tokens int,
    cost_usd numeric,
    latency_ms int,
    success boolean,
    error_code text,
    prompt_version text,
    fallback_used boolean,
    safe_metadata jsonb
  );

  insert into public.kael_optimization_metrics (
    request_id, job_id, purpose, provider, model, option_flags,
    enabled_options, cost_before_estimate, cost_actual, latency_ms,
    input_tokens, output_tokens, quality_pass, quality_signal,
    metric_source, safe_metadata, created_at
  )
  select
    row_data.request_id,
    row_data.job_id,
    row_data.purpose,
    row_data.provider::public.api_provider,
    row_data.model,
    coalesce(row_data.option_flags, '{}'::jsonb),
    coalesce(row_data.enabled_options, '{}'::text[]),
    row_data.cost_before_estimate,
    row_data.cost_actual,
    row_data.latency_ms,
    row_data.input_tokens,
    row_data.output_tokens,
    row_data.quality_pass,
    row_data.quality_signal,
    coalesce(row_data.metric_source, 'edge_api_log'),
    coalesce(row_data.safe_metadata, '{}'::jsonb),
    v_now
  from pg_catalog.jsonb_to_recordset(v_metrics) as row_data(
    request_id text,
    job_id uuid,
    purpose text,
    provider text,
    model text,
    option_flags jsonb,
    enabled_options text[],
    cost_before_estimate numeric,
    cost_actual numeric,
    latency_ms int,
    input_tokens int,
    output_tokens int,
    quality_pass boolean,
    quality_signal text,
    metric_source text,
    safe_metadata jsonb
  );

  update public.scope_change_request_effects as effect
    set effect_state = 'completed',
        claim_id = null,
        claimed_at = null,
        completed_at = v_now,
        attempt_count = effect.attempt_count + 1,
        last_error_code = null,
        updated_at = v_now
    where effect.effect_id = v_effect.effect_id;

  return query select true, null::text, true, v_effect.effect_id;
end;
$function$;

create or replace function public.apply_scope_change_learning_effect_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_scope_change_id uuid,
  p_effect_id uuid
) returns table (
  ok boolean,
  error_code text,
  completed boolean,
  effect_id uuid
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_job record;
  v_command public.scope_change_request_commands%rowtype;
  v_scope public.scope_change_requests%rowtype;
  v_effect public.scope_change_request_effects%rowtype;
  v_destination text;
  v_input jsonb;
  v_candidate jsonb;
  v_queue_state text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or p_client_request_id is null
    or p_scope_change_id is null or p_effect_id is null
  then
    return query select false, 'INVALID_INPUT'::text, false, p_effect_id;
    return;
  end if;

  select job.id, job.worker_id
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found or v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, p_effect_id;
    return;
  end if;

  select command.*
    into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found
    or v_command.job_id is distinct from p_job_id
    or v_command.scope_change_id is distinct from p_scope_change_id
    or v_command.request_state <> 'completed'
  then
    return query select false, 'COMMAND_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;

  select scope.*
    into v_scope
    from public.scope_change_requests as scope
    where scope.id = p_scope_change_id
    for update;
  if not found
    or v_scope.job_id is distinct from p_job_id
    or v_scope.worker_id is distinct from p_worker_id
    or v_scope.client_request_id is distinct from p_client_request_id
  then
    return query select false, 'SCOPE_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;

  select effect.*
    into v_effect
    from public.scope_change_request_effects as effect
    where effect.effect_id = p_effect_id
      and effect.worker_id = p_worker_id
      and effect.client_request_id = p_client_request_id
      and effect.job_id = p_job_id
      and effect.scope_change_id = p_scope_change_id
      and effect.effect_name = 'learning'
    for update;
  if not found then
    return query select false, 'EFFECT_BINDING_MISMATCH'::text, false, p_effect_id;
    return;
  end if;
  if v_effect.effect_state = 'completed' then
    return query select true, null::text, true, v_effect.effect_id;
    return;
  end if;

  v_destination := v_effect.payload ->> 'destination';
  v_input := v_effect.payload -> 'input_payload';
  v_candidate := v_effect.payload -> 'candidate_payload';
  v_queue_state := v_effect.payload ->> 'queue_state';
  if v_destination is null
    or v_destination not in ('none', 'batch', 'lifecycle')
    or (
      v_destination <> 'none'
      and (
        pg_catalog.jsonb_typeof(v_input) is distinct from 'object'
        or pg_catalog.jsonb_typeof(v_candidate) is distinct from 'object'
        or v_input ->> 'job_id' is distinct from p_job_id::text
        or v_input ->> 'worker_id' is distinct from p_worker_id::text
        or v_input ->> 'actor_id' is distinct from p_worker_id::text
        or v_input ->> 'actor_role' is distinct from 'worker'
        or v_input ->> 'scope_change_requested' is distinct from 'true'
        or v_candidate ->> 'skill_id' is distinct from 'LS3'
        or v_candidate ->> 'trigger' is distinct from 'post-B6'
        or v_queue_state not in ('queued', 'manual_review', 'rejected')
      )
    )
  then
    return query select false, 'EFFECT_PAYLOAD_INVALID'::text, false, v_effect.effect_id;
    return;
  end if;

  if v_destination = 'batch' then
    insert into public.kael_learning_queue (
      event_type, skill_id, job_id, actor_id, actor_role, queue_state,
      input_payload, candidate_payload, run_after, created_at, updated_at
    ) values (
      'post-B6',
      'LS3',
      p_job_id,
      p_worker_id,
      'worker',
      case when v_queue_state = 'queued' then 'pending' else v_queue_state end,
      v_input,
      v_candidate,
      v_now,
      v_now,
      v_now
    );
  elsif v_destination = 'lifecycle' then
    insert into public.kael_rule_lifecycle_log (
      rule_id, candidate_id, skill_id, job_id, previous_state, next_state,
      transition_reason, actor_id, actor_role, safe_metadata, created_at
    ) values (
      null,
      null,
      'LS3',
      p_job_id,
      null,
      case
        when v_queue_state = 'manual_review' then 'manual_review'
        when v_queue_state = 'rejected' then 'rejected'
        else 'candidate'
      end,
      'queued from post-B6',
      p_worker_id,
      'worker',
      pg_catalog.jsonb_build_object(
        'event_type', 'post-B6',
        'target', v_candidate -> 'target',
        'prompt_version', v_candidate -> 'prompt_version',
        'requires_manual_review', v_candidate -> 'requires_manual_review',
        'payload', v_candidate -> 'payload',
        'rejected_reason', case
          when v_queue_state = 'rejected'
          then v_effect.payload #> '{audit,reason}'
          else 'null'::jsonb
        end,
        'scope_effect_id', p_effect_id
      ),
      v_now
    );
  end if;

  update public.scope_change_request_effects as effect
    set effect_state = 'completed',
        completed_at = v_now,
        attempt_count = effect.attempt_count + 1,
        last_error_code = null,
        updated_at = v_now
    where effect.effect_id = v_effect.effect_id;

  return query select true, null::text, true, v_effect.effect_id;
end;
$function$;

create or replace function public.claim_scope_change_push_effect_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_scope_change_id uuid,
  p_effect_id uuid,
  p_claim_id uuid
) returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  completed boolean,
  effect_id uuid,
  customer_id uuid
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_job record;
  v_command public.scope_change_request_commands%rowtype;
  v_scope public.scope_change_requests%rowtype;
  v_effect public.scope_change_request_effects%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or p_client_request_id is null
    or p_scope_change_id is null or p_effect_id is null or p_claim_id is null
  then
    return query select false, 'INVALID_INPUT'::text, false, false,
      p_effect_id, null::uuid;
    return;
  end if;

  select job.id, job.worker_id, job.customer_id
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update;
  if not found or v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false,
      p_effect_id, null::uuid;
    return;
  end if;

  select command.*
    into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found
    or v_command.job_id is distinct from p_job_id
    or v_command.scope_change_id is distinct from p_scope_change_id
    or v_command.request_state <> 'completed'
  then
    return query select false, 'COMMAND_BINDING_MISMATCH'::text, false, false,
      p_effect_id, null::uuid;
    return;
  end if;

  select scope.*
    into v_scope
    from public.scope_change_requests as scope
    where scope.id = p_scope_change_id
    for update;
  if not found
    or v_scope.job_id is distinct from p_job_id
    or v_scope.worker_id is distinct from p_worker_id
    or v_scope.client_request_id is distinct from p_client_request_id
  then
    return query select false, 'SCOPE_BINDING_MISMATCH'::text, false, false,
      p_effect_id, null::uuid;
    return;
  end if;

  select effect.*
    into v_effect
    from public.scope_change_request_effects as effect
    where effect.effect_id = p_effect_id
      and effect.worker_id = p_worker_id
      and effect.client_request_id = p_client_request_id
      and effect.job_id = p_job_id
      and effect.scope_change_id = p_scope_change_id
      and effect.effect_name = 'push'
    for update;
  if not found then
    return query select false, 'EFFECT_BINDING_MISMATCH'::text, false, false,
      p_effect_id, null::uuid;
    return;
  end if;
  if v_effect.effect_state = 'completed' then
    return query select true, null::text, false, true,
      v_effect.effect_id, v_job.customer_id;
    return;
  end if;
  if v_effect.effect_state = 'in_flight'
    and v_effect.claim_id is distinct from p_claim_id
    and v_effect.claimed_at >= v_now - interval '5 minutes'
  then
    return query select false, 'EFFECT_IN_PROGRESS'::text, false, false,
      v_effect.effect_id, v_job.customer_id;
    return;
  end if;

  update public.scope_change_request_effects as effect
    set effect_state = 'in_flight',
        claim_id = p_claim_id,
        claimed_at = v_now,
        attempt_count = effect.attempt_count + 1,
        last_error_code = case
          when effect.effect_state = 'in_flight' then 'STALE_LEASE_RECLAIMED'
          else null
        end,
        updated_at = v_now
    where effect.effect_id = v_effect.effect_id;

  return query select true, null::text, true, false,
    v_effect.effect_id, v_job.customer_id;
end;
$function$;

create or replace function public.complete_scope_change_push_effect_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_scope_change_id uuid,
  p_effect_id uuid,
  p_claim_id uuid
) returns table (completed boolean)
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_command public.scope_change_request_commands%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform 1
    from public.jobs as job
    where job.id = p_job_id and job.worker_id = p_worker_id
    for update;
  if not found then return query select false; return; end if;

  select command.* into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found or v_command.job_id is distinct from p_job_id
    or v_command.scope_change_id is distinct from p_scope_change_id
    or v_command.request_state <> 'completed'
  then return query select false; return; end if;

  update public.scope_change_request_effects as effect
    set effect_state = 'completed',
        claim_id = null,
        claimed_at = null,
        completed_at = v_now,
        last_error_code = null,
        updated_at = v_now
    where effect.effect_id = p_effect_id
      and effect.worker_id = p_worker_id
      and effect.client_request_id = p_client_request_id
      and effect.job_id = p_job_id
      and effect.scope_change_id = p_scope_change_id
      and effect.effect_name = 'push'
      and effect.effect_state = 'in_flight'
      and effect.claim_id = p_claim_id;
  return query select found;
end;
$function$;

create or replace function public.release_scope_change_push_effect_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_scope_change_id uuid,
  p_effect_id uuid,
  p_claim_id uuid,
  p_error_code text
) returns table (released boolean)
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_command public.scope_change_request_commands%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform 1
    from public.jobs as job
    where job.id = p_job_id and job.worker_id = p_worker_id
    for update;
  if not found then return query select false; return; end if;

  select command.* into v_command
    from public.scope_change_request_commands as command
    where command.worker_id = p_worker_id
      and command.client_request_id = p_client_request_id
    for update;
  if not found or v_command.job_id is distinct from p_job_id
    or v_command.scope_change_id is distinct from p_scope_change_id
    or v_command.request_state <> 'completed'
  then return query select false; return; end if;

  update public.scope_change_request_effects as effect
    set effect_state = 'pending',
        claim_id = null,
        claimed_at = null,
        last_error_code = pg_catalog.left(
          coalesce(p_error_code, 'PUSH_DELIVERY_FAILED'),
          120
        ),
        updated_at = v_now
    where effect.effect_id = p_effect_id
      and effect.worker_id = p_worker_id
      and effect.client_request_id = p_client_request_id
      and effect.job_id = p_job_id
      and effect.scope_change_id = p_scope_change_id
      and effect.effect_name = 'push'
      and effect.effect_state = 'in_flight'
      and effect.claim_id = p_claim_id;
  return query select found;
end;
$function$;

create or replace function public.request_job_incident_scope_change_atomic(
  p_incident_id uuid,
  p_claim_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[],
  p_kael_computed_min int,
  p_kael_computed_max int,
  p_kael_review jsonb
) returns table (
  ok boolean,
  error_code text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_scope record;
  v_now timestamptz;
begin
  if p_incident_id is null or p_claim_id is null
    or p_job_id is null or p_worker_id is null
  then
    return query select false, 'INVALID_INPUT'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  select incident.*
    into v_incident
    from public.kael_job_incidents as incident
    where incident.id = p_incident_id
      and incident.job_id = p_job_id
    for update;
  if not found
    or v_incident.status <> 'ready_for_scope_proposal'
    or v_incident.evidence_status <> 'ready'
    or v_incident.scope_proposal_claim_id is distinct from p_claim_id
  then
    return query select false, 'INCIDENT_CLAIM_STALE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select *
    into v_scope
    from private.request_scope_change_core_atomic(
      p_job_id,
      p_worker_id,
      null,
      p_new_description,
      p_reason,
      p_evidence_photo_urls,
      p_kael_computed_min,
      p_kael_computed_max,
      p_kael_review
    );
  if v_scope.ok is distinct from true then
    return query select false, v_scope.error_code::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  v_now := pg_catalog.clock_timestamp();
  update public.kael_job_incidents as incident
    set status = 'scope_proposed',
        scope_change_id = v_scope.scope_change_id,
        scope_proposal_claim_id = null,
        scope_proposal_claimed_at = null,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where incident.id = v_incident.id
    returning incident.* into v_incident;

  insert into public.kael_job_incident_events (
    incident_id,
    job_id,
    source_kind,
    actor_role,
    actor_id,
    content,
    media_refs,
    safe_metadata,
    created_at
  ) values (
    v_incident.id,
    p_job_id,
    'scope_proposed',
    'worker',
    p_worker_id,
    null,
    '[]'::jsonb,
    pg_catalog.jsonb_build_object('scope_change_id', v_scope.scope_change_id),
    v_now
  );

  return query select true, null::text,
    v_scope.scope_change_id::uuid,
    v_scope.scope_status::public.scope_change_status,
    v_scope.created_at_ts::timestamptz;
end;
$function$;

drop function if exists public.request_scope_change_atomic(
  uuid, uuid, text, text, text[], int, int, jsonb
);

revoke execute on function public.claim_scope_change_request_atomic(
  uuid, uuid, uuid, uuid, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.claim_scope_change_request_atomic(
  uuid, uuid, uuid, uuid, text, text, text[]
) to service_role;

revoke execute on function public.release_scope_change_request_claim_atomic(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.release_scope_change_request_claim_atomic(
  uuid, uuid, uuid, uuid, text
) to service_role;

revoke execute on function public.request_scope_change_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb,
  uuid, jsonb, uuid, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.request_scope_change_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb,
  uuid, jsonb, uuid, jsonb, uuid
) to service_role;

revoke execute on function public.apply_scope_change_database_effect_atomic(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.apply_scope_change_database_effect_atomic(
  uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke execute on function public.apply_scope_change_learning_effect_atomic(
  uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.apply_scope_change_learning_effect_atomic(
  uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke execute on function public.claim_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke execute on function public.complete_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.complete_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid
) to service_role;

revoke execute on function public.release_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.release_scope_change_push_effect_atomic(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) to service_role;

revoke execute on function public.request_job_incident_scope_change_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb
) from public, anon, authenticated;
grant execute on function public.request_job_incident_scope_change_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb
) to service_role;

comment on column public.scope_change_requests.client_request_id is
  'Direct worker request id persisted for durable idempotency; legacy and incident-originated rows remain null.';
comment on table public.scope_change_request_commands is
  'Service-only durable claim, payload binding, lease, and replay state for direct worker scope changes.';
comment on table public.scope_change_request_effects is
  'Replayable post-commit database, learning, and leased external-push effects for direct scope changes.';
comment on function public.claim_scope_change_request_atomic(
  uuid, uuid, uuid, uuid, text, text, text[]
) is
  'Claims an exact direct scope-change request before provider spend, or replays its completed response.';

commit;
