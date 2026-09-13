begin;

create or replace function public.expire_worker_candidate_atomic(
  p_job_id uuid, p_candidate_id uuid, p_customer_id uuid
) returns table(ok boolean, error_code text, job_status public.job_status,
  candidate_id uuid, worker_id uuid, already_applied boolean)
language plpgsql security invoker set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_candidate public.job_worker_candidates%rowtype;
  v_now timestamptz;
begin
  select job.* into v_job from public.jobs as job where job.id = p_job_id for update;
  if v_job.id is null or p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    return query select false, 'NOT_FOUND', null::public.job_status, null::uuid, null::uuid, false;
    return;
  end if;
  select candidate.* into v_candidate from public.job_worker_candidates as candidate
    where candidate.id = p_candidate_id and candidate.job_id = p_job_id for update;
  if v_candidate.id is null then
    return query select false, 'NOT_FOUND', v_job.status, null::uuid, null::uuid, false;
    return;
  end if;
  if v_candidate.status = 'expired' then
    return query select true, null::text, v_job.status, v_candidate.id, v_candidate.worker_id, true;
    return;
  end if;
  if v_candidate.status <> 'proposed' or v_job.status <> 'worker_candidate_pending'
    or v_job.worker_id is not null then
    return query select false, 'INVALID_STATUS', v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  perform worker.id from public.worker_profiles as worker where worker.id = v_candidate.worker_id for update;
  v_now := clock_timestamp();
  -- Reads may discover expiry, but can never stand in for a Customer decision.
  if v_candidate.expires_at is null or v_candidate.expires_at > v_now then
    return query select false, 'NOT_EXPIRED', v_job.status, v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;

  update public.job_worker_candidates set status = 'expired', updated_at = v_now
    where id = v_candidate.id;
  update public.worker_matching_proposals as proposal set status = 'expired', updated_at = v_now
    where proposal.candidate_id = v_candidate.id and proposal.status = 'proposed';
  update public.job_broadcasts set status = 'expired', responded_at = v_now
    where id = v_candidate.broadcast_id and status in ('pending', 'sent', 'accepted');
  update public.matching_recipient_deliveries set status = 'expired', updated_at = v_now
    where broadcast_id = v_candidate.broadcast_id and status in ('queued', 'delivered', 'seen', 'accepted');
  update public.matching_capacity_reservations as capacity
    set status = 'released', released_at = v_now, updated_at = v_now
    where capacity.job_id = p_job_id and capacity.worker_id = v_candidate.worker_id
      and capacity.status in ('held', 'offered');
  update public.jobs set status = 'broadcasting', broadcast_at = null where id = p_job_id;
  update public.matching_operations as matching set state = 'broadcasting', updated_at = v_now
    where matching.job_id = p_job_id and matching.state = 'candidate_ready';
  update public.confirmation_operations as confirmation set state = 'broadcasting', updated_at = v_now
    where confirmation.job_id = p_job_id and confirmation.state = 'candidate_ready';
  return query select true, null::text, 'broadcasting'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$func$;

revoke execute on function public.expire_worker_candidate_atomic(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.expire_worker_candidate_atomic(uuid,uuid,uuid) to service_role;

commit;
