-- Customer-confirmed completion ends the Worker service-capacity hold.
-- Keep completed_by_worker active until the customer confirms completion.

begin;

create or replace function private.eligible_matching_worker_ids(
  p_service_type public.service_type,
  p_district_code text,
  p_quote_mode public.service_quote_mode,
  p_diagnosis_scope jsonb,
  p_intake_scope_snapshot jsonb,
  p_synthetic_cohort_id text,
  p_observed_at timestamptz,
  p_excluded_job_id uuid default null,
  p_operation_id uuid default null
) returns table(worker_id uuid)
language sql
stable
security definer
set search_path = ''
as $func$
  select worker.id
  from public.worker_profiles as worker
  where worker.is_approved
    and worker.verification_status = 'approved'::public.worker_verification_status
    and worker.is_available
    and not worker.is_suspended
    and p_service_type = any(worker.selected_service_types)
    and (
      p_district_code = any(worker.districts)
      or 'hcmc_all' = any(worker.districts)
    )
    and worker.synthetic_cohort_id is not distinct from p_synthetic_cohort_id
    and (
      (
        worker.matching_push_proven_at between p_observed_at - interval '24 hours' and p_observed_at
        and exists (
          select 1
          from public.device_push_tokens as push_token
          where push_token.user_id = worker.id
            and push_token.enabled
            and push_token.permission_status = 'granted'
            and push_token.updated_at <= worker.matching_push_proven_at
        )
      )
      or worker.matching_foreground_active_until >= p_observed_at
    )
    and not exists (
      select 1
      from public.worker_service_quality_status as quality
      where quality.worker_id = worker.id
        and quality.service_type = p_service_type
        and quality.is_locked
    )
    and not exists (
      select 1
      from public.jobs as busy_job
      where busy_job.worker_id = worker.id
        and busy_job.id is distinct from p_excluded_job_id
        and busy_job.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting',
          'repairing', 'scope_change_pending', 'completed_by_worker'
        )
    )
    and not exists (
      select 1
      from public.job_worker_candidates as candidate
      where candidate.worker_id = worker.id
        and candidate.status = 'proposed'
        and (candidate.expires_at is null or candidate.expires_at > p_observed_at)
        and candidate.job_id is distinct from p_excluded_job_id
    )
    and not exists (
      select 1
      from public.matching_capacity_reservations as capacity
      where capacity.worker_id = worker.id
        and capacity.status in ('held', 'offered')
        and capacity.expires_at > p_observed_at
        and capacity.operation_id is distinct from p_operation_id
    )
    and private.worker_meets_job_matching_requirements(
      p_quote_mode,
      p_diagnosis_scope,
      p_intake_scope_snapshot,
      worker.problem_specializations
    );
$func$;

revoke execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) from public, anon, authenticated;
grant execute on function private.eligible_matching_worker_ids(
  public.service_type,text,public.service_quote_mode,jsonb,jsonb,text,timestamptz,uuid,uuid
) to service_role;

commit;
