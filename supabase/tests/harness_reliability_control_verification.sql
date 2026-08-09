begin;

DO $$
begin
  if to_regclass('public.harness_idempotency_keys') is null then
    raise exception 'harness_idempotency_keys missing';
  end if;
  if to_regclass('public.harness_dependency_circuits') is null then
    raise exception 'harness_dependency_circuits missing';
  end if;
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'reserve_harness_idempotency', 'start_harness_idempotency_execution',
        'mark_harness_idempotency_reconcile_required', 'complete_harness_idempotency',
        'acquire_harness_dependency_permit', 'record_harness_dependency_result'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE'
  ) then
    raise exception 'reliability RPC exposed beyond service_role';
  end if;
end;
$$;

DO $$
declare
  v_first record;
  v_second record;
  v_conflict record;
  v_other_actor record;
  v_permit record;
  v_state text;
  v_spend record;
  v_spend_blocked record;
  v_spend_after_release record;
  v_invalid record;
  v_long_dependency text := repeat('x', 121);
begin
  select * into v_first from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.paymentIntent', repeat('a', 64),
    repeat('b', 64), repeat('c', 64), 300
  );
  if v_first.state <> 'reserved' or v_first.reservation_id is null then
    raise exception 'first reservation failed';
  end if;
  select * into v_second from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.paymentIntent', repeat('a', 64),
    repeat('b', 64), repeat('c', 64), 300
  );
  if v_second.state <> 'in_progress' or v_second.reservation_id <> v_first.reservation_id then
    raise exception 'duplicate reservation did not return in_progress';
  end if;
  select * into v_conflict from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.paymentIntent', repeat('a', 64),
    repeat('b', 64), repeat('d', 64), 300
  );
  if v_conflict.state <> 'conflict' then raise exception 'request hash conflict not detected'; end if;
  if not public.start_harness_idempotency_execution(v_first.reservation_id) then
    raise exception 'reservation execution start failed';
  end if;
  if not public.complete_harness_idempotency(v_first.reservation_id, repeat('e', 64)) then
    raise exception 'reservation completion failed';
  end if;
  select * into v_second from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.paymentIntent', repeat('a', 64),
    repeat('b', 64), repeat('c', 64), 300
  );
  if v_second.state <> 'completed' or v_second.response_hash <> repeat('e', 64) then
    raise exception 'completed replay receipt missing';
  end if;
  select * into v_other_actor from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.paymentIntent', repeat('9', 64),
    repeat('b', 64), repeat('c', 64), 300
  );
  if v_other_actor.state <> 'reserved' or v_other_actor.reservation_id = v_first.reservation_id then
    raise exception 'idempotency key leaked across actors';
  end if;

  select * into v_first from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.review', repeat('a', 64),
    repeat('f', 64), repeat('1', 64), 300
  );
  if not public.start_harness_idempotency_execution(v_first.reservation_id) then
    raise exception 'reconciliation fixture did not begin execution';
  end if;
  if not public.mark_harness_idempotency_reconcile_required(
    v_first.reservation_id, 'RESPONSE_RECEIPT_COMMIT_FAILED'
  ) then
    raise exception 'reconciliation fixture was not quarantined';
  end if;
  select * into v_second from public.reserve_harness_idempotency(
    'local', 'harness-test', 'jobs.review', repeat('a', 64),
    repeat('f', 64), repeat('1', 64), 300
  );
  if v_second.state <> 'reconcile_required' then
    raise exception 'unknown execution outcome was allowed to retry';
  end if;

  select * into v_spend from public.reserve_kael_ai_spend(
    null, 1, 'reliability-test', 1, null, null
  );
  if not v_spend.allowed or v_spend.reservation_id is null then
    raise exception 'spend reservation failed';
  end if;
  select * into v_spend_blocked from public.reserve_kael_ai_spend(
    null, 0.01, 'reliability-test', 1, null, null
  );
  if v_spend_blocked.allowed or v_spend_blocked.blocked_scope <> 'global_daily' then
    raise exception 'concurrent spend envelope was not bounded';
  end if;
  perform public.finalize_kael_ai_spend(v_spend.reservation_id, 0, 'reliability-test');
  select * into v_spend_after_release from public.reserve_kael_ai_spend(
    null, 0.01, 'reliability-test', 1, null, null
  );
  if not v_spend_after_release.allowed then
    raise exception 'released spend reservation still consumed the cap';
  end if;

  v_state := public.record_harness_dependency_result(
    'sepay', 'local', 'harness-test', false, 'TIMEOUT',
    1, 300000, 600000, 1, null
  );
  if v_state <> 'open' then raise exception 'circuit did not open'; end if;
  select * into v_permit from public.acquire_harness_dependency_permit(
    'sepay', 'local', 1, 30
  );
  if v_permit.allowed or v_permit.state <> 'open' then
    raise exception 'open circuit issued a permit';
  end if;
  update public.harness_dependency_circuits
  set open_until = now() - interval '1 second'
  where dependency = 'sepay' and environment = 'local';
  select * into v_permit from public.acquire_harness_dependency_permit(
    'sepay', 'local', 1, 30
  );
  if not v_permit.allowed or v_permit.state <> 'half_open' or v_permit.probe_token is null then
    raise exception 'half-open probe was not leased';
  end if;
  v_state := public.record_harness_dependency_result(
    'sepay', 'local', 'harness-test', true, null,
    1, 300000, 600000, 1, v_permit.probe_token
  );
  if v_state <> 'closed' then raise exception 'successful probe did not close circuit'; end if;

  select * into v_invalid from public.reserve_harness_idempotency(
    null, 'harness-test', 'jobs.paymentIntent', repeat('a', 64),
    repeat('b', 64), repeat('c', 64), 300
  );
  if v_invalid.state <> 'conflict' then
    raise exception 'invalid idempotency environment did not fail closed';
  end if;
  select * into v_permit from public.acquire_harness_dependency_permit(
    v_long_dependency, 'local', 1, 30
  );
  if v_permit.allowed or v_permit.state <> 'open' then
    raise exception 'oversized dependency did not fail closed';
  end if;
  if exists (
    select 1 from public.harness_dependency_circuits
    where dependency = left(v_long_dependency, 120) and environment = 'local'
  ) then
    raise exception 'oversized dependency was truncated into circuit state';
  end if;
  v_state := public.record_harness_dependency_result(
    v_long_dependency, 'local', 'harness-test', true, null,
    1, 300000, 600000, 1, null
  );
  if v_state <> 'open' then
    raise exception 'oversized dependency result did not fail closed';
  end if;
end;
$$;

rollback;
