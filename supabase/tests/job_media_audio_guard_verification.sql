-- Rollback-only verification for the server-issued job-media upload boundary.
-- Run against local/staging after 20260714092842.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a2100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'media-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'media-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a2100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'media-outsider@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker'
where id = 'a2100000-0000-4000-8000-000000000002';

insert into public.jobs (
  id, customer_id, worker_id, service_type, description, address_district, status
) values (
  'a2200000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000001',
  'a2100000-0000-4000-8000-000000000002',
  'electrical', 'Job-media RLS fixture', 'q7', 'worker_matched'
);

do $$
declare
  v_allowed boolean;
  v_reason text;
begin
  select result.allowed into v_allowed
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001/before/photo.jpg',
    'before', 'image/jpeg', 10
  ) as result;
  if v_allowed is not true then
    raise exception 'customer photo reservation was rejected';
  end if;

  select result.allowed into v_allowed
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001/before/clip.mp4',
    'before', 'video/mp4', 10
  ) as result;
  if v_allowed is not true then
    raise exception 'customer video reservation was rejected';
  end if;

  select result.allowed into v_allowed
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'a2200000-0000-4000-8000-000000000001/scope_change_evidence/scope.png',
    'scope_change_evidence', 'image/png', 10
  ) as result;
  if v_allowed is not true then
    raise exception 'worker scope-evidence reservation was rejected';
  end if;

  select result.allowed into v_allowed
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'a2200000-0000-4000-8000-000000000001/kael_reference/worker.jpg',
    'kael_reference', 'image/jpeg', 10
  ) as result;
  if v_allowed is not true then
    raise exception 'worker Kael-reference reservation was rejected';
  end if;

  select result.allowed, result.reason into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001/before/voice.m4a',
    'before', 'audio/m4a', 10
  ) as result;
  if v_allowed is not false or v_reason <> 'INVALID_JOB_MEDIA_UPLOAD' then
    raise exception 'raw audio reservation passed the job-media boundary';
  end if;

  select result.allowed, result.reason into v_allowed, v_reason
  from public.reserve_job_media_upload(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    'a2200000-0000-4000-8000-000000000001/scope_change_evidence/clip.mp4',
    'scope_change_evidence', 'video/mp4', 10
  ) as result;
  if v_allowed is not false or v_reason <> 'UNSUPPORTED_JOB_MEDIA' then
    raise exception 'worker video reservation passed an image-only stage';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/before/direct.jpg',
       'a2100000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":"10"}');
    raise exception 'customer bypassed the server-issued upload boundary';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/kael_reference/direct-worker.jpg',
       'a2100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":"10"}');
    raise exception 'worker bypassed the server-issued upload boundary';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/before/outsider.jpg',
       'a2100000-0000-4000-8000-000000000003', '{"mimetype":"image/jpeg","size":"10"}');
    raise exception 'outsider unexpectedly uploaded job media';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-media', 'a2200000-0000-4000-8000-000000000001/before/photo.jpg',
   'a2100000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":"10"}'),
  ('job-media', 'a2200000-0000-4000-8000-000000000001/before/clip.mp4',
   'a2100000-0000-4000-8000-000000000001', '{"mimetype":"video/mp4","size":"10"}'),
  ('job-media', 'a2200000-0000-4000-8000-000000000001/scope_change_evidence/scope.png',
   'a2100000-0000-4000-8000-000000000002', '{"mimetype":"image/png","size":"10"}'),
  ('job-media', 'a2200000-0000-4000-8000-000000000001/kael_reference/worker.jpg',
   'a2100000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":"10"}');

do $$
declare
  v_consumed integer;
  v_ok boolean;
begin
  select result.ok, result.consumed_count into v_ok, v_consumed
  from public.consume_job_media_uploads(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000001',
    array[
      'a2200000-0000-4000-8000-000000000001/before/photo.jpg',
      'a2200000-0000-4000-8000-000000000001/before/clip.mp4'
    ]
  ) as result;
  if v_ok is not true or v_consumed <> 2 then
    raise exception 'customer signed-upload fixtures were not consumed';
  end if;

  select result.ok, result.consumed_count into v_ok, v_consumed
  from public.consume_job_media_uploads(
    'a2200000-0000-4000-8000-000000000001',
    'a2100000-0000-4000-8000-000000000002',
    array[
      'a2200000-0000-4000-8000-000000000001/scope_change_evidence/scope.png',
      'a2200000-0000-4000-8000-000000000001/kael_reference/worker.jpg'
    ]
  ) as result;
  if v_ok is not true or v_consumed <> 2 then
    raise exception 'worker signed-upload fixtures were not consumed';
  end if;
end;
$$;

rollback;
