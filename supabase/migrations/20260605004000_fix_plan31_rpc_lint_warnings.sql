-- Plan 31 production post-lint cleanup.
-- The previous Plan31 RPCs were behaviorally correct, but remote lint found
-- unused audit params and one unused local variable. This forward migration
-- preserves the RPC contracts while consuming the audit params in lifecycle
-- metadata and removing the unused autonomy variable.

create or replace function public.promote_learning_candidate(
  p_skill_id text,
  p_candidate_type text,
  p_target text,
  p_effects text[] default array[]::text[],
  p_candidate_payload jsonb default '{}'::jsonb,
  p_rule_payload jsonb default '{}'::jsonb,
  p_affected_service public.service_type default null,
  p_affected_problem text default null,
  p_affected_district text default null,
  p_confidence numeric default 0,
  p_evidence_count integer default 0,
  p_actor_id uuid default null,
  p_actor_role text default 'system',
  p_job_id uuid default null,
  p_audit_reason text default null
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_candidate_id uuid;
  v_rule_id uuid;
  v_rule_version integer;
  v_existing record;
  v_effect text;
  v_lock_key text;
  v_actor_role text;
begin
  if p_skill_id not in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7') then
    return query select false, 'UNKNOWN_SKILL'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_skill_id in ('LS5', 'LS6', 'LS7') then
    return query select false, 'MANUAL_REVIEW_REQUIRED'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_candidate_type not in ('price_prior_update', 'analysis_rule') then
    return query select false, 'UNSUPPORTED_CANDIDATE_TYPE'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_target not in (
    'analysis_prompt',
    'price_prior',
    'clarification_pattern',
    'advisory_pattern',
    'detection_pattern',
    'intent_category'
  ) then
    return query select false, 'TARGET_NOT_ALLOWED'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  foreach v_effect in array coalesce(p_effects, array[]::text[]) loop
    if v_effect in (
      'auto_charge_payment',
      'auto_confirm_booking',
      'auto_cancel_job',
      'auto_approve_worker',
      'auto_suspend_worker',
      'auto_change_final_price',
      'auto_expand_service_scope',
      'hide_learning_changes_from_admin'
    ) then
      return query select false, 'FORBIDDEN_EFFECT'::text, null::uuid, null::uuid, null::integer;
      return;
    end if;
  end loop;

  if jsonb_typeof(p_candidate_payload) is distinct from 'object'
     or jsonb_typeof(p_rule_payload) is distinct from 'object' then
    return query select false, 'INVALID_PAYLOAD'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_affected_service is null
     or nullif(p_affected_problem, '') is null
     or nullif(p_affected_district, '') is null then
    return query select false, 'MISSING_SCOPE'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_confidence < 0 or p_confidence > 1 then
    return query select false, 'INVALID_CONFIDENCE'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if p_evidence_count < 5 or p_confidence < 0.6 then
    return query select false, 'EVIDENCE_GATE_NOT_PASSED'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  v_actor_role := case
    when p_actor_role in ('customer', 'worker', 'admin', 'system') then p_actor_role
    else 'system'
  end;
  v_lock_key := concat_ws(
    '|',
    p_candidate_type,
    p_affected_service::text,
    p_affected_problem,
    p_affected_district
  );
  perform pg_advisory_xact_lock(hashtext(v_lock_key));

  insert into public.learning_candidates (
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    suggested_payload,
    confidence,
    evidence_count,
    status,
    audit_reason
  ) values (
    p_candidate_type,
    p_affected_service,
    p_affected_problem,
    p_affected_district,
    p_candidate_payload,
    p_confidence,
    p_evidence_count,
    'evidence_gate_passed'::public.learning_candidate_status,
    coalesce(p_audit_reason, 'promote_learning_candidate')
  )
  returning id into v_candidate_id;

  select id, active_version into v_existing
    from public.learning_rules
    where rule_type = p_candidate_type
      and affected_service = p_affected_service
      and coalesce(affected_problem, '') = coalesce(p_affected_problem, '')
      and coalesce(affected_district, '') = coalesce(p_affected_district, '')
      and status = 'active'::public.learning_rule_status
    order by created_at asc
    limit 1
    for update;

  if found then
    v_rule_id := v_existing.id;
    v_rule_version := v_existing.active_version + 1;

    update public.learning_rules
      set rule_payload = p_rule_payload,
          confidence = p_confidence,
          evidence_count = p_evidence_count,
          active_version = v_rule_version
      where id = v_rule_id;
  else
    insert into public.learning_rules (
      rule_type,
      affected_service,
      affected_problem,
      affected_district,
      rule_payload,
      confidence,
      evidence_count,
      status,
      active_version,
      rollback_available
    ) values (
      p_candidate_type,
      p_affected_service,
      p_affected_problem,
      p_affected_district,
      p_rule_payload,
      p_confidence,
      p_evidence_count,
      'active'::public.learning_rule_status,
      1,
      true
    )
    returning id, active_version into v_rule_id, v_rule_version;
  end if;

  insert into public.learning_rule_versions (
    rule_id,
    version,
    rule_payload,
    change_reason,
    status
  ) values (
    v_rule_id,
    v_rule_version,
    p_rule_payload,
    'promote_learning_candidate:' || v_candidate_id::text,
    'active'::public.learning_rule_status
  );

  update public.learning_candidates
    set status = 'auto_promoted'::public.learning_candidate_status,
        promoted_at = now(),
        audit_reason = coalesce(p_audit_reason, 'promote_learning_candidate')
          || '; rule=' || v_rule_id::text
          || '; version=' || v_rule_version::text
    where id = v_candidate_id;

  insert into public.kael_rule_lifecycle_log (
    rule_id,
    candidate_id,
    skill_id,
    previous_state,
    next_state,
    transition_reason,
    actor_role,
    safe_metadata
  ) values (
    v_rule_id,
    v_candidate_id,
    p_skill_id,
    'evidence_gate_check',
    'active',
    'promote_learning_candidate',
    v_actor_role,
    jsonb_strip_nulls(jsonb_build_object(
      'actor_id', p_actor_id,
      'actor_role_raw', p_actor_role,
      'job_id', p_job_id,
      'target', p_target,
      'rule_version', v_rule_version
    ))
  );

  return query select true, null::text, v_candidate_id, v_rule_id, v_rule_version;
end;
$func$;

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
     and status = p_expected_from;

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
