begin;

-- While the worker is repairing, the customer can ask Kael to remind the worker to report the job
-- done. It is a reminder only: the job status never moves from here, and the worker alone reports
-- completion with the evidence the customer then reviews. Each nudge is one job_events row, so the
-- audit trail and the rate window read from the same place and no table is added.
--
-- The limits live in this one function and the job read returns its answer, so the app never holds a
-- second copy of them: at least 10 minutes of real work (pauses excluded) before the first nudge, 15
-- minutes between nudges, at most 3 per job, never while the worker has the work paused.

create or replace function public.completion_nudge_state(p_job_id uuid)
returns table (
  can_nudge boolean,
  reason text,
  used integer,
  max_allowed integer,
  last_nudged_at timestamptz,
  next_available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  c_min_work constant interval := interval '10 minutes';
  c_cooldown constant interval := interval '15 minutes';
  c_max constant integer := 3;
  v_job record;
  v_used integer;
  v_last timestamptz;
  v_earliest timestamptz;
begin
  max_allowed := c_max;
  select job.status, job.work_started_at, job.work_paused_at, job.work_paused_ms
    into v_job
    from public.jobs as job
    where job.id = p_job_id;
  if not found then
    can_nudge := false; reason := 'JOB_NOT_FOUND'; used := 0; last_nudged_at := null; next_available_at := null;
    return next;
    return;
  end if;

  select pg_catalog.count(*)::integer, pg_catalog.max(event.created_at)
    into v_used, v_last
    from public.job_events as event
    where event.job_id = p_job_id and event.event_type = 'customer_completion_nudge';
  used := v_used;
  last_nudged_at := v_last;
  next_available_at := null;

  if v_job.status is distinct from 'repairing'::public.job_status then
    can_nudge := false; reason := 'INVALID_STATUS';
  elsif v_job.work_paused_at is not null then
    can_nudge := false; reason := 'WORK_PAUSED';
  elsif v_used >= c_max then
    can_nudge := false; reason := 'LIMIT_REACHED';
  else
    v_earliest := case
      when v_job.work_started_at is null then null
      else v_job.work_started_at + pg_catalog.make_interval(secs => coalesce(v_job.work_paused_ms, 0) / 1000.0) + c_min_work
    end;
    if v_earliest is null or pg_catalog.now() < v_earliest then
      can_nudge := false; reason := 'TOO_EARLY'; next_available_at := v_earliest;
    elsif v_last is not null and pg_catalog.now() < v_last + c_cooldown then
      can_nudge := false; reason := 'COOLDOWN'; next_available_at := v_last + c_cooldown;
    else
      can_nudge := true; reason := null;
    end if;
  end if;
  return next;
end;
$function$;

revoke all on function public.completion_nudge_state(uuid) from public, anon, authenticated;
grant execute on function public.completion_nudge_state(uuid) to service_role;

-- One transaction under the job lock: the state is read, and when it allows a nudge the audit row,
-- the Kael line both sides see in the job chat and the worker's inbox entry are written together.
-- The caller sends the push afterwards. A refusal is returned, not raised, so the app can say why.
create or replace function public.nudge_worker_completion_atomic(p_job_id uuid, p_customer_id uuid)
returns table (
  ok boolean,
  reason text,
  used integer,
  max_allowed integer,
  last_nudged_at timestamptz,
  next_available_at timestamptz,
  worker_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  c_cooldown constant interval := interval '15 minutes';
  v_job record;
  v_state record;
  v_now timestamptz := pg_catalog.now();
begin
  select job.id, job.customer_id, job.worker_id
    into v_job
    from public.jobs as job
    where job.id = p_job_id
    for update of job;
  if not found or v_job.customer_id is distinct from p_customer_id then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_state from public.completion_nudge_state(p_job_id);
  ok := false;
  reason := v_state.reason;
  used := v_state.used;
  max_allowed := v_state.max_allowed;
  last_nudged_at := v_state.last_nudged_at;
  next_available_at := v_state.next_available_at;
  worker_id := v_job.worker_id;

  if v_job.worker_id is null then
    reason := 'NO_WORKER';
    return next;
    return;
  end if;
  if not v_state.can_nudge then
    return next;
    return;
  end if;

  insert into public.job_events (job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
  values (
    p_job_id, p_customer_id, 'customer', 'customer_completion_nudge',
    'repairing', 'repairing',
    pg_catalog.jsonb_build_object('sequence', v_state.used + 1)
  );
  insert into public.chat_messages (job_id, sender_id, sender_role, content)
  values (p_job_id, null, 'kael', 'Kael đã nhắc thợ báo hoàn tất công việc.');
  perform public.insert_notification_atomic(
    v_job.worker_id, p_job_id, 'customer_completion_nudge',
    'Khách đang chờ bạn báo hoàn tất',
    'Nếu đã làm xong, hãy báo hoàn tất kèm ảnh để khách kiểm tra. Nếu chưa xong, bạn cứ tiếp tục làm.',
    pg_catalog.jsonb_build_object('sequence', v_state.used + 1)
  );

  ok := true;
  reason := null;
  used := v_state.used + 1;
  last_nudged_at := v_now;
  next_available_at := case when v_state.used + 1 >= v_state.max_allowed then null else v_now + c_cooldown end;
  return next;
end;
$function$;

revoke all on function public.nudge_worker_completion_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nudge_worker_completion_atomic(uuid, uuid) to service_role;

commit;
