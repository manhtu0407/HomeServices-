begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a4100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'atomic-memory-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a4100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'atomic-memory-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a4100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'atomic-memory-new-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set role = 'worker'
where id = 'a4100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district,
  status, kael_problem_identified, final_price, created_at, reviewed_at
) values
  (
    'a4200000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    'plumbing', 'Atomic memory newer review', 'q7', 'reviewed',
    'newer_pipe_issue', 450000, '2026-07-14T01:00:00Z', '2026-07-14T04:00:00Z'
  ),
  (
    'a4200000-0000-4000-8000-000000000002',
    'a4100000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    'plumbing', 'Atomic memory older review', 'q1', 'reviewed',
    'older_pipe_issue', 250000, '2026-07-14T01:00:00Z', '2026-07-14T03:00:00Z'
  ),
  (
    'a4200000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    'plumbing', 'Atomic cancellation and chat fixture', 'q7', 'worker_on_way',
    'active_pipe_issue', 300000, '2026-07-14T01:00:00Z', null
  ),
  (
    'a4200000-0000-4000-8000-000000000004',
    'a4100000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000002',
    'electrical', 'Atomic new memory row review', 'q3', 'reviewed',
    'new_electrical_issue', 350000, '2026-07-14T01:00:00Z', '2026-07-14T09:00:00Z'
  );

insert into public.reviews (
  id, job_id, customer_id, worker_id, rating, tags, created_at
) values
  (
    'a4300000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    5, array['on_time'], '2026-07-14T04:00:00Z'
  ),
  (
    'a4300000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000002',
    'a4100000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    2, array['late'], '2026-07-14T03:00:00Z'
  ),
  (
    'a4300000-0000-4000-8000-000000000003',
    'a4200000-0000-4000-8000-000000000004',
    'a4100000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000002',
    4, array['on_time'], '2026-07-14T09:00:00Z'
  );

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district,
  status, kael_problem_identified, final_price, created_at, reviewed_at
) values (
  'a4200000-0000-4000-8000-000000000005',
  'a4100000-0000-4000-8000-000000000003',
  'a4100000-0000-4000-8000-000000000002',
  'electrical', 'Mismatched review worker fixture', 'q3', 'reviewed',
  'mismatched_review_worker', 350000, '2026-07-14T01:00:00Z', '2026-07-14T10:00:00Z'
);

insert into public.reviews (
  id, job_id, customer_id, worker_id, rating, tags, created_at
) values (
  'a4300000-0000-4000-8000-000000000004',
  'a4200000-0000-4000-8000-000000000005',
  'a4100000-0000-4000-8000-000000000003',
  'a4100000-0000-4000-8000-000000000001',
  4, array['on_time'], '2026-07-14T10:00:00Z'
);

insert into public.chat_messages (
  id, job_id, sender_id, sender_role, content, created_at
) values
  (
    'a4400000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000002',
    'worker', 'Kael redacted contact content one.', '2026-07-14T05:00:00Z'
  ),
  (
    'a4400000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'a4100000-0000-4000-8000-000000000002',
    'worker', 'Kael redacted contact content two.', '2026-07-14T06:00:00Z'
  );

insert into public.worker_cancellation_requests (
  id, job_id, worker_id, status, reason, reason_code, reason_category,
  admin_review_required, fallback_options, abuse_signals, created_at
) values (
  'a4500000-0000-4000-8000-000000000001',
  'a4200000-0000-4000-8000-000000000003',
  'a4100000-0000-4000-8000-000000000002',
  'approved',
  'Call 090 123 4567 or atomic-worker@example.test; CCCD: 079 123 456 789; STK: 1234 5678 9012; căn A-1201 tầng 12 số nhà 88/3; Vinhomes Central Park; 91 Nguyễn Huệ.',
  'higher_pay_elsewhere', 'suspicious', true,
  '[{"id":"cancel_no_charge"}]'::jsonb,
  array['cancellation_rate_exceeded'],
  '2026-07-14T07:00:00Z'
);

insert into public.customer_cancellation_records (
  id, job_id, customer_id, worker_id, sub_case, reason_code,
  reason_category, reason_note, status, admin_review_required,
  worker_goodwill, abuse_signals, created_at
) values (
  'a4600000-0000-4000-8000-000000000001',
  'a4200000-0000-4000-8000-000000000003',
  'a4100000-0000-4000-8000-000000000001',
  'a4100000-0000-4000-8000-000000000002',
  'after_worker_accept', 'changed_mind', 'no_penalty_phase_0',
  'Call 090 765 4321 or atomic-customer@example.test; CMND: 025 987 654 321; bank: 9988 7766 5544; unit B-905 floor 9 so nha 42/7; Masteri Thảo Điền; 77/4 đường Lê Lợi.',
  'requested', true,
  '{"required":true,"kind":"phase0_goodwill_note","worker_id":"a4100000-0000-4000-8000-000000000002","amount":null}'::jsonb,
  array['cancel_after_accept_threshold'],
  '2026-07-14T08:00:00Z'
);

insert into public.customer_kael_memory (
  customer_id, preference_summary, service_preferences, home_context, trust_signals, safe_metadata
) values (
  'a4100000-0000-4000-8000-000000000001',
  'Ưu tiên trao đổi ngắn gọn bằng tiếng Việt.',
  '{"plumbing":{"legacy_preference":"keep","observed_at":"not-a-time"},"untouched_service":{"value":1}}'::jsonb,
  '{"untouched_home":true}'::jsonb,
  '{"untouched_customer_trust":true}'::jsonb,
  '{"untouched_customer_meta":true,"last_normal_transaction":{"observed_at":"not-a-time"}}'::jsonb
);

insert into public.worker_kael_memory (
  worker_id, service_skill_summary, service_skill_proficiency, reliability_signals, red_flags, safe_metadata
) values (
  'a4100000-0000-4000-8000-000000000002',
  'Kỹ năng do thợ tự mô tả bằng tiếng Việt.',
  '{"plumbing":{"legacy_skill":"keep","observed_at":"not-a-time"},"untouched_service":{"value":2}}'::jsonb,
  '{"untouched_worker_reliability":true}'::jsonb,
  '{"untouched_worker_flag":true,"disintermediation_risk_count":7,"last_disintermediation_at":"not-a-time"}'::jsonb,
  '{"untouched_worker_meta":true,"last_normal_transaction":{"observed_at":"not-a-time"}}'::jsonb
);

set local role service_role;

do $$
declare
  v_applied boolean;
  v_count bigint;
begin
  select applied into v_applied
  from public.record_normal_transaction_memory_atomic(
    'a4200000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001'
  );
  if v_applied is not true then
    raise exception 'newer normal transaction was not applied';
  end if;

  select applied into v_applied
  from public.record_normal_transaction_memory_atomic(
    'a4200000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001'
  );
  if v_applied is not false then
    raise exception 'duplicate normal transaction was applied twice';
  end if;

  select applied into v_applied
  from public.record_normal_transaction_memory_atomic(
    'a4200000-0000-4000-8000-000000000002',
    'a4100000-0000-4000-8000-000000000001'
  );
  if v_applied is not true then
    raise exception 'distinct older normal transaction was not recorded';
  end if;

  select applied, disintermediation_risk_count
  into v_applied, v_count
  from public.record_worker_disintermediation_memory_atomic(
    'a4100000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'a4400000-0000-4000-8000-000000000002',
    array['phone', 'zalo', 'off_app']
  );
  if v_applied is not true or v_count <> 8 then
    raise exception 'first distinct disintermediation event count was not exact';
  end if;

  select applied, disintermediation_risk_count
  into v_applied, v_count
  from public.record_worker_disintermediation_memory_atomic(
    'a4100000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'a4400000-0000-4000-8000-000000000001',
    array['phone']
  );
  if v_applied is not true or v_count <> 9 then
    raise exception 'second distinct disintermediation event count was not exact';
  end if;

  select applied, disintermediation_risk_count
  into v_applied, v_count
  from public.record_worker_disintermediation_memory_atomic(
    'a4100000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'a4400000-0000-4000-8000-000000000002',
    array['phone', 'zalo', 'off_app']
  );
  if v_applied is not false or v_count <> 9 then
    raise exception 'duplicate disintermediation event changed the exact count';
  end if;

  select applied into v_applied
  from public.record_worker_cancellation_memory_atomic(
    'a4500000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'explicit_cancel'
  );
  if v_applied is not true then
    raise exception 'worker cancellation memory was not applied';
  end if;

  select applied into v_applied
  from public.record_worker_cancellation_memory_atomic(
    'a4500000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000002',
    'a4200000-0000-4000-8000-000000000003',
    'explicit_cancel'
  );
  if v_applied is not false then
    raise exception 'duplicate worker cancellation was applied twice';
  end if;

  select applied into v_applied
  from public.record_customer_cancellation_memory_atomic(
    'a4600000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000003'
  );
  if v_applied is not true then
    raise exception 'customer cancellation memory was not applied';
  end if;

  select applied into v_applied
  from public.record_customer_cancellation_memory_atomic(
    'a4600000-0000-4000-8000-000000000001',
    'a4100000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000003'
  );
  if v_applied is not false then
    raise exception 'duplicate customer cancellation was applied twice';
  end if;

  select applied into v_applied
  from public.record_normal_transaction_memory_atomic(
    'a4200000-0000-4000-8000-000000000004',
    'a4100000-0000-4000-8000-000000000003'
  );
  if v_applied is not true then
    raise exception 'normal transaction did not create a new customer memory row';
  end if;
end $$;

reset role;

do $$
declare
  v_customer public.customer_kael_memory%rowtype;
  v_customer_reason text;
  v_new_customer public.customer_kael_memory%rowtype;
  v_worker public.worker_kael_memory%rowtype;
  v_worker_reason text;
begin
  select * into strict v_customer
  from public.customer_kael_memory
  where customer_id = 'a4100000-0000-4000-8000-000000000001';

  select * into strict v_worker
  from public.worker_kael_memory
  where worker_id = 'a4100000-0000-4000-8000-000000000002';

  select * into strict v_new_customer
  from public.customer_kael_memory
  where customer_id = 'a4100000-0000-4000-8000-000000000003';

  v_customer_reason := v_customer.safe_metadata
    #>> '{last_customer_cancellation_review,sanitized_reason}';
  v_worker_reason := v_worker.safe_metadata
    #>> '{last_worker_cancellation_review,sanitized_reason}';

  if v_customer.preference_summary <> 'Ưu tiên trao đổi ngắn gọn bằng tiếng Việt.'
    or v_customer.home_context ->> 'untouched_home' <> 'true'
    or v_customer.trust_signals ->> 'untouched_customer_trust' <> 'true'
    or v_customer.safe_metadata ->> 'untouched_customer_meta' <> 'true'
    or v_customer.service_preferences #>> '{plumbing,legacy_preference}' <> 'keep'
    or v_customer.service_preferences #>> '{untouched_service,value}' <> '1'
    or v_customer.service_preferences #>> '{plumbing,last_rating}' <> '5'
    or v_customer.service_preferences #>> '{plumbing,last_normal_job_id}'
      <> 'a4200000-0000-4000-8000-000000000001'
  then
    raise exception 'customer memory lost a preference or regressed chronological state';
  end if;

  if v_worker.service_skill_summary <> 'Kỹ năng do thợ tự mô tả bằng tiếng Việt.'
    or v_worker.reliability_signals ->> 'untouched_worker_reliability' <> 'true'
    or v_worker.red_flags ->> 'untouched_worker_flag' <> 'true'
    or v_worker.safe_metadata ->> 'untouched_worker_meta' <> 'true'
    or v_worker.service_skill_proficiency #>> '{plumbing,legacy_skill}' <> 'keep'
    or v_worker.service_skill_proficiency #>> '{untouched_service,value}' <> '2'
    or v_worker.service_skill_proficiency #>> '{plumbing,last_rating}' <> '5'
    or v_worker.service_skill_proficiency #>> '{plumbing,last_normal_job_id}'
      <> 'a4200000-0000-4000-8000-000000000001'
    or v_worker.red_flags ->> 'disintermediation_risk_count' <> '9'
    or v_worker.red_flags ->> 'last_disintermediation_job_id'
      <> 'a4200000-0000-4000-8000-000000000003'
    or v_worker.safe_metadata #>> '{last_disintermediation_guard,message_id}'
      <> 'a4400000-0000-4000-8000-000000000002'
  then
    raise exception 'worker memory lost a summary, key, count, or chronological state';
  end if;

  if v_new_customer.preference_summary <> '' then
    raise exception 'new customer memory did not keep the language-neutral summary default';
  end if;

  if (
    select count(*) from public.kael_memory_update_receipts
    where subject_id in (
      'a4100000-0000-4000-8000-000000000001',
      'a4100000-0000-4000-8000-000000000002'
    )
  ) <> 6 then
    raise exception 'receipt cardinality is not exactly one per durable source event';
  end if;

  if (
    select count(*) from public.job_events
    where job_id in (
      'a4200000-0000-4000-8000-000000000001',
      'a4200000-0000-4000-8000-000000000002'
    ) and event_type = 'kael_memory_l2_observed'
  ) <> 2 then
    raise exception 'normal transaction memory job events were duplicated or omitted';
  end if;

  if (
    select count(*) from public.kael_admin_queue
    where job_id = 'a4200000-0000-4000-8000-000000000003'
  ) <> 4 then
    raise exception 'atomic memory queues were duplicated or omitted';
  end if;

  if not (
    v_worker_reason like '%[phone]%'
    and v_worker_reason like '%[email]%'
    and v_worker_reason like '%[id-number]%'
    and v_worker_reason like '%[bank-account]%'
    and v_worker_reason like '%[unit]%'
    and v_worker_reason like '%[floor]%'
    and v_worker_reason like '%[house-no]%'
    and v_worker_reason like '%[building]%'
    and v_customer_reason like '%[phone]%'
    and v_customer_reason like '%[email]%'
    and v_customer_reason like '%[id-number]%'
    and v_customer_reason like '%[bank-account]%'
    and v_customer_reason like '%[unit]%'
    and v_customer_reason like '%[floor]%'
    and v_customer_reason like '%[house-no]%'
    and v_customer_reason like '%[building]%'
  )
    or not exists (
      select 1
      from public.kael_admin_queue
      where job_id = 'a4200000-0000-4000-8000-000000000003'
        and queue_type = 'worker_cancellation_review'
        and safe_metadata ->> 'sanitized_reason' = v_worker_reason
    )
    or not exists (
      select 1
      from public.kael_admin_queue
      where job_id = 'a4200000-0000-4000-8000-000000000003'
        and queue_type = 'customer_cancellation_review'
        and safe_metadata ->> 'sanitized_reason' = v_customer_reason
    )
  then
    raise exception 'cancellation sanitizer did not retain every required redaction marker';
  end if;

  if exists (
    select 1
    from public.kael_admin_queue
    where job_id = 'a4200000-0000-4000-8000-000000000003'
      and (
        safe_metadata::text like '%090 123 4567%'
        or safe_metadata::text like '%090 765 4321%'
        or safe_metadata::text like '%atomic-worker@example.test%'
        or safe_metadata::text like '%atomic-customer@example.test%'
        or safe_metadata::text like '%079 123 456 789%'
        or safe_metadata::text like '%025 987 654 321%'
        or safe_metadata::text like '%1234 5678 9012%'
        or safe_metadata::text like '%9988 7766 5544%'
        or safe_metadata::text like '%A-1201%'
        or safe_metadata::text like '%B-905%'
        or safe_metadata::text like '%88/3%'
        or safe_metadata::text like '%42/7%'
        or safe_metadata::text like '%Vinhomes Central Park%'
        or safe_metadata::text like '%Masteri Thảo Điền%'
        or safe_metadata::text like '%91 Nguyễn Huệ%'
        or safe_metadata::text like '%77/4 đường Lê Lợi%'
      )
  ) or v_customer.safe_metadata::text like '%090 765 4321%'
    or v_customer.safe_metadata::text like '%atomic-customer@example.test%'
    or v_customer.safe_metadata::text like '%025 987 654 321%'
    or v_customer.safe_metadata::text like '%9988 7766 5544%'
    or v_customer.safe_metadata::text like '%B-905%'
    or v_customer.safe_metadata::text like '%42/7%'
    or v_customer.safe_metadata::text like '%Masteri Thảo Điền%'
    or v_customer.safe_metadata::text like '%77/4 đường Lê Lợi%'
    or v_worker.safe_metadata::text like '%090 123 4567%'
    or v_worker.safe_metadata::text like '%atomic-worker@example.test%'
    or v_worker.safe_metadata::text like '%079 123 456 789%'
    or v_worker.safe_metadata::text like '%1234 5678 9012%'
    or v_worker.safe_metadata::text like '%A-1201%'
    or v_worker.safe_metadata::text like '%88/3%'
    or v_worker.safe_metadata::text like '%Vinhomes Central Park%'
    or v_worker.safe_metadata::text like '%91 Nguyễn Huệ%'
  then
    raise exception 'cancellation memory or queue leaked a raw contact excerpt';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_worker_disintermediation_memory_atomic(uuid,uuid,uuid,text[])',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_normal_transaction_memory_atomic(uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_worker_cancellation_memory_atomic(uuid,uuid,uuid,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.record_customer_cancellation_memory_atomic(uuid,uuid,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.record_worker_disintermediation_memory_atomic(uuid,uuid,uuid,text[])',
    'execute'
  ) or has_table_privilege(
    'authenticated',
    'public.kael_memory_update_receipts',
    'select'
  ) then
    raise exception 'service-role-only memory update privilege contract failed';
  end if;
end $$;

set local role service_role;

do $$
begin
  perform public.record_normal_transaction_memory_atomic(
    'a4200000-0000-4000-8000-000000000005',
    'a4100000-0000-4000-8000-000000000003'
  );
  raise exception 'mismatched review worker was accepted by normal memory';
exception
  when sqlstate '22023' then null;
end $$;

do $$
begin
  perform public.record_worker_disintermediation_memory_atomic(
    'a4100000-0000-4000-8000-000000000001',
    'a4200000-0000-4000-8000-000000000003',
    'a4400000-0000-4000-8000-000000000002',
    array['phone']
  );
  raise exception 'mismatched worker chat actor was accepted';
exception
  when sqlstate '22023' then null;
end $$;

reset role;

rollback;
