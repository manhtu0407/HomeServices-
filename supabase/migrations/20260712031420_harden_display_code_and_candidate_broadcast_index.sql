-- Keep job display-code allocation inside the server-side workflow boundary.
-- Direct client job writes are already denied; allowing authenticated RPC calls
-- here would let a caller consume display codes without creating a job.
revoke all on function public.next_job_display_code() from public, anon, authenticated;
grant execute on function public.next_job_display_code() to service_role;

-- Cover the candidate broadcast foreign key used by candidate/broadcast joins.
create index if not exists job_worker_candidates_broadcast_id_idx
  on public.job_worker_candidates (broadcast_id);
