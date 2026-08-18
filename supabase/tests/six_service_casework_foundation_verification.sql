-- Rollback-only actor/RLS verification for the six-service case-work foundation.
-- Run only against a local or staging database after the migration is applied.

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
    'a1100000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'casework-customer-one@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1100000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'casework-customer-two@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1100000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'casework-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1100000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'casework-outsider@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'worker'
where id = 'a1100000-0000-4000-8000-000000000003';

insert into public.customer_profiles (id, district) values
  ('a1100000-0000-4000-8000-000000000001', 'q7'),
  ('a1100000-0000-4000-8000-000000000002', 'q2')
on conflict (id) do update
set district = excluded.district;

insert into public.worker_profiles (
  id,
  service_types,
  years_experience,
  districts,
  is_approved,
  is_available,
  legal_name,
  date_of_birth,
  verification_status
) values (
  'a1100000-0000-4000-8000-000000000003',
  array['electrical']::public.service_type[],
  5,
  array['q7'],
  true,
  true,
  'Case-work Worker',
  '1990-01-01',
  'approved'
);

insert into public.jobs (
  id,
  customer_id,
  service_type,
  service_problem_id,
  description,
  address_district,
  status
) values (
  'a1200000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  'electrical',
  (select id from public.service_problems where slug = 'electrical-general'),
  'Synthetic case-work RLS fixture',
  'q7',
  'broadcasting'
);

insert into public.job_broadcasts (
  id,
  job_id,
  worker_id,
  status,
  sent_at,
  expires_at
) values (
  'a1300000-0000-4000-8000-000000000001',
  'a1200000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000003',
  'accepted',
  now(),
  now() + interval '5 minutes'
);

insert into public.job_worker_candidates (
  id,
  job_id,
  worker_id,
  broadcast_id,
  expires_at
) values (
  'a1400000-0000-4000-8000-000000000001',
  'a1200000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000003',
  'a1300000-0000-4000-8000-000000000001',
  now() + interval '5 minutes'
);

do $$
begin
  begin
    insert into public.job_worker_candidates (job_id, worker_id)
    values (
      'a1200000-0000-4000-8000-000000000001',
      'a1100000-0000-4000-8000-000000000003'
    );
    raise exception 'second active candidate unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'a1100000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if (
    select count(*)
    from public.job_worker_candidates
    where id = 'a1400000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'own customer could not read worker candidate';
  end if;

  begin
    update public.job_worker_candidates
    set status = 'customer_confirmed', customer_decided_at = now()
    where id = 'a1400000-0000-4000-8000-000000000001';
    raise exception 'customer directly updated server-owned candidate state';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.customer_favorite_workers (customer_id, worker_id)
  values (
    'a1100000-0000-4000-8000-000000000001',
    'a1100000-0000-4000-8000-000000000003'
  );

  if (
    select count(*)
    from public.customer_favorite_workers
    where customer_id = 'a1100000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'customer could not read own favorite-worker relation';
  end if;

  delete from public.customer_favorite_workers
  where customer_id = 'a1100000-0000-4000-8000-000000000001'
    and worker_id = 'a1100000-0000-4000-8000-000000000003';

  if exists (
    select 1
    from public.customer_favorite_workers
    where customer_id = 'a1100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'customer could not remove own favorite-worker relation';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1100000-0000-4000-8000-000000000002';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if exists (
    select 1
    from public.job_worker_candidates
    where id = 'a1400000-0000-4000-8000-000000000001'
  ) then
    raise exception 'other customer read a worker candidate outside their job';
  end if;

  if exists (
    select 1
    from public.customer_favorite_workers
    where customer_id = 'a1100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'other customer read private favorite-worker relation';
  end if;

  begin
    insert into public.customer_favorite_workers (customer_id, worker_id)
    values (
      'a1100000-0000-4000-8000-000000000001',
      'a1100000-0000-4000-8000-000000000003'
    );
    raise exception 'other customer wrote a private favorite-worker relation';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into public.customer_favorite_workers (customer_id, worker_id)
values (
  'a1100000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000003'
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1100000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if (
    select count(*)
    from public.job_worker_candidates
    where id = 'a1400000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'candidate worker could not read own candidacy';
  end if;

  if exists (
    select 1
    from public.customer_favorite_workers
    where customer_id = 'a1100000-0000-4000-8000-000000000001'
  ) then
    raise exception 'worker read a customer favorite-worker relation';
  end if;
end;
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a1100000-0000-4000-8000-000000000004';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  if exists (select 1 from public.job_worker_candidates) then
    raise exception 'outsider read a worker candidate';
  end if;
  if exists (select 1 from public.customer_favorite_workers) then
    raise exception 'outsider read a favorite-worker relation';
  end if;
end;
$$;

reset role;

do $$
begin
  if pg_catalog.has_table_privilege(
    'anon',
    'public.job_worker_candidates',
    'select'
  ) then
    raise exception 'anon can read worker candidates';
  end if;
  if pg_catalog.has_table_privilege(
    'anon',
    'public.customer_favorite_workers',
    'select'
  ) then
    raise exception 'anon can read customer favorite workers';
  end if;
  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.job_worker_candidates',
    'update'
  ) then
    raise exception 'authenticated can update server-owned worker candidates';
  end if;
  if not pg_catalog.has_table_privilege(
    'service_role', 'public.job_worker_candidates', 'insert'
  ) or not pg_catalog.has_table_privilege(
    'service_role', 'public.job_worker_candidates', 'update'
  ) or not pg_catalog.has_table_privilege(
    'service_role', 'public.job_worker_candidates', 'delete'
  ) then
    raise exception 'service_role lacks worker candidate orchestration privileges';
  end if;
end;
$$;

select jsonb_build_object(
  'one_active_candidate_constraint', true,
  'customer_candidate_isolation', true,
  'worker_candidate_visibility', true,
  'favorite_owner_write', true,
  'favorite_cross_customer_denied', true,
  'anonymous_access_denied', true,
  'server_owned_candidate_writes', true
) as six_service_casework_foundation_verification;

rollback;
