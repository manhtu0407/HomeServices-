-- P71: rollback-only proof for atomic worker access applications and explicit revision resubmission.

begin;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'readiness-applicant@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'readiness-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'admin'
where id = 'd7100000-0000-4000-8000-000000000002';

do $verification$
declare
  v_first record;
  v_retry record;
  v_changed record;
  v_resubmitted record;
  v_resubmit_retry record;
begin
  select * into strict v_first
  from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000001',
    'nt', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000101', null
  );
  if not v_first.ok or v_first.status_out <> 'pending_review' or v_first.idempotent_out then
    raise exception 'first application did not create one pending review';
  end if;

  select * into strict v_retry
  from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000001',
    'nt', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000102', null
  );
  if v_retry.application_id is distinct from v_first.application_id
     or v_retry.status_out <> 'pending_review' or not v_retry.idempotent_out then
    raise exception 'a second request duplicated the pending application';
  end if;

  if (select count(*) from public.kael_admin_queue
      where actor_id = 'd7100000-0000-4000-8000-000000000001'
        and queue_type = 'worker_application_review') <> 1 then
    raise exception 'pending worker application count is not exactly one';
  end if;

  update public.kael_admin_queue
  set status = 'acknowledged',
      response_summary = 'worker_application_changes_requested',
      safe_metadata = safe_metadata || jsonb_build_object(
        'decision', 'request_changes',
        'decided_at', now()
      )
  where id = v_first.application_id;

  insert into public.admin_worker_application_reviews(
    queue_id, worker_id, decision, reason, decided_by, decided_at, review_stage
  ) values (
    v_first.application_id,
    'd7100000-0000-4000-8000-000000000001',
    'request_changes',
    'Bổ sung thông tin kinh nghiệm.',
    'd7100000-0000-4000-8000-000000000002',
    now(),
    'access'
  );

  select * into strict v_changed
  from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000001',
    'nt', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000103', null
  );
  if v_changed.status_out <> 'changes_requested'
     or not v_changed.can_resume or not v_changed.idempotent_out then
    raise exception 'changes-requested state was not returned without resubmission';
  end if;

  select * into strict v_resubmitted
  from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000001',
    'nt', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000104', v_first.application_id
  );
  if v_resubmitted.application_id is not distinct from v_first.application_id
     or v_resubmitted.status_out <> 'pending_review' or v_resubmitted.idempotent_out then
    raise exception 'explicit revision did not create one new pending application';
  end if;

  select * into strict v_resubmit_retry
  from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000001',
    'nt', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000104', v_first.application_id
  );
  if v_resubmit_retry.application_id is distinct from v_resubmitted.application_id
     or not v_resubmit_retry.idempotent_out then
    raise exception 'explicit revision retry was not idempotent';
  end if;

  if (select count(*) from public.kael_admin_queue
      where actor_id = 'd7100000-0000-4000-8000-000000000001'
        and queue_type = 'worker_application_review') <> 2 then
    raise exception 'revision did not preserve exact application history';
  end if;

  if exists (
    select 1 from public.kael_admin_queue
    where actor_id = 'd7100000-0000-4000-8000-000000000001'
      and queue_type = 'worker_application_review'
      and safe_metadata::text ilike '%readiness-applicant@example.test%'
  ) then
    raise exception 'worker application metadata leaked the full email';
  end if;
end;
$verification$;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'd7100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
  'readiness-lineage@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.kael_admin_queue (
  id, actor_id, actor_role, escalation_level, priority, queue_type,
  reason_code, response_summary, safe_metadata, status, created_at
) values
  ('d7100000-0000-4000-8000-000000000090', 'd7100000-0000-4000-8000-000000000003',
   'customer', 'soft', 'medium', 'worker_application_review', 'worker_application_submitted',
   'worker_application_submitted', '{"decision":"request_changes"}', 'acknowledged', now()),
  ('d7100000-0000-4000-8000-000000000080', 'd7100000-0000-4000-8000-000000000003',
   'customer', 'soft', 'medium', 'worker_application_review', 'worker_application_submitted',
   'worker_application_submitted', '{"revision_of_application_id":"d7100000-0000-4000-8000-000000000090"}',
   'open', now());

do $lineage$
declare
  v_current record;
begin
  select * into strict v_current from public.submit_worker_application_atomic(
    'd7100000-0000-4000-8000-000000000003', 'ge', 'vi', 'auth_worker_create',
    'd7100000-0000-4000-8000-000000000199', null
  );
  if v_current.application_id is distinct from 'd7100000-0000-4000-8000-000000000080'::uuid
     or v_current.status_out is distinct from 'pending_review' then
    raise exception 'revision lineage lost to timestamp/UUID order: %', row_to_json(v_current);
  end if;

  update public.kael_admin_queue set created_at = now() - interval '1 minute'
  where id = 'd7100000-0000-4000-8000-000000000080';
  select * into strict v_current
  from public.get_current_worker_application('d7100000-0000-4000-8000-000000000003');
  if v_current.id is distinct from 'd7100000-0000-4000-8000-000000000080'::uuid then
    raise exception 'transaction-start timestamp reversal restored a superseded application';
  end if;

  insert into public.kael_admin_queue (
    actor_id, actor_role, escalation_level, priority, queue_type,
    reason_code, response_summary, safe_metadata, status
  ) values (
    'd7100000-0000-4000-8000-000000000002', 'admin', 'soft', 'medium',
    'worker_application_review', 'worker_application_submitted', 'worker_application_submitted',
    '{"revision_of_application_id":"d7100000-0000-4000-8000-000000000080"}', 'open'
  );
  select * into strict v_current
  from public.get_current_worker_application('d7100000-0000-4000-8000-000000000003');
  if v_current.id is distinct from 'd7100000-0000-4000-8000-000000000080'::uuid then
    raise exception 'another actor masked the current application through revision metadata';
  end if;
end;
$lineage$;

do $privilege$
begin
  if has_function_privilege('anon', 'public.get_current_worker_application(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_current_worker_application(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_current_worker_application(uuid)', 'EXECUTE') then
    raise exception 'current worker application lookup escaped the service-role boundary';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.submit_worker_application_atomic(uuid,text,text,text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can invoke the privileged application RPC directly';
  end if;
end;
$privilege$;

rollback;
