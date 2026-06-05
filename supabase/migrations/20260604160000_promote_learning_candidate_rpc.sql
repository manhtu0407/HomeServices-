-- =============================================================================
-- Plan.md §31 A1.3: atomic Kael learning promotion RPC.
--
-- Edge batch processing may only promote a validated learning candidate through
-- this service-role RPC. The function re-validates the AI-facing scope boundary
-- server-side and writes candidate -> active rule -> immutable version in one
-- database transaction.
-- =============================================================================

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

  return query select true, null::text, v_candidate_id, v_rule_id, v_rule_version;
end;
$func$;

revoke execute on function public.promote_learning_candidate(
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  public.service_type,
  text,
  text,
  numeric,
  integer,
  uuid,
  text,
  uuid,
  text
) from public;
revoke execute on function public.promote_learning_candidate(
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  public.service_type,
  text,
  text,
  numeric,
  integer,
  uuid,
  text,
  uuid,
  text
) from anon;
revoke execute on function public.promote_learning_candidate(
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  public.service_type,
  text,
  text,
  numeric,
  integer,
  uuid,
  text,
  uuid,
  text
) from authenticated;
grant execute on function public.promote_learning_candidate(
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  public.service_type,
  text,
  text,
  numeric,
  integer,
  uuid,
  text,
  uuid,
  text
) to service_role;

comment on function public.promote_learning_candidate(
  text,
  text,
  text,
  text[],
  jsonb,
  jsonb,
  public.service_type,
  text,
  text,
  numeric,
  integer,
  uuid,
  text,
  uuid,
  text
) is
  'Plan.md §31 A1.3: service-role-only atomic promotion from Kael learning candidate to active rule and version.';
