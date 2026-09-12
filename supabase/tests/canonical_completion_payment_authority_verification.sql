-- P68: rollback-only proof for atomic Customer completion and manual-bank ordering.

begin;

insert into auth.users(
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d6800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'completion-payment-customer@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'completion-payment-worker@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'worker'
where id = 'd6800000-0000-4000-8000-000000000002';

insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d6800000-0000-4000-8000-000000000001', 'Completion Building', 'D680', 'q7')
on conflict (id) do update
set building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  district = excluded.district;

insert into public.worker_profiles(
  id, service_types, selected_service_types, years_experience, districts,
  problem_specializations, is_approved, is_available, legal_name,
  date_of_birth, verification_status
) values (
  'd6800000-0000-4000-8000-000000000002',
  array['plumbing']::public.service_type[],
  array['plumbing']::public.service_type[],
  5,
  array['q7'],
  array[]::text[],
  true,
  true,
  'Completion Payment Worker',
  '1990-01-01',
  'approved'
);

insert into public.jobs(
  id, customer_id, worker_id, service_type, description, address_district,
  status, final_price, completion_notes, completion_photo_urls,
  worker_commission_level, worker_commission_rate_bps
) values
  (
    'd6800000-0000-4000-8000-000000000101',
    'd6800000-0000-4000-8000-000000000001',
    'd6800000-0000-4000-8000-000000000002',
    'plumbing',
    'Atomic completion payment verification.',
    'q7',
    'completed_by_worker',
    450000,
    'Đã hoàn tất và gửi bằng chứng.',
    array['supabase://job-media/d6800000-0000-4000-8000-000000000101/after/photo-1.jpg'],
    1,
    1000
  ),
  (
    'd6800000-0000-4000-8000-000000000102',
    'd6800000-0000-4000-8000-000000000001',
    'd6800000-0000-4000-8000-000000000002',
    'plumbing',
    'Missing completion evidence verification.',
    'q7',
    'completed_by_worker',
    300000,
    'Chưa có ảnh hoàn tất.',
    array[]::text[],
    1,
    1000
  );

insert into public.job_media_assets(
  job_id, owner_id, service_type, stage, bucket_id, object_path, mime_type
) values (
  'd6800000-0000-4000-8000-000000000101',
  'd6800000-0000-4000-8000-000000000002',
  'plumbing', 'after', 'job-media',
  'd6800000-0000-4000-8000-000000000101/after/photo-1.jpg', 'image/jpeg'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_first_operation_id uuid;
  v_index integer;
  v_result record;
  v_review record;
begin
  for v_index in 1..100 loop
    select * into strict v_result
    from public.confirm_completion_manual_bank_atomic(
      'd6800000-0000-4000-8000-000000000101',
      'd6800000-0000-4000-8000-000000000001',
      'completion-payment:d6800000-0000-4000-8000-000000000101:d6800000-0000-4000-8000-000000000001',
      450000,
      'NSAAAAAAAAAAAAAAAAAAAAAAAA',
      'NSAAAAAAAAAAAAAAAAAAAAAAAA',
      'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=450000&des=NSAAAAAAAAAAAAAAAAAAAAAAAA',
      now()
    );
    if v_result.status <> 'payment_pending'::public.job_status
      or v_result.payment_status <> 'manual_qr_ready'
      or v_result.final_price <> 450000
    then
      raise exception 'atomic completion receipt is invalid: %', row_to_json(v_result);
    end if;
    if v_index = 1 then
      if v_result.already_applied then
        raise exception 'first atomic completion was reported as a replay';
      end if;
      v_first_operation_id := v_result.operation_id;
    elsif not v_result.already_applied
      or v_result.operation_id is distinct from v_first_operation_id
    then
      raise exception 'duplicate completion did not return the stable receipt';
    end if;
  end loop;

  if (select count(*) from public.completion_payment_operations
      where job_id = 'd6800000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.job_payment_orders
      where job_id = 'd6800000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.worker_payment_ledger
      where job_id = 'd6800000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.job_events
      where job_id = 'd6800000-0000-4000-8000-000000000101'
        and event_type = 'customer_confirmed_completion') <> 1
    or (select count(*) from public.job_events
      where job_id = 'd6800000-0000-4000-8000-000000000101'
        and event_type = 'customer_started_payment') <> 1
  then
    raise exception 'atomic completion left duplicate or partial records';
  end if;

  select * into strict v_review
  from public.submit_review_atomic(
    'd6800000-0000-4000-8000-000000000101',
    'd6800000-0000-4000-8000-000000000001',
    5,
    array['professional'],
    'Must remain locked before verified payment.'
  );
  if v_review.ok or v_review.error_code <> 'INVALID_STATUS' then
    raise exception 'review opened before verified payment: %', row_to_json(v_review);
  end if;

  begin
    perform * from public.confirm_completion_manual_bank_atomic(
      'd6800000-0000-4000-8000-000000000102',
      'd6800000-0000-4000-8000-000000000001',
      'completion-payment:d6800000-0000-4000-8000-000000000102:d6800000-0000-4000-8000-000000000001',
      300000,
      'NSBBBBBBBBBBBBBBBBBBBBBBBB',
      'NSBBBBBBBBBBBBBBBBBBBBBBBB',
      'https://vietqr.app/img?acc=1234567890&bank=VCB&amount=300000&des=NSBBBBBBBBBBBBBBBBBBBBBBBB',
      now()
    );
    raise exception 'completion without media evidence was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' then raise; end if;
  end;

  if exists (
    select 1 from public.completion_payment_operations
    where job_id = 'd6800000-0000-4000-8000-000000000102'
  ) or exists (
    select 1 from public.job_payment_orders
    where job_id = 'd6800000-0000-4000-8000-000000000102'
  ) or exists (
    select 1 from public.jobs
    where id = 'd6800000-0000-4000-8000-000000000102'
      and status <> 'completed_by_worker'::public.job_status
  ) then
    raise exception 'rejected completion left a partial effect';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.completion_payment_operations', 'select')
    or not has_table_privilege('service_role', 'public.completion_payment_operations', 'select,insert,update')
    or has_function_privilege(
      'authenticated',
      'public.confirm_completion_manual_bank_atomic(uuid,uuid,text,integer,text,text,text,timestamptz)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.confirm_completion_manual_bank_atomic(uuid,uuid,text,integer,text,text,text,timestamptz)',
      'execute'
    )
    or has_function_privilege(
      'service_role', 'public.select_direct_worker_payment(uuid,uuid,text)', 'execute'
    )
    or has_function_privilege(
      'service_role', 'public.respond_to_direct_worker_payment(uuid,uuid,text,boolean)', 'execute'
    )
    or has_function_privilege(
      'service_role', 'public.acknowledge_worker_cash_payment(uuid,uuid,boolean)', 'execute'
    )
    or has_function_privilege(
      'service_role', 'public.confirm_worker_cash_payment(uuid,uuid)', 'execute'
    )
  then
    raise exception 'completion/payment least-privilege contract failed';
  end if;
end;
$$;

reset role;
rollback;
