begin;

create table public.worker_violation_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.worker_violation_cases(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  reason text not null check (pg_catalog.char_length(reason) between 20 and 2000),
  evidence_paths text[] not null default '{}' check (pg_catalog.cardinality(evidence_paths) <= 6),
  status text not null default 'submitted' check (status in ('submitted', 'upheld', 'overturned')),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or pg_catalog.char_length(decision_reason) between 10 and 2000),
  check ((status = 'submitted') = (decided_at is null))
);

alter table public.worker_violation_appeals enable row level security;
revoke all on table public.worker_violation_appeals from public, anon, authenticated;
grant select, insert, update on table public.worker_violation_appeals to service_role;

create or replace function private.propose_violation_case(
  p_worker_id uuid,
  p_customer_id uuid,
  p_job_id uuid,
  p_code text,
  p_source text,
  p_reporter_id uuid,
  p_statement text,
  p_evidence jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.worker_discipline_policy%rowtype;
  v_case_id uuid;
  v_level smallint := private.violation_level(p_code);
begin
  select * into v_policy from public.worker_discipline_policy where id = 1;
  select id into v_case_id from public.worker_violation_cases where dedupe_key = p_dedupe_key;
  if found then
    return v_case_id;
  end if;

  insert into public.worker_violation_cases (
    worker_id, customer_id, job_id, violation_code, level, source, reporter_id, statement,
    evidence, dedupe_key, decision_deadline_at
  ) values (
    p_worker_id, p_customer_id, p_job_id, p_code, v_level, p_source, p_reporter_id, p_statement,
    coalesce(p_evidence, '{}'::jsonb), p_dedupe_key,
    pg_catalog.now() + pg_catalog.make_interval(hours => v_policy.decision_deadline_hours)
  ) returning id into v_case_id;

  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (v_case_id, 'proposed', p_reporter_id, pg_catalog.jsonb_build_object('source', p_source, 'level', v_level));

  -- The one effect that needs no admin: a lower matching rank, which the governance rules
  -- treat as a matching signal rather than a punishment.
  if v_level = 1 then
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_until, detail)
    values (v_case_id, p_worker_id, 'matching_deprioritize',
      pg_catalog.now() + pg_catalog.make_interval(days => v_policy.l1_matching_days),
      pg_catalog.jsonb_build_object('automatic', true));
  end if;

  return v_case_id;
end;
$function$;

create or replace function private.forfeit_all_points(p_case_id uuid, p_worker_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_balance bigint := private.worker_ambassador_points_balance(p_worker_id);
begin
  if v_balance <= 0 then
    return;
  end if;
  insert into public.worker_ambassador_point_entries (
    worker_id, entry_kind, points_milli, case_id, actor_id, reason, idempotency_key
  ) values (
    p_worker_id, 'penalty_forfeit', -v_balance, p_case_id, p_actor_id, 'Mất toàn bộ điểm do vi phạm đã xác nhận',
    'forfeit:' || p_case_id
  );
  insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
  values (p_case_id, p_worker_id, 'points_forfeit', p_actor_id, pg_catalog.jsonb_build_object('points_milli', v_balance));
end;
$function$;

create or replace function private.ban_worker_for_case(p_case_id uuid, p_worker_id uuid, p_actor_id uuid, p_level smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_link_ids uuid[];
begin
  insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
  values (p_case_id, p_worker_id, 'ban', p_actor_id, pg_catalog.jsonb_build_object('level', p_level));

  perform private.apply_worker_suspension(
    p_worker_id, 'admin', null, 'Khóa vĩnh viễn do vi phạm cấp ' || p_level || ' đã xác nhận', p_actor_id, p_case_id
  );

  -- The worker's customers are free to join another worker's network.
  with ended as (
    update public.customer_worker_links
    set ended_at = pg_catalog.now(), end_reason = case when p_level >= 4 then 'fraud' else 'penalty' end,
        ended_by = p_actor_id, case_id = p_case_id
    where worker_id = p_worker_id and ended_at is null
    returning id
  )
  select pg_catalog.array_agg(id) into v_link_ids from ended;

  if v_link_ids is not null then
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
    values (p_case_id, p_worker_id, 'link_revoked', p_actor_id, pg_catalog.jsonb_build_object('link_ids', pg_catalog.to_jsonb(v_link_ids)));
  end if;
end;
$function$;

create or replace function private.violation_case_json(p_case_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'id', violation.id,
    'worker_id', violation.worker_id,
    'customer_id', violation.customer_id,
    'job_id', violation.job_id,
    'violation_code', violation.violation_code,
    'level', violation.level,
    'source', violation.source,
    'statement', violation.statement,
    'status', violation.status,
    'decision_deadline_at', violation.decision_deadline_at,
    'decided_at', violation.decided_at,
    'decision_reason', violation.decision_reason,
    'appeal_status', violation.appeal_status,
    'appeal_deadline_at', case when violation.status = 'confirmed'
      then violation.decided_at + pg_catalog.make_interval(days => policy.appeal_window_days) end,
    'suspended_pending_review', violation.suspended_pending_review,
    'created_at', violation.created_at,
    'consequences', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'entry_kind', entry.entry_kind,
        'effective_until', entry.effective_until,
        'restored', exists (select 1 from public.worker_discipline_entries as restore where restore.restores_entry_id = entry.id),
        'detail', entry.detail
      ) order by entry.created_at)
      from public.worker_discipline_entries as entry
      where entry.case_id = violation.id and entry.entry_kind <> 'restore'
    ), '[]'::jsonb)
  )
  from public.worker_violation_cases as violation
  cross join public.worker_discipline_policy as policy
  where violation.id = p_case_id and policy.id = 1;
$function$;

create or replace function public.admin_decide_violation_case(
  p_actor_id uuid,
  p_case_id uuid,
  p_decision text,
  p_reason text,
  p_clawback_vnd integer default 0,
  p_blocklist jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_policy public.worker_discipline_policy%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.now();
  v_link_id uuid;
  v_state record;
  v_balance record;
  v_bonus_in_balance bigint;
  v_clawback integer;
  v_clawback_id uuid;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if p_decision not in ('confirm', 'dismiss', 'fabricated_report')
     or pg_catalog.char_length(v_reason) not between 10 and 2000
     or coalesce(p_clawback_vnd, 0) < 0 then
    raise exception 'INVALID_DECISION_INPUT' using errcode = '22023';
  end if;

  select * into v_case from public.worker_violation_cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'proposed' then
    -- A retried decision returns the recorded outcome; a different decision is refused.
    if (p_decision = 'confirm' and v_case.status = 'confirmed')
       or (p_decision = 'dismiss' and v_case.status = 'dismissed')
       or (p_decision = 'fabricated_report' and v_case.status = 'fabricated_report') then
      return private.violation_case_json(p_case_id);
    end if;
    raise exception 'CASE_ALREADY_DECIDED' using errcode = 'P0001';
  end if;
  if p_decision = 'fabricated_report' and v_case.source <> 'customer_report' then
    raise exception 'NOT_A_CUSTOMER_REPORT' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_case.worker_id::text, 0));
  select * into v_policy from public.worker_discipline_policy where id = 1;

  update public.worker_violation_cases
  set status = case p_decision when 'confirm' then 'confirmed' when 'dismiss' then 'dismissed' else 'fabricated_report' end,
      decided_by = p_actor_id, decided_at = v_now, decision_reason = v_reason, updated_at = v_now
  where id = p_case_id;

  if p_decision <> 'confirm' then
    -- An L1 matching signal and an emergency suspension end with a case that did not stand.
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, restores_entry_id, actor_id, detail)
    select p_case_id, entry.worker_id, 'restore', entry.id, p_actor_id, pg_catalog.jsonb_build_object('reason', p_decision)
    from public.worker_discipline_entries as entry
    where entry.case_id = p_case_id and entry.entry_kind <> 'restore'
      and not exists (select 1 from public.worker_discipline_entries as restore where restore.restores_entry_id = entry.id);
    if v_case.suspended_pending_review then
      perform private.lift_worker_suspension(v_case.worker_id, 'reinstate', 'admin', v_reason, p_actor_id);
    end if;
    if p_decision = 'fabricated_report' and v_case.reporter_id is not null then
      update public.profiles
      set account_state = 'locked', locked_at = v_now, locked_case_id = p_case_id
      where id = v_case.reporter_id and role = 'customer'::public.user_role and account_state = 'active';
    end if;
    insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
    values (p_case_id, case when p_decision = 'dismiss' then 'dismissed' else 'fabricated_report' end, p_actor_id,
      pg_catalog.jsonb_build_object('reason', v_reason));
    return private.violation_case_json(p_case_id);
  end if;

  if v_case.level = 1 then
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id)
    values (p_case_id, v_case.worker_id, 'warning', p_actor_id);
  elsif v_case.level = 2 then
    insert into public.worker_ambassador_point_entries (
      worker_id, entry_kind, points_milli, case_id, actor_id, reason, idempotency_key
    ) values (
      v_case.worker_id, 'penalty_debit', -(v_policy.l2_points_debit::bigint * 1000), p_case_id, p_actor_id,
      'Trừ điểm do vi phạm cấp 2 đã xác nhận', 'penalty:' || p_case_id
    );
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
    values (p_case_id, v_case.worker_id, 'points_debit', p_actor_id,
      pg_catalog.jsonb_build_object('points_milli', v_policy.l2_points_debit::bigint * 1000));
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_until, actor_id)
    values (p_case_id, v_case.worker_id, 'network_freeze',
      v_now + pg_catalog.make_interval(days => v_policy.l2_network_freeze_days), p_actor_id);
  elsif v_case.level = 3 then
    perform private.forfeit_all_points(p_case_id, v_case.worker_id, p_actor_id);
    if v_case.customer_id is not null then
      update public.customer_worker_links
      set ended_at = v_now, end_reason = 'penalty', ended_by = p_actor_id, case_id = p_case_id
      where customer_id = v_case.customer_id and worker_id = v_case.worker_id and ended_at is null
      returning id into v_link_id;
      if v_link_id is not null then
        insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
        values (p_case_id, v_case.worker_id, 'link_revoked', p_actor_id,
          pg_catalog.jsonb_build_object('link_ids', pg_catalog.jsonb_build_array(v_link_id)));
      end if;
    end if;
    insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_until, actor_id) values
      (p_case_id, v_case.worker_id, 'redemption_freeze', v_now + pg_catalog.make_interval(days => v_policy.l3_freeze_days), p_actor_id),
      (p_case_id, v_case.worker_id, 'network_freeze', v_now + pg_catalog.make_interval(days => v_policy.l3_freeze_days), p_actor_id),
      (p_case_id, v_case.worker_id, 'strike', null, p_actor_id);
    select * into v_state from private.worker_discipline_state(v_case.worker_id);
    if v_state.strikes_12m >= 2 then
      perform private.ban_worker_for_case(p_case_id, v_case.worker_id, p_actor_id, v_case.level);
    end if;
  else
    perform private.forfeit_all_points(p_case_id, v_case.worker_id, p_actor_id);
    if v_case.level = 4 and coalesce(p_clawback_vnd, 0) > 0
       and exists (select 1 from public.worker_bonus_redemptions where worker_id = v_case.worker_id) then
      -- Only bonus credit still sitting in the balance can be taken back; the rest is recorded
      -- as owed, and earned job income is never touched.
      select * into v_balance from private.worker_withdrawable_balance(v_case.worker_id);
      v_bonus_in_balance := greatest(0, least(v_balance.bonus_available_vnd, v_balance.withdrawable_vnd));
      v_clawback := least(p_clawback_vnd::bigint, v_bonus_in_balance)::integer;
      insert into public.worker_bonus_clawbacks (
        worker_id, redemption_id, amount_vnd, receivable_vnd, case_id, decided_by, reason
      ) values (
        v_case.worker_id,
        (select id from public.worker_bonus_redemptions where worker_id = v_case.worker_id order by created_at desc limit 1),
        v_clawback, p_clawback_vnd - v_clawback, p_case_id, p_actor_id, v_reason
      ) returning id into v_clawback_id;
      insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, actor_id, detail)
      values (p_case_id, v_case.worker_id, 'bonus_clawback', p_actor_id,
        pg_catalog.jsonb_build_object('clawback_id', v_clawback_id, 'amount_vnd', v_clawback,
          'receivable_vnd', p_clawback_vnd - v_clawback));
    end if;
    perform private.ban_worker_for_case(p_case_id, v_case.worker_id, p_actor_id, v_case.level);
    if v_case.level = 5 then
      -- The hold is time-boxed: NestScout is not a court, so earned money is released on this
      -- date unless an admin records a reference from the authority handling the case.
      insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_until, actor_id)
      values (p_case_id, v_case.worker_id, 'withdrawal_hold',
        v_now + pg_catalog.make_interval(days => v_policy.withdrawal_hold_days), p_actor_id);
      insert into public.identity_blocklist (kind, value_hmac, case_id, created_by)
      select digest.kind, pg_catalog.lower(digest.value_hmac), p_case_id, p_actor_id
      from pg_catalog.jsonb_to_recordset(coalesce(p_blocklist, '[]'::jsonb)) as digest(kind text, value_hmac text)
      where digest.kind in ('cccd', 'phone', 'email') and digest.value_hmac ~* '^[0-9a-f]{64}$'
      on conflict do nothing;
      -- The digests recorded at approval are blocked too, so the worker cannot re-register
      -- under a new phone number or a new spelling of the same email.
      insert into public.identity_blocklist (kind, value_hmac, case_id, created_by)
      select recorded.kind, recorded.value_hmac, p_case_id, p_actor_id
      from public.worker_identity_numbers as identity
      cross join lateral (values ('cccd', identity.cccd_hmac), ('phone', identity.phone_hmac), ('email', identity.email_hmac))
        as recorded(kind, value_hmac)
      where identity.worker_id = v_case.worker_id and recorded.value_hmac is not null
      on conflict do nothing;
    end if;
  end if;

  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (p_case_id, 'confirmed', p_actor_id, pg_catalog.jsonb_build_object('reason', v_reason, 'level', v_case.level));

  perform public.insert_notification_atomic(
    v_case.worker_id, v_case.job_id, 'violation_confirmed',
    'Vi phạm cấp ' || v_case.level || ' đã được xác nhận',
    'Xem lý do và hình thức xử lý. Bạn có ' || v_policy.appeal_window_days || ' ngày để gửi khiếu nại kèm bằng chứng.',
    pg_catalog.jsonb_build_object('case_id', p_case_id, 'level', v_case.level)
  );
  if v_case.customer_id is not null and v_case.job_id is not null and private.compensation_eligible(v_case.violation_code) then
    perform public.insert_notification_atomic(
      v_case.customer_id, v_case.job_id, 'violation_confirmed_customer',
      'Báo cáo của bạn đã được xác nhận',
      'Nếu bạn bị thiệt hại về tiền hoặc tài sản, bạn có thể đề nghị thợ bồi thường trong mục Lịch sử.',
      pg_catalog.jsonb_build_object('case_id', p_case_id)
    );
  end if;

  return private.violation_case_json(p_case_id);
end;
$function$;

create or replace function public.admin_suspend_worker_for_case(p_actor_id uuid, p_case_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if pg_catalog.char_length(v_reason) not between 10 and 1000 then
    raise exception 'INVALID_DECISION_INPUT' using errcode = '22023';
  end if;
  select * into v_case from public.worker_violation_cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.level <> 5 or v_case.status <> 'proposed' then
    raise exception 'SUSPEND_ONLY_FOR_OPEN_HARM_CASE' using errcode = 'P0001';
  end if;
  if v_case.suspended_pending_review then
    return private.violation_case_json(p_case_id);
  end if;

  perform private.apply_worker_suspension(v_case.worker_id, 'admin', null, v_reason, p_actor_id, p_case_id);
  update public.worker_violation_cases set suspended_pending_review = true, updated_at = pg_catalog.now()
  where id = p_case_id;
  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (p_case_id, 'suspended_pending_review', p_actor_id, pg_catalog.jsonb_build_object('reason', v_reason));
  return private.violation_case_json(p_case_id);
end;
$function$;

-- Keeping a worker's earned money past the default hold needs an outside authority (police,
-- court) to be handling the case; the admin records its reference, and each renewal is bounded.
create or replace function public.admin_extend_withdrawal_hold(
  p_actor_id uuid,
  p_case_id uuid,
  p_authority_reference text,
  p_hold_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_reference text := pg_catalog.btrim(coalesce(p_authority_reference, ''));
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if pg_catalog.char_length(v_reference) not between 3 and 200
     or p_hold_until is null
     or p_hold_until <= pg_catalog.now()
     or p_hold_until > pg_catalog.now() + interval '365 days' then
    raise exception 'INVALID_HOLD_INPUT' using errcode = '22023';
  end if;
  select * into v_case from public.worker_violation_cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.level <> 5 or v_case.status <> 'confirmed' or v_case.appeal_status = 'overturned'
     or not exists (
       select 1 from public.worker_discipline_entries as entry
       where entry.case_id = p_case_id and entry.entry_kind = 'withdrawal_hold'
         and not exists (select 1 from public.worker_discipline_entries as restore where restore.restores_entry_id = entry.id)
     ) then
    raise exception 'HOLD_NOT_EXTENDABLE' using errcode = 'P0001';
  end if;

  insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, effective_until, actor_id, detail)
  values (p_case_id, v_case.worker_id, 'withdrawal_hold', p_hold_until, p_actor_id,
    pg_catalog.jsonb_build_object('authority_reference', v_reference));
  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (p_case_id, 'withdrawal_hold_extended', p_actor_id,
    pg_catalog.jsonb_build_object('authority_reference', v_reference, 'hold_until', p_hold_until));
  perform public.insert_notification_atomic(
    v_case.worker_id, v_case.job_id, 'withdrawal_hold_extended',
    'Tiếp tục tạm giữ rút tiền',
    'Cơ quan có thẩm quyền đang xử lý vụ việc nên việc rút tiền được tạm giữ thêm. Xem chi tiết trong mục Vi phạm.',
    pg_catalog.jsonb_build_object('case_id', p_case_id)
  );
  return private.violation_case_json(p_case_id);
end;
$function$;

create or replace function public.submit_violation_appeal(
  p_worker_id uuid,
  p_case_id uuid,
  p_reason text,
  p_evidence_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_policy public.worker_discipline_policy%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_paths text[] := coalesce(p_evidence_paths, '{}');
  v_prefix text := 'appeals/' || p_worker_id || '/' || p_case_id || '/';
begin
  select * into v_case from public.worker_violation_cases where id = p_case_id and worker_id = p_worker_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.appeal_status = 'submitted' then
    return private.violation_case_json(p_case_id);
  end if;
  select * into v_policy from public.worker_discipline_policy where id = 1;
  if v_case.status <> 'confirmed' or v_case.appeal_status <> 'none' then
    raise exception 'APPEAL_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if v_case.decided_at + pg_catalog.make_interval(days => v_policy.appeal_window_days) < pg_catalog.now() then
    raise exception 'APPEAL_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  if pg_catalog.char_length(v_reason) not between 20 and 2000
     or pg_catalog.cardinality(v_paths) > 6
     or exists (
       select 1 from pg_catalog.unnest(v_paths) as path
       where pg_catalog.left(path, pg_catalog.char_length(v_prefix)) <> v_prefix
         or path !~ '^appeals/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|mp4|m4a|pdf)$'
     ) then
    raise exception 'INVALID_APPEAL_INPUT' using errcode = '22023';
  end if;

  insert into public.worker_violation_appeals (case_id, worker_id, reason, evidence_paths)
  values (p_case_id, p_worker_id, v_reason, v_paths);
  update public.worker_violation_cases set appeal_status = 'submitted', updated_at = pg_catalog.now() where id = p_case_id;
  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (p_case_id, 'appeal_submitted', p_worker_id, pg_catalog.jsonb_build_object('evidence_count', pg_catalog.cardinality(v_paths)));
  return private.violation_case_json(p_case_id);
end;
$function$;

create or replace function public.admin_decide_violation_appeal(
  p_actor_id uuid,
  p_case_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_entry record;
  v_link public.customer_worker_links%rowtype;
  v_link_id text;
  v_clawback public.worker_bonus_clawbacks%rowtype;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  if p_decision not in ('upheld', 'overturned') or pg_catalog.char_length(v_reason) not between 10 and 2000 then
    raise exception 'INVALID_DECISION_INPUT' using errcode = '22023';
  end if;
  select * into v_case from public.worker_violation_cases where id = p_case_id for update;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.appeal_status in ('upheld', 'overturned') then
    if v_case.appeal_status = p_decision then
      return private.violation_case_json(p_case_id);
    end if;
    raise exception 'APPEAL_ALREADY_DECIDED' using errcode = 'P0001';
  end if;
  if v_case.appeal_status <> 'submitted' then
    raise exception 'APPEAL_NOT_SUBMITTED' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_case.worker_id::text, 0));

  update public.worker_violation_appeals
  set status = p_decision, decided_by = p_actor_id, decided_at = pg_catalog.now(), decision_reason = v_reason
  where case_id = p_case_id;
  update public.worker_violation_cases set appeal_status = p_decision, updated_at = pg_catalog.now() where id = p_case_id;

  if p_decision = 'overturned' then
    for v_entry in
      select entry.* from public.worker_discipline_entries as entry
      where entry.case_id = p_case_id and entry.entry_kind <> 'restore'
        and not exists (select 1 from public.worker_discipline_entries as restore where restore.restores_entry_id = entry.id)
      order by entry.created_at
    loop
      insert into public.worker_discipline_entries (case_id, worker_id, entry_kind, restores_entry_id, actor_id, detail)
      values (p_case_id, v_entry.worker_id, 'restore', v_entry.id, p_actor_id, pg_catalog.jsonb_build_object('reason', 'appeal_overturned'));

      if v_entry.entry_kind in ('points_debit', 'points_forfeit') then
        insert into public.worker_ambassador_point_entries (
          worker_id, entry_kind, points_milli, case_id, actor_id, reason, idempotency_key
        ) values (
          v_entry.worker_id, 'appeal_restore', (v_entry.detail->>'points_milli')::bigint, p_case_id, p_actor_id,
          'Hoàn điểm sau khi khiếu nại được chấp nhận', 'restore:' || v_entry.id
        );
      elsif v_entry.entry_kind = 'link_revoked' then
        for v_link_id in select pg_catalog.jsonb_array_elements_text(v_entry.detail->'link_ids') loop
          select * into v_link from public.customer_worker_links where id = v_link_id::uuid;
          if v_link.expires_at > pg_catalog.now()
             and not exists (select 1 from public.customer_worker_links where customer_id = v_link.customer_id and ended_at is null) then
            insert into public.customer_worker_links (
              customer_id, worker_id, source, program_version_id, formed_at, expires_at, formed_by_job_id
            ) values (
              v_link.customer_id, v_link.worker_id, v_link.source, v_link.program_version_id, pg_catalog.now(),
              v_link.expires_at, v_link.formed_by_job_id
            );
          end if;
        end loop;
      elsif v_entry.entry_kind = 'ban' then
        perform private.lift_worker_suspension(v_entry.worker_id, 'reinstate', 'admin', v_reason, p_actor_id);
      elsif v_entry.entry_kind = 'bonus_clawback' then
        select * into v_clawback from public.worker_bonus_clawbacks where id = (v_entry.detail->>'clawback_id')::uuid;
        insert into public.worker_bonus_clawbacks (
          worker_id, redemption_id, amount_vnd, receivable_vnd, case_id, decided_by, reason, clawback_kind, reverses_clawback_id
        ) values (
          v_clawback.worker_id, v_clawback.redemption_id, v_clawback.amount_vnd, v_clawback.receivable_vnd,
          p_case_id, p_actor_id, v_reason, 'reversal', v_clawback.id
        );
      end if;
    end loop;
    update public.identity_blocklist
    set lifted_at = pg_catalog.now(), lifted_by = p_actor_id, lift_reason = v_reason
    where case_id = p_case_id and lifted_at is null;
  end if;

  insert into public.worker_violation_case_events (case_id, event_kind, actor_id, detail)
  values (p_case_id, case when p_decision = 'upheld' then 'appeal_upheld' else 'appeal_overturned' end, p_actor_id,
    pg_catalog.jsonb_build_object('reason', v_reason));

  perform public.insert_notification_atomic(
    v_case.worker_id, v_case.job_id,
    case when p_decision = 'upheld' then 'violation_appeal_upheld' else 'violation_appeal_overturned' end,
    case when p_decision = 'upheld' then 'Khiếu nại chưa được chấp nhận' else 'Khiếu nại được chấp nhận — bạn đã được minh oan' end,
    case when p_decision = 'upheld' then 'Quyết định xử lý vi phạm được giữ nguyên. Xem lý do trong mục Vi phạm.'
      else 'Toàn bộ điểm, hạng và quyền lợi liên quan đã được khôi phục.' end,
    pg_catalog.jsonb_build_object('case_id', p_case_id)
  );

  return private.violation_case_json(p_case_id);
end;
$function$;

-- Customers can report only the worker on their own job, only after a worker was assigned,
-- and only for conduct a customer can witness. Quality complaints go through disputes.
create or replace function public.create_worker_report(
  p_customer_id uuid,
  p_job_id uuid,
  p_violation_code text,
  p_statement text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_statement text := pg_catalog.btrim(coalesce(p_statement, ''));
  v_case_id uuid;
begin
  if p_violation_code not in (
    'off_app_dealing', 'extra_cash', 'theft', 'intentional_damage', 'harassment_sexual',
    'violence', 'threats', 'covert_recording'
  ) or pg_catalog.char_length(v_statement) not between 10 and 2000 then
    raise exception 'INVALID_REPORT_INPUT' using errcode = '22023';
  end if;
  select * into v_job from public.jobs where id = p_job_id and customer_id = p_customer_id;
  if not found or v_job.worker_id is null then
    raise exception 'JOB_NOT_REPORTABLE' using errcode = 'P0001';
  end if;
  if (select count(*) from public.worker_violation_cases
      where reporter_id = p_customer_id and created_at > pg_catalog.now() - interval '1 day') >= 5 then
    raise exception 'REPORT_RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_case_id := private.propose_violation_case(
    v_job.worker_id, p_customer_id, p_job_id, p_violation_code, 'customer_report', p_customer_id,
    v_statement, pg_catalog.jsonb_build_object('job_id', p_job_id),
    'report:' || p_job_id || ':' || p_violation_code
  );
  return pg_catalog.jsonb_build_object(
    'case_id', v_case_id,
    'level', private.violation_level(p_violation_code),
    'status', (select status from public.worker_violation_cases where id = v_case_id)
  );
end;
$function$;

revoke all on function private.propose_violation_case(uuid, uuid, uuid, text, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function private.forfeit_all_points(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.ban_worker_for_case(uuid, uuid, uuid, smallint) from public, anon, authenticated;
revoke all on function private.violation_case_json(uuid) from public, anon, authenticated;
revoke all on function public.admin_decide_violation_case(uuid, uuid, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.admin_suspend_worker_for_case(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_extend_withdrawal_hold(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.submit_violation_appeal(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.admin_decide_violation_appeal(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_worker_report(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.propose_violation_case(uuid, uuid, uuid, text, text, uuid, text, jsonb, text) to service_role;
grant execute on function private.violation_case_json(uuid) to service_role;
grant execute on function public.admin_decide_violation_case(uuid, uuid, text, text, integer, jsonb) to service_role;
grant execute on function public.admin_suspend_worker_for_case(uuid, uuid, text) to service_role;
grant execute on function public.admin_extend_withdrawal_hold(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.submit_violation_appeal(uuid, uuid, text, text[]) to service_role;
grant execute on function public.admin_decide_violation_appeal(uuid, uuid, text, text) to service_role;
grant execute on function public.create_worker_report(uuid, uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.create_worker_withdrawal_request(p_worker_id uuid, p_amount_vnd integer, p_client_request_id uuid)
 RETURNS TABLE(ok boolean, error_code text, request_id uuid, status_out text, amount_vnd_out integer, available_balance_before_vnd_out integer, bank_key_out text, bank_name_out text, bank_account_masked_out text, requested_at_out timestamp with time zone, updated_at_out timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_worker public.worker_profiles%rowtype;
  v_method public.worker_payout_methods%rowtype;
  v_request public.worker_withdrawal_requests%rowtype;
  v_available_balance bigint := 0;
  v_discipline record;
begin
  if p_worker_id is null or p_client_request_id is null
     or p_amount_vnd is null or p_amount_vnd <= 0 or p_amount_vnd > 1000000000
  then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select worker.*
  into v_worker
  from public.worker_profiles as worker
  join public.profiles as profile on profile.id = worker.id
  where worker.id = p_worker_id
    and profile.role = 'worker'::public.user_role
  for update;

  if not found then
    return query select false, 'WORKER_NOT_FOUND'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  -- A worker banned for a confirmed violation keeps the right to withdraw income already earned;
  -- only an open harm case (withdrawal hold) stops that.
  select * into v_discipline from private.worker_discipline_state(p_worker_id);
  if v_discipline.withdrawal_hold
     or ((v_worker.is_suspended or not v_worker.is_approved or v_worker.verification_status <> 'approved'::public.worker_verification_status)
       and not v_discipline.banned) then
    return query select false, 'WORKER_NOT_ELIGIBLE'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));

  select request.*
  into v_request
  from public.worker_withdrawal_requests as request
  where request.worker_id = p_worker_id
    and request.client_request_id = p_client_request_id
  for update;

  if found then
    if v_request.amount_vnd <> p_amount_vnd then
      return query select false, 'CLIENT_REQUEST_MISMATCH'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
      return;
    end if;
    return query select
      true,
      null::text,
      v_request.id,
      v_request.status,
      v_request.amount_vnd,
      v_request.available_balance_before_vnd,
      v_request.bank_key,
      v_request.bank_name,
      v_request.bank_account_masked,
      v_request.requested_at,
      v_request.updated_at;
    return;
  end if;

  select method.*
  into v_method
  from public.worker_payout_methods as method
  where method.worker_id = p_worker_id
    and method.is_default
  for update;

  if not found then
    return query select false, 'PAYOUT_METHOD_MISSING'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_method.status <> 'verified' then
    return query select false, 'PAYOUT_METHOD_NOT_VERIFIED'::text, null::uuid, null::text, null::integer, null::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select balance.withdrawable_vnd
  into v_available_balance
  from private.worker_withdrawable_balance(p_worker_id) as balance;
  if p_amount_vnd::bigint > v_available_balance then
    return query select false, 'INSUFFICIENT_BALANCE'::text, null::uuid, null::text, null::integer, v_available_balance::integer, null::text, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.worker_withdrawal_requests (
    worker_id,
    payout_method_id,
    client_request_id,
    amount_vnd,
    available_balance_before_vnd,
    bank_key,
    bank_name,
    account_holder_name,
    bank_account,
    bank_account_masked,
    status
  ) values (
    p_worker_id,
    v_method.id,
    p_client_request_id,
    p_amount_vnd,
    v_available_balance::integer,
    v_method.bank_key,
    v_method.bank_name,
    v_method.account_holder_name,
    v_method.bank_account,
    v_method.bank_account_masked,
    'pending'
  ) returning * into v_request;

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
    p_worker_id,
    'worker',
    'worker_withdrawal_request',
    'create',
    'manual_payout',
    'allow',
    'withdrawal_requested',
    pg_catalog.jsonb_build_object(
      'withdrawal_request_id', v_request.id,
      'amount_vnd', v_request.amount_vnd,
      'payout_method_id', v_method.id,
      'bank_key', v_method.bank_key
    )
  );

  return query select
    true,
    null::text,
    v_request.id,
    v_request.status,
    v_request.amount_vnd,
    v_request.available_balance_before_vnd,
    v_request.bank_key,
    v_request.bank_name,
    v_request.bank_account_masked,
    v_request.requested_at,
    v_request.updated_at;
end;
$function$;

create or replace function public.get_worker_violations(p_worker_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(private.violation_case_json(violation.id) order by violation.created_at desc), '[]'::jsonb)
  from (
    select id, created_at from public.worker_violation_cases
    where worker_id = p_worker_id and status in ('proposed', 'confirmed') and level >= 2
    order by created_at desc
    limit 50
  ) as violation;
$function$;

create or replace function public.admin_list_violation_cases(p_actor_id uuid, p_status text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  return coalesce((
    select pg_catalog.jsonb_agg(item order by (item->>'level')::integer desc, item->>'created_at')
    from (
      select private.violation_case_json(violation.id)
        || pg_catalog.jsonb_build_object('worker_name', profile.full_name) as item
      from public.worker_violation_cases as violation
      left join public.profiles as profile on profile.id = violation.worker_id
      where (p_status is null and (violation.status = 'proposed' or violation.appeal_status = 'submitted'))
         or violation.status = p_status
      order by violation.level desc, violation.created_at
      limit 200
    ) as rows
  ), '[]'::jsonb);
end;
$function$;

-- Chat originals are included only for off-app cases, the only ones they can prove.
create or replace function public.admin_get_violation_case(p_actor_id uuid, p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_case public.worker_violation_cases%rowtype;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  select * into v_case from public.worker_violation_cases where id = p_case_id;
  if not found then
    raise exception 'CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.violation_case_json(p_case_id) || pg_catalog.jsonb_build_object(
    'worker_name', (select full_name from public.profiles where id = v_case.worker_id),
    'evidence', v_case.evidence,
    'identity_recorded', exists (select 1 from public.worker_identity_numbers where worker_id = v_case.worker_id),
    'appeal', (
      select pg_catalog.jsonb_build_object(
        'reason', appeal.reason, 'evidence_paths', pg_catalog.to_jsonb(appeal.evidence_paths),
        'status', appeal.status, 'submitted_at', appeal.submitted_at, 'decision_reason', appeal.decision_reason
      ) from public.worker_violation_appeals as appeal where appeal.case_id = p_case_id
    ),
    'chat_evidence', case when v_case.violation_code in ('off_app_dealing', 'extra_cash') then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'original_body', evidence.original_body, 'matched_rules', pg_catalog.to_jsonb(evidence.matched_rules),
        'created_at', evidence.created_at
      ) order by evidence.created_at)
      from public.chat_guard_redaction_evidence as evidence
      where evidence.sender_id = v_case.worker_id
        and evidence.original_body is not null
        and evidence.created_at > v_case.created_at - interval '60 days'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'event_kind', event.event_kind, 'actor_id', event.actor_id, 'detail', event.detail, 'created_at', event.created_at
      ) order by event.created_at)
      from public.worker_violation_case_events as event where event.case_id = p_case_id
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.admin_list_identity_blocks(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.discipline.manage');
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', block.id, 'kind', block.kind, 'case_id', block.case_id, 'created_at', block.created_at,
      'lifted_at', block.lifted_at, 'lift_reason', block.lift_reason
    ) order by block.created_at desc)
    from public.identity_blocklist as block
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.get_worker_violations(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_violation_cases(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_get_violation_case(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_identity_blocks(uuid) from public, anon, authenticated;
grant execute on function public.get_worker_violations(uuid) to service_role;
grant execute on function public.admin_list_violation_cases(uuid, text) to service_role;
grant execute on function public.admin_get_violation_case(uuid, uuid) to service_role;
grant execute on function public.admin_list_identity_blocks(uuid) to service_role;

commit;
