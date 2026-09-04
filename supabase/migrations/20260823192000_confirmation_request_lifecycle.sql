-- Confirmation already owns its durable idempotency receipt in the workflow transaction. These
-- two RPCs preserve the required trace and privileged-operation ledger while avoiding a sequence
-- of network round trips before Edge can acknowledge that durable receipt.

create or replace function private.guard_kael_confirmation_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
begin
  select session.* into strict v_session
  from public.kael_chat_sessions as session
  where session.id = new.session_id;
  if v_session.job_id is null and (
    v_session.scheduled_at is null or
    v_session.scheduled_at <= pg_catalog.statement_timestamp()
  ) then
    raise exception using errcode = '22023', message = 'KAEL_SCHEDULE_INVALID';
  end if;
  return new;
end;
$func$;

do $block$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'confirmation_operations_schedule_guard'
      and tgrelid = 'public.confirmation_operations'::regclass
      and not tgisinternal
  ) then
    create trigger confirmation_operations_schedule_guard
    before insert on public.confirmation_operations
    for each row execute function private.guard_kael_confirmation_schedule();
  end if;
end;
$block$;

revoke execute on function private.guard_kael_confirmation_schedule()
from public, anon, authenticated, service_role;

create or replace function public.begin_harness_authorized_request(
  p_run_id uuid,
  p_trace_id uuid,
  p_parent_run_id uuid,
  p_actor_id_hash text,
  p_actor_role text,
  p_route_kind text,
  p_capability text,
  p_environment text,
  p_release_id text,
  p_job_id uuid,
  p_risk text,
  p_operation_class text,
  p_privileged boolean,
  p_confirmation_gate text,
  p_resource_type text,
  p_resource_id_hash text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_started boolean;
begin
  select public.begin_harness_run(
    p_run_id,
    p_trace_id,
    p_parent_run_id,
    p_actor_id_hash,
    p_actor_role,
    p_route_kind,
    p_capability,
    p_environment,
    p_release_id,
    p_job_id,
    jsonb_build_object(
      'risk', p_risk,
      'operation_class', p_operation_class,
      'privileged', p_privileged,
      'confirmation_gate', p_confirmation_gate
    )
  ) into v_started;
  if not coalesce(v_started, false) then return false; end if;

  perform public.append_harness_event(
    gen_random_uuid(), p_run_id, p_trace_id, null, null, null,
    'authorization.resolved', 'authorization', 'succeeded', 1,
    null, null, null, null, 0, p_release_id, p_environment, null,
    jsonb_build_object('capability', p_capability, 'run_persisted', true)
  );
  perform public.append_harness_event(
    gen_random_uuid(), p_run_id, p_trace_id, null, null, null,
    'idempotency.delegated', p_route_kind, 'succeeded', 1,
    null, null, null, null, 0, p_release_id, p_environment, null,
    jsonb_build_object('strategy', 'durable_operation_receipt')
  );
  perform public.append_harness_event(
    gen_random_uuid(), p_run_id, p_trace_id, null, null, null,
    'request.started', p_route_kind, 'started', 1,
    null, null, null, null, 0, p_release_id, p_environment, null,
    jsonb_build_object('method', 'POST')
  );

  if p_privileged then
    perform public.record_harness_privileged_operation(
      gen_random_uuid(), p_run_id, p_trace_id, p_actor_id_hash, p_actor_role,
      p_route_kind, p_capability, 'mobile_api_route_dispatch', p_resource_type,
      p_resource_id_hash, 'allowed', p_release_id, p_environment, null,
      jsonb_build_object('confirmation_gate', p_confirmation_gate)
    );
  end if;
  return true;
end;
$func$;

create or replace function public.finish_harness_authorized_request(
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
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_finished boolean;
begin
  perform public.append_harness_event(
    gen_random_uuid(), p_run_id, p_trace_id, null, null, null,
    'request.completed', p_route_kind, 'succeeded', 1,
    null, null, null, null, greatest(coalesce(p_duration_ms, 0), 0),
    p_release_id, p_environment, null, '{}'::jsonb
  );
  if p_privileged then
    perform public.record_harness_privileged_operation(
      gen_random_uuid(), p_run_id, p_trace_id, p_actor_id_hash, p_actor_role,
      p_route_kind, p_capability, 'mobile_api_route_dispatch', p_resource_type,
      p_resource_id_hash, 'succeeded', p_release_id, p_environment, null,
      '{}'::jsonb
    );
  end if;
  select public.finish_harness_run(
    p_run_id,
    'completed',
    greatest(coalesce(p_duration_ms, 0), 0),
    null,
    '{}'::jsonb
  ) into v_finished;
  return coalesce(v_finished, false);
end;
$func$;

revoke execute on function public.begin_harness_authorized_request(
  uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean,text,text,text
) from public, anon, authenticated;
revoke execute on function public.finish_harness_authorized_request(
  uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) from public, anon, authenticated;

grant execute on function public.begin_harness_authorized_request(
  uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean,text,text,text
) to service_role;
grant execute on function public.finish_harness_authorized_request(
  uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) to service_role;

comment on function public.begin_harness_authorized_request(
  uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text,boolean,text,text,text
) is 'Atomically records the pre-mutation trace and privileged authorization for durable confirmation.';
comment on function public.finish_harness_authorized_request(
  uuid,uuid,text,text,text,text,text,text,boolean,text,text,integer
) is 'Atomically records successful durable-confirmation completion and closes its harness run.';
comment on function private.guard_kael_confirmation_schedule() is
  'Keeps first-time governed confirmation from creating a job after its appointment has elapsed.';
