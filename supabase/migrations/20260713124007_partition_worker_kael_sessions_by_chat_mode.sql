-- Worker Kael has two distinct conversation catalogs. Existing rows were
-- created by the original job-scoped contract, so they remain in intake.

alter table public.kael_worker_chat_sessions
  add column if not exists chat_mode text not null default 'intake';

alter table public.kael_worker_chat_sessions
  drop constraint if exists kael_worker_chat_sessions_chat_mode_check;

alter table public.kael_worker_chat_sessions
  add constraint kael_worker_chat_sessions_chat_mode_check
  check (chat_mode in ('normal', 'intake'));

create index if not exists kael_worker_chat_sessions_worker_mode_active_idx
  on public.kael_worker_chat_sessions (worker_id, chat_mode, updated_at desc)
  where archived_at is null;

drop index if exists public.kael_worker_chat_sessions_worker_job_idempotency_idx;

create unique index if not exists kael_worker_chat_sessions_worker_job_mode_idempotency_idx
  on public.kael_worker_chat_sessions (worker_id, job_id, chat_mode, client_request_id)
  where client_request_id is not null;
