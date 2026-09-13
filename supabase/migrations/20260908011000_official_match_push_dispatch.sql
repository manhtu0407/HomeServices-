begin;

alter table public.notifications
  add column if not exists push_state text not null default 'not_requested'
    check (push_state in ('not_requested','queued','processing','submitted','unreachable','recovery_required','stopped')),
  add column if not exists push_attempt_count integer not null default 0 check (push_attempt_count between 0 and 8),
  add column if not exists push_next_attempt_at timestamptz,
  add column if not exists push_expires_at timestamptz,
  add column if not exists push_lease_token uuid,
  add column if not exists push_leased_by text,
  add column if not exists push_lease_expires_at timestamptz,
  add column if not exists push_submitted_count integer not null default 0 check (push_submitted_count >= 0),
  add column if not exists push_submitted_at timestamptz,
  add column if not exists push_last_error_code text;

create index if not exists notifications_official_push_pending
  on public.notifications (push_next_attempt_at, id)
  where push_state in ('queued','processing');

create or replace function private.enqueue_official_match_push()
returns trigger language plpgsql security definer set search_path='' as $func$
begin
  if new.event_type not in ('worker_matched','customer_confirmed_worker') then return new; end if;
  if not exists(select 1 from public.jobs job
    join public.job_worker_candidates candidate on candidate.job_id=job.id and candidate.worker_id=job.worker_id
    where job.id=new.job_id and job.status='worker_matched' and candidate.status='customer_confirmed'
      and candidate.id::text=new.safe_metadata->>'candidate_id'
      and ((new.event_type='worker_matched' and new.user_id=job.customer_id)
        or (new.event_type='customer_confirmed_worker' and new.user_id=job.worker_id))) then
    raise exception using errcode='22023',message='OFFICIAL_MATCH_PUSH_NOT_AUTHORIZED';
  end if;
  new.push_state:='queued';
  new.push_attempt_count:=0;
  new.push_next_attempt_at:=clock_timestamp();
  new.push_expires_at:=clock_timestamp()+interval '5 minutes';
  new.push_lease_token:=null; new.push_leased_by:=null; new.push_lease_expires_at:=null;
  new.push_submitted_count:=0; new.push_submitted_at:=null; new.push_last_error_code:=null;
  return new;
end;
$func$;
revoke all on function private.enqueue_official_match_push() from public,anon,authenticated,service_role;
do $trigger$
begin
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.notifications'::regclass
    and tgname='notifications_enqueue_official_match_push' and not tgisinternal) then
    create trigger notifications_enqueue_official_match_push before insert on public.notifications
      for each row execute function private.enqueue_official_match_push();
  end if;
end;
$trigger$;

create or replace function private.official_match_push_release_allows(
  p_job_id uuid,p_environment text,p_release_id text,p_deployment_id text
) returns boolean language sql stable security definer set search_path='' as $func$
  select exists(select 1 from public.jobs job
    join public.stage1_release_controls control on control.environment=p_environment
    join public.stage1_source_deployment_attestations attestation
      on attestation.environment=control.environment and attestation.release_id=p_release_id
      and attestation.function_name='kael-matching-maintainer' and attestation.deployment_id=p_deployment_id
    where job.id=p_job_id and (
      control.active_release_id=p_release_id or
      (control.candidate_release_id=p_release_id and job.synthetic_cohort_id=control.candidate_cohort_id)));
$func$;
revoke all on function private.official_match_push_release_allows(uuid,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.claim_official_match_push(
  p_dispatcher_id text,p_environment text,p_release_id text,p_deployment_id text,p_limit integer default 1
) returns table(notification_id uuid,job_id uuid,user_id uuid,candidate_id uuid,event_type text,lease_token uuid)
language plpgsql security definer set search_path='' as $func$
declare v_notice public.notifications%rowtype; v_now timestamptz; v_valid boolean;
begin
  if p_dispatcher_id is null or length(p_dispatcher_id) not between 1 and 160
    or p_environment is null or p_environment not in ('staging','production')
    or p_release_id is null or p_release_id !~ '^harness-[0-9a-f]{12}-[0-9a-f]{12}$'
    or p_deployment_id is null or length(p_deployment_id) not between 30 and 160
    or p_limit is null or p_limit not between 1 and 10 then
    raise exception using errcode='22023',message='OFFICIAL_MATCH_PUSH_INPUT_INVALID';
  end if;
  for v_notice in
    select notice.* from public.notifications notice
      where notice.push_state in ('queued','processing')
        and notice.event_type in ('worker_matched','customer_confirmed_worker')
        and (notice.push_state='queued' and notice.push_next_attempt_at<=clock_timestamp()
          or notice.push_state='processing' and notice.push_lease_expires_at<=clock_timestamp())
        and private.official_match_push_release_allows(notice.job_id,p_environment,p_release_id,p_deployment_id)
      order by notice.push_next_attempt_at,notice.id limit p_limit for update of notice skip locked
  loop
    v_now:=clock_timestamp();
    select exists(select 1 from public.jobs job
      join public.job_worker_candidates candidate on candidate.job_id=job.id and candidate.worker_id=job.worker_id
      where job.id=v_notice.job_id and job.status='worker_matched'
        and candidate.id::text=v_notice.safe_metadata->>'candidate_id' and candidate.status='customer_confirmed'
        and ((v_notice.event_type='worker_matched' and v_notice.user_id=job.customer_id)
          or (v_notice.event_type='customer_confirmed_worker' and v_notice.user_id=job.worker_id))
        and (job.synthetic_cohort_id is null
          and not exists(select 1 from public.synthetic_matching_cohort_members member where member.profile_id=v_notice.user_id)
          or job.synthetic_cohort_id is not null and exists(select 1 from public.synthetic_matching_cohort_members member
            where member.profile_id=v_notice.user_id and member.cohort_id=job.synthetic_cohort_id))) into v_valid;
    if not v_valid or v_notice.push_expires_at is null or v_notice.push_expires_at<=v_now or v_notice.push_attempt_count>=8 then
      update public.notifications notice set
        push_state=case when v_notice.push_state='processing' then 'recovery_required' else 'stopped' end,
        push_last_error_code=case when not v_valid then 'MATCH_NO_LONGER_CURRENT' else 'PUSH_WINDOW_EXHAUSTED' end,
        push_lease_token=null,push_leased_by=null,push_lease_expires_at=null where notice.id=v_notice.id;
      continue;
    end if;
    notification_id:=v_notice.id; job_id:=v_notice.job_id; user_id:=v_notice.user_id;
    candidate_id:=(v_notice.safe_metadata->>'candidate_id')::uuid; event_type:=v_notice.event_type;
    lease_token:=gen_random_uuid();
    update public.notifications notice set push_state='processing',push_attempt_count=push_attempt_count+1,
      push_lease_token=lease_token,push_leased_by=p_dispatcher_id,push_lease_expires_at=v_now+interval '120 seconds'
      where notice.id=v_notice.id;
    return next;
  end loop;
end;
$func$;
revoke execute on function public.claim_official_match_push(text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.claim_official_match_push(text,text,text,text,integer) to service_role;

create or replace function public.begin_official_match_push(
  p_notification_id uuid,p_lease_token uuid,p_dispatcher_id text,
  p_environment text,p_release_id text,p_deployment_id text
) returns boolean language plpgsql security definer set search_path='' as $func$
declare v_notice public.notifications%rowtype;
begin
  select * into v_notice from public.notifications where id=p_notification_id for update;
  if not found or v_notice.push_state<>'processing' or p_lease_token is null
    or v_notice.push_lease_token is distinct from p_lease_token
    or v_notice.push_leased_by is distinct from p_dispatcher_id
    or v_notice.push_lease_expires_at<=clock_timestamp() then return false; end if;
  if v_notice.push_expires_at<=clock_timestamp()
    or not private.official_match_push_release_allows(v_notice.job_id,p_environment,p_release_id,p_deployment_id)
    or not exists(select 1 from public.jobs job join public.job_worker_candidates candidate
      on candidate.job_id=job.id and candidate.worker_id=job.worker_id
      where job.id=v_notice.job_id and job.status='worker_matched' and candidate.status='customer_confirmed'
        and candidate.id::text=v_notice.safe_metadata->>'candidate_id'
        and ((v_notice.event_type='worker_matched' and v_notice.user_id=job.customer_id)
          or (v_notice.event_type='customer_confirmed_worker' and v_notice.user_id=job.worker_id))) then
    update public.notifications set push_state='stopped',push_last_error_code='MATCH_OR_RELEASE_CHANGED',
      push_lease_token=null,push_leased_by=null,push_lease_expires_at=null where id=v_notice.id;
    return false;
  end if;
  return true;
end;
$func$;
revoke execute on function public.begin_official_match_push(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_official_match_push(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.finish_official_match_push(
  p_notification_id uuid,p_lease_token uuid,p_dispatcher_id text,
  p_outcome text,p_submitted_count integer,p_error_code text default null
) returns boolean language plpgsql security definer set search_path='' as $func$
declare v_notice public.notifications%rowtype; v_state text;
begin
  if p_outcome is null or p_outcome not in ('submitted','unreachable','recovery_required','retry')
    or p_submitted_count is null or p_submitted_count<0
    or (p_outcome='submitted') is distinct from (p_submitted_count>0)
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$')
    or (p_outcome='retry' and coalesce(p_error_code,'') not in
      ('PUSH_CIRCUIT_OPEN','RATE_LIMITED','TOKEN_LOOKUP_FAILED','IDEMPOTENCY_UNAVAILABLE','IDEMPOTENCY_START_FAILED')) then
    raise exception using errcode='22023',message='OFFICIAL_MATCH_PUSH_RECEIPT_INVALID';
  end if;
  select * into v_notice from public.notifications where id=p_notification_id for update;
  if not found or v_notice.push_state<>'processing' or p_lease_token is null
    or v_notice.push_lease_token is distinct from p_lease_token
    or v_notice.push_leased_by is distinct from p_dispatcher_id
    or v_notice.push_lease_expires_at<=clock_timestamp() then return false; end if;
  v_state:=case when p_outcome='retry' then
    case when v_notice.push_attempt_count<8 and v_notice.push_expires_at>clock_timestamp()+interval '15 seconds'
      then 'queued' else 'recovery_required' end else p_outcome end;
  update public.notifications set push_state=v_state,push_last_error_code=p_error_code,
    push_submitted_count=p_submitted_count,
    push_submitted_at=case when p_outcome='submitted' then clock_timestamp() else null end,
    push_next_attempt_at=case when v_state='queued' then clock_timestamp()+interval '15 seconds' else null end,
    push_lease_token=null,push_leased_by=null,push_lease_expires_at=null
    where id=v_notice.id;
  return true;
end;
$func$;
revoke execute on function public.finish_official_match_push(uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.finish_official_match_push(uuid,uuid,text,text,integer,text) to service_role;

commit;
