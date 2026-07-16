begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'verification-cleanup-owner@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    'a5100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'verification-cleanup-outsider@example.test',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

update public.profiles
set role = 'worker'::public.user_role
where id = 'a5100000-0000-4000-8000-000000000001';

insert into storage.objects (bucket_id, name, owner, metadata) values
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/cccd-front/submitted-front.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/cccd-back/submitted-back.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/selfie/submitted-selfie.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/cccd-front/unsubmitted.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/cccd-front/../traversal.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000001/passport/wrong-folder.jpg',
    'a5100000-0000-4000-8000-000000000001',
    '{"mimetype":"image/jpeg","size":"1024"}'
  ),
  (
    'worker-verification',
    'a5100000-0000-4000-8000-000000000002/cccd-front/outsider.jpg',
    'a5100000-0000-4000-8000-000000000002',
    '{"mimetype":"image/jpeg","size":"1024"}'
  );

do $$
declare
  v_result record;
begin
  select * into v_result
  from public.submit_worker_registration_atomic(
    'a5100000-0000-4000-8000-000000000001',
    'a5100000-0000-4000-8000-000000000001',
    'Nguyen Van Cleanup',
    '1990-01-15'::date,
    'male',
    array['electrical'::public.service_type],
    5,
    array['q1'],
    10.775,
    106.7,
    8,
    array['outlet_repair'],
    'supabase://worker-verification/a5100000-0000-4000-8000-000000000001/cccd-front/submitted-front.jpg',
    'supabase://worker-verification/a5100000-0000-4000-8000-000000000001/cccd-back/submitted-back.jpg',
    'supabase://worker-verification/a5100000-0000-4000-8000-000000000001/selfie/submitted-selfie.jpg',
    '0123456789',
    'Vietcombank'
  );

  if v_result.ok is not true then
    raise exception 'verification cleanup fixture registration failed';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a5100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if private.can_delete_worker_verification_draft(
    'a5100000-0000-4000-8000-000000000001/cccd-front/unsubmitted.jpg',
    'a5100000-0000-4000-8000-000000000001'
  ) is not true then
    raise exception 'owner draft was not deletable';
  end if;
  if private.can_delete_worker_verification_draft(
    'a5100000-0000-4000-8000-000000000001/cccd-front/submitted-front.jpg',
    'a5100000-0000-4000-8000-000000000001'
  ) is true then
    raise exception 'submitted verification ref was deletable';
  end if;
  if private.can_delete_worker_verification_draft(
    'a5100000-0000-4000-8000-000000000002/cccd-front/outsider.jpg',
    'a5100000-0000-4000-8000-000000000002'
  ) is true then
    raise exception 'cross-owner verification draft was deletable';
  end if;
  if private.can_delete_worker_verification_draft(
    'a5100000-0000-4000-8000-000000000001/cccd-front/../traversal.jpg',
    'a5100000-0000-4000-8000-000000000001'
  ) is true then
    raise exception 'verification traversal path was deletable';
  end if;
  if private.can_delete_worker_verification_draft(
    'a5100000-0000-4000-8000-000000000001/passport/wrong-folder.jpg',
    'a5100000-0000-4000-8000-000000000001'
  ) is true then
    raise exception 'wrong verification folder was deletable';
  end if;
end;
$$;

reset role;

rollback;
