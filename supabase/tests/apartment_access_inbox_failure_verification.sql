-- @pillar id: P130-apartment-inbox-failure-sql
-- @pillar invariant: A failed apartment access inbox insert rolls back the Customer grant and its audit event
-- @pillar authority: governance/RULES.md #7 and #8
-- @pillar target: supabase/migrations/20260908012000_apartment_access_atomic_authorization.sql
-- @pillar layer: sql
-- @pillar siblings: P129-apartment-access-authority-sql
-- @pillar mutation: Swallow the inbox insert error; the test reports a partial authorization instead of an atomic rollback
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';

insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-apartment-p129');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..4 loop
    v_actor:=('c1290000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','apartment-p129-'||i||'@example.test',
        '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i>=3 then update public.profiles set role='worker' where id=v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
      values('synthetic-apartment-p129',v_actor,
        case when i>=3 then 'worker'::public.user_role else 'customer'::public.user_role end);
    if i>=3 then
      insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
        problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status,synthetic_cohort_id)
      values(v_actor,array['plumbing']::public.service_type[],array['plumbing']::public.service_type[],
        5,array['q7'],array[]::text[],true,true,'Apartment fixture','1990-01-01','approved','synthetic-apartment-p129');
      perform public.record_worker_matching_heartbeat(v_actor,now());
    end if;
  end loop;
end;
$fixtures$;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode,apartment_access_state)
values('c1290000-0000-4000-8000-000000000101','c1290000-0000-4000-8000-000000000001',
  'c1290000-0000-4000-8000-000000000003','plumbing','Apartment authorization fixture','q7','arrived','rfq',
  '{"worker_checked_in":true,"check_in":{"worker_id":"c1290000-0000-4000-8000-000000000003","checked_in_at":"2026-09-08T01:00:00.000Z","mode":"geofence"}}');


create function private.apartment_p129_inbox_fault() returns trigger language plpgsql set search_path='' as $fault$ begin raise exception 'P129_INBOX_FAULT'; end; $fault$;
create trigger apartment_p129_inbox_fault before insert on public.notifications for each row
when (new.job_id='c1290000-0000-4000-8000-000000000101'::uuid and new.event_type='apartment_access_authorized')
execute function private.apartment_p129_inbox_fault();
set local role service_role;
do $prove$
begin
  begin
    perform public.authorize_apartment_access_atomic('c1290000-0000-4000-8000-000000000101',
      'c1290000-0000-4000-8000-000000000001','c1290000-0000-4000-8000-000000000003','2026-09-08T01:00:00.000Z');
    raise exception 'P129_INBOX_FAULT_WAS_SWALLOWED';
  exception when raise_exception then
    if sqlerrm<>'P129_INBOX_FAULT' then raise; end if;
  end;
  if exists(select 1 from public.jobs where id='c1290000-0000-4000-8000-000000000101'
      and apartment_access_state->'exact_unit_released'='true'::jsonb)
    or exists(select 1 from public.job_events where job_id='c1290000-0000-4000-8000-000000000101'
      and event_type='apartment_access_authorized')
    or exists(select 1 from public.notifications where job_id='c1290000-0000-4000-8000-000000000101') then
    raise exception 'P129_INBOX_FAILURE_LEFT_PARTIAL_AUTHORIZATION';
  end if;

end;
$prove$;
reset role;
select 'P130_PASS' as result;
rollback;
