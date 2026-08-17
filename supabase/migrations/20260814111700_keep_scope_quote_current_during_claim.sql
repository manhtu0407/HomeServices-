-- Confirming a quote advances the incident revision. Advance the quote binding
-- in the same write so retries see the active lease; later evidence still makes
-- the quote stale by advancing only the incident revision.
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
        scope_price_quote_revision = v_incident.revision + 1,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where incident.id = v_incident.id
    returning incident.* into v_incident;

  return query select true, null::text, true, false,
    pg_catalog.to_jsonb(v_incident);
end;
$function$;

revoke execute on function public.claim_job_incident_scope_proposal_atomic(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_job_incident_scope_proposal_atomic(
  uuid, uuid, uuid, uuid
) to service_role;
