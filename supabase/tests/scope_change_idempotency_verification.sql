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
where id = 'd1110000-0000-4000-8000-000000000001';
delete from auth.users
where id in (
  'd1120000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000002'
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
    'd1120000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'scope-idempotency-customer@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  ),
  (
    'd1120000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'scope-idempotency-worker@example.test',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

update public.profiles
set role = 'worker'
where id = 'd1120000-0000-4000-8000-000000000002';

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  description,
  address_district,
  status,
  kael_problem_identified,
  kael_complexity,
  kael_price_min,
  kael_price_max
) values (
  'd1110000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000002',
  'plumbing',
  'Verify direct scope-change idempotency and provider-spend serialization.',
  'q7',
  'repairing',
  'pipe_leak',
  'medium',
  200000,
  400000
);

insert into public.kael_job_incidents (
  id,
  job_id,
  opened_by,
  status,
  reported_description,
  reported_reason,
  evidence_status,
  revision,
  scope_price_quote_id,
  scope_price_quote,
  scope_price_quote_revision,
  scope_price_quote_expires_at,
  scope_price_quote_confirmed_at
) values (
  'd1150000-0000-4000-8000-000000000001',
  'd1110000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000002',
  'ready_for_scope_proposal',
  'Replace the concealed cracked pipe section behind the wall.',
  'The original scope did not include the concealed damaged section.',
  'ready',
  1,
  'd1160000-0000-4000-8000-000000000001',
  '{
    "schema_version": "scope_change_worker_quote.v1",
    "quote_id": "d1160000-0000-4000-8000-000000000001",
    "incident_id": "d1150000-0000-4000-8000-000000000001",
    "job_id": "d1110000-0000-4000-8000-000000000001",
    "selection_rule": "verified_neutral_midpoint_with_bilateral_confirmation",
    "customer_total": 360000,
    "platform_fee": 36000,
    "worker_net": 324000
  }'::jsonb,
  1,
  '2099-08-14T00:00:00+00'::timestamptz,
  '2026-08-14T00:00:00+00'::timestamptz
);

select dblink_connect('scope_claim_a', :'dblink_connstr');
select dblink_connect('scope_claim_b', :'dblink_connstr');

select dblink_send_query('scope_claim_a', $remote$
  with claimed as materialized (
    select *
    from public.claim_scope_change_request_atomic(
      'd1110000-0000-4000-8000-000000000001',
      'd1120000-0000-4000-8000-000000000002',
      'd1130000-0000-4000-8000-000000000001',
      'd1140000-0000-4000-8000-000000000001',
      'Replace the concealed cracked pipe section behind the wall.',
      'The original scope did not include the concealed damaged section.',
      '{}'::text[]
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claim_row)::text
  from claimed as claim_row cross join pause_after_claim;
$remote$);

select dblink_send_query('scope_claim_b', $remote$
  with claimed as materialized (
    select *
    from public.claim_scope_change_request_atomic(
      'd1110000-0000-4000-8000-000000000001',
      'd1120000-0000-4000-8000-000000000002',
      'd1130000-0000-4000-8000-000000000002',
      'd1140000-0000-4000-8000-000000000002',
      'Replace the concealed cracked pipe section behind the wall.',
      'The original scope did not include the concealed damaged section.',
      '{}'::text[]
    )
  ), pause_after_claim as materialized (
    select pg_catalog.pg_sleep(1) from claimed
  )
  select pg_catalog.row_to_json(claim_row)::text
  from claimed as claim_row cross join pause_after_claim;
$remote$);

create temporary table scope_claim_concurrent_results (payload jsonb not null);

insert into scope_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('scope_claim_a') as remote_result(payload text);

insert into scope_claim_concurrent_results (payload)
select remote_result.payload::jsonb
from dblink_get_result('scope_claim_b') as remote_result(payload text);

select dblink_disconnect('scope_claim_a');
select dblink_disconnect('scope_claim_b');

do $$
declare
  v_command public.scope_change_request_commands%rowtype;
  v_conflict record;
  v_fresh_retry record;
  v_stale_retry record;
  v_release record;
  v_reclaimed record;
  v_invalid_review record;
  v_reclaimed_after_invalid record;
  v_mismatched_review record;
  v_reclaimed_after_mismatch record;
  v_completed record;
  v_database_rejected record;
  v_database_effect record;
  v_database_replay record;
  v_learning_effect record;
  v_learning_replay record;
  v_push_claim record;
  v_push_duplicate record;
  v_push_complete record;
  v_push_replay record;
  v_replay record;
  v_final_retry record;
  v_security_definer boolean;
  v_config text[];
  v_review jsonb := '{
    "price_min": 360000,
    "price_max": 360000,
    "confidence": 0.82,
    "problem_summary": "A concealed cracked pipe section requires replacement.",
    "advisory": "The customer must approve the changed scope before work continues.",
    "complexity_assessment": "medium",
    "disclaimer": "Kael estimate for explicit customer confirmation.",
    "fallback_used": false,
    "anti_fraud": {"score": 0.1, "challenge_required": false},
    "worker_challenge": {"challenge_required": false},
    "customer_card": {"decision_required": true},
    "price_source": "verified_baseline",
    "pricing_mode": "full_scope_total",
    "selection_rule": "verified_neutral_midpoint_with_bilateral_confirmation",
    "baseline_used": "concealed_pipe_replacement_medium_hcmc",
    "baseline_source": "verified_test_baseline",
    "reference_price_min": 260000,
    "reference_price_max": 480000,
    "stakeholder_balance": {
      "customer_total": 360000,
      "platform_fee": 36000,
      "worker_net": 324000,
      "commission_rate_bps": 1000,
      "worker_confirmation_required": true,
      "customer_confirmation_required": true
    },
    "worker_price_confirmation": {
      "confirmed": true,
      "quote_id": "d1160000-0000-4000-8000-000000000001",
      "confirmed_at": "2026-08-14T00:00:00+00:00"
    }
  }'::jsonb;
begin
  if (
    select pg_catalog.count(*) <> 2
      or pg_catalog.count(*) filter (where payload->>'claimed' = 'true') <> 1
      or pg_catalog.count(*) filter (
        where payload->>'error_code' = 'REQUEST_IN_PROGRESS'
      ) <> 1
    from scope_claim_concurrent_results
  ) then
    raise exception 'concurrent scope workers were not serialized before provider spend';
  end if;

  select command.*
    into strict v_command
    from public.scope_change_request_commands as command
    where command.job_id = 'd1110000-0000-4000-8000-000000000001'
      and command.request_state = 'in_flight';

  select * into v_conflict
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000003',
    'A different description reuses the completed client request identifier.',
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_conflict.ok is not false or v_conflict.error_code <> 'IDEMPOTENCY_CONFLICT' then
    raise exception 'scope command accepted a conflicting payload binding';
  end if;

  select * into v_fresh_retry
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000004',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_fresh_retry.ok is not false or v_fresh_retry.error_code <> 'REQUEST_IN_PROGRESS' then
    raise exception 'fresh scope claim was acquired twice';
  end if;

  update public.scope_change_request_commands as command
    set claimed_at = pg_catalog.clock_timestamp() - interval '6 minutes'
    where command.worker_id = v_command.worker_id
      and command.client_request_id = v_command.client_request_id;

  select * into v_stale_retry
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000005',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_stale_retry.ok is not true or v_stale_retry.claimed is not true then
    raise exception 'stale scope claim was not recovered';
  end if;

  select * into v_release
  from public.release_scope_change_request_claim_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000005',
    'PROVIDER_FAILED'
  );
  if v_release.released is not true then
    raise exception 'failed provider claim was not released for retry';
  end if;

  select * into v_reclaimed
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000006',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_reclaimed.ok is not true or v_reclaimed.claimed is not true then
    raise exception 'released scope command was not retryable';
  end if;

  select * into v_invalid_review
  from public.request_scope_change_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000006',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls,
    360000,
    360000,
    v_review - 'anti_fraud'
  );
  if v_invalid_review.ok is not false
    or v_invalid_review.error_code <> 'KAEL_REVIEW_MISSING'
  then
    raise exception 'scope completion accepted an incomplete replay payload';
  end if;
  if (
    select job.status
    from public.jobs as job
    where job.id = v_command.job_id
  ) is distinct from 'repairing'::public.job_status
    or exists (
      select 1
      from public.scope_change_requests as scope
      where scope.worker_id = v_command.worker_id
        and scope.client_request_id = v_command.client_request_id
    )
  then
    raise exception 'invalid replay payload partially mutated scope state';
  end if;

  select * into v_reclaimed_after_invalid
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000008',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_reclaimed_after_invalid.ok is not true
    or v_reclaimed_after_invalid.claimed is not true
  then
    raise exception 'scope command was not retryable after invalid review rejection';
  end if;

  select * into v_mismatched_review
  from public.request_scope_change_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000008',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls,
    370000,
    370000,
    v_review
  );
  if v_mismatched_review.ok is not false
    or v_mismatched_review.error_code <> 'KAEL_REVIEW_MISMATCH'
  then
    raise exception 'scope completion accepted a price-mismatched replay payload';
  end if;

  select * into v_reclaimed_after_mismatch
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000009',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_reclaimed_after_mismatch.ok is not true
    or v_reclaimed_after_mismatch.claimed is not true
  then
    raise exception 'scope command was not retryable after review mismatch rejection';
  end if;

  select * into v_completed
  from public.request_scope_change_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000009',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls,
    360000,
    360000,
    v_review
  );
  if v_completed.ok is not true
    or v_completed.replayed is not false
    or v_completed.scope_change_id is null
    or v_completed.response_payload->>'scope_change_id'
      is distinct from v_completed.scope_change_id::text
  then
    raise exception 'scope completion was not atomically persisted with its replay payload';
  end if;

  if (
    select pg_catalog.count(*)
    from public.scope_change_request_effects as effect
    where effect.worker_id = v_command.worker_id
      and effect.client_request_id = v_command.client_request_id
      and effect.effect_state = 'pending'
  ) <> 3
    or (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_object_keys(v_completed.side_effects_state)
    ) <> 3
  then
    raise exception 'scope completion did not atomically seed all durable effects';
  end if;

  select * into v_database_rejected
  from public.apply_scope_change_database_effect_atomic(
    v_command.job_id,
    'd1120000-0000-4000-8000-000000000001',
    v_command.client_request_id,
    v_completed.scope_change_id,
    (
      select effect.effect_id
      from public.scope_change_request_effects as effect
      where effect.worker_id = v_command.worker_id
        and effect.client_request_id = v_command.client_request_id
        and effect.effect_name = 'database'
    )
  );
  if v_database_rejected.ok is not false
    or v_database_rejected.error_code <> 'AUTH_FORBIDDEN'
    or exists (
      select 1 from public.job_events as event
      where event.job_id = v_command.job_id
        and event.safe_metadata ? 'scope_effect_id'
    )
  then
    raise exception 'database effect wrote before worker ownership verification';
  end if;

  select * into v_database_effect
  from public.apply_scope_change_database_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    (
      select effect.effect_id
      from public.scope_change_request_effects as effect
      where effect.worker_id = v_command.worker_id
        and effect.client_request_id = v_command.client_request_id
        and effect.effect_name = 'database'
    )
  );
  if v_database_effect.ok is not true or v_database_effect.completed is not true
    or (
      select pg_catalog.count(*)
      from public.job_events as event
      where event.job_id = v_command.job_id
        and event.safe_metadata ->> 'scope_effect_id' = v_database_effect.effect_id::text
    ) <> 3
    or (
      select pg_catalog.count(*)
      from public.notifications as notification
      where notification.job_id = v_command.job_id
        and notification.safe_metadata ->> 'scope_effect_id' = v_database_effect.effect_id::text
    ) <> 1
  then
    raise exception 'database effect did not atomically apply progress, events, and notification';
  end if;

  select * into v_database_replay
  from public.apply_scope_change_database_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    v_database_effect.effect_id
  );
  if v_database_replay.ok is not true or v_database_replay.completed is not true
    or (
      select pg_catalog.count(*)
      from public.job_events as event
      where event.job_id = v_command.job_id
        and event.safe_metadata ->> 'scope_effect_id' = v_database_effect.effect_id::text
    ) <> 3
  then
    raise exception 'database effect replay duplicated transactional writes';
  end if;

  select * into v_learning_effect
  from public.apply_scope_change_learning_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    (
      select effect.effect_id
      from public.scope_change_request_effects as effect
      where effect.worker_id = v_command.worker_id
        and effect.client_request_id = v_command.client_request_id
        and effect.effect_name = 'learning'
    )
  );
  select * into v_learning_replay
  from public.apply_scope_change_learning_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    v_learning_effect.effect_id
  );
  if v_learning_effect.ok is not true or v_learning_effect.completed is not true
    or v_learning_replay.ok is not true or v_learning_replay.completed is not true
  then
    raise exception 'learning effect was not replay-safe';
  end if;

  select * into v_push_claim
  from public.claim_scope_change_push_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    (
      select effect.effect_id
      from public.scope_change_request_effects as effect
      where effect.worker_id = v_command.worker_id
        and effect.client_request_id = v_command.client_request_id
        and effect.effect_name = 'push'
    ),
    'd1140000-0000-4000-8000-000000000010'
  );
  select * into v_push_duplicate
  from public.claim_scope_change_push_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    v_push_claim.effect_id,
    'd1140000-0000-4000-8000-000000000011'
  );
  if v_push_claim.claimed is not true
    or v_push_duplicate.ok is not false
    or v_push_duplicate.error_code <> 'EFFECT_IN_PROGRESS'
  then
    raise exception 'push effect lease allowed a duplicate concurrent drain';
  end if;

  select * into v_push_complete
  from public.complete_scope_change_push_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    v_push_claim.effect_id,
    'd1140000-0000-4000-8000-000000000010'
  );
  select * into v_push_replay
  from public.claim_scope_change_push_effect_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    v_completed.scope_change_id,
    v_push_claim.effect_id,
    'd1140000-0000-4000-8000-000000000012'
  );
  if v_push_complete.completed is not true
    or v_push_replay.completed is not true
    or v_push_replay.claimed is not false
  then
    raise exception 'completed push effect was not replayed without another send lease';
  end if;

  select * into v_replay
  from public.claim_scope_change_request_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000007',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls
  );
  if v_replay.ok is not true
    or v_replay.replayed is not true
    or v_replay.scope_change_id is distinct from v_completed.scope_change_id
    or v_replay.response_payload is distinct from v_completed.response_payload
    or v_replay.side_effects_state #>> '{database,state}' is distinct from 'completed'
    or v_replay.side_effects_state #>> '{learning,state}' is distinct from 'completed'
    or v_replay.side_effects_state #>> '{push,state}' is distinct from 'completed'
  then
    raise exception 'completed scope request did not replay before provider work';
  end if;

  select * into v_final_retry
  from public.request_scope_change_atomic(
    v_command.job_id,
    v_command.worker_id,
    v_command.client_request_id,
    'd1140000-0000-4000-8000-000000000006',
    v_command.new_description,
    v_command.reason,
    v_command.evidence_photo_urls,
    360000,
    360000,
    v_review
  );
  if v_final_retry.ok is not true
    or v_final_retry.replayed is not true
    or v_final_retry.scope_change_id is distinct from v_completed.scope_change_id
  then
    raise exception 'lost final RPC response was not idempotently replayed';
  end if;

  if (
    select pg_catalog.count(*)
    from public.scope_change_requests as scope
    where scope.worker_id = v_command.worker_id
      and scope.client_request_id = v_command.client_request_id
  ) <> 1 then
    raise exception 'scope idempotency key created multiple final rows';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_scope_change_request_atomic(uuid, uuid, uuid, uuid, text, text, text[])',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_scope_change_request_atomic(uuid, uuid, uuid, uuid, text, text, text[])',
    'execute'
  ) then
    raise exception 'scope claim RPC privileges are unsafe';
  end if;

  select function_row.prosecdef, function_row.proconfig
    into v_security_definer, v_config
    from pg_catalog.pg_proc as function_row
    where function_row.oid = pg_catalog.to_regprocedure(
      'public.claim_scope_change_request_atomic(uuid, uuid, uuid, uuid, text, text, text[])'
    );
  if v_security_definer is distinct from true
    or v_config is distinct from array['search_path=""']::text[]
  then
    raise exception 'scope claim RPC configuration is unsafe';
  end if;
end;
$$;

delete from public.jobs
where id = 'd1110000-0000-4000-8000-000000000001';
delete from auth.users
where id in (
  'd1120000-0000-4000-8000-000000000001',
  'd1120000-0000-4000-8000-000000000002'
);

\if :dblink_preexisting
\else
drop extension dblink;
\endif

select pg_catalog.jsonb_build_object(
  'two_workers_serialized', true,
  'full_payload_bound', true,
  'fresh_lease_protected', true,
  'stale_lease_recovered', true,
  'provider_failure_retryable', true,
  'review_shape_guarded', true,
  'review_price_bound', true,
  'completion_atomic', true,
  'completed_replay', true,
  'final_rpc_replay', true,
  'effects_seeded_atomically', true,
  'database_effect_exactly_once', true,
  'learning_effect_exactly_once', true,
  'push_lease_serialized', true,
  'push_effect_replayed', true,
  'single_scope_row', true,
  'service_role_only', true
) as scope_change_idempotency_verification;
