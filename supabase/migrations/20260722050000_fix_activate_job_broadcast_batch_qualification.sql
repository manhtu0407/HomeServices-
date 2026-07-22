-- Qualify the unnested worker id because the RPC return table also exposes a
-- worker_id output variable in PL/pgSQL.

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
  v_status public.job_status;
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

  select job.status
    into v_status
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception 'worker broadcast job not found' using errcode = 'P0002';
  end if;
  if v_status is distinct from 'broadcasting'::public.job_status then
    raise exception 'worker broadcast job is not active' using errcode = '55000';
  end if;

  return query
  insert into public.job_broadcasts as existing (
    job_id,
    worker_id,
    status,
    broadcast_at,
    sent_at,
    responded_at,
    expires_at,
    batch_id
  )
  select
    p_job_id,
    candidate.worker_id,
    'sent'::public.broadcast_status,
    p_sent_at,
    p_sent_at,
    null,
    p_expires_at,
    p_batch_id
  from (
    select distinct worker_ids.worker_id
    from pg_catalog.unnest(p_worker_ids) as worker_ids(worker_id)
  ) as candidate
  on conflict on constraint job_broadcasts_job_id_worker_id_key do update
    set status = excluded.status,
        broadcast_at = excluded.broadcast_at,
        sent_at = excluded.sent_at,
        responded_at = null,
        expires_at = excluded.expires_at,
        batch_id = excluded.batch_id
    where existing.status = 'expired'::public.broadcast_status
  returning existing.id, existing.worker_id;
end;
$$;

revoke execute on function public.activate_job_broadcast_batch_atomic(
  uuid,
  uuid[],
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.activate_job_broadcast_batch_atomic(
  uuid,
  uuid[],
  uuid,
  timestamptz,
  timestamptz
) to service_role;
