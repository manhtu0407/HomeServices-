alter table public.kael_worker_chat_sessions
  add column if not exists pinned_at timestamptz;

create index if not exists kael_worker_chat_sessions_worker_pinned_active_idx
  on public.kael_worker_chat_sessions (worker_id, pinned_at desc)
  where pinned_at is not null and archived_at is null;
