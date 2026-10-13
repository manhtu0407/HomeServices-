-- Keep the worker-confirmed quote bound to its server analysis so proposal can
-- revalidate current catalog and commission data without another AI request.
create schema if not exists private;

create table if not exists private.kael_scope_change_quote_basis (
  quote_id uuid primary key,
  incident_id uuid not null references public.kael_job_incidents(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null,
  incident_revision integer not null check (incident_revision >= 0),
  expires_at timestamptz not null,
  analysis jsonb not null check (
    jsonb_typeof(analysis) = 'object'
    and octet_length(analysis::text) <= 12288
    and analysis ->> 'fallback_used' = 'false'
    and analysis ->> 'schema_version' = 'scope_change_kael_review.v2'
  ),
  created_at timestamptz not null default clock_timestamp()
);

alter table private.kael_scope_change_quote_basis enable row level security;
revoke all on table private.kael_scope_change_quote_basis from public, anon, authenticated;
grant all on table private.kael_scope_change_quote_basis to service_role;

create or replace function public.save_job_incident_scope_quote_with_basis_atomic(
  p_incident_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_expected_revision integer,
  p_quote_id uuid,
  p_quote jsonb,
  p_quote_expires_at timestamptz,
  p_analysis jsonb
) returns table (
  ok boolean,
  error_code text,
  incident jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_saved record;
  v_rows integer;
begin
  if p_analysis is null
    or pg_catalog.jsonb_typeof(p_analysis) is distinct from 'object'
    or pg_catalog.octet_length(p_analysis::text) > 12288
    or p_analysis ->> 'fallback_used' is distinct from 'false'
    or p_analysis ->> 'schema_version' is distinct from 'scope_change_kael_review.v2'
    or p_analysis ->> 'provider' not in ('anthropic', 'deepseek')
  then
    return query select false, 'INVALID_QUOTE_ANALYSIS'::text, null::jsonb;
    return;
  end if;

  select * into v_saved
    from public.save_job_incident_scope_price_quote_atomic(
      p_incident_id,
      p_job_id,
      p_worker_id,
      p_expected_revision,
      p_quote_id,
      p_quote,
      p_quote_expires_at
    );
  if v_saved.ok is distinct from true then
    return query select v_saved.ok, v_saved.error_code, v_saved.incident;
    return;
  end if;

  delete from private.kael_scope_change_quote_basis as basis
    where basis.incident_id = p_incident_id
      and basis.quote_id is distinct from p_quote_id;

  insert into private.kael_scope_change_quote_basis (
    quote_id, incident_id, job_id, worker_id, incident_revision,
    expires_at, analysis
  ) values (
    p_quote_id, p_incident_id, p_job_id, p_worker_id, p_expected_revision,
    p_quote_expires_at, p_analysis
  )
  on conflict (quote_id) do update
    set incident_id = excluded.incident_id,
        job_id = excluded.job_id,
        worker_id = excluded.worker_id,
        incident_revision = excluded.incident_revision,
        expires_at = excluded.expires_at,
        analysis = excluded.analysis,
        created_at = clock_timestamp()
    where private.kael_scope_change_quote_basis.incident_id = excluded.incident_id
      and private.kael_scope_change_quote_basis.job_id = excluded.job_id
      and private.kael_scope_change_quote_basis.worker_id = excluded.worker_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception using errcode = '23505', message = 'SCOPE_QUOTE_BASIS_CONFLICT';
  end if;

  return query select v_saved.ok, v_saved.error_code, v_saved.incident;
end;
$function$;

revoke execute on function public.save_job_incident_scope_quote_with_basis_atomic(
  uuid, uuid, uuid, integer, uuid, jsonb, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.save_job_incident_scope_quote_with_basis_atomic(
  uuid, uuid, uuid, integer, uuid, jsonb, timestamptz, jsonb
) to service_role;

create or replace function public.load_job_incident_scope_quote_basis(
  p_quote_id uuid,
  p_job_id uuid,
  p_worker_id uuid
) returns table (
  incident_id uuid,
  incident_revision integer,
  expires_at timestamptz,
  analysis jsonb
) language sql stable security definer
set search_path = ''
as $function$
  select basis.incident_id, basis.incident_revision, basis.expires_at, basis.analysis
  from private.kael_scope_change_quote_basis as basis
  join public.kael_job_incidents as incident
    on incident.id = basis.incident_id
   and incident.job_id = basis.job_id
   and incident.scope_price_quote_id = basis.quote_id
  where basis.quote_id = p_quote_id
    and basis.job_id = p_job_id
    and basis.worker_id = p_worker_id
    and basis.expires_at > pg_catalog.clock_timestamp()
    and incident.status in ('ready_for_scope_proposal', 'scope_proposed')
    -- Claiming advances incident revision once; replay keeps the same server analysis bound.
    and (
      incident.scope_price_quote_revision = basis.incident_revision
      or (
        incident.scope_proposal_claim_id is not null
        and incident.scope_price_quote_revision = incident.revision
        and incident.revision = basis.incident_revision + 1
      )
    );
$function$;

revoke execute on function public.load_job_incident_scope_quote_basis(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.load_job_incident_scope_quote_basis(uuid, uuid, uuid)
  to service_role;

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
  if p_job_id is null or p_worker_id is null or p_claim_id is null or p_quote_id is null then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );

  select job.worker_id, job.status into v_job
    from public.jobs as job where job.id = p_job_id;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false, null::jsonb;
    return;
  end if;

  select incident.* into v_incident
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
      return query select false, 'QUOTE_CHANGED'::text, false, false, pg_catalog.to_jsonb(v_incident);
      return;
    end if;
    return query select true, null::text, false, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_job.status not in ('worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing') then
    return query select false, 'STATUS_CHANGED'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.scope_price_quote_id is distinct from p_quote_id
    or pg_catalog.jsonb_typeof(v_incident.scope_price_quote) is distinct from 'object'
    or v_incident.scope_price_quote_revision is distinct from v_incident.revision
    or v_incident.scope_price_quote_expires_at is null
    or v_incident.scope_price_quote_expires_at <= v_now
    or not exists (
      select 1
      from private.kael_scope_change_quote_basis as basis
      where basis.quote_id = p_quote_id
        and basis.incident_id = v_incident.id
        and basis.job_id = p_job_id
        and basis.worker_id = p_worker_id
        -- The first claim advances revision; an active or stale claim retains that quote.
        and (
          basis.incident_revision = v_incident.revision
          or (
            v_incident.scope_proposal_claim_id is not null
            and basis.incident_revision + 1 = v_incident.revision
          )
        )
        and basis.expires_at = v_incident.scope_price_quote_expires_at
        and basis.expires_at > v_now
    )
  then
    return query select false, 'QUOTE_CHANGED'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  if v_incident.scope_proposal_claim_id = p_claim_id then
    return query select true, null::text, true, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.scope_proposal_claim_id is not null
    and v_incident.scope_proposal_claimed_at >= v_now - interval '5 minutes'
  then
    return query select false, 'PROPOSAL_IN_PROGRESS'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  -- Reclaim an expired lease without changing the already-confirmed quote revision.
  update public.kael_job_incidents as incident
    set scope_proposal_claim_id = p_claim_id,
        scope_proposal_claimed_at = v_now,
        scope_price_quote_confirmed_at = case
          when v_incident.scope_proposal_claim_id is null then v_now
          else v_incident.scope_price_quote_confirmed_at
        end,
        scope_price_quote_revision = case
          when v_incident.scope_proposal_claim_id is null then v_incident.revision + 1
          else v_incident.scope_price_quote_revision
        end,
        revision = case
          when v_incident.scope_proposal_claim_id is null then v_incident.revision + 1
          else v_incident.revision
        end,
        updated_at = v_now
    where incident.id = v_incident.id
    returning incident.* into v_incident;

  return query select true, null::text, true, false, pg_catalog.to_jsonb(v_incident);
end;
$function$;

revoke execute on function public.claim_job_incident_scope_proposal_atomic(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_job_incident_scope_proposal_atomic(uuid, uuid, uuid, uuid)
  to service_role;
