-- Keep broadcast creation single-writer across Edge isolates without overloading
-- jobs.broadcast_at, which remains the business timestamp used by reporting.

create table if not exists public.job_broadcast_retry_claims (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  claim_token uuid not null,
  claimed_at timestamptz not null,
  expires_at timestamptz not null,
  constraint job_broadcast_retry_claims_expiry_check
    check (expires_at > claimed_at)
);

create index if not exists job_broadcast_retry_claims_expires_at_idx
  on public.job_broadcast_retry_claims (expires_at);

alter table public.job_broadcast_retry_claims enable row level security;
revoke all on table public.job_broadcast_retry_claims from public, anon, authenticated;
grant select, insert, update, delete on table public.job_broadcast_retry_claims to service_role;

drop function if exists public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, timestamptz, integer);
drop function if exists public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer);
create function public.claim_job_broadcast_retry_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer default 180
)
returns table (
  claimed boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_status public.job_status;
  v_claimed boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_job_id is null
     or p_customer_id is null
     or p_claim_token is null
     or p_lease_seconds not between 30 and 300 then
    return query select false, 'INVALID_INPUT'::text;
    return;
  end if;

  select job.customer_id, job.status
    into v_customer_id, v_status
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;
  if v_customer_id is distinct from p_customer_id then
    return query select false, 'NOT_OWNER'::text;
    return;
  end if;
  if v_status is distinct from 'broadcasting'::public.job_status then
    return query select false, 'INVALID_STATUS'::text;
    return;
  end if;

  insert into public.job_broadcast_retry_claims as claim (
    job_id,
    customer_id,
    claim_token,
    claimed_at,
    expires_at
  ) values (
    p_job_id,
    p_customer_id,
    p_claim_token,
    v_now,
    v_now + pg_catalog.make_interval(secs => p_lease_seconds)
  )
  on conflict (job_id) do update
    set customer_id = excluded.customer_id,
        claim_token = excluded.claim_token,
        claimed_at = excluded.claimed_at,
        expires_at = excluded.expires_at
    where claim.expires_at <= v_now
  returning true into v_claimed;

  -- The upsert above waits for an existing owner to release its row. Only after
  -- winning do we recheck rows the previous owner may have inserted meanwhile.
  if v_claimed and exists (
    select 1
    from public.job_broadcasts as broadcast
    where broadcast.job_id = p_job_id
      and broadcast.status = 'sent'::public.broadcast_status
      and (broadcast.expires_at is null or broadcast.expires_at > v_now)
  ) then
    delete from public.job_broadcast_retry_claims as owned_claim
    where owned_claim.job_id = p_job_id
      and owned_claim.claim_token = p_claim_token;
    return query select false, 'ACTIVE_BROADCAST'::text;
    return;
  end if;

  return query select coalesce(v_claimed, false),
    case when v_claimed then null::text else 'CLAIM_ACTIVE'::text end;
end;
$$;

drop function if exists public.release_job_broadcast_retry_claim_atomic(uuid, uuid, uuid);
create function public.release_job_broadcast_retry_claim_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_claim_token uuid
)
returns table (
  released boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_released boolean := false;
begin
  if p_job_id is null or p_customer_id is null or p_claim_token is null then
    return query select false;
    return;
  end if;

  delete from public.job_broadcast_retry_claims as claim
  where claim.job_id = p_job_id
    and claim.customer_id = p_customer_id
    and claim.claim_token = p_claim_token
  returning true into v_released;

  return query select coalesce(v_released, false);
end;
$$;

revoke execute on function public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer)
  to service_role;
revoke execute on function public.release_job_broadcast_retry_claim_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_job_broadcast_retry_claim_atomic(uuid, uuid, uuid)
  to service_role;

comment on table public.job_broadcast_retry_claims is
  'Short-lived service-only claims preventing duplicate worker broadcast creation across Edge isolates.';
comment on function public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer) is
  'Claims one broadcasting job for bounded worker-broadcast creation; expired claims are recoverable.';
comment on function public.release_job_broadcast_retry_claim_atomic(uuid, uuid, uuid) is
  'Releases only the exact broadcast retry claim token owned by the customer/job pair.';
