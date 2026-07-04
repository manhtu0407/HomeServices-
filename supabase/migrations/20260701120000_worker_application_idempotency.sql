-- Make retry-safe worker application submissions idempotent at the admin queue.
-- The mobile client retries POST /worker-applications with a stable
-- client_request_id; duplicate attempts from the same actor/source must return
-- the original review ticket instead of creating a second admin queue row.
create unique index if not exists kael_admin_queue_worker_application_idempotency_idx
on public.kael_admin_queue (
  actor_id,
  (safe_metadata->>'source'),
  (safe_metadata->>'client_request_id')
)
where queue_type = 'worker_application_review'
  and reason_code = 'worker_application_submitted'
  and actor_id is not null
  and (safe_metadata->>'source') is not null
  and (safe_metadata->>'client_request_id') is not null
  and (safe_metadata->>'client_request_id') <> '';
