create or replace function public.record_system_monitor_observer_heartbeat(
  p_environment text,
  p_dispatcher_status text,
  p_d1_status text,
  p_error_code text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.system_health_observer_state%rowtype;
  v_incident_id uuid;
  v_opened_at timestamptz;
  v_reason text;
  v_transition text := 'none';
  v_has_previous_sample boolean;
  v_previous_healthy boolean;
  v_healthy boolean;
begin
  if p_environment is null or p_environment not in ('production', 'staging', 'local')
    or p_dispatcher_status is null or p_dispatcher_status not in ('green', 'yellow', 'red', 'gray')
    or p_d1_status is null or p_d1_status not in ('green', 'yellow', 'red', 'gray')
    or p_error_code is not null and p_error_code !~ '^[A-Z][A-Z0-9_]{0,63}$'
    or p_observed_at is null or p_observed_at > clock_timestamp() + interval '30 seconds'
    or p_observed_at < clock_timestamp() - interval '2 minutes' then
    raise exception using errcode = '22023', message = 'invalid observer heartbeat';
  end if;

  insert into public.system_health_observer_state (environment, updated_at)
  values (p_environment, p_observed_at)
  on conflict (environment) do nothing;

  select * into v_state
  from public.system_health_observer_state
  where environment = p_environment
  for update;

  if v_state.observer_heartbeat_at is not null and p_observed_at <= v_state.observer_heartbeat_at then
    return jsonb_build_object(
      'transition', 'none',
      'incident_id', v_state.active_dispatcher_incident_id,
      'opened_at', v_state.dispatcher_incident_opened_at,
      'reason_code', coalesce(v_state.dispatcher_incident_reason, p_error_code, 'DISPATCHER_UNAVAILABLE')
    );
  end if;

  v_incident_id := v_state.active_dispatcher_incident_id;
  v_opened_at := v_state.dispatcher_incident_opened_at;
  v_reason := v_state.dispatcher_incident_reason;
  v_has_previous_sample := v_state.observer_heartbeat_at is not null;
  v_previous_healthy := v_has_previous_sample
    and v_state.dispatcher_status = 'green'
    and v_state.d1_status = 'green';
  v_healthy := p_dispatcher_status = 'green' and p_d1_status = 'green';

  if v_healthy then
    if v_incident_id is not null and v_previous_healthy then
      v_transition := 'resolved';
      v_incident_id := null;
      v_opened_at := null;
      v_reason := null;
    elsif v_incident_id is null then
      v_opened_at := null;
      v_reason := null;
    end if;
  else
    v_reason := coalesce(
      p_error_code,
      case when p_d1_status <> 'green' then 'D1_UNAVAILABLE' else 'DISPATCHER_UNAVAILABLE' end,
      v_reason
    );
    if v_incident_id is null and v_has_previous_sample and not v_previous_healthy then
      v_incident_id := gen_random_uuid();
      v_opened_at := p_observed_at;
      v_transition := 'opened';
    end if;
  end if;

  update public.system_health_observer_state
  set observer_heartbeat_at = p_observed_at,
      dispatcher_status = p_dispatcher_status,
      d1_status = p_d1_status,
      last_error_code = p_error_code,
      active_dispatcher_incident_id = v_incident_id,
      dispatcher_incident_opened_at = v_opened_at,
      dispatcher_incident_reason = v_reason,
      updated_at = p_observed_at
  where environment = p_environment;

  return jsonb_build_object(
    'transition', v_transition,
    'incident_id', coalesce(v_incident_id, case when v_transition = 'resolved' then v_state.active_dispatcher_incident_id end),
    'opened_at', coalesce(v_opened_at, case when v_transition = 'resolved' then v_state.dispatcher_incident_opened_at end),
    'reason_code', coalesce(v_reason, v_state.dispatcher_incident_reason, p_error_code, 'DISPATCHER_UNAVAILABLE')
  );
end;
$$;
