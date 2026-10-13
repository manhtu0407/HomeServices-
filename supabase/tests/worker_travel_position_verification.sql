-- @pillar id: P379-worker-travel-position-sql
-- @pillar invariant: Only the assigned worker can report a position, and only while the job is worker_on_way; only the job's own customer can read it, only during the trip; the trip route stays fixed unless the worker is farther than the trip ever was; the position is deleted the moment the trip ends
-- @pillar authority: governance/RULES.md #9 and #7
-- @pillar target: supabase/migrations/20261013110000_worker_travel_position.sql
-- @pillar layer: sql
-- @pillar siblings: P378-customer-completion-nudge-sql
-- @pillar mutation: Drop the status condition from get_job_worker_travel or the clearing trigger; the after-trip read assertion fails

begin;
set local statement_timeout='20s';
set local lock_timeout='3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-travel-p379');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor:=('c3790000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','travel-p379-'||i||'@example.test',
        '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i in (2,4) then update public.profiles set role='worker' where id=v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
      values('synthetic-travel-p379',v_actor,
        case when i in (2,4) then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i in (2,4) then
      insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
        problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status,synthetic_cohort_id)
      values(v_actor,array['plumbing']::public.service_type[],array['plumbing']::public.service_type[],
        5,array['q7'],array[]::text[],true,true,'Travel fixture','1990-01-01','approved','synthetic-travel-p379');
      perform public.record_worker_matching_heartbeat(v_actor,now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status)
values('c3790000-0000-4000-8000-000000000101','c3790000-0000-4000-8000-000000000001',
  'c3790000-0000-4000-8000-000000000002','plumbing','Worker travel fixture','q7','worker_on_way');

do $privileges$
declare v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform * from public.get_job_worker_travel('c3790000-0000-4000-8000-000000000101','c3790000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  if not v_denied then raise exception 'authenticated could read a travel position'; end if;
  v_denied := false;
  set local role authenticated;
  begin
    perform count(*) from public.job_worker_positions;
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  if not v_denied then raise exception 'authenticated could read the positions table'; end if;
  set local role anon;
  v_denied := false;
  begin
    perform * from public.record_worker_travel_position_atomic('c3790000-0000-4000-8000-000000000101','c3790000-0000-4000-8000-000000000002',10.78,106.70,'abc',3000,600);
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  if not v_denied then raise exception 'anon could report a position'; end if;
end;
$privileges$;

set local role service_role;
do $verify$
declare
  v_job constant uuid:='c3790000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c3790000-0000-4000-8000-000000000001';
  v_other constant uuid:='c3790000-0000-4000-8000-000000000003';
  v_worker constant uuid:='c3790000-0000-4000-8000-000000000002';
  v_stranger constant uuid:='c3790000-0000-4000-8000-000000000004';
  v_result record;
  v_read record;
  v_count integer;
begin
  select count(*) into v_count from public.get_job_worker_travel(v_job, v_customer);
  if v_count <> 0 then raise exception 'a position was readable before the worker reported'; end if;

  select * into v_result from public.record_worker_travel_position_atomic(v_job, v_worker, 10.7800, 106.7000, 'routeA', 5000, 900);
  if not v_result.recorded or v_result.total_meters <> 5000 then raise exception 'first report refused or total wrong: %', v_result; end if;
  select * into v_read from public.get_job_worker_travel(v_job, v_customer);
  if v_read.route_polyline is distinct from 'routeA' or v_read.remaining_meters <> 5000 or v_read.total_meters <> 5000 then
    raise exception 'customer read wrong: %', v_read;
  end if;
  select count(*) into v_count from public.get_job_worker_travel(v_job, v_other);
  if v_count <> 0 then raise exception 'another customer could read the position'; end if;

  select * into v_result from public.record_worker_travel_position_atomic(v_job, v_worker, 10.7810, 106.7010, 'routeB', 4000, 700);
  if v_result.recorded or v_result.reason is distinct from 'THROTTLED' then raise exception 'report inside 10 seconds was stored: %', v_result; end if;
  select * into v_read from public.get_job_worker_travel(v_job, v_customer);
  if v_read.remaining_meters <> 5000 then raise exception 'a throttled report changed the position'; end if;

  reset role;
  update public.job_worker_positions set reported_at = now() - interval '30 seconds' where job_id = v_job;
  set local role service_role;
  select * into v_result from public.record_worker_travel_position_atomic(v_job, v_worker, 10.7810, 106.7010, 'routeB', 4000, 700);
  if not v_result.recorded or v_result.total_meters <> 5000 then raise exception 'progress report refused or moved the total: %', v_result; end if;
  select * into v_read from public.get_job_worker_travel(v_job, v_customer);
  if v_read.route_polyline is distinct from 'routeA' or v_read.remaining_meters <> 4000 or v_read.remaining_seconds <> 700 then
    raise exception 'progress did not keep the trip route: %', v_read;
  end if;

  reset role;
  update public.job_worker_positions set reported_at = now() - interval '30 seconds' where job_id = v_job;
  set local role service_role;
  select * into v_result from public.record_worker_travel_position_atomic(v_job, v_worker, 10.7700, 106.6900, 'routeC', 7000, 1200);
  if not v_result.recorded or v_result.total_meters <> 7000 then raise exception 're-route did not raise the total: %', v_result; end if;
  select * into v_read from public.get_job_worker_travel(v_job, v_customer);
  if v_read.route_polyline is distinct from 'routeC' then raise exception 're-route did not replace the route'; end if;

  begin
    perform * from public.record_worker_travel_position_atomic(v_job, v_stranger, 10.78, 106.70, 'x', 100, 10);
    raise exception 'another worker could report';
  exception when sqlstate 'P0001' then
    if sqlerrm is distinct from 'JOB_NOT_FOUND' then raise; end if;
  end;
  reset role;
  update public.job_worker_positions set reported_at = now() - interval '30 seconds' where job_id = v_job;
  set local role service_role;
  begin
    perform * from public.record_worker_travel_position_atomic(v_job, v_worker, 21.03, 105.85, 'x', 100, 10);
    raise exception 'a position outside Ho Chi Minh City was stored';
  exception when check_violation then null;
  end;

  update public.jobs set status = 'arrived' where id = v_job;
  select count(*) into v_count from public.job_worker_positions where job_id = v_job;
  if v_count <> 0 then raise exception 'the position survived the end of the trip'; end if;
  select count(*) into v_count from public.get_job_worker_travel(v_job, v_customer);
  if v_count <> 0 then raise exception 'a position was readable after the trip'; end if;
  select * into v_result from public.record_worker_travel_position_atomic(v_job, v_worker, 10.78, 106.70, 'x', 100, 10);
  if v_result.recorded or v_result.reason is distinct from 'INVALID_STATUS' then raise exception 'a report after the trip was stored: %', v_result; end if;
end;
$verify$;
reset role;
rollback;
