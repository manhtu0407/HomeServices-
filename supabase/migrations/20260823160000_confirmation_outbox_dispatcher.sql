begin;

alter table public.workflow_outbox
  add column if not exists lease_token uuid,
  add column if not exists leased_by text,
  add column if not exists dead_lettered_at timestamptz;

create index if not exists workflow_outbox_dispatch_claim_idx
  on public.workflow_outbox(next_attempt_at, created_at)
  where event_type = 'matching_requested' and dead_lettered_at is null;

create or replace function public.claim_confirmation_matching_outbox_batch(
  p_dispatcher_id text,
  p_limit integer default 20,
  p_lease_seconds integer default 45
) returns table(
  outbox_id uuid,
  lease_token uuid,
  operation_id uuid,
  customer_id uuid,
  session_id uuid,
  job_id uuid,
  diagnosis_scope jsonb,
  preferred_worker_id uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_dispatcher_id is null or length(p_dispatcher_id) not between 8 and 160
    or p_dispatcher_id !~ '^[A-Za-z0-9_.:-]+$'
    or p_limit is null or p_limit not between 1 and 50
    or p_lease_seconds is null or p_lease_seconds not between 15 and 120
  then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_CLAIM_INVALID';
  end if;

  return query
  with claimable as (
    select outbox.id
    from public.workflow_outbox outbox
    where outbox.event_type = 'matching_requested'
      and outbox.dead_lettered_at is null
      and outbox.attempt_count < 8
      and (
        (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= now())
        or (
          outbox.status = 'processing' and
          coalesce(outbox.lease_expires_at, '-infinity'::timestamptz) <= now()
        )
      )
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.workflow_outbox outbox
    set status = 'processing',
      attempt_count = outbox.attempt_count + 1,
      lease_token = gen_random_uuid(),
      leased_by = p_dispatcher_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      updated_at = now()
    from claimable
    where outbox.id = claimable.id
    returning outbox.id, outbox.lease_token, outbox.operation_id, outbox.attempt_count
  )
  select claimed.id, claimed.lease_token, operation.id, operation.customer_id,
    operation.session_id, operation.job_id, session.diagnosis_scope,
    session.preferred_worker_id, claimed.attempt_count
  from claimed
  join public.confirmation_operations operation on operation.id = claimed.operation_id
  join public.kael_chat_sessions session on session.id = operation.session_id
  where operation.job_id is not null;
end;
$func$;

create or replace function public.settle_confirmation_matching_outbox_claim(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_operation_id uuid,
  p_state text,
  p_error_code text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_outbox public.workflow_outbox%rowtype;
  v_delay_seconds integer;
begin
  if p_outbox_id is null or p_lease_token is null or p_operation_id is null
    or p_state not in ('broadcasting', 'no_reachable_worker', 'recovery_required')
    or (p_state = 'recovery_required' and (
      p_error_code is null or length(p_error_code) not between 1 and 64 or
      p_error_code !~ '^[A-Z][A-Z0-9_]*$'
    ))
    or (p_state <> 'recovery_required' and p_error_code is not null)
  then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_SETTLE_INVALID';
  end if;

  select * into v_outbox
  from public.workflow_outbox outbox
  where outbox.id = p_outbox_id
    and outbox.operation_id = p_operation_id
    and outbox.event_type = 'matching_requested'
    and outbox.status = 'processing'
    and outbox.lease_token = p_lease_token
    and outbox.lease_expires_at > now()
  for update;
  if not found then return 'lease_lost'; end if;

  if p_state <> 'recovery_required' then
    update public.confirmation_operations operation
    set state = p_state,
      last_error_code = null,
      retry_after_ms = null,
      updated_at = now()
    where operation.id = p_operation_id;
    update public.matching_operations matching
    set state = p_state, updated_at = now()
    where matching.confirmation_operation_id = p_operation_id
      and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');
    update public.workflow_outbox outbox
    set status = 'completed', lease_token = null, leased_by = null,
      lease_expires_at = null, last_error_code = null, updated_at = now()
    where outbox.id = p_outbox_id and outbox.lease_token = p_lease_token;
    return 'completed';
  end if;

  v_delay_seconds := least(300, power(2, v_outbox.attempt_count)::integer);
  update public.confirmation_operations operation
  set state = 'recovery_required', last_error_code = p_error_code,
    retry_after_ms = case when v_outbox.attempt_count >= 8 then null else v_delay_seconds * 1000 end,
    updated_at = now()
  where operation.id = p_operation_id;
  update public.matching_operations matching
  set state = 'recovery_required', updated_at = now()
  where matching.confirmation_operation_id = p_operation_id
    and matching.state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');

  if v_outbox.attempt_count >= 8 then
    update public.workflow_outbox outbox
    set status = 'failed', lease_token = null, leased_by = null,
      lease_expires_at = null, dead_lettered_at = now(),
      last_error_code = p_error_code, updated_at = now()
    where outbox.id = p_outbox_id and outbox.lease_token = p_lease_token;
    return 'dead_letter';
  end if;

  update public.workflow_outbox outbox
  set status = 'failed', lease_token = null, leased_by = null,
    lease_expires_at = null,
    next_attempt_at = now() + make_interval(secs => v_delay_seconds),
    last_error_code = p_error_code, updated_at = now()
  where outbox.id = p_outbox_id and outbox.lease_token = p_lease_token;
  return 'retry_scheduled';
end;
$func$;

create or replace function private.kick_confirmation_matching_dispatcher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_project_url text;
  v_maintainer_secret text;
begin
  if new.event_type <> 'matching_requested'
    or to_regclass('vault.decrypted_secrets') is null
  then
    return new;
  end if;

  select max(secret.decrypted_secret) filter (where secret.name = 'project_url'),
    max(secret.decrypted_secret) filter (where secret.name = 'kael_matching_maintainer_secret')
  into v_project_url, v_maintainer_secret
  from vault.decrypted_secrets secret;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_maintainer_secret), '') is null
  then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/kael-matching-maintainer',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-kael-matching-maintainer-secret', v_maintainer_secret
    ),
    body := jsonb_build_object('source', 'confirmation_outbox')
  );
  return new;
exception when others then
  return new;
end;
$func$;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger item
    where item.tgname = 'workflow_outbox_kick_confirmation_dispatcher'
      and item.tgrelid = 'public.workflow_outbox'::regclass
      and not item.tgisinternal
  ) then
    create trigger workflow_outbox_kick_confirmation_dispatcher
    after insert on public.workflow_outbox
    for each row when (new.event_type = 'matching_requested')
    execute function private.kick_confirmation_matching_dispatcher();
  end if;
end;
$block$;

create or replace function public.get_confirmation_matching_outbox_health()
returns table(
  queued_count bigint,
  processing_count bigint,
  retry_count bigint,
  dead_letter_count bigint,
  oldest_ready_age_seconds integer
)
language sql
security definer
set search_path = ''
stable
as $func$
  select
    count(*) filter (where outbox.status = 'queued' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'processing' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.status = 'failed' and outbox.dead_lettered_at is null),
    count(*) filter (where outbox.dead_lettered_at is not null),
    coalesce(max(extract(epoch from now() - outbox.next_attempt_at)) filter (
      where outbox.dead_lettered_at is null and outbox.status in ('queued', 'failed')
        and outbox.next_attempt_at <= now()
    ), 0)::integer
  from public.workflow_outbox outbox
  where outbox.event_type = 'matching_requested';
$func$;

create or replace function public.list_confirmation_matching_outbox_incidents(
  p_limit integer default 50
) returns table(
  outbox_id uuid,
  operation_id uuid,
  attempt_count integer,
  last_error_code text,
  dead_lettered_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $func$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'CONFIRMATION_OUTBOX_INCIDENT_LIMIT_INVALID';
  end if;
  return query
  select outbox.id, outbox.operation_id, outbox.attempt_count,
    outbox.last_error_code, outbox.dead_lettered_at, outbox.updated_at
  from public.workflow_outbox outbox
  where outbox.event_type = 'matching_requested'
    and (outbox.dead_lettered_at is not null or outbox.status = 'failed')
  order by outbox.updated_at desc, outbox.id
  limit p_limit;
end;
$func$;

revoke execute on function public.claim_confirmation_matching_outbox(uuid,uuid,integer),
  public.settle_confirmation_matching_operation(uuid,text,text)
from service_role;

revoke all on function public.claim_confirmation_matching_outbox_batch(text,integer,integer),
  public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text),
  public.get_confirmation_matching_outbox_health(),
  public.list_confirmation_matching_outbox_incidents(integer)
from public, anon, authenticated;

revoke all on function private.kick_confirmation_matching_dispatcher()
from public, anon, authenticated;

grant execute on function public.claim_confirmation_matching_outbox_batch(text,integer,integer),
  public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text),
  public.get_confirmation_matching_outbox_health(),
  public.list_confirmation_matching_outbox_incidents(integer)
to service_role;

comment on function public.claim_confirmation_matching_outbox_batch(text,integer,integer) is
  'Leases a bounded SKIP LOCKED batch so matching progresses independently of Customer polling.';
comment on function public.settle_confirmation_matching_outbox_claim(uuid,uuid,uuid,text,text) is
  'Lease-token CAS settlement with exponential retry and terminal dead-letter evidence.';
comment on function private.kick_confirmation_matching_dispatcher() is
  'Queues an immediate secret-authenticated maintainer wake-up after commit; the minute cron remains the recovery path.';

commit;
