-- P13 Kael Agentic Case 5: neutral dispute flow, evidence lock, admin decision.

begin;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in (
    'demanding_customer',
    'worker_cancellation_review',
    'worker_no_show',
    'customer_cancellation_review',
    'dispute_review'
  ));

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_priority_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_priority_check
  check (priority in ('low', 'medium', 'high', 'critical'));

create table if not exists public.evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  evidence_locked_at timestamptz not null default now(),
  evidence_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists evidence_snapshots_job_locked_idx
  on public.evidence_snapshots (job_id, evidence_locked_at desc);

create or replace function public.prevent_evidence_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $func$
begin
  raise exception 'evidence_snapshots are immutable once locked';
end;
$func$;

drop trigger if exists evidence_snapshots_immutable on public.evidence_snapshots;
create trigger evidence_snapshots_immutable
  before update or delete on public.evidence_snapshots
  for each row execute function public.prevent_evidence_snapshot_mutation();

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  dispute_type text not null check (dispute_type in (
    'completion_rejected',
    'damage_claim',
    'unpaid_service',
    'abusive_behavior_customer',
    'abusive_behavior_worker',
    'scope_disagreement_post_job',
    'other'
  )),
  initiated_by text not null check (initiated_by in ('customer', 'worker', 'admin')),
  initiated_by_id uuid not null references public.profiles(id) on delete restrict,
  counter_party_id uuid references public.profiles(id) on delete set null,
  initiator_statement text not null check (char_length(initiator_statement) between 10 and 2000),
  counter_party_statement text check (
    counter_party_statement is null or char_length(counter_party_statement) between 10 and 2000
  ),
  counter_party_response_deadline timestamptz not null,
  evidence_locked_at timestamptz not null,
  evidence_snapshot_id uuid not null references public.evidence_snapshots(id) on delete restrict,
  kael_neutral_summary text not null check (char_length(kael_neutral_summary) between 10 and 1000),
  admin_review jsonb not null default '{}'::jsonb
    check (jsonb_typeof(admin_review) = 'object'),
  admin_decision jsonb check (
    admin_decision is null or (
      jsonb_typeof(admin_decision) = 'object'
      and (admin_decision ? 'outcome')
      and (admin_decision ? 'customer_trust_impact')
      and (admin_decision ? 'worker_action')
      and (admin_decision ? 'reasoning')
      and (
        not (admin_decision ? 'refund_amount')
        or jsonb_typeof(admin_decision -> 'refund_amount') = 'number'
      )
      and (
        not (admin_decision ? 'worker_credit_amount')
        or jsonb_typeof(admin_decision -> 'worker_credit_amount') = 'number'
      )
    )
  ),
  admin_decision_at timestamptz,
  admin_decision_by uuid references public.profiles(id) on delete set null,
  abuse_signals text[] not null default '{}'::text[],
  status text not null default 'open' check (status in (
    'open',
    'awaiting_counter_party',
    'admin_review',
    'admin_decided',
    'communicated',
    'resolved',
    'appealed'
  )),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists disputes_job_status_idx
  on public.disputes (job_id, status, created_at desc);
create index if not exists disputes_initiated_by_idx
  on public.disputes (initiated_by_id, created_at desc);
create index if not exists disputes_counter_party_idx
  on public.disputes (counter_party_id, created_at desc);
create unique index if not exists disputes_one_active_per_job_idx
  on public.disputes (job_id)
  where status in ('open', 'awaiting_counter_party', 'admin_review');

drop trigger if exists disputes_updated_at on public.disputes;
create trigger disputes_updated_at
  before update on public.disputes
  for each row execute function public.update_updated_at();

alter table public.evidence_snapshots enable row level security;
alter table public.disputes enable row level security;

drop policy if exists "Participants read dispute evidence snapshots"
  on public.evidence_snapshots;
create policy "Participants read dispute evidence snapshots"
  on public.evidence_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = evidence_snapshots.job_id
        and (
          j.customer_id = (select auth.uid())
          or j.worker_id = (select auth.uid())
        )
    )
    or (select private.is_admin())
  );

drop policy if exists "Participants read disputes" on public.disputes;
create policy "Participants read disputes"
  on public.disputes
  for select
  to authenticated
  using (
    initiated_by_id = (select auth.uid())
    or counter_party_id = (select auth.uid())
    or exists (
      select 1
      from public.jobs j
      where j.id = disputes.job_id
        and (
          j.customer_id = (select auth.uid())
          or j.worker_id = (select auth.uid())
        )
    )
    or (select private.is_admin())
  );

revoke all on public.evidence_snapshots from public;
revoke all on public.evidence_snapshots from anon;
revoke all on public.evidence_snapshots from authenticated;
grant select on public.evidence_snapshots to authenticated;
grant all on public.evidence_snapshots to service_role;

revoke all on public.disputes from public;
revoke all on public.disputes from anon;
revoke all on public.disputes from authenticated;
grant select on public.disputes to authenticated;
grant all on public.disputes to service_role;

drop function if exists public.open_dispute_atomic(uuid, uuid, text, text, text, text[], text);
create function public.open_dispute_atomic(
  p_job_id uuid,
  p_initiated_by_id uuid,
  p_initiated_by text,
  p_dispute_type text,
  p_initiator_statement text,
  p_evidence_photo_urls text[] default '{}'::text[],
  p_kael_neutral_summary text default null
) returns table (
  ok boolean,
  error_code text,
  dispute_id uuid,
  evidence_snapshot_id uuid,
  dispute_status text,
  admin_review_required boolean,
  priority text,
  evidence_locked_at timestamptz,
  created_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
  v_counter_party_id uuid;
  v_priority text := 'medium';
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_dispute_id uuid;
  v_abuse_signals text[] := '{}'::text[];
  v_customer_disputes int := 0;
  v_customer_completed int := 0;
  v_worker_disputes int := 0;
  v_worker_completed int := 0;
  v_same_party_disputes int := 0;
  v_summary text := coalesce(nullif(btrim(p_kael_neutral_summary), ''), 'Fact-only dispute summary for admin review.');
begin
  if p_dispute_type = 'unpaid_service' then
    return query select false, 'DEFERRED_PHASE0'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_initiated_by not in ('customer', 'worker', 'admin') then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_dispute_type not in (
    'completion_rejected',
    'damage_claim',
    'abusive_behavior_customer',
    'abusive_behavior_worker',
    'scope_disagreement_post_job',
    'other'
  ) then
    return query select false, 'INVALID_TYPE'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select *
    into v_job
    from public.jobs
   where id = p_job_id
   for update;

  if not found then
    return query select false, 'NOT_FOUND'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_initiated_by = 'customer' and v_job.customer_id <> p_initiated_by_id then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_initiated_by = 'worker' and coalesce(v_job.worker_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_initiated_by_id then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_initiated_by = 'admin' and not exists (
    select 1 from public.profiles where id = p_initiated_by_id and role = 'admin'
  ) then
    return query select false, 'AUTH_FORBIDDEN'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_job.status not in (
    'completed_by_worker',
    'confirmed_by_customer',
    'payment_pending',
    'paid',
    'reviewed',
    'scope_change_pending',
    'repairing'
  ) then
    return query select false, 'INVALID_STATUS'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if exists (
    select 1
      from public.disputes d
     where d.job_id = p_job_id
       and d.status in ('open', 'awaiting_counter_party', 'admin_review')
  ) then
    return query select false, 'ALREADY_OPEN'::text,
      null::uuid, null::uuid, null::text, true, 'medium'::text,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_initiated_by = 'customer' then
    v_counter_party_id := v_job.worker_id;
  elsif p_initiated_by = 'worker' then
    v_counter_party_id := v_job.customer_id;
  else
    v_counter_party_id := coalesce(v_job.worker_id, v_job.customer_id);
  end if;

  if p_dispute_type in ('completion_rejected', 'damage_claim', 'scope_disagreement_post_job') then
    v_priority := 'high';
  elsif p_dispute_type in ('abusive_behavior_customer', 'abusive_behavior_worker') then
    v_priority := 'critical';
  end if;

  select count(*) into v_customer_disputes
    from public.disputes d
    join public.jobs j on j.id = d.job_id
   where j.customer_id = v_job.customer_id
     and d.created_at >= v_now - interval '30 days';

  select count(*) into v_customer_completed
    from public.jobs j
   where j.customer_id = v_job.customer_id
     and j.status in ('confirmed_by_customer', 'paid', 'reviewed')
     and coalesce(j.confirmed_at, j.completed_at, j.updated_at, j.created_at) >= v_now - interval '30 days';

  if v_customer_disputes::numeric / greatest(1, v_customer_completed) > 0.20 then
    v_abuse_signals := array_append(v_abuse_signals, 'customer_dispute_rate_threshold');
  end if;

  if v_job.worker_id is not null then
    select count(*) into v_worker_disputes
      from public.disputes d
      join public.jobs j on j.id = d.job_id
     where j.worker_id = v_job.worker_id
       and d.created_at >= v_now - interval '30 days';

    select count(*) into v_worker_completed
      from public.jobs j
     where j.worker_id = v_job.worker_id
       and j.status in ('confirmed_by_customer', 'paid', 'reviewed')
       and coalesce(j.confirmed_at, j.completed_at, j.updated_at, j.created_at) >= v_now - interval '30 days';

    if v_worker_disputes::numeric / greatest(1, v_worker_completed) > 0.15 then
      v_abuse_signals := array_append(v_abuse_signals, 'worker_dispute_rate_threshold');
    end if;

    select count(*) into v_same_party_disputes
      from public.disputes d
      join public.jobs j on j.id = d.job_id
     where j.customer_id = v_job.customer_id
       and j.worker_id = v_job.worker_id
       and d.created_at >= v_now - interval '30 days';

    if v_same_party_disputes >= 2 then
      v_abuse_signals := array_append(v_abuse_signals, 'same_party_repeat_threshold');
    end if;
  end if;

  if cardinality(v_abuse_signals) > 0 and v_priority <> 'critical' then
    v_priority := 'high';
  end if;

  v_snapshot := jsonb_build_object(
    'chat_message_ids',
      coalesce((
        select jsonb_agg(cm.id order by cm.created_at)
          from public.chat_messages cm
         where cm.job_id = p_job_id
      ), '[]'::jsonb),
    'photo_urls',
      coalesce((
        select jsonb_agg(media.url)
          from (
            select unnest(coalesce(v_job.photo_urls, '{}'::text[])) as url
            union all
            select unnest(coalesce(v_job.completion_photo_urls, '{}'::text[])) as url
            union all
            select unnest(coalesce(p_evidence_photo_urls, '{}'::text[])) as url
          ) media
         where nullif(media.url, '') is not null
      ), '[]'::jsonb),
    'status_timeline',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'status', coalesce(je.to_status::text, je.from_status::text, je.event_type),
            'event_type', je.event_type,
            'at', je.created_at
          )
          order by je.created_at
        )
          from public.job_events je
         where je.job_id = p_job_id
      ), '[]'::jsonb),
    'scope_changes',
      coalesce((
        select jsonb_agg(sc.id order by sc.created_at)
          from public.scope_change_requests sc
         where sc.job_id = p_job_id
      ), '[]'::jsonb),
    'kael_artifacts',
      coalesce((
        select jsonb_agg(ka.id order by ka.created_at)
          from public.kael_analysis_artifacts ka
         where ka.job_id = p_job_id
      ), '[]'::jsonb)
  );

  insert into public.evidence_snapshots (
    job_id,
    evidence_locked_at,
    evidence_snapshot
  ) values (
    p_job_id,
    v_now,
    v_snapshot
  ) returning id into v_snapshot_id;

  insert into public.disputes (
    job_id,
    dispute_type,
    initiated_by,
    initiated_by_id,
    counter_party_id,
    initiator_statement,
    counter_party_response_deadline,
    evidence_locked_at,
    evidence_snapshot_id,
    kael_neutral_summary,
    admin_review,
    abuse_signals,
    status,
    created_at,
    updated_at
  ) values (
    p_job_id,
    p_dispute_type,
    p_initiated_by,
    p_initiated_by_id,
    v_counter_party_id,
    btrim(p_initiator_statement),
    v_now + interval '24 hours',
    v_now,
    v_snapshot_id,
    left(v_summary, 1000),
    jsonb_build_object(
      'priority', v_priority,
      'assigned_admin_id', null,
      'reviewed_at', null
    ),
    v_abuse_signals,
    'open',
    v_now,
    v_now
  ) returning id into v_dispute_id;

  insert into public.kael_admin_queue (
    job_id,
    actor_id,
    actor_role,
    queue_type,
    priority,
    status,
    escalation_level,
    reason_code,
    response_summary,
    safe_metadata
  ) values (
    p_job_id,
    p_initiated_by_id,
    p_initiated_by,
    'dispute_review',
    v_priority,
    'open',
    case when v_priority in ('high', 'critical') then 'hard' else 'soft' end,
    p_dispute_type,
    left(v_summary, 200),
    jsonb_build_object(
      'dispute_id', v_dispute_id,
      'evidence_snapshot_id', v_snapshot_id,
      'abuse_signals', to_jsonb(v_abuse_signals),
      'kael_neutral', true
    )
  );

  return query select true, null::text, v_dispute_id, v_snapshot_id, 'open'::text,
    true, v_priority, v_now, v_now;
end;
$func$;

drop function if exists public.submit_counter_statement_atomic(uuid, uuid, text);
create function public.submit_counter_statement_atomic(
  p_dispute_id uuid,
  p_actor_id uuid,
  p_statement text
) returns table (
  ok boolean,
  error_code text,
  dispute_id uuid,
  dispute_status text,
  updated_at_ts timestamptz
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_dispute public.disputes%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_dispute
    from public.disputes
   where id = p_dispute_id
   for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if v_dispute.status not in ('open', 'awaiting_counter_party') then
    return query select false, 'INVALID_STATUS'::text, p_dispute_id, v_dispute.status, null::timestamptz;
    return;
  end if;

  if v_dispute.counter_party_statement is not null then
    return query select false, 'ALREADY_SUBMITTED'::text, p_dispute_id, v_dispute.status, null::timestamptz;
    return;
  end if;

  if coalesce(v_dispute.counter_party_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_actor_id
    and not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    return query select false, 'AUTH_FORBIDDEN'::text, p_dispute_id, v_dispute.status, null::timestamptz;
    return;
  end if;

  update public.disputes
     set counter_party_statement = btrim(p_statement),
         status = 'admin_review',
         updated_at = v_now
   where id = p_dispute_id;

  return query select true, null::text, p_dispute_id, 'admin_review'::text, v_now;
end;
$func$;

drop function if exists public.admin_decide_dispute_atomic(uuid, uuid, text, int, int, text, text, text);
create function public.admin_decide_dispute_atomic(
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
    update public.worker_profiles
       set verification_status = 'suspended',
           updated_at = v_now
     where id = v_worker_id;
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

revoke execute on function public.prevent_evidence_snapshot_mutation() from public;
revoke execute on function public.prevent_evidence_snapshot_mutation() from anon;
revoke execute on function public.prevent_evidence_snapshot_mutation() from authenticated;
grant execute on function public.prevent_evidence_snapshot_mutation() to service_role;

revoke execute on function public.open_dispute_atomic(uuid, uuid, text, text, text, text[], text) from public;
revoke execute on function public.open_dispute_atomic(uuid, uuid, text, text, text, text[], text) from anon;
revoke execute on function public.open_dispute_atomic(uuid, uuid, text, text, text, text[], text) from authenticated;
grant execute on function public.open_dispute_atomic(uuid, uuid, text, text, text, text[], text) to service_role;

revoke execute on function public.submit_counter_statement_atomic(uuid, uuid, text) from public;
revoke execute on function public.submit_counter_statement_atomic(uuid, uuid, text) from anon;
revoke execute on function public.submit_counter_statement_atomic(uuid, uuid, text) from authenticated;
grant execute on function public.submit_counter_statement_atomic(uuid, uuid, text) to service_role;

revoke execute on function public.admin_decide_dispute_atomic(uuid, uuid, text, int, int, text, text, text) from public;
revoke execute on function public.admin_decide_dispute_atomic(uuid, uuid, text, int, int, text, text, text) from anon;
revoke execute on function public.admin_decide_dispute_atomic(uuid, uuid, text, int, int, text, text, text) from authenticated;
grant execute on function public.admin_decide_dispute_atomic(uuid, uuid, text, int, int, text, text, text) to service_role;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'evidence_snapshots'
  ) then
    alter publication supabase_realtime add table public.evidence_snapshots;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'disputes'
  ) then
    alter publication supabase_realtime add table public.disputes;
  end if;
end $$;

commit;
