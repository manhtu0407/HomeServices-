-- P10 Kael Agentic Case 2: demanding customer escalation and defensive logging.

create table if not exists public.kael_admin_queue (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'worker', 'admin', 'system')),
  queue_type text not null check (queue_type in ('demanding_customer')),
  priority text not null check (priority in ('medium', 'high')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'cancelled')),
  escalation_level text not null check (escalation_level in ('soft', 'hard')),
  reason_code text not null check (char_length(reason_code) between 3 and 120),
  response_summary text not null check (char_length(response_summary) between 3 and 200),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kael_interaction_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'worker', 'admin', 'system')),
  interaction_type text not null check (interaction_type in ('demanding_customer')),
  nuance text not null check (nuance in ('detail_oriented', 'pressure', 'mixed', 'none')),
  expected_nuance text not null check (expected_nuance in ('detail_oriented', 'pressure', 'none')),
  escalation_level text not null check (escalation_level in ('none', 'soft', 'hard')),
  legitimate_concern_signals text[] not null default '{}'::text[],
  pressure_signals text[] not null default '{}'::text[],
  strategy_ids text[] not null default '{}'::text[],
  sanitized_excerpt text not null default '' check (char_length(sanitized_excerpt) <= 240),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_admin_queue_status_priority_idx
  on public.kael_admin_queue (status, priority, created_at desc);
create index if not exists kael_admin_queue_job_idx
  on public.kael_admin_queue (job_id, created_at desc);
create index if not exists kael_interaction_log_job_idx
  on public.kael_interaction_log (job_id, created_at desc);
create index if not exists kael_interaction_log_actor_idx
  on public.kael_interaction_log (actor_id, created_at desc);
create index if not exists kael_interaction_log_escalation_idx
  on public.kael_interaction_log (escalation_level, created_at desc);

alter table public.kael_admin_queue enable row level security;
alter table public.kael_interaction_log enable row level security;

drop trigger if exists kael_admin_queue_updated_at on public.kael_admin_queue;
create trigger kael_admin_queue_updated_at
  before update on public.kael_admin_queue
  for each row execute function public.update_updated_at();

drop policy if exists "Admins view kael admin queue" on public.kael_admin_queue;
create policy "Admins view kael admin queue"
  on public.kael_admin_queue
  for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins view kael interaction log" on public.kael_interaction_log;
create policy "Admins view kael interaction log"
  on public.kael_interaction_log
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_admin_queue from public;
revoke all on public.kael_admin_queue from anon;
revoke all on public.kael_admin_queue from authenticated;
grant select on public.kael_admin_queue to authenticated;
grant all on public.kael_admin_queue to service_role;

revoke all on public.kael_interaction_log from public;
revoke all on public.kael_interaction_log from anon;
revoke all on public.kael_interaction_log from authenticated;
grant select on public.kael_interaction_log to authenticated;
grant all on public.kael_interaction_log to service_role;

comment on table public.kael_admin_queue is
  'Kael P10 admin queue for demanding customer soft/hard escalation. Service role writes; admins read.';
comment on table public.kael_interaction_log is
  'Kael P10 defensive interaction log with sanitized excerpts only. Service role writes; admins read.';
