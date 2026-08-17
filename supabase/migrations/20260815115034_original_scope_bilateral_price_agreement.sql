-- A server-frozen point quote turns the verified estimate range into one exact
-- original-scope agreement. The worker confirms it by accepting the broadcast;
-- the customer confirms the same immutable quote when choosing that worker.

alter table public.job_broadcasts
  add column if not exists original_scope_price_quote jsonb;

alter table public.job_worker_candidates
  add column if not exists original_scope_price_quote jsonb;

create or replace function private.is_valid_original_scope_price_quote(
  p_quote jsonb,
  p_job_id uuid,
  p_worker_id uuid,
  p_broadcast_id uuid,
  p_expires_at timestamptz,
  p_require_worker_confirmation boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reference_min integer;
  v_reference_max integer;
  v_customer_total integer;
  v_platform_fee integer;
  v_worker_net integer;
  v_commission_level integer;
  v_commission_rate_bps integer;
  v_receipt jsonb;
  v_scenarios jsonb;
  v_fairness jsonb;
  v_baseline jsonb;
  v_baseline_sources integer := 0;
  v_market_sources integer := 0;
  v_high_trust_sources integer := 0;
  v_required_quorum integer := 0;
  v_confidence numeric;
  v_quote_expires_at timestamptz;
  v_worker_confirmed_at timestamptz;
  v_baseline_quorum boolean := false;
  v_market_quorum boolean := false;
begin
  if p_quote is null
    or pg_catalog.jsonb_typeof(p_quote) <> 'object'
    or p_quote ->> 'schema_version' <> 'original_scope_price_quote.v1'
    or p_quote ->> 'selection_rule'
      <> 'verified_neutral_midpoint_with_bilateral_confirmation'
    or p_quote -> 'worker_confirmation_required' <> 'true'::jsonb
    or p_quote -> 'customer_confirmation_required' <> 'true'::jsonb
    or p_quote ->> 'job_id' is distinct from p_job_id::text
    or p_quote ->> 'worker_id' is distinct from p_worker_id::text
    or p_quote ->> 'broadcast_id' is distinct from p_broadcast_id::text
    or p_quote ->> 'quote_id'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(p_quote -> 'reference_price_min') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'reference_price_max') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'customer_total') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'platform_fee') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'worker_net') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'commission_level') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'commission_rate_bps') <> 'number'
    or nullif(pg_catalog.btrim(p_quote ->> 'price_source'), '') is null
    or nullif(pg_catalog.btrim(p_quote ->> 'expires_at'), '') is null
  then
    return false;
  end if;

  v_reference_min := (p_quote ->> 'reference_price_min')::integer;
  v_reference_max := (p_quote ->> 'reference_price_max')::integer;
  v_customer_total := (p_quote ->> 'customer_total')::integer;
  v_platform_fee := (p_quote ->> 'platform_fee')::integer;
  v_worker_net := (p_quote ->> 'worker_net')::integer;
  v_commission_level := (p_quote ->> 'commission_level')::integer;
  v_commission_rate_bps := (p_quote ->> 'commission_rate_bps')::integer;
  v_quote_expires_at := (p_quote ->> 'expires_at')::timestamptz;

  if p_quote ->> 'worker_confirmed_at' is not null then
    v_worker_confirmed_at := (p_quote ->> 'worker_confirmed_at')::timestamptz;
  end if;

  if v_reference_min <= 0
    or v_reference_max < v_reference_min
    or v_customer_total <> pg_catalog.round(
      ((v_reference_min + v_reference_max)::numeric / 2) / 1000
    )::integer * 1000
    or v_customer_total not between v_reference_min and v_reference_max
    or v_platform_fee < 0
    or v_worker_net <= 0
    or v_commission_level < 1
    or v_commission_rate_bps not between 0 and 1500
    or v_platform_fee <> pg_catalog.round(
      v_customer_total::numeric * v_commission_rate_bps / 10000.0
    )::integer
    or v_worker_net <> v_customer_total - v_platform_fee
    or v_quote_expires_at is distinct from p_expires_at
    or (
      p_require_worker_confirmation
      and (v_worker_confirmed_at is null or v_worker_confirmed_at > v_quote_expires_at)
    )
    or (not p_require_worker_confirmation and v_worker_confirmed_at is not null)
  then
    return false;
  end if;

  v_receipt := p_quote -> 'reasoning_receipt';
  v_scenarios := v_receipt -> 'scenarios';
  v_fairness := v_receipt -> 'fairness';
  if pg_catalog.jsonb_typeof(v_receipt) <> 'object'
    or v_receipt ->> 'schema_version' <> 'price_reasoning_receipt.v1'
    or pg_catalog.jsonb_typeof(v_scenarios) <> 'object'
    or pg_catalog.jsonb_typeof(v_fairness) <> 'object'
    or (v_scenarios #>> '{low,total}')::integer <> v_reference_min
    or (v_scenarios #>> '{high,total}')::integer <> v_reference_max
    or v_fairness ->> 'price_source' is distinct from p_quote ->> 'price_source'
    or nullif(pg_catalog.btrim(v_fairness ->> 'cap_statement'), '') is null
    or pg_catalog.jsonb_typeof(v_fairness -> 'confidence') <> 'number'
  then
    return false;
  end if;

  v_confidence := (v_fairness ->> 'confidence')::numeric;
  if v_confidence < 0 or v_confidence > 1 then
    return false;
  end if;

  v_baseline := v_fairness -> 'baseline_evidence';
  if pg_catalog.jsonb_typeof(v_baseline) = 'object'
    and v_baseline ->> 'schema_version' = 'baseline_price_evidence_receipt.v1'
    and v_baseline -> 'quorum_met' = 'true'::jsonb
    and pg_catalog.jsonb_typeof(v_baseline -> 'sources') = 'array'
  then
    v_baseline_sources := (v_baseline ->> 'accepted_source_count')::integer;
    v_high_trust_sources := (v_baseline ->> 'high_trust_source_count')::integer;
    v_required_quorum := (v_baseline ->> 'required_quorum')::integer;
    v_baseline_quorum := v_baseline_sources > 0
      and v_required_quorum > 0
      and v_high_trust_sources >= v_required_quorum
      and pg_catalog.jsonb_array_length(v_baseline -> 'sources') = v_baseline_sources;
  end if;

  if pg_catalog.jsonb_typeof(v_fairness -> 'market_source_count') = 'number' then
    v_market_sources := (v_fairness ->> 'market_source_count')::integer;
  end if;
  if pg_catalog.jsonb_typeof(v_fairness -> 'high_trust_source_count') = 'number' then
    v_high_trust_sources := (v_fairness ->> 'high_trust_source_count')::integer;
  end if;
  v_market_quorum := v_fairness -> 'quorum_met' = 'true'::jsonb
    and v_market_sources >= 2
    and v_high_trust_sources >= 1;

  return v_baseline_quorum or v_market_quorum;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.is_valid_original_scope_price_quote(
  jsonb, uuid, uuid, uuid, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function private.is_valid_original_scope_price_quote(
  jsonb, uuid, uuid, uuid, timestamptz, boolean
) to service_role;

alter table public.job_broadcasts
  drop constraint if exists job_broadcasts_original_scope_price_quote_check;
alter table public.job_broadcasts
  add constraint job_broadcasts_original_scope_price_quote_check
  check (
    original_scope_price_quote is null
    or private.is_valid_original_scope_price_quote(
      original_scope_price_quote,
      job_id,
      worker_id,
      id,
      expires_at,
      false
    )
  );

alter table public.job_worker_candidates
  drop constraint if exists job_worker_candidates_original_scope_price_quote_check;
alter table public.job_worker_candidates
  add constraint job_worker_candidates_original_scope_price_quote_check
  check (
    original_scope_price_quote is null
    or private.is_valid_original_scope_price_quote(
      original_scope_price_quote,
      job_id,
      worker_id,
      broadcast_id,
      expires_at,
      true
    )
  );

create unique index if not exists job_broadcasts_original_scope_quote_id_idx
  on public.job_broadcasts ((original_scope_price_quote ->> 'quote_id'))
  where original_scope_price_quote is not null;

create unique index if not exists job_worker_candidates_original_scope_quote_id_idx
  on public.job_worker_candidates ((original_scope_price_quote ->> 'quote_id'))
  where original_scope_price_quote is not null;

create or replace function private.protect_candidate_original_scope_price_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.original_scope_price_quote is not null
    and new.original_scope_price_quote is distinct from old.original_scope_price_quote
  then
    raise exception 'candidate original-scope price quote is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists job_worker_candidates_immutable_price_quote
  on public.job_worker_candidates;
create trigger job_worker_candidates_immutable_price_quote
before update on public.job_worker_candidates
for each row execute function private.protect_candidate_original_scope_price_quote();

revoke all on function private.protect_candidate_original_scope_price_quote()
  from public;

create or replace function public.activate_job_broadcast_batch_atomic(
  p_job_id uuid,
  p_worker_ids uuid[],
  p_batch_id uuid,
  p_sent_at timestamptz,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  worker_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_customer_total integer;
  v_reasoning_receipt jsonb;
begin
  if p_job_id is null
     or p_worker_ids is null
     or pg_catalog.cardinality(p_worker_ids) not between 1 and 5
     or pg_catalog.array_position(p_worker_ids, null) is not null
     or p_batch_id is null
     or p_sent_at is null
     or p_expires_at is null
     or p_expires_at <= p_sent_at then
    raise exception 'invalid worker broadcast batch input' using errcode = '22023';
  end if;

  select
    job.status,
    job.kael_price_min,
    job.kael_price_max,
    job.kael_estimate_card_v3
  into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'worker broadcast job not found' using errcode = 'P0002';
  end if;
  if v_job.status is distinct from 'broadcasting'::public.job_status then
    raise exception 'worker broadcast job is not active' using errcode = '55000';
  end if;
  if v_job.kael_price_min is null
    or v_job.kael_price_min <= 0
    or v_job.kael_price_max is null
    or v_job.kael_price_max < v_job.kael_price_min
  then
    raise exception 'worker broadcast price range is unavailable' using errcode = '23514';
  end if;

  v_reasoning_receipt := v_job.kael_estimate_card_v3
    #> '{card,price_reasoning_receipt}';
  v_customer_total := pg_catalog.round(
    ((v_job.kael_price_min + v_job.kael_price_max)::numeric / 2) / 1000
  )::integer * 1000;

  return query
  with candidate as (
    select
      worker_ids.worker_id,
      tier.commission_level,
      tier.commission_rate_bps,
      extensions.gen_random_uuid() as quote_id,
      extensions.gen_random_uuid() as broadcast_id
    from (
      select distinct listed.worker_id
      from pg_catalog.unnest(p_worker_ids) as listed(worker_id)
    ) as worker_ids
    cross join lateral private.resolve_worker_commission_tier(worker_ids.worker_id) as tier
  )
  insert into public.job_broadcasts as existing (
    id,
    job_id,
    worker_id,
    status,
    broadcast_at,
    sent_at,
    responded_at,
    expires_at,
    batch_id,
    original_scope_price_quote
  )
  select
    candidate.broadcast_id,
    p_job_id,
    candidate.worker_id,
    'sent'::public.broadcast_status,
    p_sent_at,
    p_sent_at,
    null,
    p_expires_at,
    p_batch_id,
    pg_catalog.jsonb_build_object(
      'schema_version', 'original_scope_price_quote.v1',
      'quote_id', candidate.quote_id,
      'job_id', p_job_id,
      'worker_id', candidate.worker_id,
      'broadcast_id', candidate.broadcast_id,
      'reference_price_min', v_job.kael_price_min,
      'reference_price_max', v_job.kael_price_max,
      'customer_total', v_customer_total,
      'platform_fee', pg_catalog.round(
        v_customer_total::numeric * candidate.commission_rate_bps / 10000.0
      )::integer,
      'worker_net', v_customer_total - pg_catalog.round(
        v_customer_total::numeric * candidate.commission_rate_bps / 10000.0
      )::integer,
      'commission_level', candidate.commission_level,
      'commission_rate_bps', candidate.commission_rate_bps,
      'price_source', v_reasoning_receipt #>> '{fairness,price_source}',
      'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
      'worker_confirmation_required', true,
      'customer_confirmation_required', true,
      'worker_confirmed_at', null,
      'expires_at', p_expires_at,
      'reasoning_receipt', v_reasoning_receipt
    )
  from candidate
  on conflict on constraint job_broadcasts_job_id_worker_id_key do update
    set status = excluded.status,
        broadcast_at = excluded.broadcast_at,
        sent_at = excluded.sent_at,
        responded_at = null,
        expires_at = excluded.expires_at,
        batch_id = excluded.batch_id,
        original_scope_price_quote = pg_catalog.jsonb_set(
          excluded.original_scope_price_quote,
          '{broadcast_id}',
          pg_catalog.to_jsonb(existing.id),
          true
        )
    where existing.status = 'expired'::public.broadcast_status
       or (
         existing.status = 'accepted'::public.broadcast_status
         and not exists (
           select 1
           from public.job_worker_candidates as candidate_guard
           where candidate_guard.job_id = p_job_id
             and candidate_guard.worker_id = existing.worker_id
             and candidate_guard.status = 'proposed'
             and (
               candidate_guard.expires_at is null
               or candidate_guard.expires_at > p_sent_at
             )
         )
       )
  returning existing.id, existing.worker_id;
end;
$$;

revoke execute on function public.activate_job_broadcast_batch_atomic(
  uuid, uuid[], uuid, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.activate_job_broadcast_batch_atomic(
  uuid, uuid[], uuid, timestamptz, timestamptz
) to service_role;

drop function if exists public.accept_broadcast_atomic(uuid, uuid, uuid);
create function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_quote_id uuid
)
returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  already_applied boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_broadcast record;
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_quote_id uuid;
  v_candidate_expires_at timestamptz;
  v_candidate_quote jsonb;
  v_now timestamptz := now();
begin
  if p_quote_id is null then
    return query select false, 'PRICE_QUOTE_REQUIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select j.id, j.status, j.service_type, j.address_district
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select jb.id, jb.status, jb.expires_at, jb.original_scope_price_quote
    into v_broadcast
    from public.job_broadcasts as jb
    where jb.job_id = p_job_id
      and jb.worker_id = p_worker_id
      and jb.status in (
        'sent'::public.broadcast_status,
        'accepted'::public.broadcast_status
      )
    order by jb.sent_at desc nulls last,
      jb.broadcast_at desc nulls last,
      jb.id desc
    limit 1
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_job.status = 'worker_candidate_pending'::public.job_status then
    select c.id, c.worker_id, c.status, c.original_scope_price_quote
      into v_candidate
      from public.job_worker_candidates as c
      where c.job_id = p_job_id
        and c.worker_id = p_worker_id
        and c.status = 'proposed'
      order by c.proposed_at desc, c.id desc
      limit 1;

    if found
      and v_candidate.original_scope_price_quote ->> 'quote_id' = p_quote_id::text
    then
      return query select true, null::text,
        'worker_candidate_pending'::public.job_status,
        v_candidate.id, true;
      return;
    end if;

    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  if v_job.status <> 'broadcasting'::public.job_status then
    return query select false, 'ALREADY_TAKEN'::text,
      v_job.status, null::uuid, false;
    return;
  end if;

  if v_broadcast.status <> 'sent'::public.broadcast_status then
    return query select false, 'BROADCAST_NOT_ACTIVE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if v_broadcast.expires_at is not null and v_broadcast.expires_at <= v_now then
    update public.job_broadcasts as jb
      set status = 'expired'::public.broadcast_status,
          responded_at = v_now
      where jb.id = v_broadcast.id
        and jb.status = 'sent'::public.broadcast_status;
    return query select false, 'EXPIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  if not private.is_valid_original_scope_price_quote(
    v_broadcast.original_scope_price_quote,
    p_job_id,
    p_worker_id,
    v_broadcast.id,
    v_broadcast.expires_at,
    false
  ) then
    return query select false, 'PRICE_QUOTE_INVALID'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  v_quote_id := (v_broadcast.original_scope_price_quote ->> 'quote_id')::uuid;
  if v_quote_id is distinct from p_quote_id then
    return query select false, 'PRICE_QUOTE_CHANGED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.selected_service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = p_worker_id
    for update;

  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);

  if v_job_district is null
    or v_job_district = 'hcmc_all'
    or not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_worker.selected_service_types is null
    or cardinality(v_worker.selected_service_types) = 0
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = p_worker_id
        and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = p_worker_id
        and active_job.id <> p_job_id
        and active_job.status in (
          'worker_matched'::public.job_status,
          'worker_on_way'::public.job_status,
          'arrived'::public.job_status,
          'inspecting'::public.job_status,
          'repairing'::public.job_status,
          'scope_change_pending'::public.job_status,
          'completed_by_worker'::public.job_status
        )
      limit 1
    )
    or exists (
      select 1
      from public.job_worker_candidates as reserved
      where reserved.worker_id = p_worker_id
        and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and reserved.expires_at > v_now
      limit 1
    )
  then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  v_candidate_expires_at := v_now + interval '10 minutes';
  v_candidate_quote := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      v_broadcast.original_scope_price_quote,
      '{worker_confirmed_at}',
      pg_catalog.to_jsonb(v_now),
      true
    ),
    '{expires_at}',
    pg_catalog.to_jsonb(v_candidate_expires_at),
    true
  );

  insert into public.job_worker_candidates (
    job_id,
    worker_id,
    broadcast_id,
    status,
    proposed_at,
    expires_at,
    original_scope_price_quote
  ) values (
    p_job_id,
    p_worker_id,
    v_broadcast.id,
    'proposed',
    v_now,
    v_candidate_expires_at,
    v_candidate_quote
  )
  returning id, worker_id, status into v_candidate;

  update public.jobs as j
    set status = 'worker_candidate_pending'::public.job_status,
        worker_id = null,
        matched_at = null
    where j.id = p_job_id
      and j.status = 'broadcasting'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while proposing worker';
  end if;

  update public.job_broadcasts as jb
    set status = 'accepted'::public.broadcast_status,
        responded_at = v_now
    where jb.id = v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  update public.job_broadcasts as jb
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where jb.job_id = p_job_id
      and jb.id <> v_broadcast.id
      and jb.status = 'sent'::public.broadcast_status;

  return query select true, null::text,
    'worker_candidate_pending'::public.job_status,
    v_candidate.id, false;
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid, uuid)
  to service_role;

create or replace function public.accept_broadcast_atomic(
  p_job_id uuid,
  p_worker_id uuid
)
returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  already_applied boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_quote_id uuid;
begin
  select (broadcast.original_scope_price_quote ->> 'quote_id')::uuid
  into v_quote_id
  from public.job_broadcasts as broadcast
  where broadcast.job_id = p_job_id
    and broadcast.worker_id = p_worker_id
    and broadcast.status in (
      'sent'::public.broadcast_status,
      'accepted'::public.broadcast_status
    )
  order by broadcast.sent_at desc nulls last,
    broadcast.broadcast_at desc nulls last,
    broadcast.id desc
  limit 1;

  if v_quote_id is null then
    return query select false, 'PRICE_QUOTE_REQUIRED'::text,
      null::public.job_status, null::uuid, false;
    return;
  end if;

  return query
  select *
  from public.accept_broadcast_atomic(p_job_id, p_worker_id, v_quote_id);
end;
$func$;

revoke execute on function public.accept_broadcast_atomic(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_broadcast_atomic(uuid, uuid)
  to service_role;

create or replace function public.confirm_worker_candidate_atomic(
  p_job_id uuid,
  p_candidate_id uuid,
  p_customer_id uuid
)
returns table (
  ok boolean,
  error_code text,
  job_status public.job_status,
  candidate_id uuid,
  worker_id uuid,
  already_applied boolean
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_candidate record;
  v_job record;
  v_worker record;
  v_job_district text;
  v_customer_total integer;
  v_commission_level integer;
  v_commission_rate_bps integer;
  v_now timestamptz := now();
begin
  select j.id, j.status, j.customer_id, j.worker_id, j.matched_at,
      j.service_type, j.address_district, j.final_price
    into v_job
    from public.jobs as j
    where j.id = p_job_id
    for update;

  if not found or v_job.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND'::text,
      null::public.job_status, null::uuid, null::uuid, false;
    return;
  end if;

  select c.id, c.worker_id, c.broadcast_id, c.status, c.expires_at,
      c.original_scope_price_quote
    into v_candidate
    from public.job_worker_candidates as c
    where c.id = p_candidate_id
      and c.job_id = p_job_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      v_job.status, null::uuid, null::uuid, false;
    return;
  end if;

  if v_candidate.status = 'proposed'
    and v_candidate.expires_at is not null
    and v_candidate.expires_at <= v_now
  then
    update public.job_worker_candidates
      set status = 'expired', updated_at = v_now
      where id = v_candidate.id and status = 'proposed';
    update public.jobs
      set status = 'broadcasting'::public.job_status,
          worker_id = null,
          matched_at = null,
          broadcast_at = null
      where id = p_job_id
        and customer_id = p_customer_id
        and status = 'worker_candidate_pending'::public.job_status;
    return query select false, 'EXPIRED'::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  if v_candidate.status = 'customer_confirmed'
    and v_job.worker_id = v_candidate.worker_id
    and v_job.status in (
      'worker_matched'::public.job_status,
      'worker_on_way'::public.job_status,
      'arrived'::public.job_status,
      'inspecting'::public.job_status,
      'repairing'::public.job_status,
      'scope_change_pending'::public.job_status,
      'completed_by_worker'::public.job_status,
      'confirmed_by_customer'::public.job_status,
      'payment_pending'::public.job_status,
      'paid'::public.job_status,
      'reviewed'::public.job_status
    )
    and (
      v_candidate.original_scope_price_quote is null
      or v_job.final_price = (
        v_candidate.original_scope_price_quote ->> 'customer_total'
      )::integer
      or exists (
        select 1
        from public.scope_change_requests as scope
        where scope.job_id = p_job_id
          and scope.status = 'approved_by_customer'::public.scope_change_status
          and scope.kael_computed_max = v_job.final_price
      )
    )
  then
    return query select true, null::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;

  if v_candidate.status <> 'proposed'
    or v_job.status <> 'worker_candidate_pending'::public.job_status
  then
    return query select false, 'INVALID_STATUS'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  if not private.is_valid_original_scope_price_quote(
    v_candidate.original_scope_price_quote,
    p_job_id,
    v_candidate.worker_id,
    v_candidate.broadcast_id,
    v_candidate.expires_at,
    true
  ) then
    return query select false, 'PRICE_QUOTE_INVALID'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  v_customer_total := (
    v_candidate.original_scope_price_quote ->> 'customer_total'
  )::integer;
  v_commission_level := (
    v_candidate.original_scope_price_quote ->> 'commission_level'
  )::integer;
  v_commission_rate_bps := (
    v_candidate.original_scope_price_quote ->> 'commission_rate_bps'
  )::integer;

  select wp.id, wp.is_approved, wp.is_available, wp.is_suspended,
      wp.selected_service_types, wp.districts
    into v_worker
    from public.worker_profiles as wp
    where wp.id = v_candidate.worker_id
    for update;

  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);

  if not found
    or v_worker.is_approved is not true
    or v_worker.is_available is not true
    or v_worker.is_suspended is true
    or v_job_district is null
    or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or cardinality(v_worker.selected_service_types) = 0
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or cardinality(v_worker.districts) = 0
    or not (
      v_job_district = any(v_worker.districts)
      or 'hcmc_all' = any(v_worker.districts)
    )
    or exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = v_candidate.worker_id
        and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1
      from public.jobs as active_job
      where active_job.worker_id = v_candidate.worker_id
        and active_job.id <> p_job_id
        and active_job.status in (
          'worker_matched'::public.job_status,
          'worker_on_way'::public.job_status,
          'arrived'::public.job_status,
          'inspecting'::public.job_status,
          'repairing'::public.job_status,
          'scope_change_pending'::public.job_status,
          'completed_by_worker'::public.job_status
        )
      limit 1
    )
  then
    update public.job_worker_candidates as c
      set status = 'withdrawn',
          updated_at = v_now
      where c.id = v_candidate.id
        and c.status = 'proposed';
    update public.jobs as j
      set status = 'broadcasting'::public.job_status,
          worker_id = null,
          matched_at = null,
          broadcast_at = null
      where j.id = p_job_id
        and j.customer_id = p_customer_id
        and j.status = 'worker_candidate_pending'::public.job_status;
    return query select false, 'WORKER_NOT_ELIGIBLE'::text,
      'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.job_worker_candidates as c
    set status = 'customer_confirmed',
        customer_decided_at = v_now,
        updated_at = v_now
    where c.id = v_candidate.id
      and c.status = 'proposed';

  if not found then
    return query select false, 'STATUS_CHANGED'::text,
      v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.jobs as j
    set worker_id = v_candidate.worker_id,
        status = 'worker_matched'::public.job_status,
        matched_at = v_now,
        final_price = v_customer_total,
        worker_commission_level = v_commission_level,
        worker_commission_rate_bps = v_commission_rate_bps
    where j.id = p_job_id
      and j.customer_id = p_customer_id
      and j.status = 'worker_candidate_pending'::public.job_status;

  if not found then
    raise exception using errcode = '40001',
      message = 'job status changed while confirming worker';
  end if;

  return query select true, null::text,
    'worker_matched'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$func$;

revoke execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_worker_candidate_atomic(uuid, uuid, uuid)
  to service_role;

create or replace function public.guard_bilateral_final_price_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.final_price is null
    or (tg_op = 'UPDATE' and new.final_price is not distinct from old.final_price)
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.job_worker_candidates as candidate
    where candidate.job_id = new.id
      and candidate.worker_id = new.worker_id
      and candidate.status = 'customer_confirmed'
      and candidate.customer_decided_at is not null
      and candidate.customer_decided_at <= candidate.expires_at
      and private.is_valid_original_scope_price_quote(
        candidate.original_scope_price_quote,
        candidate.job_id,
        candidate.worker_id,
        candidate.broadcast_id,
        candidate.expires_at,
        true
      )
      and (candidate.original_scope_price_quote ->> 'customer_total')::integer
        = new.final_price
  ) and not exists (
    select 1
    from public.scope_change_requests as scope
    where scope.job_id = new.id
      and scope.status = 'approved_by_customer'::public.scope_change_status
      and scope.kael_computed_min = new.final_price
      and scope.kael_computed_max = new.final_price
      and pg_catalog.jsonb_typeof(scope.kael_review) = 'object'
      and scope.kael_review ->> 'price_source' = 'verified_baseline'
      and scope.kael_review ->> 'pricing_mode' = 'full_scope_total'
      and scope.kael_review ->> 'selection_rule'
        = 'verified_neutral_midpoint_with_bilateral_confirmation'
      and scope.kael_review #>> '{worker_price_confirmation,confirmed}' = 'true'
      and nullif(pg_catalog.btrim(
        scope.kael_review #>> '{worker_price_confirmation,quote_id}'
      ), '') is not null
      and nullif(pg_catalog.btrim(
        scope.kael_review #>> '{worker_price_confirmation,confirmed_at}'
      ), '') is not null
      and scope.kael_review #>> '{stakeholder_balance,customer_confirmation_required}' = 'true'
      and scope.kael_review #>> '{stakeholder_balance,worker_confirmation_required}' = 'true'
      and (scope.kael_review #>> '{stakeholder_balance,customer_total}')::numeric
        = new.final_price
  ) then
    raise exception using
      errcode = '23514',
      message = 'final price requires bilateral verified approval';
  end if;

  return new;
end;
$$;

comment on column public.job_broadcasts.original_scope_price_quote is
  'Server-frozen exact quote shown to the worker before broadcast acceptance.';
comment on column public.job_worker_candidates.original_scope_price_quote is
  'Immutable original-scope quote confirmed by the worker and awaiting the owning customer decision.';
comment on column public.jobs.final_price is
  'Exact payable service price set by a customer-confirmed worker quote or a later bilaterally approved verified scope-change receipt.';
