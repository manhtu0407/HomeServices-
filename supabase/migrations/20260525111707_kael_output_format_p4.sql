-- P4 Kael output format: structured cards/briefs, worker Q&A, and scope-change stats.

alter table public.jobs
  add column if not exists kael_estimate_card_v3 jsonb,
  add column if not exists kael_worker_brief_core jsonb,
  add column if not exists kael_worker_brief_guidance jsonb;

alter table public.jobs
  drop constraint if exists jobs_kael_estimate_card_v3_is_object,
  add constraint jobs_kael_estimate_card_v3_is_object
    check (kael_estimate_card_v3 is null or jsonb_typeof(kael_estimate_card_v3) = 'object'),
  drop constraint if exists jobs_kael_worker_brief_core_is_object,
  add constraint jobs_kael_worker_brief_core_is_object
    check (kael_worker_brief_core is null or jsonb_typeof(kael_worker_brief_core) = 'object'),
  drop constraint if exists jobs_kael_worker_brief_guidance_is_object,
  add constraint jobs_kael_worker_brief_guidance_is_object
    check (kael_worker_brief_guidance is null or jsonb_typeof(kael_worker_brief_guidance) = 'object');

create table if not exists public.kael_worker_qa_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 3 and 1000),
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_worker_qa_log_job_worker_created_idx
  on public.kael_worker_qa_log(job_id, worker_id, created_at desc);

alter table public.kael_worker_qa_log enable row level security;

drop policy if exists "Workers view own kael qa log" on public.kael_worker_qa_log;
create policy "Workers view own kael qa log"
  on public.kael_worker_qa_log
  for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());

revoke all on public.kael_worker_qa_log from authenticated;
revoke insert, update, delete on public.kael_worker_qa_log from authenticated;
grant select on public.kael_worker_qa_log to authenticated;
grant all on public.kael_worker_qa_log to service_role;

create table if not exists public.worker_scope_change_stats (
  worker_id uuid primary key references public.profiles(id) on delete cascade,
  total_completed_jobs int not null default 0 check (total_completed_jobs >= 0),
  scope_change_requests int not null default 0 check (scope_change_requests >= 0),
  scope_change_rate numeric(6,4) not null default 0 check (scope_change_rate >= 0 and scope_change_rate <= 1),
  last_scope_change_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists worker_scope_change_stats_rate_idx
  on public.worker_scope_change_stats(scope_change_rate desc);

alter table public.worker_scope_change_stats enable row level security;

drop policy if exists "Workers view own scope-change stats" on public.worker_scope_change_stats;
create policy "Workers view own scope-change stats"
  on public.worker_scope_change_stats
  for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());

revoke all on public.worker_scope_change_stats from authenticated;
revoke insert, update, delete on public.worker_scope_change_stats from authenticated;
grant select on public.worker_scope_change_stats to authenticated;
grant all on public.worker_scope_change_stats to service_role;

comment on table public.kael_worker_qa_log is
  'P4 service-role log for worker job-scoped Kael clarifications, limited by Edge to 3 per job.';
comment on table public.worker_scope_change_stats is
  'P4 anti-fraud input table for worker scope-change rate, maintained by trusted backend/admin jobs.';
