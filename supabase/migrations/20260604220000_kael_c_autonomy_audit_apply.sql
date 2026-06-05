-- Track C (Plan.md §31.6): autonomy decision audit/replay + service-role apply gate.

begin;

create table if not exists public.kael_autonomy_decision_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'worker', 'admin', 'system')),
  decision_source text not null check (decision_source in ('policy', 'llm_proposed')),
  decision jsonb check (decision is null or jsonb_typeof(decision) = 'object'),
  from_status public.job_status not null,
  to_status public.job_status not null,
  gate_result text not null check (gate_result in ('allow', 'reject', 'escalate')),
  reason_code text not null check (char_length(reason_code) between 3 and 160),
  evidence_refs text[] not null default '{}',
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  resulting_event text check (resulting_event is null or char_length(resulting_event) between 3 and 160),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_autonomy_decision_audit_job_idx
  on public.kael_autonomy_decision_audit (job_id, created_at desc);
create index if not exists kael_autonomy_decision_audit_result_idx
  on public.kael_autonomy_decision_audit (gate_result, created_at desc);
create index if not exists kael_autonomy_decision_audit_event_idx
  on public.kael_autonomy_decision_audit (resulting_event, created_at desc);

alter table public.kael_autonomy_decision_audit enable row level security;

drop policy if exists "Admins view kael autonomy decision audit"
  on public.kael_autonomy_decision_audit;
create policy "Admins view kael autonomy decision audit"
  on public.kael_autonomy_decision_audit
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_autonomy_decision_audit from public;
revoke all on public.kael_autonomy_decision_audit from anon;
revoke all on public.kael_autonomy_decision_audit from authenticated;
grant select on public.kael_autonomy_decision_audit to authenticated;
grant all on public.kael_autonomy_decision_audit to service_role;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in (
    'demanding_customer',
    'worker_cancellation_review',
    'worker_no_show',
    'customer_cancellation_review',
    'dispute_review',
    'autonomy_escalation'
  ));

create or replace function public.apply_kael_autonomy_decision(
  p_job_id uuid,
  p_gate_audit_id uuid,
  p_expected_from public.job_status,
  p_to_status public.job_status
)
returns table (
  ok boolean,
  error text,
  job_id uuid,
  from_status public.job_status,
  to_status public.job_status,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $func$
declare
  v_audit public.kael_autonomy_decision_audit%rowtype;
  v_job public.jobs%rowtype;
  v_event text;
  v_now timestamptz := now();
begin
  select *
    into v_audit
    from public.kael_autonomy_decision_audit
   where id = p_gate_audit_id
   limit 1;

  if not found then
    return query select false, 'audit_not_found'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  if v_audit.gate_result <> 'allow' then
    return query select false, 'gate_not_allow'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  if v_audit.job_id is distinct from p_job_id
     or v_audit.from_status <> p_expected_from
     or v_audit.to_status <> p_to_status then
    return query select false, 'audit_context_mismatch'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  if coalesce(v_audit.decision->>'actor', '') <> 'kael_system' then
    return query select false, 'decision_actor_invalid'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  v_event := nullif(v_audit.decision->>'resulting_event', '');
  if v_event is null or v_event <> v_audit.resulting_event then
    return query select false, 'decision_event_mismatch'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  update public.jobs
     set status = p_to_status,
         broadcast_at = case when p_to_status = 'broadcasting' then coalesce(broadcast_at, v_now) else broadcast_at end,
         matched_at = case when p_to_status = 'worker_matched' then coalesce(matched_at, v_now) else matched_at end,
         completed_at = case when p_to_status = 'completed_by_worker' then coalesce(completed_at, v_now) else completed_at end,
         confirmed_at = case when p_to_status = 'confirmed_by_customer' then coalesce(confirmed_at, v_now) else confirmed_at end,
         paid_at = case when p_to_status = 'paid' then coalesce(paid_at, v_now) else paid_at end,
         cancelled_at = case when p_to_status = 'cancelled' then coalesce(cancelled_at, v_now) else cancelled_at end,
         reviewed_at = case when p_to_status = 'reviewed' then coalesce(reviewed_at, v_now) else reviewed_at end,
         updated_at = v_now
   where id = p_job_id
     and status = p_expected_from
   returning * into v_job;

  if not found then
    return query select false, 'status_changed'::text, p_job_id, p_expected_from, p_to_status, null::timestamptz;
    return;
  end if;

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    p_job_id,
    v_audit.actor_id,
    case when v_audit.actor_role in ('customer', 'worker', 'admin')
      then v_audit.actor_role::public.user_role
      else null
    end,
    v_event,
    p_expected_from,
    p_to_status,
    jsonb_build_object(
      'kael_autonomy_audit_id', p_gate_audit_id,
      'policy_id', v_audit.decision->>'policy_id',
      'gate_result', v_audit.gate_result,
      'reason_code', v_audit.reason_code
    )
  );

  return query select true, null::text, p_job_id, p_expected_from, p_to_status, v_now;
end;
$func$;

revoke execute on function public.apply_kael_autonomy_decision(uuid, uuid, public.job_status, public.job_status)
  from public;
revoke execute on function public.apply_kael_autonomy_decision(uuid, uuid, public.job_status, public.job_status)
  from anon;
revoke execute on function public.apply_kael_autonomy_decision(uuid, uuid, public.job_status, public.job_status)
  from authenticated;
grant execute on function public.apply_kael_autonomy_decision(uuid, uuid, public.job_status, public.job_status)
  to service_role;

comment on table public.kael_autonomy_decision_audit is
  'Track C autonomy gate audit/replay log. Service role writes; admins read.';
comment on function public.apply_kael_autonomy_decision(uuid, uuid, public.job_status, public.job_status) is
  'Applies only an allow-gated Kael autonomy decision audit row through an atomic status check.';

commit;
