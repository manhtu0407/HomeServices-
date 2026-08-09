create or replace function public.reserve_harness_idempotency(
  p_environment text,
  p_release_id text,
  p_operation_id text,
  p_actor_id_hash text,
  p_key_hash text,
  p_request_hash text,
  p_ttl_seconds integer
)
returns table (state text, reservation_id uuid, response_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.harness_idempotency_keys%rowtype;
  v_reservation_id uuid;
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_release_id text := nullif(trim(coalesce(p_release_id, '')), '');
  v_operation_id text := nullif(trim(coalesce(p_operation_id, '')), '');
  v_actor_id_hash text := nullif(trim(coalesce(p_actor_id_hash, '')), '');
begin
  if p_environment is null
     or v_environment = ''
     or v_environment not in ('local', 'preview', 'staging', 'production')
     or v_release_id is null or char_length(v_release_id) > 160
     or v_operation_id is null or char_length(v_operation_id) > 160
     or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or (v_actor_id_hash is not null and v_actor_id_hash !~ '^[0-9a-f]{64}$') then
    return query select 'conflict'::text, null::uuid, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    v_environment || '|' || v_operation_id || '|' || coalesce(v_actor_id_hash, 'system') || '|' || p_key_hash
  ));

  select * into v_row
  from public.harness_idempotency_keys key
  where key.environment = v_environment
    and key.operation_id = v_operation_id
    and key.actor_id_hash is not distinct from v_actor_id_hash
    and key.key_hash = p_key_hash
  for update;

  if found then
    if v_row.request_hash <> p_request_hash then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'conflict', 'REQUEST_HASH_CONFLICT');
      return query select 'conflict'::text, null::uuid, null::text;
      return;
    end if;
    if v_row.status = 'completed' then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'replayed');
      return query select 'completed'::text, v_row.reservation_id, v_row.response_hash;
      return;
    end if;
    if v_row.status = 'reconcile_required' then
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status in ('reserved', 'executing') and v_row.expires_at > now() then
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result
      ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'in_progress');
      return query select 'in_progress'::text, v_row.reservation_id, null::text;
      return;
    end if;
    if v_row.status = 'executing' then
      update public.harness_idempotency_keys
      set status = 'reconcile_required', completed_at = now(),
          error_code = 'EXECUTION_OUTCOME_UNKNOWN'
      where reservation_id = v_row.reservation_id;
      insert into public.harness_reliability_events (
        environment, release_id, operation_id, event_class, result, error_code
      ) values (v_environment, v_release_id, v_operation_id,
        'idempotency', 'reconcile_required', 'EXECUTION_OUTCOME_UNKNOWN');
      return query select 'reconcile_required'::text, v_row.reservation_id, null::text;
      return;
    end if;
    update public.harness_idempotency_keys
    set status = 'reserved', release_id = v_release_id,
        request_hash = p_request_hash, response_hash = null, error_code = null,
        reserved_at = now(), completed_at = null,
        expires_at = now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
    where reservation_id = v_row.reservation_id;
    return query select 'reserved'::text, v_row.reservation_id, null::text;
    return;
  end if;

  insert into public.harness_idempotency_keys (
    environment, release_id, operation_id, actor_id_hash, key_hash,
    request_hash, expires_at
  ) values (
    v_environment, v_release_id, v_operation_id,
    v_actor_id_hash, p_key_hash, p_request_hash,
    now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30))
  ) returning harness_idempotency_keys.reservation_id into v_reservation_id;

  insert into public.harness_reliability_events (
    environment, release_id, operation_id, event_class, result
  ) values (v_environment, v_release_id, v_operation_id, 'idempotency', 'reserved');
  return query select 'reserved'::text, v_reservation_id, null::text;
end;
$$;

revoke all on function public.reserve_harness_idempotency(text,text,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_harness_idempotency(text,text,text,text,text,text,integer) to service_role;
