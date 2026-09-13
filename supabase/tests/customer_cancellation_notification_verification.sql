-- @pillar id: P118-customer-cancellation-notification-sql
-- @pillar invariant: Accepted-job cancellation commits one Worker inbox notice with the cancellation record, without requiring Edge post-processing
-- @pillar authority: governance/RULES.md #7 and #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260906011000_customer_cancellation_durable_notification.sql
-- @pillar layer: sql
-- @pillar siblings: P117-customer-cancellation-durability-sql, P116-customer-cancellation-http
-- @pillar mutation: Omit the cancellation notification trigger; the successful cancellation has no durable Worker notice

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';
insert into public.synthetic_matching_cohorts(cohort_id) values ('synthetic-customer-cancel-p118');
do $fixtures$
declare v_actor uuid;
begin
  for i in 1..3 loop
    v_actor := ('c1180000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(v_actor,'authenticated','authenticated','customer-cancel-p118-'||i||'@example.test',
      '{"provider":"email","providers":["email"]}','{}',now(),now());
    if i > 1 then update public.profiles set role='worker' where id=v_actor; end if;
    insert into public.synthetic_matching_cohort_members(cohort_id,profile_id,member_role)
    values('synthetic-customer-cancel-p118',v_actor,
      case when i=1 then 'customer'::public.user_role else 'worker'::public.user_role end);
  end loop;
end;
$fixtures$;
insert into public.worker_profiles(id,service_types,districts,is_approved,is_available,synthetic_cohort_id)
values('c1180000-0000-4000-8000-000000000002',array['plumbing']::public.service_type[],
  array['q7'],true,true,'synthetic-customer-cancel-p118');
insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
values('c1180000-0000-4000-8000-000000000101','c1180000-0000-4000-8000-000000000001',
  'c1180000-0000-4000-8000-000000000002','plumbing','Cancellation inbox fixture','q7','worker_matched','rfq');

do $notification$
declare
  v_job constant uuid := 'c1180000-0000-4000-8000-000000000101';
  v_customer constant uuid := 'c1180000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'c1180000-0000-4000-8000-000000000002';
  v_result record;
  v_notice record;
  v_notice_id uuid;
  v_actor uuid;
  v_role public.user_role;
begin
  foreach v_actor in array array[null,v_worker]::uuid[] loop
    select * into strict v_result from public.request_customer_cancellation_atomic(v_job,v_actor,'no_reason_provided',null);
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
      raise exception 'P118_REQUEST_ACCEPTED_INVALID_CUSTOMER';
    end if;
    select * into strict v_result from public.cancel_job_after_accept_atomic(v_job,v_actor,'no_reason_provided');
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
      raise exception 'P118_AFTER_ACCEPT_INVALID_CUSTOMER';
    end if;
  end loop;
  foreach v_role in array array['admin','worker']::public.user_role[] loop
    update public.profiles set role=v_role where id=v_customer;
    select * into strict v_result from public.request_customer_cancellation_atomic(v_job,v_customer,'no_reason_provided',null);
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
      raise exception 'P118_REQUEST_ACCEPTED_NON_CUSTOMER_ROLE: %',v_role;
    end if;
    select * into strict v_result from public.cancel_job_after_accept_atomic(v_job,v_customer,'no_reason_provided');
    if v_result.ok or v_result.error_code is distinct from 'NOT_FOUND' then
      raise exception 'P118_AFTER_ACCEPT_NON_CUSTOMER_ROLE: %',v_role;
    end if;
  end loop;
  update public.profiles set role='customer' where id=v_customer;
  if (select status from public.jobs where id=v_job) <> 'worker_matched'
    or exists(select 1 from public.customer_cancellation_records where job_id=v_job)
    or exists(select 1 from public.notifications where job_id=v_job) then
    raise exception 'P118_DENIED_CANCELLATION_CHANGED_STATE';
  end if;
  select * into strict v_result from public.request_customer_cancellation_atomic(v_job,v_customer,'no_reason_provided',null);
  if not v_result.ok or v_result.job_status is distinct from 'cancelled'
    or v_result.cancellation_id is null then
    raise exception 'P118_CANCELLATION_FIXTURE_FAILED: %',row_to_json(v_result);
  end if;
  if (select count(*) from public.notifications
    where user_id=v_worker and job_id=v_job and event_type='customer_cancelled_after_accept') <> 1 then
    raise exception 'P118_CANCELLATION_COMMITTED_WITHOUT_WORKER_NOTICE';
  end if;
  select id into strict v_notice_id from public.notifications
    where job_id=v_job and user_id=v_worker and event_type='customer_cancelled_after_accept';
  update public.notifications set status='read',read_at=now() where id=v_notice_id;
  for i in 1..100 loop
    select * into strict v_notice from public.insert_notification_atomic(
      v_worker,v_job,'customer_cancelled_after_accept','Retry title','Retry body','{}');
    if v_notice.notification_id is distinct from v_notice_id then
      raise exception 'P118_RETRY_DUPLICATED_NOTICE: %',i;
    end if;
  end loop;
  if (select count(*) from public.notifications where job_id=v_job) <> 1
    or not exists(select 1 from public.notifications where id=v_notice_id and status='read'
      and title='Khách đã hủy yêu cầu' and safe_metadata->>'cancellation_id'=v_result.cancellation_id::text) then
    raise exception 'P118_RETRY_OVERWROTE_INBOX_RECEIPT';
  end if;
  begin
    perform public.insert_notification_atomic('c1180000-0000-4000-8000-000000000003',v_job,
      'customer_cancelled_after_accept','Wrong worker','Wrong worker','{}');
    raise exception 'P118_FOREIGN_WORKER_NOTICE_CREATED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'CANCELLATION_NOTIFICATION_NOT_AUTHORIZED' then raise; end if;
  end;
  update public.customer_cancellation_records set status='reviewed' where id=v_result.cancellation_id;
  select * into strict v_notice from public.insert_notification_atomic(
    v_worker,v_job,'customer_cancelled_after_accept','Retry after review','Retry after review','{}');
  if v_notice.notification_id is distinct from v_notice_id then
    raise exception 'P118_REVIEWED_CANCELLATION_LOST_INBOX_RECEIPT';
  end if;
  if has_function_privilege('authenticated','public.insert_notification_atomic(uuid,uuid,text,text,text,jsonb)','execute')
    or has_function_privilege('anon','public.insert_notification_atomic(uuid,uuid,text,text,text,jsonb)','execute')
    or not has_function_privilege('service_role','public.insert_notification_atomic(uuid,uuid,text,text,text,jsonb)','execute')
    or has_function_privilege('authenticated','private.notify_worker_customer_cancellation()','execute') then
    raise exception 'P118_NOTIFICATION_MUTATION_GRANT_LEAK';
  end if;
end;
$notification$;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode,scheduled_at)
values('c1180000-0000-4000-8000-000000000102','c1180000-0000-4000-8000-000000000001',
  'c1180000-0000-4000-8000-000000000002','plumbing','Scheduled cancellation fixture','q7','worker_matched','rfq',now()+interval '2 days');
do $scheduled$
declare v_result record;
begin
  select * into strict v_result from public.request_customer_cancellation_atomic(
    'c1180000-0000-4000-8000-000000000102','c1180000-0000-4000-8000-000000000001','no_reason_provided',null);
  if not v_result.ok or v_result.sub_case is distinct from 'scheduled_job'
    or (select count(*) from public.notifications where job_id='c1180000-0000-4000-8000-000000000102'
      and body='Khách đã hủy lịch sắp tới. Bạn không cần tiếp tục công việc này.') <> 1 then
    raise exception 'P118_SCHEDULED_CANCELLATION_NOTICE_MISSING';
  end if;
end;
$scheduled$;
insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
values('c1180000-0000-4000-8000-000000000103','c1180000-0000-4000-8000-000000000001',
  'c1180000-0000-4000-8000-000000000002','plumbing','Dispute notification fixture','q7','inspecting','rfq');
select public.propose_rfq_price_atomic(
  'c1180000-0000-4000-8000-000000000103','c1180000-0000-4000-8000-000000000002',
  'c1180000-0000-4000-8000-000000000203',220000,'Inspected fitting replacement including labor.');
select public.decide_rfq_price_atomic(
  'c1180000-0000-4000-8000-000000000103','c1180000-0000-4000-8000-000000000001',
  'c1180000-0000-4000-8000-000000000203',true);
insert into public.job_media_assets(job_id,owner_id,service_type,stage,bucket_id,object_path,mime_type)
values('c1180000-0000-4000-8000-000000000103','c1180000-0000-4000-8000-000000000002',
  'plumbing','after','job-media','c1180000-0000-4000-8000-000000000103/after/fixture.jpg','image/jpeg');
update public.jobs set status='completed_by_worker',completion_notes='Completed fixture with attached evidence.',
  completion_photo_urls=array['supabase://job-media/c1180000-0000-4000-8000-000000000103/after/fixture.jpg']
where id='c1180000-0000-4000-8000-000000000103';
do $dispute$
declare v_result record;
begin
  select * into strict v_result from public.request_customer_cancellation_atomic(
    'c1180000-0000-4000-8000-000000000103','c1180000-0000-4000-8000-000000000001','no_reason_provided',null);
  if not v_result.ok or v_result.sub_case is distinct from 'after_worker_completed_trigger_dispute'
    or v_result.job_status is distinct from 'completed_by_worker'
    or exists(select 1 from public.notifications where job_id='c1180000-0000-4000-8000-000000000103'
      and event_type='customer_cancelled_after_accept') then
    raise exception 'P118_DISPUTE_INVENTED_CANCELLATION_NOTICE';
  end if;
end;
$dispute$;

set local role authenticated;
select set_config('request.jwt.claim.sub','c1180000-0000-4000-8000-000000000002',true);
do $owner_read$
begin
  if (select count(*) from public.notifications where job_id='c1180000-0000-4000-8000-000000000101') <> 1 then
    raise exception 'P118_OWNER_CANNOT_READ_DURABLE_NOTICE';
  end if;
end;
$owner_read$;
select set_config('request.jwt.claim.sub','c1180000-0000-4000-8000-000000000003',true);
do $foreign_read$
begin
  if exists(select 1 from public.notifications where job_id='c1180000-0000-4000-8000-000000000101') then
    raise exception 'P118_FOREIGN_WORKER_READ_NOTICE';
  end if;
end;
$foreign_read$;
reset role;
select 'P118 customer cancellation notification passed' as result;
rollback;
