-- The first combined confirmation RPC queried harness_runs directly. Keeping it as a security
-- invoker correctly denied that table access to service_role, so V4 carries the Edge duration
-- into the existing narrow lifecycle RPC instead of widening table privileges.

revoke execute on function public.confirm_kael_chat_durable_authorized_v3(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text
) from public, anon, authenticated, service_role;

create or replace function public.confirm_kael_chat_durable_authorized_v4(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text,
  p_run_id uuid,
  p_trace_id uuid,
  p_actor_id_hash text,
  p_actor_role text,
  p_route_kind text,
  p_capability text,
  p_environment text,
  p_release_id text,
  p_privileged boolean,
  p_resource_type text,
  p_resource_id_hash text,
  p_duration_ms integer
) returns table (
  ok boolean,
  error_code text,
  operation_id uuid,
  receipt_id uuid,
  job_id uuid,
  job_status public.job_status,
  quote_mode public.service_quote_mode,
  operation_state text,
  already_applied boolean,
  accepted_at timestamptz,
  updated_at timestamptz,
  idempotency_key text,
  support_code text,
  terminal boolean,
  retry_after_ms integer,
  trace_finalized boolean
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_result record;
  v_trace_finalized boolean;
begin
  if p_duration_ms is null or p_duration_ms < 0 or p_duration_ms > 600000 then
    raise exception using errcode = '22023', message = 'HARNESS_DURATION_INVALID';
  end if;

  select * into strict v_result
  from public.confirm_kael_chat_durable_atomic_v2(
    p_session_id,
    p_customer_id,
    p_idempotency_key,
    p_confirmation_kind,
    p_price_reasoning_receipt_id
  );

  if not coalesce(v_result.ok, false) then
    return query select
      v_result.ok,
      v_result.error_code,
      v_result.operation_id,
      v_result.receipt_id,
      v_result.job_id,
      v_result.job_status,
      v_result.quote_mode,
      v_result.operation_state,
      v_result.already_applied,
      v_result.accepted_at,
      v_result.updated_at,
      v_result.idempotency_key,
      v_result.support_code,
      v_result.terminal,
      v_result.retry_after_ms,
      false;
    return;
  end if;

  select public.finish_harness_authorized_request(
    p_run_id,
    p_trace_id,
    p_actor_id_hash,
    p_actor_role,
    p_route_kind,
    p_capability,
    p_environment,
    p_release_id,
    p_privileged,
    p_resource_type,
    p_resource_id_hash,
    p_duration_ms
  ) into v_trace_finalized;
  if not coalesce(v_trace_finalized, false) then
    raise exception using errcode = '55000', message = 'TRACE_FINALIZATION_UNAVAILABLE';
  end if;

  return query select
    v_result.ok,
    v_result.error_code,
    v_result.operation_id,
    v_result.receipt_id,
    v_result.job_id,
    v_result.job_status,
    v_result.quote_mode,
    v_result.operation_state,
    v_result.already_applied,
    v_result.accepted_at,
    v_result.updated_at,
    v_result.idempotency_key,
    v_result.support_code,
    v_result.terminal,
    v_result.retry_after_ms,
    true;
end;
$func$;

revoke execute on function public.confirm_kael_chat_durable_authorized_v4(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) from public, anon, authenticated;

grant execute on function public.confirm_kael_chat_durable_authorized_v4(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) to service_role;

comment on function public.confirm_kael_chat_durable_authorized_v4(
  uuid,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) is 'Atomically creates or recovers confirmation state and finalizes its authorized request without direct harness table access.';
