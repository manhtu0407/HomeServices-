-- Worker Kael transcripts are operational evidence. Archiving hides a session
-- from the worker's active list while preserving its turns for authorised
-- support and incident review; it is intentionally not a physical delete.

alter table public.kael_worker_chat_sessions
  add column if not exists archived_at timestamptz;

create index if not exists kael_worker_chat_sessions_worker_job_active_idx
  on public.kael_worker_chat_sessions (worker_id, job_id, updated_at desc)
  where archived_at is null;
