begin;

create or replace function private.reconcile_job_matching_expiry(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_candidate record;
  v_result record;
  v_now timestamptz;
  v_changed boolean := false;
begin
  select job.* into v_job from public.jobs job where job.id=p_job_id for update;
  if v_job.id is null or v_job.worker_id is not null
    or v_job.status not in ('broadcasting','worker_candidate_pending')
    or v_job.quote_mode is null then return false; end if;
  select matching.* into v_matching from public.matching_operations matching
    where matching.job_id=p_job_id and matching.state in ('broadcasting','candidate_ready')
      and matching.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
    order by matching.created_at desc, matching.id desc limit 1;
  if v_matching.id is null then return false; end if;

  for v_candidate in
    select candidate.id from public.job_worker_candidates candidate
      join public.matching_recipient_deliveries delivery on delivery.broadcast_id=candidate.broadcast_id
    where candidate.job_id=p_job_id and candidate.status='proposed'
      and candidate.expires_at <= clock_timestamp() and delivery.operation_id=v_matching.id
      and candidate.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
  loop
    select * into v_result from public.expire_worker_candidate_atomic(p_job_id,v_candidate.id,v_job.customer_id);
    if v_result.ok and not v_result.already_applied then
      v_changed := true;
      insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
      values (p_job_id,'worker_candidate_expired','worker_candidate_pending','broadcasting',
        jsonb_build_object('reason_code','CANDIDATE_LEASE_EXPIRED','operation_id',v_matching.id));
    end if;
  end loop;
  select job.* into v_job from public.jobs job where job.id=p_job_id;
  if v_job.status <> 'broadcasting' or v_job.worker_id is not null then return v_changed; end if;
  v_now := clock_timestamp();

  -- An in-flight dispatch or unexpired reservation still owns the right to make progress.
  if exists (select 1 from public.workflow_outbox outbox
      where (outbox.operation_id=v_matching.confirmation_operation_id
          or outbox.replacement_matching_operation_id=v_matching.id)
        and outbox.status in ('queued','processing','failed') and outbox.dead_lettered_at is null)
    or exists (select 1 from public.job_worker_candidates candidate where candidate.job_id=p_job_id
      and candidate.status='proposed')
    or exists (select 1 from public.matching_recipient_deliveries delivery
      where delivery.operation_id=v_matching.id and delivery.status in ('queued','delivered','seen','accepted')
        and delivery.expires_at > v_now)
    or exists (select 1 from public.matching_capacity_reservations capacity
      where capacity.job_id=p_job_id and capacity.operation_id=v_matching.confirmation_operation_id
        and capacity.status in ('held','offered') and capacity.expires_at > v_now)
    or not exists (select 1 from public.matching_recipient_deliveries delivery where delivery.operation_id=v_matching.id)
  then return v_changed; end if;

  update public.matching_recipient_deliveries set status='expired',updated_at=v_now
    where operation_id=v_matching.id and status in ('queued','delivered','seen','accepted') and expires_at <= v_now;
  update public.job_broadcasts broadcast set status='expired',responded_at=v_now
    where broadcast.job_id=p_job_id and broadcast.status in ('pending','sent','accepted')
      and broadcast.expires_at <= v_now and exists (
        select 1 from public.matching_recipient_deliveries delivery
        where delivery.broadcast_id=broadcast.id and delivery.operation_id=v_matching.id);
  update public.matching_capacity_reservations set status='released',released_at=v_now,updated_at=v_now
    where job_id=p_job_id and operation_id=v_matching.confirmation_operation_id
      and status in ('held','offered') and expires_at <= v_now;
  update public.matching_operations set state='no_reachable_worker',updated_at=v_now where id=v_matching.id;
  update public.confirmation_operations set state='no_reachable_worker',retry_after_ms=null,
    last_error_code=null,updated_at=v_now where id=v_matching.confirmation_operation_id
      and state in ('broadcasting','candidate_ready');
  insert into public.job_events(job_id,event_type,from_status,to_status,safe_metadata)
  values (p_job_id,'no_worker_found','broadcasting','broadcasting',
    jsonb_build_object('reason_code','MATCHING_LEASES_EXHAUSTED','operation_id',v_matching.id));
  return true;
end;
$func$;

-- Only the attested, cohort-gated maintenance command may invoke this helper.
revoke execute on function private.reconcile_job_matching_expiry(uuid) from public,anon,authenticated,service_role;

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
            and delivery.status in ('queued','delivered','seen','accepted') and delivery.expires_at <= clock_timestamp())
          and not exists (select 1 from public.matching_recipient_deliveries delivery
            where delivery.job_id=job.id and delivery.status in ('queued','delivered','seen','accepted')
              and delivery.expires_at > clock_timestamp())))
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
