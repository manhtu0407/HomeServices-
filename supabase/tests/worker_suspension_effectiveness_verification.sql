-- @pillar id: P256-suspension-blocks-matching-sql
-- @pillar invariant: Every suspension path sets the matching gate (is_suspended, not approved, unavailable) with an end date and an append-only event; a timed suspension lifts itself when it ends, and reinstating clears the end date
-- @pillar authority: governance/RULES.md #7 | Plan moonlit-singing-phoenix Phase 0.2: a dispute suspension previously left the worker matchable
-- @pillar target: supabase/migrations/20260925101000_worker_suspension_effectiveness.sql
-- @pillar layer: sql
-- @pillar siblings: P204-notification-missing-job-sql
-- @pillar mutation: Restore the old dispute branch that only sets verification_status = 'suspended'; is_suspended stays false and P207 raises P256_DISPUTE_NOT_SUSPENDED

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2070000-0000-4000-8000-000000000001','authenticated','authenticated','suspension-p207-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2070000-0000-4000-8000-000000000002','authenticated','authenticated','suspension-p207-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2070000-0000-4000-8000-000000000003','authenticated','authenticated','suspension-p207-admin@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker' where id='c2070000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='c2070000-0000-4000-8000-000000000003';

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2070000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.8, 10, 'approved', false, 'Suspension Fixture Worker', '1990-01-01'
)
on conflict (id) do update set is_approved = true, is_available = true,
  verification_status = 'approved', is_suspended = false;

insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
values('c2070000-0000-4000-8000-000000000101','c2070000-0000-4000-8000-000000000001',
  'c2070000-0000-4000-8000-000000000002','plumbing','Suspension fixture job','q7','worker_on_way','rfq');

insert into public.evidence_snapshots(id, job_id)
values ('c2070000-0000-4000-8000-000000000201','c2070000-0000-4000-8000-000000000101');

insert into public.disputes(
  id, job_id, dispute_type, initiated_by, initiated_by_id, initiator_statement,
  counter_party_response_deadline, evidence_locked_at, evidence_snapshot_id, kael_neutral_summary, status
) values (
  'c2070000-0000-4000-8000-000000000301','c2070000-0000-4000-8000-000000000101','abusive_behavior_worker',
  'customer','c2070000-0000-4000-8000-000000000001','Thợ có hành vi không đúng mực trong nhà.',
  now() + interval '1 day', now(), 'c2070000-0000-4000-8000-000000000201',
  'Khách báo hành vi không đúng mực.', 'admin_review'
);

do $dispute_suspends$
declare
  v_worker constant uuid := 'c2070000-0000-4000-8000-000000000002';
  v_row public.worker_profiles%rowtype;
  v_ok boolean;
begin
  select ok into v_ok from public.admin_decide_dispute_atomic(
    'c2070000-0000-4000-8000-000000000301', 'c2070000-0000-4000-8000-000000000003',
    'customer_favor_full', null, null, 'none', 'temp_suspend_7d',
    'Admin xác minh hành vi vi phạm qua lời khai hai bên và bằng chứng đã khóa.');
  if v_ok is not true then
    raise exception 'P256_DISPUTE_DECISION_FAILED';
  end if;

  select * into v_row from public.worker_profiles where id = v_worker;
  if v_row.is_suspended is not true or v_row.is_approved or v_row.is_available then
    raise exception 'P256_DISPUTE_NOT_SUSPENDED';
  end if;
  if v_row.suspended_until is null
     or v_row.suspended_until < now() + interval '6 days 23 hours'
     or v_row.suspended_until > now() + interval '7 days 1 hour' then
    raise exception 'P256_DISPUTE_UNTIL_WRONG';
  end if;
  if not exists (select 1 from public.worker_suspension_events
                 where worker_id = v_worker and action = 'suspend' and source = 'dispute'
                   and reference_id = 'c2070000-0000-4000-8000-000000000301') then
    raise exception 'P256_DISPUTE_EVENT_MISSING';
  end if;
end;
$dispute_suspends$;

do $expiry_lifts$
declare
  v_worker constant uuid := 'c2070000-0000-4000-8000-000000000002';
  v_row public.worker_profiles%rowtype;
begin
  update public.worker_profiles set suspended_until = now() - interval '1 minute' where id = v_worker;
  perform private.expire_worker_suspensions();

  select * into v_row from public.worker_profiles where id = v_worker;
  if v_row.is_suspended or v_row.suspended_until is not null or v_row.is_approved is not true then
    raise exception 'P256_EXPIRY_DID_NOT_LIFT';
  end if;
  if not exists (select 1 from public.worker_suspension_events
                 where worker_id = v_worker and action = 'expire' and source = 'system') then
    raise exception 'P256_EXPIRY_EVENT_MISSING';
  end if;
end;
$expiry_lifts$;

do $admin_suspend_and_reinstate$
declare
  v_worker constant uuid := 'c2070000-0000-4000-8000-000000000002';
  v_admin constant uuid := 'c2070000-0000-4000-8000-000000000003';
  v_row public.worker_profiles%rowtype;
  v_ok boolean;
begin
  select ok into v_ok from public.admin_set_worker_access_atomic(v_admin, v_worker, 'suspend', 'Tạm ngưng để điều tra');
  select * into v_row from public.worker_profiles where id = v_worker;
  if v_ok is not true or v_row.is_suspended is not true or v_row.suspension_reason <> 'Tạm ngưng để điều tra' then
    raise exception 'P256_ADMIN_SUSPEND_FAILED';
  end if;

  perform private.expire_worker_suspensions();
  select * into v_row from public.worker_profiles where id = v_worker;
  if v_row.is_suspended is not true then
    raise exception 'P256_INDEFINITE_SUSPENSION_EXPIRED';
  end if;

  select ok into v_ok from public.admin_set_worker_access_atomic(v_admin, v_worker, 'reinstate', 'Đã xác minh xong');
  select * into v_row from public.worker_profiles where id = v_worker;
  if v_ok is not true or v_row.is_suspended or v_row.suspension_reason is not null then
    raise exception 'P256_ADMIN_REINSTATE_FAILED';
  end if;
end;
$admin_suspend_and_reinstate$;

do $events_immutable$
begin
  begin
    delete from public.worker_suspension_events where worker_id = 'c2070000-0000-4000-8000-000000000002';
    raise exception 'P256_EVENT_DELETED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'WORKER_SUSPENSION_EVENT_IMMUTABLE' then raise; end if;
  end;
end;
$events_immutable$;

rollback;
