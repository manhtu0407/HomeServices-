-- Keep learning candidate promotion atomic and retry-safe. The application
-- performs the contradiction gate; this service-role-only RPC re-validates the
-- durable candidate, serializes its scope, and commits the full audit write set.

create or replace function public.auto_promote_learning_candidate_atomic(
  p_candidate_id uuid
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_candidate public.learning_candidates%rowtype;
  v_existing record;
  v_rule_id uuid;
  v_rule_version integer;
  v_skill_id text;
  v_lock_key text;
  v_payload jsonb;
  v_suggestion_kind text;
begin
  if p_candidate_id is null then
    return query
      select false, 'INVALID_INPUT'::text, null::uuid, null::uuid, null::integer, null::text;
    return;
  end if;

  select candidate.*
    into v_candidate
    from public.learning_candidates as candidate
    where candidate.id = p_candidate_id
    for update;

  if not found then
    return query
      select false, 'CANDIDATE_NOT_FOUND'::text, p_candidate_id, null::uuid, null::integer, null::text;
    return;
  end if;

  if v_candidate.status = 'auto_promoted'::public.learning_candidate_status then
    select lifecycle.rule_id as id,
        (lifecycle.safe_metadata ->> 'rule_version')::integer as active_version
      into v_existing
      from public.kael_rule_lifecycle_log as lifecycle
      where lifecycle.candidate_id = p_candidate_id
        and lifecycle.rule_id is not null
        and lifecycle.next_state = 'active'
        and coalesce(lifecycle.safe_metadata ->> 'rule_version', '') ~ '^[1-9][0-9]*$'
      order by lifecycle.created_at asc, lifecycle.id asc
      limit 1;

    if not found then
      select rule.id, rule.active_version
        into v_existing
        from public.learning_rules as rule
        where rule.rule_type = v_candidate.candidate_type
          and rule.affected_service = v_candidate.affected_service
          and coalesce(rule.affected_problem, '') = coalesce(v_candidate.affected_problem, '')
          and coalesce(rule.affected_district, '') = coalesce(v_candidate.affected_district, '')
          and rule.status = 'active'::public.learning_rule_status
        order by rule.created_at asc, rule.id asc
        limit 1;
    end if;

    if found then
      return query
        select true, null::text, p_candidate_id, v_existing.id,
          v_existing.active_version, v_candidate.status::text;
    else
      return query
        select false, 'PROMOTED_RULE_NOT_FOUND'::text, p_candidate_id,
          null::uuid, null::integer, v_candidate.status::text;
    end if;
    return;
  end if;

  if v_candidate.status not in (
    'created'::public.learning_candidate_status,
    'pending_evidence'::public.learning_candidate_status,
    'evidence_gate_passed'::public.learning_candidate_status
  ) then
    return query
      select false, 'CANDIDATE_NOT_PROMOTABLE'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  if v_candidate.candidate_type not in ('price_prior_update', 'analysis_rule') then
    return query
      select false, 'UNSUPPORTED_CANDIDATE_TYPE'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  if v_candidate.affected_service is null
     or nullif(trim(coalesce(v_candidate.affected_problem, '')), '') is null
     or nullif(trim(coalesce(v_candidate.affected_district, '')), '') is null then
    return query
      select false, 'MISSING_SCOPE'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  if v_candidate.evidence_count < 5 or v_candidate.confidence < 0.6 then
    return query
      select false, 'EVIDENCE_GATE_NOT_PASSED'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_payload := v_candidate.suggested_payload;
  if jsonb_typeof(v_payload) is distinct from 'object'
     or v_payload->>'candidate_type' is distinct from v_candidate.candidate_type
     or jsonb_typeof(v_payload->'scope') is distinct from 'object'
     or v_payload#>>'{scope,service_type}' is distinct from v_candidate.affected_service::text
     or v_payload#>>'{scope,problem_slug}' is distinct from v_candidate.affected_problem
     or v_payload#>>'{scope,district_code}' is distinct from v_candidate.affected_district
     or jsonb_typeof(v_payload->'suggested') is distinct from 'object' then
    return query
      select false, 'INVALID_PAYLOAD'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text;
    return;
  end if;

  v_suggestion_kind := v_payload#>>'{suggested,kind}';
  if v_candidate.candidate_type = 'price_prior_update' then
    if jsonb_typeof(v_payload#>'{suggested,new_min}') is distinct from 'number'
       or jsonb_typeof(v_payload#>'{suggested,new_max}') is distinct from 'number'
       or (v_payload#>>'{suggested,new_min}')::numeric <= 0
       or (v_payload#>>'{suggested,new_max}')::numeric <= 0
       or (v_payload#>>'{suggested,new_max}')::numeric <
          (v_payload#>>'{suggested,new_min}')::numeric
       or coalesce(v_payload#>>'{suggested,direction}', '') not in (
         'underestimate', 'overestimate', 'noisy'
       ) then
      return query
        select false, 'UNSAFE_PRICE_PRIOR_PAYLOAD'::text, p_candidate_id,
          null::uuid, null::integer, v_candidate.status::text;
      return;
    end if;
    v_skill_id := 'LS1';
  else
    if coalesce(v_suggestion_kind, '') not in (
      'raise_complexity_prior', 'add_advisory', 'add_clarification'
    ) then
      return query
        select false, 'UNSAFE_ANALYSIS_RULE_PAYLOAD'::text, p_candidate_id,
          null::uuid, null::integer, v_candidate.status::text;
      return;
    end if;
    v_skill_id := 'LS2';
  end if;

  v_lock_key := concat_ws(
    '|',
    v_candidate.candidate_type,
    v_candidate.affected_service::text,
    v_candidate.affected_problem,
    v_candidate.affected_district
  );
  perform pg_advisory_xact_lock(hashtext(v_lock_key));

  select rule.id, rule.active_version
    into v_existing
    from public.learning_rules as rule
    where rule.rule_type = v_candidate.candidate_type
      and rule.affected_service = v_candidate.affected_service
      and coalesce(rule.affected_problem, '') = coalesce(v_candidate.affected_problem, '')
      and coalesce(rule.affected_district, '') = coalesce(v_candidate.affected_district, '')
      and rule.status = 'active'::public.learning_rule_status
    order by rule.created_at asc, rule.id asc
    limit 1
    for update;

  if found then
    v_rule_id := v_existing.id;
    v_rule_version := v_existing.active_version + 1;

    update public.learning_rules as rule
      set rule_payload = v_payload,
          confidence = v_candidate.confidence,
          evidence_count = v_candidate.evidence_count,
          active_version = v_rule_version
      where rule.id = v_rule_id;
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
      v_candidate.candidate_type,
      v_candidate.affected_service,
      v_candidate.affected_problem,
      v_candidate.affected_district,
      v_payload,
      v_candidate.confidence,
      v_candidate.evidence_count,
      'active'::public.learning_rule_status,
      1,
      true
    ) returning id, active_version into v_rule_id, v_rule_version;
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
    v_payload,
    'auto_promote_learning_candidate_atomic:' || p_candidate_id::text,
    'active'::public.learning_rule_status
  );

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
    p_candidate_id,
    v_skill_id,
    case
      when v_candidate.status = 'created'::public.learning_candidate_status
        then 'candidate'
      when v_candidate.status = 'pending_evidence'::public.learning_candidate_status
        then 'pending_evidence'
      else 'evidence_gate_check'
    end,
    'active',
    'auto_promote_learning_candidate_atomic',
    'system',
    jsonb_build_object(
      'candidate_type', v_candidate.candidate_type,
      'rule_version', v_rule_version
    )
  );

  update public.learning_candidates as candidate
    set status = 'auto_promoted'::public.learning_candidate_status,
        promoted_at = now(),
        audit_reason = 'gate_passed; rule=' || v_rule_id::text
          || '; version=' || v_rule_version::text
    where candidate.id = p_candidate_id;

  return query
    select true, null::text, p_candidate_id, v_rule_id,
      v_rule_version, 'auto_promoted'::text;
end;
$func$;

revoke execute on function public.auto_promote_learning_candidate_atomic(uuid) from public;
revoke execute on function public.auto_promote_learning_candidate_atomic(uuid) from anon;
revoke execute on function public.auto_promote_learning_candidate_atomic(uuid) from authenticated;
grant execute on function public.auto_promote_learning_candidate_atomic(uuid) to service_role;

comment on function public.auto_promote_learning_candidate_atomic(uuid) is
  'Atomically promotes one evidence-gated LS1 or LS2 candidate; service role only.';

-- Rollback: drop function public.auto_promote_learning_candidate_atomic(uuid).
