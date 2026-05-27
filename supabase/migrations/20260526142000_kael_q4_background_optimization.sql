-- =============================================================================
-- Plan.md Section 24 Q4: background learning queue + Anthropic batch tracking.
--
-- This is default-off infrastructure. Customer/worker workflow still writes
-- learning lifecycle rows immediately unless KAEL_OPT_BATCH_LEARNING_ENABLED is
-- enabled in the Edge runtime.
-- =============================================================================

create table if not exists public.kael_learning_queue (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('post-A14', 'post-B6', 'post-B7', 'post-decline', 'admin-trigger', 'admin-safety-tag')),
  skill_id text not null check (skill_id in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7')),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid,
  actor_role text,
  queue_state text not null default 'pending'
    check (queue_state in ('pending', 'batched', 'processed', 'manual_review', 'rejected', 'failed', 'realtime_fallback')),
  input_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(input_payload) = 'object'),
  candidate_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate_payload) = 'object'),
  batch_id uuid,
  provider_batch_id text,
  attempts integer not null default 0 check (attempts >= 0),
  error_code text,
  run_after timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kael_ai_batches (
  id uuid primary key default gen_random_uuid(),
  provider public.api_provider not null default 'anthropic',
  provider_batch_id text unique,
  purpose text not null default 'post_job_learning'
    check (char_length(purpose) between 2 and 80),
  status text not null default 'queued'
    check (status in ('queued', 'submitted', 'in_progress', 'ended', 'results_processed', 'failed', 'cancelled', 'expired', 'realtime_fallback')),
  request_count integer not null default 0 check (request_count >= 0),
  processing_count integer not null default 0 check (processing_count >= 0),
  succeeded_count integer not null default 0 check (succeeded_count >= 0),
  errored_count integer not null default 0 check (errored_count >= 0),
  canceled_count integer not null default 0 check (canceled_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  results_url text,
  submitted_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz,
  next_poll_at timestamptz,
  error_code text,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kael_learning_queue
  add constraint kael_learning_queue_batch_fk
  foreign key (batch_id) references public.kael_ai_batches(id) on delete set null;

create table if not exists public.kael_ai_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.kael_ai_batches(id) on delete cascade,
  queue_id uuid references public.kael_learning_queue(id) on delete set null,
  custom_id text not null check (custom_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  skill_id text not null check (skill_id in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'errored', 'canceled', 'expired', 'realtime_fallback')),
  request_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(request_payload) = 'object'),
  response_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(response_payload) = 'object'),
  error_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(error_payload) = 'object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, custom_id)
);

create index if not exists kael_learning_queue_state_due_idx
  on public.kael_learning_queue (queue_state, run_after, created_at);
create index if not exists kael_learning_queue_skill_state_idx
  on public.kael_learning_queue (skill_id, queue_state, created_at);
create index if not exists kael_learning_queue_job_idx
  on public.kael_learning_queue (job_id)
  where job_id is not null;
create index if not exists kael_ai_batches_status_poll_idx
  on public.kael_ai_batches (status, next_poll_at, created_at);
create index if not exists kael_ai_batch_items_queue_idx
  on public.kael_ai_batch_items (queue_id)
  where queue_id is not null;

drop trigger if exists kael_learning_queue_updated_at on public.kael_learning_queue;
create trigger kael_learning_queue_updated_at
  before update on public.kael_learning_queue
  for each row execute function update_updated_at();

drop trigger if exists kael_ai_batches_updated_at on public.kael_ai_batches;
create trigger kael_ai_batches_updated_at
  before update on public.kael_ai_batches
  for each row execute function update_updated_at();

alter table public.kael_learning_queue enable row level security;
alter table public.kael_ai_batches enable row level security;
alter table public.kael_ai_batch_items enable row level security;

drop policy if exists "Admins read kael learning queue" on public.kael_learning_queue;
create policy "Admins read kael learning queue"
  on public.kael_learning_queue for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins read kael ai batches" on public.kael_ai_batches;
create policy "Admins read kael ai batches"
  on public.kael_ai_batches for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins read kael ai batch items" on public.kael_ai_batch_items;
create policy "Admins read kael ai batch items"
  on public.kael_ai_batch_items for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_learning_queue from public;
revoke all on public.kael_learning_queue from anon;
revoke all on public.kael_learning_queue from authenticated;
grant select on public.kael_learning_queue to authenticated;
grant all on public.kael_learning_queue to service_role;

revoke all on public.kael_ai_batches from public;
revoke all on public.kael_ai_batches from anon;
revoke all on public.kael_ai_batches from authenticated;
grant select on public.kael_ai_batches to authenticated;
grant all on public.kael_ai_batches to service_role;

revoke all on public.kael_ai_batch_items from public;
revoke all on public.kael_ai_batch_items from anon;
revoke all on public.kael_ai_batch_items from authenticated;
grant select on public.kael_ai_batch_items to authenticated;
grant all on public.kael_ai_batch_items to service_role;

create extension if not exists pg_cron;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'kael-learning-queue-stale-fallback',
      'kael-ai-batch-stale-fallback'
    );
  end if;
end $$;

select cron.schedule(
  'kael-learning-queue-stale-fallback',
  '17 * * * *',
  $$update public.kael_learning_queue
    set queue_state = 'failed',
        error_code = coalesce(error_code, 'STALE_PENDING_OVER_48H'),
        updated_at = now()
    where queue_state = 'pending'
      and created_at < now() - interval '48 hours';$$
);

select cron.schedule(
  'kael-ai-batch-stale-fallback',
  '23 * * * *',
  $$update public.kael_ai_batches
    set status = 'realtime_fallback',
        error_code = coalesce(error_code, 'BATCH_NOT_ENDED_OVER_48H'),
        updated_at = now()
    where status in ('submitted', 'in_progress')
      and created_at < now() - interval '48 hours';$$
);

comment on table public.kael_learning_queue is
  'Plan.md Section 24 Q4 default-off background learning queue. Service role writes; admins read.';
comment on table public.kael_ai_batches is
  'Plan.md Section 24 Q4 Anthropic Message Batches tracking for non-user-facing Kael learning work.';
comment on table public.kael_ai_batch_items is
  'Plan.md Section 24 Q4 per-request mapping from kael_learning_queue to provider batch custom_id results.';
