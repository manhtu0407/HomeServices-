begin;

-- Detectors only file proposals. Each proposal has a dedupe key so a rerun never files the
-- same case twice, and each looks back a bounded window so turning the detector on does not
-- sweep up months of history nobody was warned about.
-- +84 912 345 678 and 0912345678 are the same subscriber.
create or replace function private.normalize_vn_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    when digits like '84%' and pg_catalog.length(digits) >= 11 then '0' || pg_catalog.substr(digits, 3)
    else digits
  end
  from (select pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits) as source;
$function$;

create or replace function private.detect_worker_violations()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.worker_discipline_policy%rowtype;
  v_row record;
  v_before integer;
  v_after integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('worker-violation-detectors', 0)) then
    return pg_catalog.jsonb_build_object('skipped', 'already_running');
  end if;
  select * into v_policy from public.worker_discipline_policy where id = 1;
  select count(*) into v_before from public.worker_violation_cases;

  for v_row in
    select job.id, job.worker_id, job.customer_id, job.scheduled_at, job.arrived_at
    from public.jobs as job
    where job.worker_id is not null
      and job.scheduled_at is not null
      and job.arrived_at > job.scheduled_at + pg_catalog.make_interval(mins => v_policy.late_arrival_grace_minutes)
      and job.arrived_at > pg_catalog.now() - interval '7 days'
  loop
    perform private.propose_violation_case(
      v_row.worker_id, v_row.customer_id, v_row.id, 'late_arrival', 'detector', null, null,
      pg_catalog.jsonb_build_object('scheduled_at', v_row.scheduled_at, 'arrived_at', v_row.arrived_at),
      'late:' || v_row.id
    );
  end loop;

  for v_row in
    select job.id, job.worker_id, job.customer_id, job.scheduled_at
    from public.jobs as job
    where job.worker_id is not null
      and job.status = 'worker_matched'::public.job_status
      and job.scheduled_at < pg_catalog.now() - pg_catalog.make_interval(mins => v_policy.no_show_grace_minutes)
      and job.scheduled_at > pg_catalog.now() - interval '7 days'
  loop
    perform private.propose_violation_case(
      v_row.worker_id, v_row.customer_id, v_row.id, 'no_show', 'detector', null, null,
      pg_catalog.jsonb_build_object('scheduled_at', v_row.scheduled_at),
      'noshow:' || v_row.id || ':' || v_row.worker_id
    );
  end loop;

  for v_row in
    select request.id, request.worker_id, request.job_id, request.reason_category, job.customer_id
    from public.worker_cancellation_requests as request
    join public.jobs as job on job.id = request.job_id
    where request.reason_category in ('no_reason', 'suspicious')
      and request.created_at > pg_catalog.now() - interval '7 days'
  loop
    perform private.propose_violation_case(
      v_row.worker_id, v_row.customer_id, v_row.job_id, 'cancel_after_accept_no_reason', 'detector', null, null,
      pg_catalog.jsonb_build_object('cancellation_request_id', v_row.id, 'reason_category', v_row.reason_category),
      'cancel:' || v_row.id
    );
  end loop;

  -- Off-app solicitation needs repeated retained chat evidence; one keyword is not a case.
  for v_row in
    select evidence.sender_id as worker_id,
      (pg_catalog.array_agg(evidence.id order by evidence.created_at desc))[1] as latest_evidence_id,
      (pg_catalog.array_agg(evidence.job_id order by evidence.created_at desc))[1] as job_id,
      pg_catalog.array_agg(evidence.id order by evidence.created_at desc) as evidence_ids
    from public.chat_guard_redaction_evidence as evidence
    where evidence.sender_role = 'worker'
      and evidence.created_at > pg_catalog.now() - pg_catalog.make_interval(days => v_policy.off_app_window_days)
      and exists (select 1 from public.worker_profiles where id = evidence.sender_id)
    group by evidence.sender_id
    having count(*) >= v_policy.off_app_evidence_threshold
  loop
    if not exists (
      select 1 from public.worker_violation_cases
      where worker_id = v_row.worker_id and violation_code = 'off_app_dealing' and status = 'proposed'
    ) then
      perform private.propose_violation_case(
        v_row.worker_id, (select customer_id from public.jobs where id = v_row.job_id), v_row.job_id,
        'off_app_dealing', 'detector', null, null,
        pg_catalog.jsonb_build_object('chat_evidence_ids', pg_catalog.to_jsonb(v_row.evidence_ids)),
        'offapp:' || v_row.latest_evidence_id
      );
    end if;
  end loop;

  for v_row in
    select job.id, job.worker_id, job.customer_id
    from public.jobs as job
    join public.profiles as customer on customer.id = job.customer_id
    join public.profiles as worker on worker.id = job.worker_id
    where job.paid_at > pg_catalog.now() - interval '7 days'
      and customer.phone is not null
      and private.normalize_vn_phone(customer.phone) = private.normalize_vn_phone(worker.phone)
  loop
    perform private.propose_violation_case(
      v_row.worker_id, v_row.customer_id, v_row.id, 'self_booking', 'detector', null, null,
      pg_catalog.jsonb_build_object('signal', 'customer_and_worker_share_phone'),
      'selfbook:' || v_row.id
    );
  end loop;

  select count(*) into v_after from public.worker_violation_cases;
  return pg_catalog.jsonb_build_object('proposed', v_after - v_before);
end;
$function$;

create or replace function public.list_matching_deprioritized_workers(p_worker_ids uuid[])
returns table (worker_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select distinct entry.worker_id
  from public.worker_discipline_entries as entry
  where entry.worker_id = any(coalesce(p_worker_ids, '{}'::uuid[]))
    and entry.entry_kind = 'matching_deprioritize'
    and entry.effective_until > pg_catalog.now()
    and not exists (
      select 1 from public.worker_discipline_entries as restore where restore.restores_entry_id = entry.id
    );
$function$;

revoke all on function private.detect_worker_violations() from public, anon, authenticated;
revoke all on function public.list_matching_deprioritized_workers(uuid[]) from public, anon, authenticated;
grant execute on function private.detect_worker_violations() to service_role;
grant execute on function public.list_matching_deprioritized_workers(uuid[]) to service_role;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'worker-violation-detectors') then
    perform cron.unschedule('worker-violation-detectors');
  end if;
end $$;

select cron.schedule(
  'worker-violation-detectors',
  '*/15 * * * *',
  $$select private.detect_worker_violations()$$
);

commit;
