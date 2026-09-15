-- Stage 5 operational state only. These fields are worker-owned session facts;
-- they do not authorize status, pricing, scope, payment, or Kael decisions.
alter table jobs
  add column work_started_at timestamptz,
  add column work_paused_at timestamptz,
  add column work_paused_ms bigint not null default 0,
  add column worker_work_note text,
  add constraint jobs_work_paused_ms_non_negative check (work_paused_ms >= 0),
  add constraint jobs_worker_work_note_length check (worker_work_note is null or char_length(worker_work_note) <= 2000);
