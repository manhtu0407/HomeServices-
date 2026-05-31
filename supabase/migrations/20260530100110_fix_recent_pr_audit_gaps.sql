-- Follow-up for PR #47 review threads (2026-05-30).
--
-- 1. Make check_kael_chat_rate atomic for concurrent /kael/chat creates.
-- 2. Protect the worker district backup table created by the X3 migration.

create or replace function public.check_kael_chat_rate(
  p_user_id uuid,
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
  -- Serialize quota check+insert for one user in the current transaction.
  -- Without this lock, parallel Edge workers can all observe the same count
  -- below quota, then all insert.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.kael_chat_rate_limit_log
  where user_id = p_user_id and ts < now() - interval '2 hours';

  select count(*) into v_min
  from public.kael_chat_rate_limit_log
  where user_id = p_user_id and ts >= now() - interval '1 minute';

  select count(*) into v_hour
  from public.kael_chat_rate_limit_log
  where user_id = p_user_id and ts >= now() - interval '1 hour';

  if v_min >= p_per_minute then
    return query select false, v_min, v_hour, 'minute'::text;
    return;
  end if;

  if v_hour >= p_per_hour then
    return query select false, v_min, v_hour, 'hour'::text;
    return;
  end if;

  insert into public.kael_chat_rate_limit_log (user_id) values (p_user_id);
  return query select true, v_min + 1, v_hour + 1, null::text;
end;
$$;

revoke all on function public.check_kael_chat_rate(uuid, int, int) from public;
revoke all on function public.check_kael_chat_rate(uuid, int, int) from anon;
revoke all on function public.check_kael_chat_rate(uuid, int, int) from authenticated;
grant execute on function public.check_kael_chat_rate(uuid, int, int) to service_role;

alter table if exists public.worker_profiles_districts_backup_x3 enable row level security;
revoke all on table public.worker_profiles_districts_backup_x3 from public;
revoke all on table public.worker_profiles_districts_backup_x3 from anon;
revoke all on table public.worker_profiles_districts_backup_x3 from authenticated;
grant select on table public.worker_profiles_districts_backup_x3 to service_role;
