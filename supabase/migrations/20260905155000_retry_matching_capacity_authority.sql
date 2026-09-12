begin;

-- Both initial matching and Customer retry use the same delivery-bound capacity authority.
-- Keep this compatibility entry point; selecting only replacement outboxes bypasses initial jobs.
create or replace function private.require_live_replacement_capacity(
  p_job_id uuid, p_worker_id uuid, p_broadcast_id uuid default null
) returns void language plpgsql security definer set search_path = '' as $func$
begin
  perform private.require_live_matching_capacity(p_job_id, p_worker_id, p_broadcast_id);
end;
$func$;

revoke execute on function private.require_live_replacement_capacity(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

commit;
