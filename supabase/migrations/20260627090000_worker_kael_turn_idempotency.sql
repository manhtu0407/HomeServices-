-- Worker Kael hardening: per-turn idempotency and atomic rate limiting.
-- Session creation is session-only; each send/stream turn owns its retry key.

alter table public.kael_worker_chat_turns
  add column if not exists client_request_id text;

create unique index if not exists kael_worker_chat_turns_session_client_request_id_idx
  on public.kael_worker_chat_turns (session_id, client_request_id)
  where client_request_id is not null;

create or replace function public.check_kael_worker_chat_rate(
  p_worker_id uuid,
  p_per_minute int default 5,
  p_per_hour int default 20
)
returns table(allowed boolean, minute_count int, hour_count int, reason text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_min int;
  v_hour int;
begin
  perform pg_advisory_xact_lock(
    hashtext('kael_worker_chat_rate'),
    hashtext(p_worker_id::text)
  );

  delete from public.kael_worker_chat_rate_limit_log
  where worker_id = p_worker_id and ts < now() - interval '2 hours';

  select count(*) into v_min
  from public.kael_worker_chat_rate_limit_log
  where worker_id = p_worker_id and ts >= now() - interval '1 minute';

  select count(*) into v_hour
  from public.kael_worker_chat_rate_limit_log
  where worker_id = p_worker_id and ts >= now() - interval '1 hour';

  if v_min >= p_per_minute then
    return query select false, v_min, v_hour, 'minute'::text;
    return;
  end if;
  if v_hour >= p_per_hour then
    return query select false, v_min, v_hour, 'hour'::text;
    return;
  end if;

  insert into public.kael_worker_chat_rate_limit_log (worker_id) values (p_worker_id);
  return query select true, v_min + 1, v_hour + 1, null::text;
end;
$$;

revoke all on function public.check_kael_worker_chat_rate(uuid, int, int) from public;
revoke all on function public.check_kael_worker_chat_rate(uuid, int, int) from anon;
revoke all on function public.check_kael_worker_chat_rate(uuid, int, int) from authenticated;
grant execute on function public.check_kael_worker_chat_rate(uuid, int, int) to service_role;
