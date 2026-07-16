begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a3100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'intent-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'intent-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a3100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'intent-outsider@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set role = 'worker'
where id = 'a3100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district, status
) values (
  'a3200000-0000-4000-8000-000000000001',
  'a3100000-0000-4000-8000-000000000001',
  'a3100000-0000-4000-8000-000000000002',
  'electrical', 'Job-media upload-intent fixture', 'q7', 'worker_matched'
);

do $$
declare
  v_allowed boolean;
  v_reason text;
begin
  select result.allowed, result.reason
    into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/reserved.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not true or v_reason is not null then
    raise exception 'valid customer upload was not reserved';
  end if;

  select result.allowed, result.reason
    into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/null-stage.jpg',
    null,
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not false or v_reason <> 'INVALID_JOB_MEDIA_UPLOAD' then
    raise exception 'null upload stage was not rejected';
  end if;

  select result.allowed, result.reason
    into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not false or v_reason <> 'INVALID_JOB_MEDIA_UPLOAD' then
    raise exception 'empty object filename was not rejected';
  end if;

  select result.allowed, result.reason
    into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000002',
    'a3200000-0000-4000-8000-000000000001/before/worker.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not false or v_reason <> 'FORBIDDEN_JOB_MEDIA_STAGE' then
    raise exception 'worker reserved a customer-only media stage';
  end if;

  select result.allowed
    into v_allowed
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000003',
    'a3200000-0000-4000-8000-000000000001/before/outsider.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not false then
    raise exception 'outsider reserved job media';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = 'a3100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values (
      'job-media',
      'a3200000-0000-4000-8000-000000000001/before/direct-bypass.jpg',
      'a3100000-0000-4000-8000-000000000001',
      '{"mimetype":"image/jpeg","size":"10"}'
    );
    raise exception 'direct authenticated Storage upload bypass remained open';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

insert into storage.objects (bucket_id, name, owner, metadata) values
  (
    'job-media',
    'a3200000-0000-4000-8000-000000000001/before/reserved.jpg',
    'a3100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"10"}'
  );

do $$
declare
  v_allowed boolean;
  v_claimed_id uuid;
  v_claimed_path text;
  v_claim_token constant uuid := 'a3300000-0000-4000-8000-000000000001';
  v_completed integer;
  v_consumed integer;
  v_count integer;
  v_index integer;
  v_ok boolean;
  v_reason text;
  v_revoked_paths text[];
  v_status text;
begin
  select result.ok, result.reason, result.consumed_count
    into v_ok, v_reason, v_consumed
  from public.consume_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/reserved.jpg']
  ) as result;

  if v_ok is not true or v_reason is not null or v_consumed <> 1 then
    raise exception 'exact Storage object did not consume its reservation';
  end if;

  select result.ok, result.reason, result.consumed_count
    into v_ok, v_reason, v_consumed
  from public.consume_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/reserved.jpg']
  ) as result;

  if v_ok is not false or v_reason <> 'MEDIA_INTENT_MISSING_OR_EXPIRED' then
    raise exception 'concurrent attach reused an active validation lease';
  end if;

  select result.ok, result.reason, result.revoked_paths
    into v_ok, v_reason, v_revoked_paths
  from public.revoke_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/reserved.jpg']
  ) as result;

  if v_ok is not false or v_reason <> 'MEDIA_INTENT_STATE_CHANGED' then
    raise exception 'client revocation interrupted an in-flight attach';
  end if;

  select result.ok, result.reason, result.revoked_paths
    into v_ok, v_reason, v_revoked_paths
  from public.fail_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/reserved.jpg']
  ) as result;

  if v_ok is not true or v_reason is not null or cardinality(v_revoked_paths) <> 1 then
    raise exception 'server attach failure was not queued for cleanup';
  end if;

  select result.allowed
    into v_allowed
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/mismatch.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not true then
    raise exception 'mismatch fixture was not reserved';
  end if;

  insert into storage.objects (bucket_id, name, owner, metadata) values (
    'job-media',
    'a3200000-0000-4000-8000-000000000001/before/mismatch.jpg',
    'a3100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"11"}'
  );

  select result.ok, result.reason
    into v_ok, v_reason
  from public.consume_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/mismatch.jpg']
  ) as result;

  if v_ok is not false or v_reason <> 'MEDIA_INTENT_MISSING_OR_EXPIRED' then
    raise exception 'Storage metadata mismatch consumed a reservation';
  end if;

  select result.allowed
    into v_allowed
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/partial-revoke.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not true then
    raise exception 'partial revoke fixture was not reserved';
  end if;

  select result.ok, result.reason
    into v_ok, v_reason
  from public.revoke_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array[
      'a3200000-0000-4000-8000-000000000001/before/partial-revoke.jpg',
      'a3200000-0000-4000-8000-000000000001/before/missing-revoke.jpg'
    ]
  ) as result;

  select status
    into v_status
  from public.job_media_upload_intents
  where object_path = 'a3200000-0000-4000-8000-000000000001/before/partial-revoke.jpg';

  if v_ok is not false
     or v_reason <> 'MEDIA_INTENT_STATE_CHANGED'
     or v_status <> 'reserved'
  then
    raise exception 'partial revoke mutated a valid intent before rejecting the batch';
  end if;

  select result.allowed
    into v_allowed
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/partial-fail.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not true then
    raise exception 'partial fail fixture was not reserved';
  end if;

  select result.ok, result.reason
    into v_ok, v_reason
  from public.fail_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array[
      'a3200000-0000-4000-8000-000000000001/before/partial-fail.jpg',
      'a3200000-0000-4000-8000-000000000001/before/missing-fail.jpg'
    ]
  ) as result;

  select status
    into v_status
  from public.job_media_upload_intents
  where object_path = 'a3200000-0000-4000-8000-000000000001/before/partial-fail.jpg';

  if v_ok is not false
     or v_reason <> 'MEDIA_INTENT_STATE_CHANGED'
     or v_status <> 'reserved'
  then
    raise exception 'partial fail mutated a valid intent before rejecting the batch';
  end if;

  select result.allowed
    into v_allowed
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/revoke.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not true then
    raise exception 'revoke fixture was not reserved';
  end if;

  select result.ok, result.reason, result.revoked_paths
    into v_ok, v_reason, v_revoked_paths
  from public.revoke_job_media_uploads(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    array['a3200000-0000-4000-8000-000000000001/before/revoke.jpg']
  ) as result;

  if v_ok is not true or v_reason is not null or cardinality(v_revoked_paths) <> 1 then
    raise exception 'reserved upload was not queued for cleanup';
  end if;

  select result.intent_id, result.object_path
    into v_claimed_id, v_claimed_path
  from public.claim_job_media_cleanup_batch(
    v_claim_token,
    10,
    now() + interval '3 hours'
  ) as result
  where result.object_path = 'a3200000-0000-4000-8000-000000000001/before/revoke.jpg';

  if v_claimed_id is null or v_claimed_path is null then
    raise exception 'due cleanup item was not claimable';
  end if;

  select public.complete_job_media_cleanup(
    v_claim_token,
    array[v_claimed_id],
    now() + interval '3 hours'
  ) into v_completed;

  if v_completed <> 1 then
    raise exception 'claimed cleanup item was not completed';
  end if;

  for v_index in 1..10 loop
    select result.allowed
      into v_allowed
    from public.reserve_job_media_upload(
      'a3200000-0000-4000-8000-000000000001',
      'a3100000-0000-4000-8000-000000000001',
      format(
        'a3200000-0000-4000-8000-000000000001/before/quota-%s.jpg',
        v_index
      ),
      'before',
      'image/jpeg',
      10
    ) as result;

    if v_allowed is not true then
      raise exception 'pending quota fixture % was not reserved', v_index;
    end if;
  end loop;

  select result.allowed, result.reason
    into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a3200000-0000-4000-8000-000000000001',
    'a3100000-0000-4000-8000-000000000001',
    'a3200000-0000-4000-8000-000000000001/before/quota-overflow.jpg',
    'before',
    'image/jpeg',
    10
  ) as result;

  if v_allowed is not false or v_reason <> 'PENDING_JOB_MEDIA_QUOTA' then
    raise exception 'pending upload quota did not stop the eleventh reservation';
  end if;

  select count(*)::integer
  into v_count
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = any(array[
      'reserve_job_media_upload',
      'consume_job_media_uploads',
      'revoke_job_media_uploads',
      'fail_job_media_uploads',
      'claim_job_media_cleanup_batch',
      'complete_job_media_cleanup'
    ]::text[])
    and proc.prosecdef is true
    and proc.proconfig = array['search_path=""']::text[];

  if v_count <> 6 then
    raise exception 'job-media definer RPC search path is not empty';
  end if;
end $$;

rollback;
