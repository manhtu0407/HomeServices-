-- @pillar id: P204-notification-missing-job-sql
-- @pillar invariant: A notification for a job deleted while it was in flight returns no receipt instead of failing the notifications_job_id_fkey foreign key
-- @pillar authority: governance/RULES.md #8 | Production logs: notifications_job_id_fkey violation from notifyBroadcastWorkers during synthetic cleanup
-- @pillar target: supabase/migrations/20260924140943_notification_missing_job_no_fk_failure.sql
-- @pillar layer: sql
-- @pillar siblings: P118-customer-cancellation-notification-sql
-- @pillar mutation: Drop the job existence guard; the missing-job call raises foreign_key_violation instead of returning no rows

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2040000-0000-4000-8000-000000000001','authenticated','authenticated','notification-missing-job-p204-1@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2040000-0000-4000-8000-000000000002','authenticated','authenticated','notification-missing-job-p204-2@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker' where id='c2040000-0000-4000-8000-000000000002';
insert into public.jobs(id,customer_id,service_type,description,address_district,status,quote_mode)
values('c2040000-0000-4000-8000-000000000101','c2040000-0000-4000-8000-000000000001',
  'plumbing','Notification fixture','q7','broadcasting','rfq');

do $missing_job$
declare
  v_worker constant uuid := 'c2040000-0000-4000-8000-000000000002';
  v_live_job constant uuid := 'c2040000-0000-4000-8000-000000000101';
  v_deleted_job constant uuid := 'c2040000-0000-4000-8000-000000000102';
  v_rows integer;
begin
  select count(*) into v_rows from public.insert_notification_atomic(
    v_worker,v_deleted_job,'broadcast_received','Có yêu cầu mới','Sửa ống nước - Quận 7','{}');
  if v_rows <> 0 or exists(select 1 from public.notifications where job_id=v_deleted_job) then
    raise exception 'P204_DELETED_JOB_NOTICE_CREATED';
  end if;

  select count(*) into v_rows from public.insert_notification_atomic(
    v_worker,v_live_job,'broadcast_received','Có yêu cầu mới','Sửa ống nước - Quận 7','{}');
  if v_rows <> 1 or (select count(*) from public.notifications
    where job_id=v_live_job and user_id=v_worker and event_type='broadcast_received') <> 1 then
    raise exception 'P204_LIVE_JOB_NOTICE_MISSING';
  end if;

  select count(*) into v_rows from public.insert_notification_atomic(
    v_worker,null,'kael_learning_manual_review','Kael learning review','Needs review','{}');
  if v_rows <> 1 then
    raise exception 'P204_JOBLESS_NOTICE_MISSING';
  end if;
end;
$missing_job$;
select 'P204 notification missing job passed' as result;
rollback;
