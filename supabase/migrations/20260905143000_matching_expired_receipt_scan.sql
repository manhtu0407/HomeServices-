begin;

-- Rows already expired by foreground recovery still need a terminal operation receipt.
create or replace function public.reconcile_expired_matching_leases(
  p_environment text, p_release_id text, p_deployment_id text, p_limit integer default 50
) returns integer language plpgsql security definer set search_path = '' as $func$
declare
  v_control public.stage1_release_controls%rowtype;
  v_target record;
  v_count integer := 0;
begin
  if p_environment is null or p_environment not in ('staging','production')
    or p_release_id is null or p_release_id !~ '^harness-[0-9a-f]{12}-[0-9a-f]{12}$'
    or p_deployment_id is null or length(p_deployment_id) not between 30 and 160
    or p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode='22023',message='MATCHING_EXPIRY_INPUT_INVALID';
  end if;
  if not exists (select 1 from public.stage1_source_deployment_attestations attestation
    where attestation.environment=p_environment and attestation.release_id=p_release_id
      and attestation.function_name='kael-matching-maintainer' and attestation.deployment_id=p_deployment_id)
  then return 0; end if;
  -- Keep promotion/rollback and this bounded maintenance transaction in one release lane.
  select control.* into v_control from public.stage1_release_controls control
    where control.environment=p_environment for share;
  if v_control.environment is null or (
    v_control.active_release_id is distinct from p_release_id
    and v_control.candidate_release_id is distinct from p_release_id)
  then return 0; end if;
  for v_target in
    select job.id from public.jobs job
    where job.worker_id is null and job.quote_mode is not null
      and (v_control.active_release_id=p_release_id
        or (v_control.candidate_release_id=p_release_id and job.synthetic_cohort_id=v_control.candidate_cohort_id))
      and exists (select 1 from public.matching_operations matching where matching.job_id=job.id
        and matching.state in ('broadcasting','candidate_ready'))
      and (
        (job.status='worker_candidate_pending' and exists (
          select 1 from public.job_worker_candidates candidate where candidate.job_id=job.id
            and candidate.status='proposed' and candidate.expires_at <= clock_timestamp()))
        or (job.status='broadcasting' and exists (
          select 1 from public.matching_recipient_deliveries delivery where delivery.job_id=job.id
            and delivery.expires_at <= clock_timestamp())
          and not exists (select 1 from public.matching_recipient_deliveries delivery
            where delivery.job_id=job.id and delivery.status in ('queued','delivered','seen','accepted')
              and delivery.expires_at > clock_timestamp())
          and not exists (select 1 from public.matching_capacity_reservations capacity
            where capacity.job_id=job.id and capacity.status in ('held','offered')
              and capacity.expires_at > clock_timestamp())
          and not exists (select 1 from public.workflow_outbox outbox
            join public.matching_operations matching on (
              outbox.operation_id=matching.confirmation_operation_id or outbox.replacement_matching_operation_id=matching.id)
            where matching.job_id=job.id and matching.state in ('broadcasting','candidate_ready')
              and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)))
    order by job.updated_at,job.id limit p_limit for update of job skip locked
  loop
    if private.reconcile_job_matching_expiry(v_target.id) then v_count := v_count+1; end if;
  end loop;
  return v_count;
end;
$func$;
revoke execute on function public.reconcile_expired_matching_leases(text,text,text,integer) from public,anon,authenticated;
grant execute on function public.reconcile_expired_matching_leases(text,text,text,integer) to service_role;

commit;
