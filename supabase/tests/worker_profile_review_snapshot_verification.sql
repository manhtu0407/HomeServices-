-- @pillar id: P174-admin-worker-review-snapshot-sql
-- @pillar invariant: One exact KYC snapshot produces one immutable review and replay cannot mutate a later submission
-- @pillar authority: governance/RULES.md #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260910164636_worker_profile_review_snapshot.sql
-- @pillar layer: sql
-- @pillar siblings: P172-admin-worker-review-snapshot, P173-admin-worker-review-snapshot-ui
-- @pillar mutation: Remove the snapshot precondition or receipt replay; stale approval or old-round replay changes the current Worker profile

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

do $verification$
declare
  v_owner constant uuid := 'd7800000-0000-4000-8000-000000000001';
  v_worker constant uuid := 'd7800000-0000-4000-8000-000000000002';
  v_customer constant uuid := 'd7800000-0000-4000-8000-000000000003';
  v_access constant uuid := 'd7800000-0000-4000-8000-000000000004';
  v_absent constant uuid := 'd7800000-0000-4000-8000-000000000005';
  v_synthetic constant uuid := 'd7800000-0000-4000-8000-000000000006';
  v_synthetic_access constant uuid := 'd7800000-0000-4000-8000-000000000007';
  v_queue uuid;
  v_next_queue uuid;
  v_revision timestamptz;
  v_next_revision timestamptz;
  v_decided_at timestamptz;
  v_result record;
  v_actor uuid;
  v_signature regprocedure := 'public.admin_review_worker_profile_snapshot_atomic(uuid,uuid,text,text,timestamptz,uuid)'::regprocedure;
begin
  if pg_catalog.has_function_privilege('anon', v_signature, 'execute')
    or pg_catalog.has_function_privilege('authenticated', v_signature, 'execute')
    or not pg_catalog.has_function_privilege('service_role', v_signature, 'execute')
    or pg_catalog.has_function_privilege('service_role', 'public.admin_review_worker_profile_atomic(uuid,uuid,text,text)', 'execute') then
    raise exception 'snapshot review privilege boundary is not enforced';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = v_signature
    and prosecdef and proconfig = array['search_path=""']::text[]) then
    raise exception 'snapshot review requires a locked definer';
  end if;

  -- Transaction-local fixtures are not real-account or native onboarding proof.
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_owner, 'authenticated', 'authenticated', 'snapshot-owner@example.test', '{"provider":"email"}', '{}', now(), now()),
    (v_worker, 'authenticated', 'authenticated', 'snapshot-worker@example.test', '{"provider":"email"}', '{}', now(), now()),
    (v_customer, 'authenticated', 'authenticated', 'snapshot-customer@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = v_owner;
  insert into public.kael_admin_queue (id, actor_id, actor_role, queue_type, priority, status, escalation_level, reason_code, response_summary)
  values (v_access, v_worker, 'customer', 'worker_application_review', 'medium', 'open', 'soft', 'worker_signup', 'Snapshot verification fixture');
  select * into strict v_result from public.admin_review_worker_application_atomic(v_access, v_owner, 'approve', null);
  if v_result.ok is not true then raise exception 'access fixture approval failed'; end if;

  insert into storage.objects (bucket_id, name, owner, metadata) values
    ('worker-verification', v_worker || '/cccd-front/front.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}'),
    ('worker-verification', v_worker || '/cccd-back/back.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}'),
    ('worker-verification', v_worker || '/selfie/selfie.jpg', v_worker, '{"mimetype":"image/jpeg","size":"1024"}');
  select * into strict v_result from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van B', '1992-05-12'::date, null,
    array['electrical'::public.service_type], 4, array['q1'], null, null, 8, '{}'::text[],
    'supabase://worker-verification/' || v_worker || '/cccd-front/front.jpg',
    'supabase://worker-verification/' || v_worker || '/cccd-back/back.jpg',
    'supabase://worker-verification/' || v_worker || '/selfie/selfie.jpg', '0123456789', 'Vietcombank'
  );
  if v_result.ok is not true then raise exception 'profile fixture submission failed'; end if;
  select id into strict v_queue from public.kael_admin_queue
    where actor_id = v_worker and queue_type = 'worker_profile_verification' and status = 'open';
  select updated_at into strict v_revision from public.worker_profiles where id = v_worker;

  insert into public.synthetic_matching_cohorts (cohort_id) values ('synthetic-admin-review-d7800000');
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_synthetic, 'authenticated', 'authenticated', 'snapshot-cohort@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.synthetic_matching_cohort_members (cohort_id, profile_id, member_role)
  values ('synthetic-admin-review-d7800000', v_synthetic, 'customer');
  insert into public.kael_admin_queue (id, actor_id, actor_role, queue_type, priority, status, escalation_level, reason_code, response_summary, safe_metadata)
  values (v_synthetic_access, v_synthetic, 'customer', 'worker_application_review', 'medium', 'resolved', 'soft', 'worker_signup', 'Synthetic snapshot fixture', '{"decision":"approve"}');
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'approve', null, v_revision, v_synthetic_access);
  if v_result.error_code is distinct from 'APPLICATION_NOT_FOUND' then raise exception 'real Admin review entered a synthetic application'; end if;

  foreach v_actor in array array[null::uuid, v_absent, v_customer, v_worker] loop
    select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_actor, 'approve', null, v_revision, v_access);
    if v_result.ok is not false or v_result.error_code is distinct from 'WORKERS_REVIEW_REQUIRED' then
      raise exception 'missing or unauthorized actor could review KYC';
    end if;
  end loop;
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'approve', null, v_revision - interval '1 microsecond', v_access);
  if v_result.ok is not false or v_result.error_code is distinct from 'STALE_REVIEW' then
    raise exception 'stale profile snapshot was not refused';
  end if;
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'request_changes', 'Bo sung ho so', v_revision, v_access);
  if v_result.ok is not true or v_result.verification_status is distinct from 'rejected' then
    raise exception 'exact profile snapshot was not reviewed';
  end if;
  v_decided_at := v_result.decided_at;
  for retry in 1..100 loop
    select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'request_changes', 'Bo sung ho so', v_revision, v_access);
    if v_result.ok is not true or v_result.verification_status is distinct from 'rejected'
      or v_result.decided_at is distinct from v_decided_at then
      raise exception 'duplicate review changed its immutable receipt';
    end if;
  end loop;
  if (select count(*) from public.admin_worker_application_reviews where queue_id = v_queue) <> 1
    or (select count(*) from public.kael_permission_audit where actor_id = v_owner and purpose = 'admin_worker_profile_review') <> 1 then
    raise exception 'duplicate review wrote duplicate decisions or audit events';
  end if;

  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'request_changes', 'Changed reason', v_revision, v_access);
  if v_result.error_code is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'retry could change the reason'; end if;
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'approve', null, v_revision, v_access);
  if v_result.error_code is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'retry could change the decision'; end if;

  select * into strict v_result from public.submit_worker_registration_atomic(
    v_worker, v_worker, 'Nguyen Van B', '1992-05-12'::date, null,
    array['electrical'::public.service_type], 5, array['q1'], null, null, 8, '{}'::text[],
    'supabase://worker-verification/' || v_worker || '/cccd-front/front.jpg',
    'supabase://worker-verification/' || v_worker || '/cccd-back/back.jpg',
    'supabase://worker-verification/' || v_worker || '/selfie/selfie.jpg', '0123456789', 'Vietcombank'
  );
  if v_result.ok is not true then raise exception 'new review round fixture was not submitted'; end if;
  select id into strict v_next_queue from public.kael_admin_queue
    where actor_id = v_worker and queue_type = 'worker_profile_verification' and status = 'open';
  select updated_at into strict v_next_revision from public.worker_profiles where id = v_worker;
  if v_next_queue = v_queue or v_next_revision = v_revision then raise exception 'new round did not advance its identity'; end if;

  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_queue, v_owner, 'request_changes', 'Bo sung ho so', v_revision, v_access);
  if v_result.ok is not true or v_result.verification_status is distinct from 'rejected'
    or v_result.decided_at is distinct from v_decided_at then raise exception 'new submission rewrote old review receipt'; end if;
  if not exists (select 1 from public.worker_profiles where id = v_worker and verification_status = 'submitted' and not is_approved) then
    raise exception 'old review replay mutated new submission';
  end if;
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_next_queue, v_owner, 'approve', null, v_revision, v_access);
  if v_result.error_code is distinct from 'STALE_REVIEW' then raise exception 'old snapshot approved new round'; end if;
  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_next_queue, v_owner, 'approve', null, v_next_revision, v_absent);
  if v_result.error_code is distinct from 'APPLICATION_NOT_FOUND' then raise exception 'foreign application bound to a Worker review'; end if;

  select * into strict v_result from public.admin_review_worker_profile_snapshot_atomic(v_next_queue, v_owner, 'approve', null, v_next_revision, v_access);
  if v_result.ok is not true or v_result.verification_status is distinct from 'approved' then raise exception 'fresh complete snapshot was not approved'; end if;
  if not exists (select 1 from public.worker_profiles where id = v_worker and is_approved and not is_available)
    or (select count(*) from public.admin_worker_application_reviews where worker_id = v_worker and review_stage = 'profile') <> 2 then
    raise exception 'review history or availability authority changed';
  end if;
end;
$verification$;

select jsonb_build_object('snapshot_bound_review', true, 'duplicate_replays', 100,
  'old_round_does_not_mutate_new_submission', true, 'missing_actor_denied', true,
  'legacy_service_mutation_revoked', true, 'transaction_rollback', true) as evidence;
rollback;
