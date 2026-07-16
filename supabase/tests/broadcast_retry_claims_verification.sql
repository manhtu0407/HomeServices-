\set ON_ERROR_STOP on

\getenv dblink_connstr NESTSCOUT_TEST_DB_URL
\if :{?dblink_connstr}
\else
do $missing_connection$
begin
  raise exception 'NESTSCOUT_TEST_DB_URL is required for dblink concurrency verification.';
end;
$missing_connection$;
\endif

select exists (
  select 1 from pg_catalog.pg_extension where extname = 'dblink'
) as dblink_preexisting \gset

create extension if not exists dblink;

delete from public.jobs
where id = 'b7130000-0000-4000-8000-000000000001';
delete from auth.users
where id in (
  'b7110000-0000-4000-8000-000000000001',
  'b7120000-0000-4000-8000-000000000001'
);

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
    'b7110000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'broadcast-claim-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  ),
  (
    'b7120000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'broadcast-claim-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

update public.profiles
set role = 'worker'
where id = 'b7120000-0000-4000-8000-000000000001';

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
  'b7120000-0000-4000-8000-000000000001',
  array['electrical']::public.service_type[],
  5,
  array['q7'],
  true,
  true,
  'Broadcast Claim Worker',
  '1990-01-01',
  'approved'
);

insert into public.jobs (
  id,
  customer_id,
  service_type,
  description,
  address_district,
  status
) values (
  'b7130000-0000-4000-8000-000000000001',
  'b7110000-0000-4000-8000-000000000001',
  'electrical',
  'Verify durable broadcast retry claims.',
  'q7',
  'broadcasting'
);

do $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_first record;
  v_duplicate record;
  v_wrong_owner record;
  v_wrong_release record;
  v_release record;
  v_reclaimed record;
  v_stale record;
  v_takeover record;
  v_active record;
  v_after_expiry record;
begin
  select * into v_first
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000001',
    180
  );
  if v_first.claimed is not true or v_first.error_code is not null then
    raise exception 'first broadcast retry claim was not acquired';
  end if;

  select * into v_duplicate
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000002',
    180
  );
  if v_duplicate.claimed is not false or v_duplicate.error_code <> 'CLAIM_ACTIVE' then
    raise exception 'fresh broadcast retry claim was acquired twice';
  end if;

  select * into v_wrong_owner
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7120000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000003',
    180
  );
  if v_wrong_owner.claimed is not false or v_wrong_owner.error_code <> 'NOT_OWNER' then
    raise exception 'non-owner acquired a broadcast retry claim';
  end if;

  select * into v_wrong_release
  from public.release_job_broadcast_retry_claim_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000004'
  );
  if v_wrong_release.released is not false then
    raise exception 'mismatched token released a broadcast retry claim';
  end if;

  select * into v_release
  from public.release_job_broadcast_retry_claim_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000001'
  );
  if v_release.released is not true then
    raise exception 'exact broadcast retry token was not released';
  end if;

  select * into v_reclaimed
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000005',
    30
  );
  if v_reclaimed.claimed is not true then
    raise exception 'released broadcast retry claim was not reusable';
  end if;

  update public.job_broadcast_retry_claims
  set claimed_at = pg_catalog.clock_timestamp() - interval '2 minutes',
      expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
  where job_id = 'b7130000-0000-4000-8000-000000000001';

  select * into v_stale
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000006',
    30
  );
  if v_stale.claimed is not true then
    raise exception 'expired broadcast retry claim was not recovered';
  end if;

  select * into v_takeover
  from public.release_job_broadcast_retry_claim_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000006'
  );
  if v_takeover.released is not true then
    raise exception 'recovered broadcast retry claim was not releasable';
  end if;

  insert into public.job_broadcasts (
    id,
    job_id,
    worker_id,
    status,
    sent_at,
    expires_at
  ) values (
    'b7140000-0000-4000-8000-000000000001',
    'b7130000-0000-4000-8000-000000000001',
    'b7120000-0000-4000-8000-000000000001',
    'sent',
    v_now,
    v_now + interval '5 minutes'
  );

  select * into v_active
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000007',
    180
  );
  if v_active.claimed is not false or v_active.error_code <> 'ACTIVE_BROADCAST'
    or exists (
      select 1
      from public.job_broadcast_retry_claims
      where job_id = 'b7130000-0000-4000-8000-000000000001'
    )
  then
    raise exception 'active broadcast did not reject and clean its retry claim';
  end if;

  update public.job_broadcasts
  set expires_at = v_now - interval '1 second'
  where id = 'b7140000-0000-4000-8000-000000000001';

  select * into v_after_expiry
  from public.claim_job_broadcast_retry_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000008',
    180
  );
  if v_after_expiry.claimed is not true then
    raise exception 'expired broadcast incorrectly blocked a retry claim';
  end if;

  perform public.release_job_broadcast_retry_claim_atomic(
    'b7130000-0000-4000-8000-000000000001',
    'b7110000-0000-4000-8000-000000000001',
    'b7150000-0000-4000-8000-000000000008'
  );
end;
$$;

delete from public.job_broadcasts
where job_id = 'b7130000-0000-4000-8000-000000000001';
delete from public.job_broadcast_retry_claims
where job_id = 'b7130000-0000-4000-8000-000000000001';

select dblink_connect('broadcast_claim_a', :'dblink_connstr');
select dblink_connect('broadcast_claim_b', :'dblink_connstr');

select dblink_send_query('broadcast_claim_a', $remote$
  with claimed as materialized (
    select *
    from public.claim_job_broadcast_retry_atomic(
      'b7130000-0000-4000-8000-000000000001',
      'b7110000-0000-4000-8000-000000000001',
      'b7160000-0000-4000-8000-000000000001',
      180
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claim_row)::text
  from claimed as claim_row cross join pause_after_claim;
$remote$);

select dblink_send_query('broadcast_claim_b', $remote$
  with claimed as materialized (
    select *
    from public.claim_job_broadcast_retry_atomic(
      'b7130000-0000-4000-8000-000000000001',
      'b7110000-0000-4000-8000-000000000001',
      'b7160000-0000-4000-8000-000000000002',
      180
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claim_row)::text
  from claimed as claim_row cross join pause_after_claim;
$remote$);

create temporary table broadcast_claim_concurrent_results (payload jsonb not null);

insert into broadcast_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('broadcast_claim_a') as remote_result(payload text);

insert into broadcast_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('broadcast_claim_b') as remote_result(payload text);

select dblink_disconnect('broadcast_claim_a');
select dblink_disconnect('broadcast_claim_b');

do $$
declare
  v_security_definer boolean;
  v_config text[];
begin
  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.count(*) filter (where payload->>'claimed' = 'true') <> 1
      or pg_catalog.count(*) filter (where payload->>'error_code' = 'CLAIM_ACTIVE') <> 1
    from broadcast_claim_concurrent_results
  ) then
    raise exception 'concurrent broadcast retry claims were not serialized';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.release_job_broadcast_retry_claim_atomic(uuid, uuid, uuid)',
    'execute'
  ) then
    raise exception 'broadcast retry claim RPC privileges are unsafe';
  end if;

  select function_row.prosecdef, function_row.proconfig
    into v_security_definer, v_config
    from pg_catalog.pg_proc as function_row
    where function_row.oid = pg_catalog.to_regprocedure(
      'public.claim_job_broadcast_retry_atomic(uuid, uuid, uuid, integer)'
    );
  if v_security_definer is distinct from true
    or v_config is distinct from array['search_path=""']::text[]
  then
    raise exception 'broadcast retry claim RPC configuration is unsafe';
  end if;

  if not (
    select table_row.relrowsecurity
    from pg_catalog.pg_class as table_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'job_broadcast_retry_claims'
  ) then
    raise exception 'broadcast retry claims table does not enforce RLS';
  end if;
end;
$$;

delete from public.job_broadcast_retry_claims
where job_id = 'b7130000-0000-4000-8000-000000000001';
delete from public.jobs
where id = 'b7130000-0000-4000-8000-000000000001';
delete from auth.users
where id in (
  'b7110000-0000-4000-8000-000000000001',
  'b7120000-0000-4000-8000-000000000001'
);

\if :dblink_preexisting
\else
drop extension dblink;
\endif

select pg_catalog.jsonb_build_object(
  'owner_bound', true,
  'fresh_claim_protected', true,
  'exact_release', true,
  'expired_claim_recovered', true,
  'active_broadcast_rechecked', true,
  'concurrent_claims_serialized', true,
  'service_role_only', true,
  'rls_enabled', true
) as broadcast_retry_claims_verification;
