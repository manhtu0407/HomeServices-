-- =============================================================================
-- Plan.md Section 32 WBF.1 - worker Kael advisory chat sibling tables.
--
-- Customer kael_chat_sessions remains customer-bound. These worker tables are
-- job-scoped, advisory-only, and read-only to mobile clients; writes flow
-- through the service-role Edge mobile API.
-- =============================================================================

create table if not exists public.kael_worker_chat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid references public.profiles on delete cascade not null,
  job_id              uuid references public.jobs on delete cascade not null,
  status              text not null default 'active' check (status in (
    'active',
    'closed',
    'escalated',
    'error'
  )),
  client_request_id   text,
  started_at          timestamptz not null default now(),
  closed_at           timestamptz,
  total_turns         int not null default 0 check (total_turns >= 0),
  total_cost_usd      numeric(10,6) not null default 0 check (total_cost_usd >= 0),
  kael_progress       jsonb,
  safe_metadata       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint kael_worker_chat_sessions_progress_is_object
    check (kael_progress is null or jsonb_typeof(kael_progress) = 'object')
);

create table if not exists public.kael_worker_chat_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.kael_worker_chat_sessions on delete cascade not null,
  turn_index      int not null check (turn_index > 0),
  role            text not null check (role in ('worker', 'kael', 'system')),
  content_type    text not null check (content_type in (
    'text',
    'clarification',
    'guidance',
    'photo_request',
    'photo_attached',
    'error'
  )),
  text_content    text check (text_content is null or char_length(text_content) <= 5000),
  media_refs      text[] not null default '{}'::text[],
  safe_metadata   jsonb not null default '{}'::jsonb,
  ai_provider     public.api_provider,
  ai_model        text,
  cost_usd        numeric(10,6) check (cost_usd is null or cost_usd >= 0),
  latency_ms      int check (latency_ms is null or latency_ms >= 0),
  created_at      timestamptz not null default now(),
  unique (session_id, turn_index)
);

create table if not exists public.kael_worker_chat_rate_limit_log (
  worker_id uuid not null references public.profiles(id) on delete cascade,
  ts timestamptz not null default now()
);

create index if not exists kael_worker_chat_sessions_worker_idx
  on public.kael_worker_chat_sessions (worker_id, created_at desc);
create index if not exists kael_worker_chat_sessions_job_idx
  on public.kael_worker_chat_sessions (job_id, created_at desc);
create unique index if not exists kael_worker_chat_sessions_worker_idempotency_idx
  on public.kael_worker_chat_sessions (worker_id, client_request_id)
  where client_request_id is not null;
create index if not exists kael_worker_chat_turns_session_idx
  on public.kael_worker_chat_turns (session_id, turn_index);
create index if not exists kael_worker_chat_rate_limit_worker_ts_idx
  on public.kael_worker_chat_rate_limit_log (worker_id, ts desc);

alter table public.kael_worker_chat_sessions enable row level security;
alter table public.kael_worker_chat_turns enable row level security;
alter table public.kael_worker_chat_rate_limit_log enable row level security;

drop policy if exists "Workers read own Kael worker chat sessions" on public.kael_worker_chat_sessions;
create policy "Workers read own Kael worker chat sessions"
  on public.kael_worker_chat_sessions for select
  to authenticated
  using (worker_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Workers read own Kael worker chat turns" on public.kael_worker_chat_turns;
create policy "Workers read own Kael worker chat turns"
  on public.kael_worker_chat_turns for select
  to authenticated
  using (
    exists (
      select 1
      from public.kael_worker_chat_sessions s
      where s.id = session_id
        and (s.worker_id = (select auth.uid()) or private.is_admin())
    )
  );

revoke insert, update, delete on public.kael_worker_chat_sessions from authenticated;
revoke insert, update, delete on public.kael_worker_chat_turns from authenticated;
revoke all on public.kael_worker_chat_rate_limit_log from public;
revoke all on public.kael_worker_chat_rate_limit_log from authenticated;
revoke all on public.kael_worker_chat_rate_limit_log from anon;
grant select on public.kael_worker_chat_sessions to authenticated;
grant select on public.kael_worker_chat_turns to authenticated;
grant all on public.kael_worker_chat_sessions to service_role;
grant all on public.kael_worker_chat_turns to service_role;
grant all on public.kael_worker_chat_rate_limit_log to service_role;

drop trigger if exists kael_worker_chat_sessions_updated_at on public.kael_worker_chat_sessions;
create trigger kael_worker_chat_sessions_updated_at
  before update on public.kael_worker_chat_sessions
  for each row execute function update_updated_at();

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
