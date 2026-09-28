begin;

-- A dispute suspension only set verification_status, while matching and payouts read
-- is_suspended, so a suspended worker kept receiving jobs. Every suspension path now sets the
-- same flags, carries an end date, and leaves an append-only trail.
alter table public.worker_profiles
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text
    check (suspension_reason is null or pg_catalog.char_length(suspension_reason) between 3 and 1000);

create table if not exists public.worker_suspension_events (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  action text not null check (action in ('suspend', 'reinstate', 'expire')),
  source text not null check (source in ('dispute', 'admin', 'system')),
  until_at timestamptz,
  reason text check (reason is null or pg_catalog.char_length(reason) between 3 and 1000),
  actor_id uuid references public.profiles(id) on delete restrict,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists worker_suspension_events_worker_idx
  on public.worker_suspension_events (worker_id, created_at desc);

alter table public.worker_suspension_events enable row level security;
revoke all on table public.worker_suspension_events from public, anon, authenticated;
grant select, insert on table public.worker_suspension_events to service_role;

create or replace function private.prevent_worker_suspension_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'WORKER_SUSPENSION_EVENT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger worker_suspension_events_immutable
before update or delete on public.worker_suspension_events
for each row execute function private.prevent_worker_suspension_event_mutation();

revoke all on function private.prevent_worker_suspension_event_mutation() from public, anon, authenticated;

-- The single write path for a suspension, so dispute, admin and case decisions cannot drift
-- apart again. p_until null means indefinite.
create or replace function private.apply_worker_suspension(
  p_worker_id uuid,
  p_source text,
  p_until timestamptz,
  p_reason text,
  p_actor_id uuid,
  p_reference_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.worker_profiles
  set verification_status = 'suspended'::public.worker_verification_status,
      is_approved = false,
      is_available = false,
      is_suspended = true,
      suspended_until = p_until,
      suspension_reason = p_reason
  where id = p_worker_id;

  if not found then
    raise exception 'WORKER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.worker_suspension_events (worker_id, action, source, until_at, reason, actor_id, reference_id)
  values (p_worker_id, 'suspend', p_source, p_until, p_reason, p_actor_id, p_reference_id);
end;
$function$;

create or replace function private.lift_worker_suspension(
  p_worker_id uuid,
  p_action text,
  p_source text,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.worker_profiles
  set verification_status = 'approved'::public.worker_verification_status,
      is_approved = true,
      is_available = false,
      is_suspended = false,
      suspended_until = null,
      suspension_reason = null
  where id = p_worker_id;

  insert into public.worker_suspension_events (worker_id, action, source, reason, actor_id)
  values (p_worker_id, p_action, p_source, p_reason, p_actor_id);
end;
$function$;

revoke all on function private.apply_worker_suspension(uuid, text, timestamptz, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.lift_worker_suspension(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function private.apply_worker_suspension(uuid, text, timestamptz, text, uuid, uuid) to service_role;
grant execute on function private.lift_worker_suspension(uuid, text, text, text, uuid) to service_role;

create or replace function public.admin_decide_dispute_atomic(
  p_dispute_id uuid,
  p_admin_id uuid,
  p_outcome text,
  p_refund_amount int default null,
  p_worker_credit_amount int default null,
  p_customer_trust_impact text default 'none',
  p_worker_action text default 'none',
  p_reasoning text default ''
) returns table (
  ok boolean,
  error_code text,
  dispute_id uuid,
  dispute_status text,
  decided_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_dispute public.disputes%rowtype;
  v_now timestamptz := now();
  v_worker_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    return query select false, 'AUTH_FORBIDDEN'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if p_outcome not in (
    'customer_favor_full',
    'customer_favor_partial',
    'worker_favor',
    'no_fault_both',
    'mutual_warning'
  ) then
    return query select false, 'INVALID_DECISION'::text, p_dispute_id, null::text, null::timestamptz;
    return;
  end if;

  if p_customer_trust_impact not in ('none', 'minor_down', 'major_down', 'positive_resolved')
    or p_worker_action not in ('none', 'warning', 'temp_suspend_7d', 'temp_suspend_30d', 'permanent_suspend')
    or char_length(btrim(p_reasoning)) < 50
    or coalesce(p_refund_amount, 0) < 0
    or coalesce(p_worker_credit_amount, 0) < 0 then
    return query select false, 'INVALID_DECISION'::text, p_dispute_id, null::text, null::timestamptz;
    return;
  end if;

  select *
    into v_dispute
    from public.disputes
   where id = p_dispute_id
   for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_dispute.status = 'admin_decided' then
    return query select false, 'ALREADY_DECIDED'::text, p_dispute_id, v_dispute.status, null::timestamptz;
    return;
  end if;

  if v_dispute.status not in ('open', 'awaiting_counter_party', 'admin_review') then
    return query select false, 'INVALID_STATUS'::text, p_dispute_id, v_dispute.status, null::timestamptz;
    return;
  end if;

  select worker_id into v_worker_id
    from public.jobs
   where id = v_dispute.job_id;

  update public.disputes
     set admin_decision = jsonb_strip_nulls(jsonb_build_object(
           'outcome', p_outcome,
           'refund_amount', p_refund_amount,
           'worker_credit_amount', p_worker_credit_amount,
           'customer_trust_impact', p_customer_trust_impact,
           'worker_action', p_worker_action,
           'reasoning', btrim(p_reasoning),
           'admin_id', p_admin_id
         )),
         admin_decision_at = v_now,
         admin_decision_by = p_admin_id,
         admin_review = coalesce(admin_review, '{}'::jsonb) ||
           jsonb_build_object('reviewed_at', v_now, 'assigned_admin_id', p_admin_id),
         status = 'admin_decided',
         updated_at = v_now
   where id = p_dispute_id;

  if p_worker_action in ('temp_suspend_7d', 'temp_suspend_30d', 'permanent_suspend')
    and v_worker_id is not null then
    perform private.apply_worker_suspension(
      v_worker_id,
      'dispute',
      case p_worker_action
        when 'temp_suspend_7d' then v_now + interval '7 days'
        when 'temp_suspend_30d' then v_now + interval '30 days'
        else null
      end,
      left(btrim(p_reasoning), 1000),
      p_admin_id,
      p_dispute_id
    );
  end if;

  update public.kael_admin_queue
     set status = 'resolved',
         updated_at = v_now,
         safe_metadata = safe_metadata ||
           jsonb_build_object('admin_decision_at', v_now, 'outcome', p_outcome)
   where job_id = v_dispute.job_id
     and queue_type = 'dispute_review'
     and status = 'open';

  return query select true, null::text, p_dispute_id, 'admin_decided'::text, v_now;
end;
$func$;

create or replace function public.admin_set_worker_access_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_action text,
  p_reason text
)
returns table(
  ok boolean,
  error_code text,
  worker_id uuid,
  verification_status_out public.worker_verification_status,
  is_suspended_out boolean,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role public.user_role;
  v_worker public.worker_profiles%rowtype;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select role into v_actor_role
  from public.profiles
  where id = p_actor_id;

  if v_actor_role <> 'admin'::public.user_role
     and not (
       v_actor_role = 'admin_operator'::public.user_role
       and exists (
         select 1
         from public.admin_operator_accounts
         where user_id = p_actor_id
           and status = 'active'
           and 'workers.manage' = any(capabilities)
       )
     ) then
    return query select false, 'WORKER_MANAGE_REQUIRED'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  if v_action not in ('suspend', 'reinstate') or pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 1000 then
    return query select false, 'INVALID_INPUT'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  select worker_row.*
  into v_worker
  from public.worker_profiles as worker_row
  where worker_row.id = p_worker_id
  for update;

  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, p_worker_id, null::public.worker_verification_status, null::boolean, null::timestamptz;
    return;
  end if;

  if v_action = 'suspend' then
    if v_worker.is_suspended then
      return query select true, null::text, p_worker_id, v_worker.verification_status, true, v_now;
      return;
    end if;
    if v_worker.verification_status <> 'approved'::public.worker_verification_status or v_worker.is_approved is not true then
      return query select false, 'WORKER_NOT_APPROVED'::text, p_worker_id, v_worker.verification_status, v_worker.is_suspended, null::timestamptz;
      return;
    end if;

    perform private.apply_worker_suspension(p_worker_id, 'admin', null, v_reason, p_actor_id, null);
  else
    if not v_worker.is_suspended then
      return query select true, null::text, p_worker_id, v_worker.verification_status, false, v_now;
      return;
    end if;

    -- A confirmed discipline ban, or an open harm case suspended pending review, is lifted only
    -- through the discipline flow; a general reinstate must not route around that decision.
    if exists (select 1 from private.worker_discipline_state(p_worker_id) as state where state.banned)
       or exists (
         select 1 from public.worker_violation_cases as open_case
         where open_case.worker_id = p_worker_id and open_case.status = 'proposed'
           and open_case.suspended_pending_review
       ) then
      return query select false, 'DISCIPLINE_HOLD_ACTIVE'::text, p_worker_id, v_worker.verification_status, true, null::timestamptz;
      return;
    end if;

    perform private.lift_worker_suspension(p_worker_id, 'reinstate', 'admin', v_reason, p_actor_id);
  end if;

  select worker_row.* into v_worker from public.worker_profiles as worker_row where worker_row.id = p_worker_id;

  insert into public.kael_permission_audit (
    actor_id,
    actor_role,
    purpose,
    action,
    topic,
    decision,
    reason_code,
    safe_metadata
  ) values (
    p_actor_id,
    v_actor_role::text,
    'admin_worker_access',
    v_action,
    'worker_access',
    case when v_action = 'suspend' then 'deny' else 'allow' end,
    'worker_' || v_action,
    jsonb_build_object('worker_id', p_worker_id, 'reason_provided', true)
  );

  return query select true, null::text, p_worker_id, v_worker.verification_status, v_worker.is_suspended, v_now;
end;
$function$;

revoke execute on function public.admin_set_worker_access_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_worker_access_atomic(uuid, uuid, text, text) to service_role;

-- A timed suspension ends by itself; lifting is the only automatic direction, so the job
-- can never punish anyone.
create or replace function private.expire_worker_suspensions()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker_id uuid;
  v_count integer := 0;
begin
  for v_worker_id in
    select id from public.worker_profiles
    where is_suspended and suspended_until is not null and suspended_until <= pg_catalog.now()
    for update skip locked
  loop
    perform private.lift_worker_suspension(v_worker_id, 'expire', 'system', null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.expire_worker_suspensions() from public, anon, authenticated;
grant execute on function private.expire_worker_suspensions() to service_role;

-- Repair workers the old dispute path left half-suspended. Only a still-running suspension
-- (permanent, or a timed one that has not ended) is enforced; anything else is reported for
-- an admin rather than guessed.
do $backfill$
declare
  v_row record;
  v_until timestamptz;
  v_repaired integer := 0;
  v_unresolved integer := 0;
begin
  for v_row in
    select worker.id as worker_id, decision.admin_decision_at, decision.worker_action, decision.dispute_id,
           decision.reasoning, decision.admin_id
    from public.worker_profiles as worker
    left join lateral (
      select dispute.admin_decision_at,
             dispute.admin_decision->>'worker_action' as worker_action,
             dispute.id as dispute_id,
             dispute.admin_decision->>'reasoning' as reasoning,
             dispute.admin_decision_by as admin_id
      from public.disputes as dispute
      join public.jobs as job on job.id = dispute.job_id
      where job.worker_id = worker.id
        and dispute.admin_decision->>'worker_action' in ('temp_suspend_7d', 'temp_suspend_30d', 'permanent_suspend')
      order by dispute.admin_decision_at desc
      limit 1
    ) as decision on true
    where worker.verification_status = 'suspended'::public.worker_verification_status
      and worker.is_suspended = false
  loop
    if v_row.worker_action is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    v_until := case v_row.worker_action
      when 'temp_suspend_7d' then v_row.admin_decision_at + interval '7 days'
      when 'temp_suspend_30d' then v_row.admin_decision_at + interval '30 days'
      else null
    end;
    if v_until is not null and v_until <= now() then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    perform private.apply_worker_suspension(
      v_row.worker_id, 'dispute', v_until,
      left(coalesce(nullif(btrim(v_row.reasoning), ''), 'Backfilled dispute suspension'), 1000),
      v_row.admin_id, v_row.dispute_id
    );
    v_repaired := v_repaired + 1;
  end loop;
  raise notice 'worker suspension backfill: % repaired, % left for admin review', v_repaired, v_unresolved;
end;
$backfill$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-worker-suspensions') then
    perform cron.unschedule('expire-worker-suspensions');
  end if;
end $$;

select cron.schedule(
  'expire-worker-suspensions',
  '*/10 * * * *',
  $$select private.expire_worker_suspensions()$$
);

commit;
