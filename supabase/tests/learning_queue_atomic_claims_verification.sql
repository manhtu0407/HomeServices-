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

delete from public.kael_learning_queue
where id in (
  'd9100000-0000-4000-8000-000000000001',
  'd9100000-0000-4000-8000-000000000002'
);

insert into public.kael_learning_queue (
  id,
  event_type,
  skill_id,
  queue_state,
  input_payload,
  candidate_payload,
  run_after,
  created_at
) values
  (
    'd9100000-0000-4000-8000-000000000001',
    'post-A14',
    'LS1',
    'pending',
    '{"source":"atomic-claim-a"}'::jsonb,
    '{"candidate":"a"}'::jsonb,
    '2026-07-15T00:00:00Z',
    '2026-07-15T00:00:00Z'
  ),
  (
    'd9100000-0000-4000-8000-000000000002',
    'post-B6',
    'LS2',
    'pending',
    '{"source":"atomic-claim-b"}'::jsonb,
    '{"candidate":"b"}'::jsonb,
    '2026-07-15T00:00:00Z',
    '2026-07-15T00:00:01Z'
  );

select dblink_connect('learning_claim_a', :'dblink_connstr');
select dblink_connect('learning_claim_b', :'dblink_connstr');

select dblink_send_query('learning_claim_a', $remote$
  with claimed as materialized (
    select * from public.claim_kael_learning_queue_atomic(
      'd9200000-0000-4000-8000-000000000001',
      1,
      '2026-07-15T00:05:00Z'
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claimed)::text
  from claimed cross join pause_after_claim;
$remote$);

select dblink_send_query('learning_claim_b', $remote$
  with claimed as materialized (
    select * from public.claim_kael_learning_queue_atomic(
      'd9200000-0000-4000-8000-000000000002',
      1,
      '2026-07-15T00:05:00Z'
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claimed)::text
  from claimed cross join pause_after_claim;
$remote$);

create temporary table learning_claim_concurrent_results (payload jsonb not null);

insert into learning_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('learning_claim_a') as remote_result(payload text);

insert into learning_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('learning_claim_b') as remote_result(payload text);

select dblink_disconnect('learning_claim_a');
select dblink_disconnect('learning_claim_b');

create temporary table learning_claim_before_expiry as
select *
from public.claim_kael_learning_queue_atomic(
  'd9200000-0000-4000-8000-000000000003',
  2,
  '2026-07-15T00:19:00Z'
);

create temporary table learning_claim_after_expiry as
select *
from public.claim_kael_learning_queue_atomic(
  'd9200000-0000-4000-8000-000000000004',
  2,
  '2026-07-15T00:21:00Z'
);

insert into public.kael_learning_queue (
  id,
  event_type,
  skill_id,
  queue_state,
  input_payload,
  candidate_payload,
  run_after,
  created_at
) values (
  'd9100000-0000-4000-8000-000000000003',
  'post-B6',
  'LS3',
  'pending',
  '{"source":"atomic-finalize"}'::jsonb,
  '{"target":"scope-change","prompt_version":"q4-test","requires_manual_review":false,"payload":{"safe":true}}'::jsonb,
  '2026-07-15T00:00:00Z',
  '2026-07-15T00:00:02Z'
);

create temporary table learning_finalize_claim as
select *
from public.claim_kael_learning_queue_atomic(
  'd9200000-0000-4000-8000-000000000005',
  1,
  '2026-07-15T00:22:00Z'
);

do $$
begin
  begin
    perform *
    from public.complete_kael_learning_queue_realtime_atomic(
      'd9200000-0000-4000-8000-000000000006',
      array['d9100000-0000-4000-8000-000000000003']::uuid[],
      '2026-07-15T00:23:00Z'
    );
    raise exception 'foreign learning claim unexpectedly finalized the queue row';
  exception
    when serialization_failure then
      if sqlerrm <> 'LEARNING_QUEUE_CLAIM_STALE' then
        raise;
      end if;
  end;

  if exists (
    select 1
    from public.kael_rule_lifecycle_log
    where safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1
    from public.kael_learning_queue
    where id = 'd9100000-0000-4000-8000-000000000003'
      and queue_state = 'processing'
      and claim_id = 'd9200000-0000-4000-8000-000000000005'
  ) then
    raise exception 'foreign claim changed the queue row or lifecycle effects';
  end if;
end;
$$;

begin;
select *
from public.complete_kael_learning_queue_realtime_atomic(
  'd9200000-0000-4000-8000-000000000005',
  array['d9100000-0000-4000-8000-000000000003']::uuid[],
  '2026-07-15T00:24:00Z'
);
rollback;

do $$
begin
  if exists (
    select 1
    from public.kael_rule_lifecycle_log
    where safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1
    from public.kael_learning_queue
    where id = 'd9100000-0000-4000-8000-000000000003'
      and queue_state = 'processing'
      and claim_id = 'd9200000-0000-4000-8000-000000000005'
  ) then
    raise exception 'rolled-back completion left a partial lifecycle effect';
  end if;
end;
$$;

create temporary table learning_finalize_first as
select *
from public.complete_kael_learning_queue_realtime_atomic(
  'd9200000-0000-4000-8000-000000000005',
  array['d9100000-0000-4000-8000-000000000003']::uuid[],
  '2026-07-15T00:25:00Z'
);

create temporary table learning_finalize_replay as
select *
from public.complete_kael_learning_queue_realtime_atomic(
  'd9200000-0000-4000-8000-000000000005',
  array['d9100000-0000-4000-8000-000000000003']::uuid[],
  '2026-07-15T00:26:00Z'
);

do $$
begin
  if (select pg_catalog.count(*) from learning_finalize_first) <> 1
    or (select pg_catalog.bool_or(replayed) from learning_finalize_first)
    or (select pg_catalog.count(*) from learning_finalize_replay) <> 1
    or not (select pg_catalog.bool_and(replayed) from learning_finalize_replay)
    or not exists (
      select 1
      from public.kael_learning_queue
      where id = 'd9100000-0000-4000-8000-000000000003'
        and queue_state = 'realtime_fallback'
        and claim_id is null
        and claimed_at is null
        and finalized_claim_id = 'd9200000-0000-4000-8000-000000000005'
        and processed_at = '2026-07-15T00:25:00Z'
    ) or (
      select pg_catalog.count(*)
      from public.kael_rule_lifecycle_log
      where skill_id = 'LS3'
        and transition_reason = 'realtime_fallback'
        and safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003'
        and safe_metadata->>'q4_reason' = 'realtime_fallback'
    ) <> 1
  then
    raise exception 'learning completion was not atomic and idempotent';
  end if;
end;
$$;

delete from public.kael_rule_lifecycle_log
where safe_metadata->>'q4_queue_id' = 'd9100000-0000-4000-8000-000000000003';

delete from public.kael_learning_queue
where id in (
  'd9100000-0000-4000-8000-000000000001',
  'd9100000-0000-4000-8000-000000000002',
  'd9100000-0000-4000-8000-000000000003'
);

\if :dblink_preexisting
\else
drop extension dblink;
\endif

do $$
declare
  v_security_definer boolean;
  v_config text[];
begin
  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.count(distinct payload->>'id') <> 2
      or pg_catalog.count(distinct payload->>'claim_id') <> 2
      or pg_catalog.bool_or(payload->>'queue_state' <> 'processing')
      or pg_catalog.bool_or((payload->>'attempts')::integer <> 1)
    from learning_claim_concurrent_results
  ) then
    raise exception 'two learning workers acquired an overlapping or invalid claim';
  end if;

  if (select pg_catalog.count(*) from learning_claim_before_expiry) <> 0 then
    raise exception 'learning lease was reclaimed before its 15-minute expiry';
  end if;

  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.bool_or(claim_id <> 'd9200000-0000-4000-8000-000000000004')
      or pg_catalog.bool_or(queue_state <> 'processing')
      or pg_catalog.bool_or(attempts <> 2)
      or pg_catalog.bool_or(error_code <> 'STALE_LEASE_RECLAIMED')
    from learning_claim_after_expiry
  ) then
    raise exception 'stale learning leases were not recovered exactly once';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_kael_learning_queue_atomic(uuid, integer, timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_kael_learning_queue_atomic(uuid, integer, timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.claim_kael_learning_queue_atomic(uuid, integer, timestamptz)',
    'execute'
  ) then
    raise exception 'learning queue claim RPC privileges are unsafe';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.complete_kael_learning_queue_realtime_atomic(uuid, uuid[], timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.complete_kael_learning_queue_realtime_atomic(uuid, uuid[], timestamptz)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.complete_kael_learning_queue_realtime_atomic(uuid, uuid[], timestamptz)',
    'execute'
  ) then
    raise exception 'learning queue completion RPC privileges are unsafe';
  end if;

  select function_row.prosecdef, function_row.proconfig
    into v_security_definer, v_config
    from pg_catalog.pg_proc as function_row
    where function_row.oid = pg_catalog.to_regprocedure(
      'public.claim_kael_learning_queue_atomic(uuid, integer, timestamptz)'
    );
  if v_security_definer is distinct from true
    or v_config is distinct from array['search_path=""']::text[]
  then
    raise exception 'learning queue claim RPC configuration is unsafe';
  end if;

  select function_row.prosecdef, function_row.proconfig
    into v_security_definer, v_config
    from pg_catalog.pg_proc as function_row
    where function_row.oid = pg_catalog.to_regprocedure(
      'public.complete_kael_learning_queue_realtime_atomic(uuid, uuid[], timestamptz)'
    );
  if v_security_definer is distinct from true
    or v_config is distinct from array['search_path=""']::text[]
  then
    raise exception 'learning queue completion RPC configuration is unsafe';
  end if;
end;
$$;

select pg_catalog.jsonb_build_object(
  'two_sessions_distinct', true,
  'skip_locked', true,
  'lease_not_early', true,
  'stale_recovered', true,
  'foreign_claim_rejected', true,
  'crash_rollback_atomic', true,
  'completion_replay_idempotent', true,
  'attempts_per_claim', true,
  'service_role_only', true
) as learning_queue_atomic_claims_verification;
