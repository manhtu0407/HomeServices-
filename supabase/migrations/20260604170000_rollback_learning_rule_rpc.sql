-- =============================================================================
-- Plan.md Section 31 A3.4: atomic Kael learning rule rollback RPC.
--
-- Monitoring code decides whether a rule has degraded. The actual money-impacting
-- status change stays in one service-role-only database transaction with
-- lifecycle audit rows.
-- =============================================================================

create or replace function public.rollback_learning_rule(
  p_rule_id uuid,
  p_skill_id text,
  p_reason text default 'monitorLearningRules',
  p_safe_metadata jsonb default '{}'::jsonb
) returns table (
  ok boolean,
  error_code text,
  rule_id uuid
) language plpgsql security definer
set search_path = public, pg_catalog
as $func$
declare
  v_rule record;
  v_reason text;
begin
  if p_skill_id not in ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7') then
    return query select false, 'UNKNOWN_SKILL'::text, null::uuid;
    return;
  end if;

  if p_rule_id is null then
    return query select false, 'MISSING_RULE_ID'::text, null::uuid;
    return;
  end if;

  if jsonb_typeof(p_safe_metadata) is distinct from 'object' then
    return query select false, 'INVALID_METADATA'::text, null::uuid;
    return;
  end if;

  v_reason := left(coalesce(nullif(p_reason, ''), 'monitorLearningRules'), 120);

  select id, status, active_version, rollback_available into v_rule
    from public.learning_rules
    where id = p_rule_id
    for update;

  if not found then
    return query select false, 'RULE_NOT_FOUND'::text, null::uuid;
    return;
  end if;

  if v_rule.status <> 'active'::public.learning_rule_status then
    return query select false, 'RULE_NOT_ACTIVE'::text, p_rule_id;
    return;
  end if;

  if v_rule.rollback_available is not true then
    return query select false, 'ROLLBACK_DISABLED'::text, p_rule_id;
    return;
  end if;

  update public.learning_rules
    set status = 'rolled_back'::public.learning_rule_status,
        rollback_available = false
    where id = p_rule_id;

  update public.learning_rule_versions as version_row
    set status = 'rolled_back'::public.learning_rule_status
    where version_row.rule_id = p_rule_id
      and version_row.version = v_rule.active_version;

  insert into public.kael_rule_lifecycle_log (
    rule_id,
    skill_id,
    previous_state,
    next_state,
    actor_role,
    transition_reason,
    safe_metadata
  ) values
    (
      p_rule_id,
      p_skill_id,
      'active',
      'monitoring',
      'system',
      v_reason || ':monitoring',
      p_safe_metadata
    ),
    (
      p_rule_id,
      p_skill_id,
      'monitoring',
      'degraded',
      'system',
      v_reason || ':degraded',
      p_safe_metadata
    ),
    (
      p_rule_id,
      p_skill_id,
      'degraded',
      'rolled_back',
      'system',
      v_reason || ':rolled_back',
      p_safe_metadata
    );

  return query select true, null::text, p_rule_id;
end;
$func$;

revoke execute on function public.rollback_learning_rule(uuid, text, text, jsonb) from public;
revoke execute on function public.rollback_learning_rule(uuid, text, text, jsonb) from anon;
revoke execute on function public.rollback_learning_rule(uuid, text, text, jsonb) from authenticated;
grant execute on function public.rollback_learning_rule(uuid, text, text, jsonb) to service_role;

comment on function public.rollback_learning_rule(uuid, text, text, jsonb) is
  'Plan.md Section 31 A3.4: service-role-only atomic rollback of degraded Kael learning rules with lifecycle audit rows.';
