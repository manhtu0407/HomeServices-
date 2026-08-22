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
  ),
  (
    'b4400000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'build44-media-owner@example.test',
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
)
on conflict (id) do update set
  building_name = excluded.building_name,
  unit_number = excluded.unit_number,
  floor = excluded.floor,
  district = excluded.district;

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
)
on conflict (id) do update set
  legal_name = excluded.legal_name,
  bank_account = excluded.bank_account,
  bank_name = excluded.bank_name,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng;

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  description,
  photo_urls,
  completion_photo_urls,
  apartment_access_state,
  status
) values (
  'b4400000-0000-4000-8000-000000000003',
  'b4400000-0000-4000-8000-000000000001',
  'b4400000-0000-4000-8000-000000000002',
  'electrical'::public.service_type,
  'Build 44 deletion media fixture',
  array[
    'supabase://job-media/b4400000-0000-4000-8000-000000000003/before/customer.jpg',
    'supabase://job-media/b4400000-0000-4000-8000-000000000003/kael_reference/customer-reference.jpg'
  ],
  array[
    'supabase://job-media/b4400000-0000-4000-8000-000000000003/after/worker.jpg'
  ],
  '{"handoff":"keep-until-access-media-owner-deletion"}'::jsonb,
  'cancelled'::public.job_status
);

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  description,
  photo_urls,
  apartment_access_state,
  status
) values
  (
    'b4400000-0000-4000-8000-000000000004',
    'b4400000-0000-4000-8000-000000000001',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'Build 44 Kael-only helper isolation fixture',
    array['supabase://job-media/b4400000-0000-4000-8000-000000000004/kael_reference/helper.jpg'],
    '{"handoff":"must-survive-kael-only-cleanup"}'::jsonb,
    'cancelled'::public.job_status
  ),
  (
    'b4400000-0000-4000-8000-000000000005',
    'b4400000-0000-4000-8000-000000000001',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'Build 44 access helper isolation fixture',
    array['supabase://job-media/b4400000-0000-4000-8000-000000000005/access_check_in/helper.jpg'],
    '{"handoff":"must-clear-with-access-media"}'::jsonb,
    'cancelled'::public.job_status
  );

insert into public.job_media_assets (
  job_id,
  owner_id,
  service_type,
  stage,
  bucket_id,
  object_path
) values
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000001',
    'electrical'::public.service_type,
    'before',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/before/customer.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'after',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/after/worker.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'cancellation_evidence',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/cancellation_evidence/worker.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'scope_change_evidence',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/scope_change_evidence/worker.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000001',
    'electrical'::public.service_type,
    'kael_reference',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/kael_reference/customer-reference.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000002',
    'electrical'::public.service_type,
    'access_check_in',
    'job-media',
    'b4400000-0000-4000-8000-000000000003/access_check_in/worker-lobby.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000004',
    'b4400000-0000-4000-8000-000000000006',
    'electrical'::public.service_type,
    'kael_reference',
    'job-media',
    'b4400000-0000-4000-8000-000000000004/kael_reference/helper.jpg'
  ),
  (
    'b4400000-0000-4000-8000-000000000005',
    'b4400000-0000-4000-8000-000000000006',
    'electrical'::public.service_type,
    'access_check_in',
    'job-media',
    'b4400000-0000-4000-8000-000000000005/access_check_in/helper.jpg'
  );

do $test$
declare
  customer_first uuid;
  customer_second uuid;
  worker_first uuid;
  worker_second uuid;
  helper_storage_refs text[];
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

  if has_function_privilege(
    'authenticated',
    'private.scrub_disposable_account_job_media(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'private.collect_account_deletion_job_media()',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'private.backfill_processing_account_job_media()',
    'execute'
  ) then
    raise exception 'ACCOUNT_DELETION_PRIVATE_HELPER_EXPOSED';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

  helper_storage_refs := private.scrub_disposable_account_job_media(
    'b4400000-0000-4000-8000-000000000006'
  );

  if not (
    'supabase://job-media/b4400000-0000-4000-8000-000000000004/kael_reference/helper.jpg'
      = any(helper_storage_refs)
    and 'supabase://job-media/b4400000-0000-4000-8000-000000000005/access_check_in/helper.jpg'
      = any(helper_storage_refs)
  ) then
    raise exception 'ACCOUNT_DELETION_HELPER_STORAGE_REFS_INCOMPLETE';
  end if;

  if not exists (
    select 1
    from public.jobs job
    where job.id = 'b4400000-0000-4000-8000-000000000004'
      and job.apartment_access_state = '{"handoff":"must-survive-kael-only-cleanup"}'::jsonb
  ) then
    raise exception 'KAEL_ONLY_MEDIA_CLEARED_APARTMENT_ACCESS_STATE';
  end if;

  if not exists (
    select 1
    from public.jobs job
    where job.id = 'b4400000-0000-4000-8000-000000000005'
      and job.apartment_access_state = '{}'::jsonb
  ) then
    raise exception 'ACCESS_MEDIA_DID_NOT_CLEAR_APARTMENT_ACCESS_STATE';
  end if;

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

  insert into public.job_media_upload_intents (
    job_id,
    owner_id,
    object_path,
    stage,
    mime_type,
    file_size_bytes,
    status,
    expires_at
  ) values (
    'b4400000-0000-4000-8000-000000000003',
    'b4400000-0000-4000-8000-000000000001',
    'b4400000-0000-4000-8000-000000000003/kael_reference/backfill.jpg',
    'kael_reference',
    'image/jpeg',
    44,
    'reserved',
    now() + interval '1 hour'
  );

  perform private.backfill_processing_account_job_media();

  if not exists (
    select 1
    from public.customer_account_deletion_requests deletion_request
    where deletion_request.id = customer_first
      and 'supabase://job-media/b4400000-0000-4000-8000-000000000003/kael_reference/customer-reference.jpg'
        = any(deletion_request.storage_refs)
      and 'supabase://job-media/b4400000-0000-4000-8000-000000000003/kael_reference/backfill.jpg'
        = any(deletion_request.storage_refs)
      and not (
        'supabase://job-media/b4400000-0000-4000-8000-000000000003/before/customer.jpg'
          = any(deletion_request.storage_refs)
      )
      and not (
        'supabase://job-media/b4400000-0000-4000-8000-000000000003/after/worker.jpg'
          = any(deletion_request.storage_refs)
      )
  ) then
    raise exception 'CUSTOMER_DELETION_JOB_MEDIA_OWNERSHIP_FAILED';
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

  if not exists (
    select 1
    from public.worker_account_deletion_requests deletion_request
    where deletion_request.id = worker_first
      and 'supabase://job-media/b4400000-0000-4000-8000-000000000003/access_check_in/worker-lobby.jpg'
        = any(deletion_request.storage_refs)
      and not (
        'supabase://job-media/b4400000-0000-4000-8000-000000000003/after/worker.jpg'
          = any(deletion_request.storage_refs)
      )
      and not (
        'supabase://job-media/b4400000-0000-4000-8000-000000000003/before/customer.jpg'
          = any(deletion_request.storage_refs)
      )
  ) then
    raise exception 'WORKER_DELETION_JOB_MEDIA_OWNERSHIP_FAILED';
  end if;

  if exists (
    select 1
    from public.job_media_assets asset
    where asset.owner_id in (
      'b4400000-0000-4000-8000-000000000001',
      'b4400000-0000-4000-8000-000000000002'
    )
      and asset.stage in ('kael_reference', 'access_check_in')
  ) then
    raise exception 'ACCOUNT_DELETION_DISPOSABLE_JOB_MEDIA_NOT_SCRUBBED';
  end if;

  if (
    select count(*)
    from public.job_media_assets asset
    where asset.owner_id in (
      'b4400000-0000-4000-8000-000000000001',
      'b4400000-0000-4000-8000-000000000002'
    )
      and asset.stage in ('before', 'after', 'cancellation_evidence', 'scope_change_evidence')
  ) <> 4 then
    raise exception 'ACCOUNT_DELETION_REQUIRED_JOB_EVIDENCE_NOT_RETAINED';
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
