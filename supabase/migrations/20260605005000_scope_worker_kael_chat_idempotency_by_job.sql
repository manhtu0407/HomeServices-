-- Plan.md Section 32 WBF.3/WBF.4 follow-up.
-- Worker Kael chat idempotency must be scoped to the active job. A reused
-- client_request_id across two jobs must not recover the previous job session.
-- Turns also need their own job_id because the Edge serializer/insert path uses
-- it for job-scoped advisory evidence.

alter table public.kael_worker_chat_turns
  add column if not exists job_id uuid references public.jobs on delete cascade;

update public.kael_worker_chat_turns t
set job_id = s.job_id
from public.kael_worker_chat_sessions s
where t.session_id = s.id
  and t.job_id is null;

alter table public.kael_worker_chat_turns
  alter column job_id set not null;

create index if not exists kael_worker_chat_turns_job_idx
  on public.kael_worker_chat_turns (job_id, created_at desc);

drop index if exists public.kael_worker_chat_sessions_worker_idempotency_idx;

create unique index if not exists kael_worker_chat_sessions_worker_job_idempotency_idx
  on public.kael_worker_chat_sessions (worker_id, job_id, client_request_id)
  where client_request_id is not null;
