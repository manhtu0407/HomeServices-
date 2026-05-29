-- X2 (Plan.md §27.5 — 2026-05-29): DB-backed rate limiter for /kael/chat.
-- Per-worker in-memory token buckets do not survive Edge worker churn, so
-- the audit (Plan §27.18) saw 10 parallel POSTs all succeed instead of the
-- 5/min cap firing. This migration adds a tiny attempts log + RPC that the
-- Edge function calls; cron cleans up stale rows.

create table if not exists public.kael_chat_rate_limit_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ts timestamptz not null default now()
);

create index if not exists kael_chat_rate_limit_log_user_ts_idx
  on public.kael_chat_rate_limit_log (user_id, ts desc);

alter table public.kael_chat_rate_limit_log enable row level security;
revoke all on public.kael_chat_rate_limit_log from public;
revoke all on public.kael_chat_rate_limit_log from authenticated;
revoke all on public.kael_chat_rate_limit_log from anon;

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

select cron.schedule(
  'kael-chat-rate-limit-cleanup',
  '17 * * * *',
  $$delete from public.kael_chat_rate_limit_log where ts < now() - interval '2 hours'$$
);
