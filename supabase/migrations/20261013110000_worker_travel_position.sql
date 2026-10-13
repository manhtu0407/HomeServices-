begin;

-- While a worker is on the way, the worker's app reports where they are, and the customer follows the
-- trip. One row per job holds only the latest position, the route the trip started on and what was
-- left of it at that position. The row is created by the worker's report and removed the moment the
-- job leaves worker_on_way or changes worker, so nobody can read a position after the trip ends.
-- The table has no client access at all: both functions below are the only readers and writers.

create table public.job_worker_positions (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  latitude numeric(9,6) not null check (latitude between 10.4 and 11.2),
  longitude numeric(9,6) not null check (longitude between 106.4 and 107.1),
  route_polyline text not null check (pg_catalog.length(route_polyline) between 1 and 100000),
  total_meters integer not null check (total_meters > 0),
  remaining_meters integer not null check (remaining_meters >= 0),
  remaining_seconds integer not null check (remaining_seconds >= 0),
  reported_at timestamptz not null default now()
);

alter table public.job_worker_positions enable row level security;
revoke all on table public.job_worker_positions from public, anon, authenticated;
grant select on table public.job_worker_positions to service_role;

-- The worker's report, under the job lock. The route is the one the server just computed for this
-- position. It becomes the trip's route on the first report and again only when the worker is now
-- farther away than the trip ever was (a re-route), so the customer's picture does not jump between
-- reports. A report inside 10 seconds of the last one is acknowledged without being stored.
create or replace function public.record_worker_travel_position_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_route_polyline text,
  p_remaining_meters integer,
  p_remaining_seconds integer
)
returns table (recorded boolean, reason text, total_meters integer, reported_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  c_throttle constant interval := interval '10 seconds';
  v_job record;
  v_row public.job_worker_positions%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  select job.id, job.worker_id, job.status
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update of job;
  if not found or v_job.worker_id is distinct from p_worker_id then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.status is distinct from 'worker_on_way'::public.job_status then
    recorded := false; reason := 'INVALID_STATUS'; total_meters := null; reported_at := null;
    return next;
    return;
  end if;

  select * into v_row from public.job_worker_positions as position where position.job_id = p_job_id;
  if found and v_row.reported_at > v_now - c_throttle then
    recorded := false; reason := 'THROTTLED'; total_meters := v_row.total_meters; reported_at := v_row.reported_at;
    return next;
    return;
  end if;

  if not found then
    insert into public.job_worker_positions
      (job_id, worker_id, latitude, longitude, route_polyline, total_meters, remaining_meters, remaining_seconds, reported_at)
    values
      (p_job_id, p_worker_id, p_latitude, p_longitude, p_route_polyline, greatest(p_remaining_meters, 1),
       p_remaining_meters, p_remaining_seconds, v_now);
    total_meters := greatest(p_remaining_meters, 1);
  else
    update public.job_worker_positions as position
      set worker_id = p_worker_id,
          latitude = p_latitude,
          longitude = p_longitude,
          remaining_meters = p_remaining_meters,
          remaining_seconds = p_remaining_seconds,
          reported_at = v_now,
          route_polyline = case when p_remaining_meters > position.total_meters then p_route_polyline else position.route_polyline end,
          total_meters = case when p_remaining_meters > position.total_meters then p_remaining_meters else position.total_meters end
      where position.job_id = p_job_id
      returning position.total_meters into total_meters;
  end if;
  recorded := true; reason := null; reported_at := v_now;
  return next;
end;
$function$;

revoke all on function public.record_worker_travel_position_atomic(uuid, uuid, numeric, numeric, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_worker_travel_position_atomic(uuid, uuid, numeric, numeric, text, integer, integer) to service_role;

-- What the customer may see: the job's own customer, only while the worker is on the way, and
-- nothing at all when the worker has not reported yet.
create or replace function public.get_job_worker_travel(p_job_id uuid, p_customer_id uuid)
returns table (
  latitude numeric,
  longitude numeric,
  route_polyline text,
  total_meters integer,
  remaining_meters integer,
  remaining_seconds integer,
  reported_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select position.latitude, position.longitude, position.route_polyline, position.total_meters,
         position.remaining_meters, position.remaining_seconds, position.reported_at
    from public.job_worker_positions as position
    join public.jobs as job on job.id = position.job_id
    where position.job_id = p_job_id
      and job.customer_id = p_customer_id
      and job.worker_id = position.worker_id
      and job.status = 'worker_on_way'::public.job_status;
$function$;

revoke all on function public.get_job_worker_travel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_job_worker_travel(uuid, uuid) to service_role;

-- The trip is over, or another worker took it: the position goes with it.
create or replace function private.clear_worker_travel_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from public.job_worker_positions as position where position.job_id = new.id;
  return null;
end;
$function$;

revoke all on function private.clear_worker_travel_position() from public, anon, authenticated;

create trigger jobs_clear_worker_travel_position
  after update of status, worker_id on public.jobs
  for each row
  when (old.status = 'worker_on_way'::public.job_status
    and (new.status is distinct from old.status or new.worker_id is distinct from old.worker_id))
  execute function private.clear_worker_travel_position();

commit;
