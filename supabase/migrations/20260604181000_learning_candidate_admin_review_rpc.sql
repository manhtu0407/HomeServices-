-- =============================================================================
-- Plan.md Section 31 A4.2: admin review RPCs for manual Kael learning candidates.
--
-- These service-role-only functions are intentionally separate from
-- promote_learning_candidate(). Auto-promotion keeps rejecting LS5-LS7, while
-- admin approval can promote a locked, reviewed candidate after re-validating
-- the bounded learning scope and writing an auditable decision.
-- =============================================================================

create or replace function public.admin_approve_learning_candidate(
  p_candidate_id uuid,
  p_admin_id uuid,
  p_review_note text default null
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer,
  status text
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_candidate public.learning_candidates%rowtype;
  v_existing record;
  v_payload jsonb;
  v_rule_payload jsonb;
  v_skill_id text;
  v_target text;
  v_candidate_type text;
  v_effects text[] := array[]::text[];
  v_effect text;
  v_rule_id uuid;
  v_rule_version integer;
begin
  if p_candidate_id is null or p_admin_id is null then
    return query select false, 'INVALID_INPUT'::text, p_candidate_id, null::uuid, null::integer, null::text;
    return;
  end if;

  if not exists (
    select 1
      from public.profiles
      where id = p_admin_id
        and role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_candidate_id, null::uuid, null::integer, null::text;
    return;
  end if;

  select *
    into v_candidate
    from public.learning_candidates
    where id = p_candidate_id
    for update;

  if not found then
    return query select false, 'CANDIDATE_NOT_FOUND'::text, p_candidate_id, null::uuid, null::integer, null::text;
    return;
  end if;

  if v_candidate.status not in (
    'manual_review'::public.learning_candidate_status,
    'evidence_gate_passed'::public.learning_candidate_status
  ) then
    return query select false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_payload := coalesce(v_candidate.suggested_payload, '{}'::jsonb);
  if jsonb_typeof(v_payload) is distinct from 'object' then
    return query select false, 'INVALID_PAYLOAD'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_candidate_type := coalesce(nullif(v_payload->>'candidate_type', ''), v_candidate.candidate_type);
  if v_candidate_type <> v_candidate.candidate_type then
    return query select false, 'CANDIDATE_TYPE_MISMATCH'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_skill_id := coalesce(
    nullif(v_payload->>'skill_id', ''),
    case v_candidate_type
      when 'price_prior_update' then 'LS1'
      when 'service_knowledge_candidate' then 'LS5'
      when 'safety_pattern_candidate' then 'LS6'
      when 'decline_reason_candidate' then 'LS7'
      else null
    end
  );

  if v_skill_id not in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7') then
    return query select false, 'UNKNOWN_SKILL'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  if v_candidate_type not in (
    'price_prior_update',
    'analysis_rule',
    'service_knowledge_candidate',
    'safety_pattern_candidate',
    'decline_reason_candidate'
  ) then
    return query select false, 'UNSUPPORTED_CANDIDATE_TYPE'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_target := coalesce(
    nullif(v_payload->>'target', ''),
    case v_candidate_type
      when 'price_prior_update' then 'price_prior'
      when 'service_knowledge_candidate' then 'advisory_pattern'
      when 'safety_pattern_candidate' then 'detection_pattern'
      when 'decline_reason_candidate' then 'intent_category'
      else 'analysis_prompt'
    end
  );

  if v_target not in (
    'analysis_prompt',
    'price_prior',
    'clarification_pattern',
    'advisory_pattern',
    'detection_pattern',
    'intent_category'
  ) then
    return query select false, 'TARGET_NOT_ALLOWED'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  if jsonb_typeof(v_payload->'effects') = 'array' then
    select coalesce(array_agg(value), array[]::text[])
      into v_effects
      from jsonb_array_elements_text(v_payload->'effects') as effect(value);
  end if;

  foreach v_effect in array coalesce(v_effects, array[]::text[]) loop
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
      return query select false, 'FORBIDDEN_EFFECT'::text, p_candidate_id, null::uuid, null::integer, v_candidate.status::text;
      return;
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('admin_approve_learning_candidate:' || p_candidate_id::text));

  v_rule_payload := jsonb_strip_nulls(jsonb_build_object(
    'candidate_type', v_candidate_type,
    'target', v_target,
    'skill_id', v_skill_id,
    'effects', to_jsonb(coalesce(v_effects, array[]::text[])),
    'suggested', coalesce(v_payload->'suggested', v_payload),
    'source_candidate_id', p_candidate_id,
    'approved_by_admin_id', p_admin_id,
    'approved_at', now(),
    'review_note_present', nullif(trim(coalesce(p_review_note, '')), '') is not null
  ));

  select lr.id, lr.active_version into v_existing
    from public.learning_rules as lr
    where lr.rule_type = v_candidate_type
      and coalesce(lr.affected_service::text, '') = coalesce(v_candidate.affected_service::text, '')
      and coalesce(lr.affected_problem, '') = coalesce(v_candidate.affected_problem, '')
      and coalesce(lr.affected_district, '') = coalesce(v_candidate.affected_district, '')
      and lr.status = 'active'::public.learning_rule_status
    order by lr.created_at asc
    limit 1
    for update;

  if found then
    v_rule_id := v_existing.id;
    v_rule_version := v_existing.active_version + 1;

    update public.learning_rules
      set rule_payload = v_rule_payload,
          confidence = v_candidate.confidence,
          evidence_count = v_candidate.evidence_count,
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
      v_candidate_type,
      v_candidate.affected_service,
      v_candidate.affected_problem,
      v_candidate.affected_district,
      v_rule_payload,
      v_candidate.confidence,
      v_candidate.evidence_count,
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
    v_rule_payload,
    'admin_approve_learning_candidate:' || p_candidate_id::text,
    'active'::public.learning_rule_status
  );

  insert into public.kael_rule_lifecycle_log (
    rule_id,
    candidate_id,
    skill_id,
    previous_state,
    next_state,
    transition_reason,
    actor_id,
    actor_role,
    safe_metadata
  ) values (
    v_rule_id,
    p_candidate_id,
    v_skill_id,
    case
      when v_candidate.status = 'manual_review'::public.learning_candidate_status then 'manual_review'
      else 'evidence_gate_check'
    end,
    'active',
    'admin_approve_learning_candidate',
    p_admin_id,
    'admin',
    jsonb_build_object(
      'candidate_type', v_candidate_type,
      'target', v_target,
      'review_note_present', nullif(trim(coalesce(p_review_note, '')), '') is not null
    )
  );

  update public.learning_candidates
    set status = 'auto_promoted'::public.learning_candidate_status,
        promoted_at = now(),
        audit_reason = 'admin_approved; rule=' || v_rule_id::text
          || '; version=' || v_rule_version::text
    where id = p_candidate_id;

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
    p_admin_id,
    'admin',
    'kael_learning_admin_review',
    'approve',
    'learning_candidate',
    'allow',
    'admin_approved_learning_candidate',
    jsonb_build_object(
      'candidate_id', p_candidate_id,
      'rule_id', v_rule_id,
      'rule_version', v_rule_version,
      'skill_id', v_skill_id,
      'target', v_target,
      'candidate_type', v_candidate_type
    )
  );

  return query select true, null::text, p_candidate_id, v_rule_id, v_rule_version, 'auto_promoted'::text;
end;
$func$;

create or replace function public.admin_reject_learning_candidate(
  p_candidate_id uuid,
  p_admin_id uuid,
  p_reason text
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  status text
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_candidate public.learning_candidates%rowtype;
  v_payload jsonb;
  v_skill_id text;
  v_reason_code text;
begin
  if p_candidate_id is null or p_admin_id is null or nullif(trim(coalesce(p_reason, '')), '') is null then
    return query select false, 'INVALID_INPUT'::text, p_candidate_id, null::text;
    return;
  end if;

  if not exists (
    select 1
      from public.profiles
      where id = p_admin_id
        and role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_candidate_id, null::text;
    return;
  end if;

  select *
    into v_candidate
    from public.learning_candidates
    where id = p_candidate_id
    for update;

  if not found then
    return query select false, 'CANDIDATE_NOT_FOUND'::text, p_candidate_id, null::text;
    return;
  end if;

  if v_candidate.status not in (
    'manual_review'::public.learning_candidate_status,
    'evidence_gate_passed'::public.learning_candidate_status,
    'pending_evidence'::public.learning_candidate_status
  ) then
    return query select false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id, v_candidate.status::text;
    return;
  end if;

  v_payload := coalesce(v_candidate.suggested_payload, '{}'::jsonb);
  v_skill_id := coalesce(
    nullif(v_payload->>'skill_id', ''),
    case v_candidate.candidate_type
      when 'price_prior_update' then 'LS1'
      when 'service_knowledge_candidate' then 'LS5'
      when 'safety_pattern_candidate' then 'LS6'
      when 'decline_reason_candidate' then 'LS7'
      else 'LS2'
    end
  );
  if v_skill_id not in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7') then
    v_skill_id := 'LS2';
  end if;

  v_reason_code := lower(regexp_replace(trim(p_reason), '[^a-zA-Z0-9_]+', '_', 'g'));
  v_reason_code := left(coalesce(nullif(v_reason_code, ''), 'admin_rejected_learning_candidate'), 80);

  perform pg_advisory_xact_lock(hashtext('admin_reject_learning_candidate:' || p_candidate_id::text));

  insert into public.kael_rule_lifecycle_log (
    candidate_id,
    skill_id,
    previous_state,
    next_state,
    transition_reason,
    actor_id,
    actor_role,
    safe_metadata
  ) values (
    p_candidate_id,
    v_skill_id,
    case
      when v_candidate.status = 'manual_review'::public.learning_candidate_status then 'manual_review'
      when v_candidate.status = 'evidence_gate_passed'::public.learning_candidate_status then 'evidence_gate_check'
      else 'pending_evidence'
    end,
    'rejected',
    'admin_reject_learning_candidate',
    p_admin_id,
    'admin',
    jsonb_build_object(
      'candidate_type', v_candidate.candidate_type,
      'reason_code', v_reason_code
    )
  );

  insert into public.kael_rule_lifecycle_log (
    candidate_id,
    skill_id,
    previous_state,
    next_state,
    transition_reason,
    actor_id,
    actor_role,
    safe_metadata
  ) values (
    p_candidate_id,
    v_skill_id,
    'rejected',
    'archived',
    'admin_archive_rejected_learning_candidate',
    p_admin_id,
    'admin',
    jsonb_build_object(
      'candidate_type', v_candidate.candidate_type,
      'reason_code', v_reason_code
    )
  );

  update public.learning_candidates
    set status = 'archived'::public.learning_candidate_status,
        audit_reason = 'admin_rejected; reason_code=' || v_reason_code
    where id = p_candidate_id;

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
    p_admin_id,
    'admin',
    'kael_learning_admin_review',
    'reject',
    'learning_candidate',
    'allow',
    v_reason_code,
    jsonb_build_object(
      'candidate_id', p_candidate_id,
      'skill_id', v_skill_id,
      'candidate_type', v_candidate.candidate_type,
      'final_status', 'archived'
    )
  );

  return query select true, null::text, p_candidate_id, 'archived'::text;
end;
$func$;

revoke execute on function public.admin_approve_learning_candidate(uuid, uuid, text) from public;
revoke execute on function public.admin_approve_learning_candidate(uuid, uuid, text) from anon;
revoke execute on function public.admin_approve_learning_candidate(uuid, uuid, text) from authenticated;
grant execute on function public.admin_approve_learning_candidate(uuid, uuid, text) to service_role;

revoke execute on function public.admin_reject_learning_candidate(uuid, uuid, text) from public;
revoke execute on function public.admin_reject_learning_candidate(uuid, uuid, text) from anon;
revoke execute on function public.admin_reject_learning_candidate(uuid, uuid, text) from authenticated;
grant execute on function public.admin_reject_learning_candidate(uuid, uuid, text) to service_role;

comment on function public.admin_approve_learning_candidate(uuid, uuid, text) is
  'Plan.md Section 31 A4.2: service-role-only admin approval for manual Kael learning candidates.';
comment on function public.admin_reject_learning_candidate(uuid, uuid, text) is
  'Plan.md Section 31 A4.2: service-role-only admin rejection/archive for manual Kael learning candidates.';
