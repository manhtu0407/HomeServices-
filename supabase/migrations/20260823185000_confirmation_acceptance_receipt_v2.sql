-- Keep the confirm HTTP path to one workflow RPC after its read-only validation. The v1 RPC stays
-- available during the expand window; v2 projects the durable operation receipt from the same
-- transaction so Edge does not need a second network round trip before returning 202.

create or replace function public.confirm_kael_chat_durable_atomic_v2(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text default null
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
  retry_after_ms integer
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_result record;
  v_operation public.confirmation_operations%rowtype;
begin
  select * into strict v_result
  from public.confirm_kael_chat_durable_atomic(
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
      null::text,
      null::text,
      false,
      null::integer;
    return;
  end if;

  select operation.* into strict v_operation
  from public.confirmation_operations as operation
  where operation.id = v_result.operation_id
    and operation.session_id = p_session_id
    and operation.customer_id = p_customer_id;

  return query select
    v_result.ok,
    v_result.error_code,
    v_result.operation_id,
    v_result.receipt_id,
    v_result.job_id,
    v_result.job_status,
    v_result.quote_mode,
    v_operation.state,
    v_result.already_applied,
    v_operation.accepted_at,
    v_operation.updated_at,
    v_operation.idempotency_key,
    v_operation.support_code,
    v_operation.state in ('official_match', 'no_reachable_worker', 'stopped'),
    v_operation.retry_after_ms;
end;
$func$;

revoke execute on function public.confirm_kael_chat_durable_atomic_v2(uuid,uuid,text,text,text)
from public, anon, authenticated;

grant execute on function public.confirm_kael_chat_durable_atomic_v2(uuid,uuid,text,text,text)
to service_role;
