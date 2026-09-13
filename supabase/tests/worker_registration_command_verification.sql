-- @pillar id: P166-worker-registration-command-sql
-- @pillar invariant: Submitting an exact server draft produces one immutable actor-bound receipt, and replay cannot resubmit a later rejected profile
-- @pillar authority: governance/RULES.md #8 | approved Production Agentic Transaction Readiness plan
-- @pillar target: supabase/migrations/20260909015000_worker_registration_commands.sql
-- @pillar layer: sql
-- @pillar siblings: P164-worker-draft-receipt, P163-worker-registration-draft-gate
-- @pillar mutation: Remove command receipt replay; retry after review changes the rejected profile back to submitted

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

do $verify$
declare
  v_worker constant uuid := 'd7600000-0000-4000-8000-000000000001';
  v_other constant uuid := 'd7600000-0000-4000-8000-000000000002';
  v_key constant uuid := 'd7600000-0000-4000-8000-000000000003';
  v_stale_key constant uuid := 'd7600000-0000-4000-8000-000000000004';
  v_revision timestamptz;
  v_receipt jsonb;
  v_row jsonb;
  v_result record;
  v_count integer;
  v_function regprocedure;
begin
  if to_regprocedure('public.submit_worker_registration_draft_atomic(uuid,uuid,uuid,timestamp with time zone)') is null then
    raise exception 'P166 missing durable draft submission contract';
  end if;

  insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_worker, 'authenticated', 'authenticated', 'registration-command-worker@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_other, 'authenticated', 'authenticated', 'registration-command-other@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now());
  update public.profiles set role = 'worker' where id = v_worker;
  insert into public.worker_profiles(id, verification_status, is_approved, is_available, is_suspended,
    legal_name, date_of_birth, service_types, districts, service_radius_km, years_experience,
    problem_specializations, bank_name, bank_account, cccd_front_url, cccd_back_url, selfie_url)
  values (v_worker, 'draft', false, false, false, 'Thợ kiểm thử', '1990-01-01',
    array['electrical']::public.service_type[], array['q1'], 8, 2, '{}', 'Test bank', '123456789',
    'supabase://worker-verification/' || v_worker || '/cccd-front/front.jpg',
    null,
    'supabase://worker-verification/' || v_worker || '/selfie/selfie.jpg');
  insert into storage.objects(bucket_id, name, owner, metadata)
  select 'worker-verification', v_worker || '/' || item.path, v_worker,
    '{"mimetype":"image/jpeg","size":"1024"}'::jsonb
  from (values ('cccd-front/front.jpg'), ('cccd-back/back.jpg'), ('selfie/selfie.jpg')) as item(path);
  select to_jsonb(worker) into v_row from public.worker_profiles worker where id = v_worker;
  select * into v_result from public.save_worker_registration_draft_atomic(v_worker, v_worker,
    jsonb_build_object('cccd_back_url', 'supabase://worker-verification/' || v_worker || '/cccd-back/back.jpg'));
  if v_result.ok is distinct from true or v_result.verification_status <> 'draft'
    or not exists (select 1 from public.worker_profiles where id = v_worker
      and cccd_front_url = v_row->>'cccd_front_url' and selfie_url = v_row->>'selfie_url'
      and bank_account = v_row->>'bank_account'
      and cccd_back_url = 'supabase://worker-verification/' || v_worker || '/cccd-back/back.jpg'
      and updated_at > (v_row->>'updated_at')::timestamptz) then
    raise exception 'P166 partial document save lost an omitted identity/bank field or did not advance its draft revision';
  end if;
  select to_jsonb(worker) into v_row from public.worker_profiles worker where id = v_worker;
  select * into v_result from public.save_worker_registration_draft_atomic(v_other, v_worker,
    jsonb_build_object('cccd_back_url', 'supabase://worker-verification/' || v_other || '/cccd-back/back.jpg'));
  if v_result.ok is distinct from false
    or (select to_jsonb(worker) from public.worker_profiles worker where id = v_worker) is distinct from v_row then
    raise exception 'P166 foreign draft save changed Worker identity evidence';
  end if;
  select updated_at into v_revision from public.worker_profiles where id = v_worker;

  select count(*) into v_count from public.get_worker_registration_command(v_worker, v_key);
  if v_count <> 0 then raise exception 'P166 unknown command fabricated a receipt'; end if;

  select * into v_result from public.submit_worker_registration_draft_atomic(v_worker, v_worker, v_key, v_revision);
  if v_result.outcome <> 'submitted' or v_result.error_code is not null
    or v_result.worker_id <> v_worker or v_result.client_request_id <> v_key
    or v_result.submitted_at is null or v_result.operation_id is null then
    raise exception 'P166 exact server draft did not produce a valid submission receipt';
  end if;
  v_receipt := to_jsonb(v_result);
  select to_jsonb(worker) into v_row from public.worker_profiles worker where id = v_worker;
  select * into v_result from public.submit_worker_registration_draft_atomic(v_worker, v_worker, v_key, v_revision);
  if to_jsonb(v_result) is distinct from v_receipt
    or (select to_jsonb(worker) from public.worker_profiles worker where id = v_worker) is distinct from v_row then
    raise exception 'P166 replay changed the receipt or worker profile';
  end if;
  select count(*) into v_count from public.kael_admin_queue
    where actor_id = v_worker and queue_type = 'worker_profile_verification';
  if v_count <> 1 then raise exception 'P166 duplicate or missing Admin review item'; end if;

  update public.worker_profiles set verification_status = 'rejected', updated_at = clock_timestamp() where id = v_worker;
  if (select updated_at from public.worker_profiles where id = v_worker) <= v_revision then
    raise exception 'P166 draft revision did not advance after profile mutation';
  end if;
  select to_jsonb(worker) into v_row from public.worker_profiles worker where id = v_worker;
  select * into v_result from public.submit_worker_registration_draft_atomic(v_worker, v_worker, v_key, v_revision);
  if to_jsonb(v_result) is distinct from v_receipt
    or (select to_jsonb(worker) from public.worker_profiles worker where id = v_worker) is distinct from v_row then
    raise exception 'P166 old command resubmitted a profile after review';
  end if;
  select * into v_result from public.submit_worker_registration_draft_atomic(v_worker, v_worker, v_stale_key, v_revision);
  if v_result.outcome <> 'rejected' or v_result.error_code <> 'STALE_DRAFT'
    or (select to_jsonb(worker) from public.worker_profiles worker where id = v_worker) is distinct from v_row then
    raise exception 'P166 stale draft mutated the latest profile';
  end if;

  begin
    perform public.submit_worker_registration_draft_atomic(v_worker, v_worker, v_key, v_revision + interval '1 second');
    raise exception 'P166 one command accepted a different revision';
  exception when unique_violation then null;
  end;
  begin
    perform public.submit_worker_registration_draft_atomic(v_other, v_worker, v_stale_key, v_revision);
    raise exception 'P166 foreign actor submitted another worker draft';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_count from public.get_worker_registration_command(v_other, v_key);
  if v_count <> 0 then raise exception 'P166 foreign actor could read a worker receipt'; end if;

  foreach v_function in array array[
    'public.submit_worker_registration_draft_atomic(uuid,uuid,uuid,timestamp with time zone)'::regprocedure,
    'public.get_worker_registration_command(uuid,uuid)'::regprocedure
  ] loop
    if has_function_privilege('anon', v_function, 'execute')
      or has_function_privilege('authenticated', v_function, 'execute')
      or not has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'P166 receipt RPC is not service-only: %', v_function;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.worker_registration_commands', 'select')
    or has_table_privilege('anon', 'public.worker_registration_commands', 'select')
    or has_table_privilege('service_role', 'public.worker_registration_commands', 'update') then
    raise exception 'P166 command history allows direct access or mutation';
  end if;
end;
$verify$;

select 'worker_registration_command_verification PASS' as result;
rollback;
