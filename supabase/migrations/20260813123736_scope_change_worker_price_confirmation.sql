-- A scope proposal becomes customer-visible only after the assigned worker has
-- seen the exact customer total, commission, and projected net payout.
alter table public.kael_job_incidents
  add column if not exists scope_price_quote_id uuid,
  add column if not exists scope_price_quote jsonb,
  add column if not exists scope_price_quote_revision integer,
  add column if not exists scope_price_quote_expires_at timestamptz,
  add column if not exists scope_price_quote_confirmed_at timestamptz;

alter table public.kael_job_incidents
  add constraint kael_job_incidents_scope_price_quote_shape_check
  check (
    (
      scope_price_quote_id is null
      and scope_price_quote is null
      and scope_price_quote_revision is null
      and scope_price_quote_expires_at is null
      and scope_price_quote_confirmed_at is null
    )
    or (
      scope_price_quote_id is not null
      and jsonb_typeof(scope_price_quote) = 'object'
      and scope_price_quote_revision is not null
      and scope_price_quote_revision >= 0
      and scope_price_quote_expires_at is not null
    )
  );

create or replace function public.save_job_incident_scope_price_quote_atomic(
  p_incident_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_expected_revision integer,
  p_quote_id uuid,
  p_quote jsonb,
  p_quote_expires_at timestamptz
) returns table (
  ok boolean,
  error_code text,
  incident jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_job record;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_incident_id is null or p_job_id is null or p_worker_id is null
    or p_expected_revision is null or p_quote_id is null
    or pg_catalog.jsonb_typeof(p_quote) is distinct from 'object'
    or p_quote_expires_at is null
    or p_quote_expires_at <= v_now
    or p_quote_expires_at > v_now + interval '30 minutes'
    or p_quote ->> 'quote_id' is distinct from p_quote_id::text
    or p_quote ->> 'incident_id' is distinct from p_incident_id::text
    or p_quote ->> 'job_id' is distinct from p_job_id::text
    or p_quote ->> 'schema_version' is distinct from 'scope_change_worker_quote.v1'
    or p_quote ->> 'selection_rule' is distinct from
      'verified_neutral_midpoint_with_bilateral_confirmation'
  then
    return query select false, 'INVALID_QUOTE'::text, null::jsonb;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  select job.worker_id, job.status
    into v_job
    from public.jobs as job
    where job.id = p_job_id;
  if not found or v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, null::jsonb;
    return;
  end if;
  if v_job.status not in (
    'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing'
  ) then
    return query select false, 'STATUS_CHANGED'::text, null::jsonb;
    return;
  end if;

  select incident.*
    into v_incident
    from public.kael_job_incidents as incident
    where incident.id = p_incident_id
      and incident.job_id = p_job_id
    for update;
  if not found
    or v_incident.status <> 'ready_for_scope_proposal'
    or v_incident.evidence_status <> 'ready'
    or v_incident.revision is distinct from p_expected_revision
  then
    return query select false, 'INCIDENT_CLAIM_STALE'::text,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  update public.kael_job_incidents as incident
    set scope_price_quote_id = p_quote_id,
        scope_price_quote = p_quote,
        scope_price_quote_revision = v_incident.revision,
        scope_price_quote_expires_at = p_quote_expires_at,
        scope_price_quote_confirmed_at = null,
        updated_at = v_now
    where incident.id = v_incident.id
    returning incident.* into v_incident;

  return query select true, null::text, pg_catalog.to_jsonb(v_incident);
end;
$function$;

drop function if exists public.claim_job_incident_scope_proposal_atomic(
  uuid, uuid, uuid
);

create or replace function public.claim_job_incident_scope_proposal_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_claim_id uuid,
  p_quote_id uuid
) returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  idempotent boolean,
  incident jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_job record;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null or p_worker_id is null or p_claim_id is null
    or p_quote_id is null
  then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );

  select job.worker_id, job.status
    into v_job
    from public.jobs as job
    where job.id = p_job_id;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false, null::jsonb;
    return;
  end if;

  select incident.*
    into v_incident
    from public.kael_job_incidents as incident
    where incident.job_id = p_job_id
      and (
        (incident.status = 'ready_for_scope_proposal' and incident.evidence_status = 'ready')
        or (incident.status = 'scope_proposed' and incident.scope_change_id is not null)
      )
    order by incident.updated_at desc
    limit 1
    for update;
  if not found then
    return query select false, 'INCIDENT_NOT_READY'::text, false, false, null::jsonb;
    return;
  end if;

  if v_incident.status = 'scope_proposed' then
    if v_incident.scope_price_quote_id is distinct from p_quote_id then
      return query select false, 'QUOTE_CHANGED'::text, false, false,
        pg_catalog.to_jsonb(v_incident);
      return;
    end if;
    return query select true, null::text, false, true,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_job.status not in (
    'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing'
  ) then
    return query select false, 'STATUS_CHANGED'::text, false, false,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.scope_price_quote_id is distinct from p_quote_id
    or pg_catalog.jsonb_typeof(v_incident.scope_price_quote) is distinct from 'object'
    or v_incident.scope_price_quote_revision is distinct from v_incident.revision
    or v_incident.scope_price_quote_expires_at is null
    or v_incident.scope_price_quote_expires_at <= v_now
  then
    return query select false, 'QUOTE_CHANGED'::text, false, false,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  if v_incident.scope_proposal_claim_id = p_claim_id then
    return query select true, null::text, true, true,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.scope_proposal_claim_id is not null
    and v_incident.scope_proposal_claimed_at >= v_now - interval '5 minutes'
  then
    return query select false, 'PROPOSAL_IN_PROGRESS'::text, false, false,
      pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  update public.kael_job_incidents as incident
    set scope_proposal_claim_id = p_claim_id,
        scope_proposal_claimed_at = v_now,
        scope_price_quote_confirmed_at = v_now,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where incident.id = v_incident.id
    returning incident.* into v_incident;

  return query select true, null::text, true, false,
    pg_catalog.to_jsonb(v_incident);
end;
$function$;

create or replace function public.guard_scope_change_worker_quote_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'waiting_customer_decision'::public.scope_change_status
    and not exists (
      select 1
      from public.kael_job_incidents as incident
      where incident.job_id = new.job_id
        and incident.scope_price_quote_id::text =
          new.kael_review #>> '{worker_price_confirmation,quote_id}'
        and incident.scope_price_quote_confirmed_at is not null
        and incident.scope_price_quote_confirmed_at =
          (new.kael_review #>> '{worker_price_confirmation,confirmed_at}')::timestamptz
        and incident.scope_price_quote ->> 'customer_total' = new.kael_computed_min::text
        and incident.scope_price_quote ->> 'platform_fee' =
          new.kael_review #>> '{stakeholder_balance,platform_fee}'
        and incident.scope_price_quote ->> 'worker_net' =
          new.kael_review #>> '{stakeholder_balance,worker_net}'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'scope change is not bound to the worker-confirmed quote';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_scope_change_worker_quote_binding
  on public.scope_change_requests;
create trigger guard_scope_change_worker_quote_binding
before insert or update of status, kael_review on public.scope_change_requests
for each row execute function public.guard_scope_change_worker_quote_binding();

revoke execute on function public.save_job_incident_scope_price_quote_atomic(
  uuid, uuid, uuid, integer, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.save_job_incident_scope_price_quote_atomic(
  uuid, uuid, uuid, integer, uuid, jsonb, timestamptz
) to service_role;

revoke execute on function public.claim_job_incident_scope_proposal_atomic(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_job_incident_scope_proposal_atomic(
  uuid, uuid, uuid, uuid
) to service_role;

revoke all on function public.guard_scope_change_worker_quote_binding()
  from public;
