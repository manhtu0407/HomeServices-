-- Fix PR #18 review findings:
-- 1. Do not approve stale worker cancellation requests after the job has moved
--    out of cancellable in-progress states.
-- 2. Restrict direct job-media storage uploads by participant role and stage.

create or replace function public.decide_worker_cancellation_atomic(
  p_cancellation_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_review_note text default null
) returns table (
  ok boolean,
  error_code text,
  cancellation_status text,
  job_id_out uuid,
  job_status public.job_status,
  service_type_out public.service_type,
  district_code text,
  worker_id_out uuid,
  decided_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_request record;
  v_job record;
  v_now timestamptz := now();
  v_is_admin boolean;
begin
  if p_decision not in ('approve', 'reject') then
    return query select false, 'INVALID_DECISION'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select exists (
    select 1
      from public.profiles
      where id = p_admin_id
        and role = 'admin'::public.user_role
  ) into v_is_admin;
  if v_is_admin is not true then
    return query select false, 'AUTH_FORBIDDEN'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select id, job_id, worker_id, status
    into v_request
    from public.worker_cancellation_requests
    where id = p_cancellation_id
    for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::text, null::uuid, null::public.job_status, null::public.service_type, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_request.status not in ('requested', 'reviewing_by_kael') then
    return query select false, 'ALREADY_DECIDED'::text, v_request.status, v_request.job_id, null::public.job_status, null::public.service_type, null::text, v_request.worker_id, null::timestamptz;
    return;
  end if;

  select id, status, worker_id, service_type, address_district
    into v_job
    from public.jobs
    where id = v_request.job_id
    for update;

  if not found or v_job.worker_id <> v_request.worker_id then
    return query select false, 'JOB_CHANGED'::text, null::text, v_request.job_id, null::public.job_status, null::public.service_type, null::text, v_request.worker_id, null::timestamptz;
    return;
  end if;

  if p_decision = 'approve' and v_job.status not in (
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status
  ) then
    return query select false, 'JOB_NOT_CANCELLABLE'::text, v_request.status, v_job.id, v_job.status, v_job.service_type, v_job.address_district, v_request.worker_id, null::timestamptz;
    return;
  end if;

  if p_decision = 'reject' then
    update public.worker_cancellation_requests
      set status = 'rejected',
          admin_decision_by = p_admin_id,
          admin_decision_at = v_now,
          review_note = p_review_note
      where id = p_cancellation_id;

    return query select true, null::text, 'rejected'::text, v_job.id, v_job.status, v_job.service_type, v_job.address_district, v_request.worker_id, v_now;
    return;
  end if;

  update public.worker_cancellation_requests
    set status = 'approved',
        admin_decision_by = p_admin_id,
        admin_decision_at = v_now,
        review_note = p_review_note
    where id = p_cancellation_id;

  update public.job_broadcasts
    set status = 'reassigned'::public.broadcast_status,
        responded_at = v_now
    where job_id = v_job.id
      and status in ('pending'::public.broadcast_status, 'sent'::public.broadcast_status, 'accepted'::public.broadcast_status);

  update public.jobs
    set worker_id = null,
        status = 'broadcasting'::public.job_status,
        broadcast_at = v_now,
        matched_at = null
    where id = v_job.id;

  return query select true, null::text, 'approved'::text, v_job.id, 'broadcasting'::public.job_status, v_job.service_type, v_job.address_district, v_request.worker_id, v_now;
end;
$func$;

revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from public;
revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from anon;
revoke execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) from authenticated;
grant execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) to service_role;

drop policy if exists "Participants upload job media files" on storage.objects;
create policy "Participants upload job media files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-media'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (
        (
          (storage.foldername(name))[2] in ('before', 'kael_reference')
          and private.is_job_customer(((storage.foldername(name))[1])::uuid)
        )
        or (
          (storage.foldername(name))[2] in ('after', 'cancellation_evidence')
          and private.is_job_worker(((storage.foldername(name))[1])::uuid)
        )
        or private.is_admin()
      )
      else false
    end
  );
