-- Rollback-only RLS verification for the no-raw-audio job-media boundary.
-- Run against local/staging after 20260711065000.

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

set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-media', 'a2200000-0000-4000-8000-000000000001/before/photo.jpg',
   'a2100000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":"10"}'),
  ('job-media', 'a2200000-0000-4000-8000-000000000001/before/clip.mp4',
   'a2100000-0000-4000-8000-000000000001', '{"mimetype":"video/mp4","size":"10"}');

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/before/voice.m4a',
       'a2100000-0000-4000-8000-000000000001', '{"mimetype":"audio/m4a","size":"10"}');
    raise exception 'customer raw audio unexpectedly passed job-media RLS';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/before/fake.mp3',
       'a2100000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":"10"}');
    raise exception 'MIME/extension mismatch unexpectedly passed job-media RLS';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-media', 'a2200000-0000-4000-8000-000000000001/scope_change_evidence/scope.png',
   'a2100000-0000-4000-8000-000000000002', '{"mimetype":"image/png","size":"10"}');

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/cancellation_evidence/voice.mp4',
       'a2100000-0000-4000-8000-000000000002', '{"mimetype":"audio/mp4","size":"10"}');
    raise exception 'worker raw audio unexpectedly passed job-media RLS';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('job-media', 'a2200000-0000-4000-8000-000000000001/scope_change_evidence/clip.mp4',
       'a2100000-0000-4000-8000-000000000002', '{"mimetype":"video/mp4","size":"10"}');
    raise exception 'video unexpectedly passed image-only scope evidence RLS';
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

rollback;
