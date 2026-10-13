-- @pillar id: P378-customer-completion-nudge-sql
-- @pillar invariant: A completion nudge is one audited job_events row plus a Kael chat line and a worker inbox entry written under the job lock; the cooldown, the cap, the pause and the status rules hold; the job status never moves
-- @pillar authority: governance/RULES.md #7 and #9
-- @pillar target: supabase/migrations/20261013100000_customer_completion_nudge.sql
-- @pillar layer: sql
-- @pillar siblings: P377-customer-completion-nudge-http
-- @pillar mutation: Drop the cooldown comparison or the cap; the repeat-nudge and fourth-nudge assertions fail

begin;
set local statement_timeout='20s';
set local lock_timeout='3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-nudge-p378');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor:=('c3780000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','nudge-p378-'||i||'@example.test',
        '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i=2 then update public.profiles set role='worker' where id=v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
      values('synthetic-nudge-p378',v_actor,
        case when i=2 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i=2 then
      insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
        problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status,synthetic_cohort_id)
      values(v_actor,array['plumbing']::public.service_type[],array['plumbing']::public.service_type[],
        5,array['q7'],array[]::text[],true,true,'Nudge fixture','1990-01-01','approved','synthetic-nudge-p378');
      perform public.record_worker_matching_heartbeat(v_actor,now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,work_started_at)
values('c3780000-0000-4000-8000-000000000101','c3780000-0000-4000-8000-000000000001',
  'c3780000-0000-4000-8000-000000000002','plumbing','Completion nudge fixture','q7','repairing',now()-interval '5 minutes');

do $privileges$
declare v_denied boolean := false;
begin
  set local role authenticated;
  begin
    perform * from public.completion_nudge_state('c3780000-0000-4000-8000-000000000101');
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  if not v_denied then raise exception 'authenticated could read the nudge state'; end if;
  set local role anon;
  v_denied := false;
  begin
    perform * from public.nudge_worker_completion_atomic('c3780000-0000-4000-8000-000000000101','c3780000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then v_denied := true;
  end;
  reset role;
  if not v_denied then raise exception 'anon could run the nudge'; end if;
end;
$privileges$;

set local role service_role;
do $verify$
declare
  v_job constant uuid:='c3780000-0000-4000-8000-000000000101';
  v_customer constant uuid:='c3780000-0000-4000-8000-000000000001';
  v_other constant uuid:='c3780000-0000-4000-8000-000000000003';
  v_worker constant uuid:='c3780000-0000-4000-8000-000000000002';
  v_state record;
  v_result record;
  v_count integer;
begin
  select * into v_state from public.completion_nudge_state(v_job);
  if v_state.can_nudge or v_state.reason is distinct from 'TOO_EARLY' or v_state.next_available_at is null then
    raise exception 'a job started 5 minutes ago must report TOO_EARLY with a time: %', v_state;
  end if;
  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if v_result.ok or v_result.reason is distinct from 'TOO_EARLY' then raise exception 'early nudge was accepted: %', v_result; end if;
  select count(*) into v_count from public.job_events where job_id=v_job and event_type='customer_completion_nudge';
  if v_count <> 0 then raise exception 'a refused nudge wrote an audit row'; end if;

  update public.jobs set work_started_at = now()-interval '20 minutes' where id=v_job;
  select * into v_state from public.completion_nudge_state(v_job);
  if not v_state.can_nudge or v_state.max_allowed <> 3 or v_state.used <> 0 then raise exception 'open state wrong: %', v_state; end if;

  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if not v_result.ok or v_result.used <> 1 or v_result.worker_id is distinct from v_worker or v_result.next_available_at is null then
    raise exception 'first nudge refused or malformed: %', v_result;
  end if;
  select count(*) into v_count from public.job_events
    where job_id=v_job and event_type='customer_completion_nudge' and actor_id=v_customer and actor_role='customer'
      and from_status='repairing' and to_status='repairing' and safe_metadata->>'sequence'='1';
  if v_count <> 1 then raise exception 'audit row missing or malformed'; end if;
  select count(*) into v_count from public.chat_messages where job_id=v_job and sender_role='kael' and sender_id is null;
  if v_count <> 1 then raise exception 'Kael chat line missing'; end if;
  select count(*) into v_count from public.notifications where job_id=v_job and user_id=v_worker and event_type='customer_completion_nudge';
  if v_count <> 1 then raise exception 'worker inbox entry missing'; end if;
  if (select status from public.jobs where id=v_job) is distinct from 'repairing'::public.job_status then
    raise exception 'the nudge moved the job status';
  end if;

  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if v_result.ok or v_result.reason is distinct from 'COOLDOWN' or v_result.next_available_at is null then
    raise exception 'repeat nudge inside the cooldown was accepted: %', v_result;
  end if;
  select count(*) into v_count from public.job_events where job_id=v_job and event_type='customer_completion_nudge';
  if v_count <> 1 then raise exception 'a refused repeat wrote an audit row'; end if;

  update public.jobs set work_paused_at = now() where id=v_job;
  select * into v_state from public.completion_nudge_state(v_job);
  if v_state.can_nudge or v_state.reason is distinct from 'WORK_PAUSED' then raise exception 'paused work accepted a nudge: %', v_state; end if;
  update public.jobs set work_paused_at = null where id=v_job;

  begin
    perform * from public.nudge_worker_completion_atomic(v_job, v_other);
    raise exception 'another customer could nudge';
  exception when sqlstate 'P0001' then
    if sqlerrm is distinct from 'JOB_NOT_FOUND' then raise; end if;
  end;

  update public.job_events set created_at = now()-interval '20 minutes' where job_id=v_job and event_type='customer_completion_nudge';
  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if not v_result.ok or v_result.used <> 2 then raise exception 'second nudge after the cooldown refused: %', v_result; end if;
  update public.job_events set created_at = now()-interval '20 minutes' where job_id=v_job and event_type='customer_completion_nudge';
  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if not v_result.ok or v_result.used <> 3 or v_result.next_available_at is not null then raise exception 'third nudge wrong: %', v_result; end if;

  update public.job_events set created_at = now()-interval '20 minutes' where job_id=v_job and event_type='customer_completion_nudge';
  select * into v_result from public.nudge_worker_completion_atomic(v_job, v_customer);
  if v_result.ok or v_result.reason is distinct from 'LIMIT_REACHED' then raise exception 'fourth nudge accepted: %', v_result; end if;
  select count(*) into v_count from public.job_events where job_id=v_job and event_type='customer_completion_nudge';
  if v_count <> 3 then raise exception 'cap breached: % audit rows', v_count; end if;

  update public.jobs set status='inspecting' where id=v_job;
  select * into v_state from public.completion_nudge_state(v_job);
  if v_state.can_nudge or v_state.reason is distinct from 'INVALID_STATUS' then raise exception 'a job outside repair accepted a nudge: %', v_state; end if;
end;
$verify$;
reset role;
rollback;
