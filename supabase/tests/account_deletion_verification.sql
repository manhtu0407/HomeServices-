begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    'b4400000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'build44-customer@example.test',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    'b4400000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'build44-worker@example.test',
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

update public.profiles
set full_name = 'Build 44 Customer', phone = '+84944000001'
where id = 'b4400000-0000-4000-8000-000000000001';

update public.profiles
set
  role = 'worker'::public.user_role,
  full_name = 'Build 44 Worker',
  phone = '+84944000002'
where id = 'b4400000-0000-4000-8000-000000000002';

insert into public.customer_profiles (id, building_name, unit_number, floor, district)
values (
  'b4400000-0000-4000-8000-000000000001',
  'Build 44 Tower',
  '44',
  '4',
  'Quận 1'
);

insert into public.worker_profiles (
  id,
  legal_name,
  bank_account,
  bank_name,
  home_lat,
  home_lng
) values (
  'b4400000-0000-4000-8000-000000000002',
  'Build 44 Worker',
  '0440000002',
  'Build 44 Bank',
  10.775,
  106.700
);

do $test$
declare
  customer_first uuid;
  customer_second uuid;
  worker_first uuid;
  worker_second uuid;
begin
  if has_table_privilege(
    'authenticated',
    'public.customer_account_deletion_requests',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.worker_account_deletion_requests',
    'select'
  ) then
    raise exception 'ACCOUNT_DELETION_REQUEST_TABLE_EXPOSED';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.prepare_customer_account_deletion_v2(uuid,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.prepare_worker_account_deletion(uuid,uuid)',
    'execute'
  ) then
    raise exception 'ACCOUNT_DELETION_RPC_EXPOSED';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  select request_id
  into customer_first
  from public.prepare_customer_account_deletion_v2(
    'b4400000-0000-4000-8000-000000000001',
    'b4400000-0000-4000-8000-000000000011'
  );

  select request_id
  into customer_second
  from public.prepare_customer_account_deletion_v2(
    'b4400000-0000-4000-8000-000000000001',
    'b4400000-0000-4000-8000-000000000011'
  );

  if customer_first is null or customer_first <> customer_second then
    raise exception 'CUSTOMER_DELETION_NOT_IDEMPOTENT';
  end if;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = 'b4400000-0000-4000-8000-000000000001'
      and (
        profile.account_state <> 'deletion_processing'
        or profile.full_name is not null
        or profile.phone is not null
      )
  ) then
    raise exception 'CUSTOMER_PROFILE_NOT_SCRUBBED';
  end if;

  select request_id
  into worker_first
  from public.prepare_worker_account_deletion(
    'b4400000-0000-4000-8000-000000000002',
    'b4400000-0000-4000-8000-000000000012'
  );

  select request_id
  into worker_second
  from public.prepare_worker_account_deletion(
    'b4400000-0000-4000-8000-000000000002',
    'b4400000-0000-4000-8000-000000000012'
  );

  if worker_first is null or worker_first <> worker_second then
    raise exception 'WORKER_DELETION_NOT_IDEMPOTENT';
  end if;

  if exists (
    select 1
    from public.worker_profiles worker
    where worker.id = 'b4400000-0000-4000-8000-000000000002'
      and (
        worker.legal_name is not null
        or worker.bank_account is not null
        or worker.bank_name is not null
        or worker.home_lat is not null
        or worker.home_lng is not null
        or worker.is_approved
        or worker.is_available
        or not worker.is_suspended
      )
  ) then
    raise exception 'WORKER_PROFILE_NOT_SCRUBBED';
  end if;
end;
$test$;

select 'account-deletion-remote-verification-passed' as verdict;

rollback;
