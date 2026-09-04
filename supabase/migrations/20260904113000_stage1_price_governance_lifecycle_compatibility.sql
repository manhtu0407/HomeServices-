begin;

create or replace function public.admin_transition_price_baseline(
  p_actor_id uuid,
  p_baseline_version_id uuid,
  p_expected_revision integer,
  p_action text,
  p_reason text
) returns setof public.price_baseline_versions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.price_baseline_versions%rowtype;
  v_head public.price_baseline_governance_heads%rowtype;
  v_active public.price_baselines%rowtype;
  v_from integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED';
  end if;

  select baseline_version.* into strict v_row
  from public.price_baseline_versions as baseline_version
  where baseline_version.id = p_baseline_version_id
  for update;

  select governance_head.* into strict v_head
  from public.price_baseline_governance_heads as governance_head
  where governance_head.service_problem_id = v_row.service_problem_id
    and governance_head.district_code = v_row.district_code
    and governance_head.complexity = v_row.complexity
  for update;

  if v_head.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'STALE_PRICE_BASELINE_REVISION';
  end if;
  v_from := v_head.active_version;

  if p_action = 'approve' then
    if v_row.status <> 'draft' or v_row.created_by = p_actor_id then
      raise exception using errcode = '42501', message = 'PRICE_BASELINE_MAKER_CHECKER_REQUIRED';
    end if;
    update public.price_baseline_versions as baseline_version
    set
      status = 'approved',
      approved_by = p_actor_id,
      approved_at = now(),
      updated_by = p_actor_id,
      updated_at = now()
    where baseline_version.id = p_baseline_version_id
    returning baseline_version.* into v_row;
  elsif p_action in ('publish', 'rollback') then
    if v_row.status not in ('approved', 'retired') or v_row.created_by = p_actor_id then
      raise exception using errcode = '42501', message = 'PRICE_BASELINE_MAKER_CHECKER_REQUIRED';
    end if;
    if not public.price_evidence_has_quorum(v_row.price_evidence) then
      raise exception using errcode = '23514', message = 'PRICE_EVIDENCE_QUORUM_REQUIRED';
    end if;

    update public.price_baseline_versions as baseline_version
    set
      status = 'retired',
      updated_by = p_actor_id,
      updated_at = now()
    where baseline_version.service_problem_id = v_row.service_problem_id
      and baseline_version.district_code = v_row.district_code
      and baseline_version.complexity = v_row.complexity
      and baseline_version.status = 'active';

    update public.price_baseline_versions as baseline_version
    set
      status = 'active',
      published_by = p_actor_id,
      published_at = now(),
      updated_by = p_actor_id,
      updated_at = now()
    where baseline_version.id = p_baseline_version_id
    returning baseline_version.* into v_row;

    update public.price_baseline_governance_heads as governance_head
    set active_version = v_row.version
    where governance_head.service_problem_id = v_row.service_problem_id
      and governance_head.district_code = v_row.district_code
      and governance_head.complexity = v_row.complexity;

    select baseline.* into v_active
    from public.price_baselines as baseline
    where baseline.service_problem_id = v_row.service_problem_id
      and baseline.district_code = v_row.district_code
      and baseline.complexity = v_row.complexity
      and baseline.lifecycle = 'active'
    for update;

    if found then
      update public.price_baselines as baseline
      set lifecycle = 'superseded', updated_at = now()
      where baseline.id = v_active.id;
    end if;

    insert into public.price_baselines(
      service_type,
      service_problem_id,
      district_code,
      complexity,
      price_min,
      price_max,
      source,
      version,
      price_evidence,
      lifecycle,
      effective_from,
      supersedes_id,
      created_by,
      updated_at
    ) values (
      v_row.service_type,
      v_row.service_problem_id,
      v_row.district_code,
      v_row.complexity,
      v_row.price_min,
      v_row.price_max,
      v_row.source,
      v_row.version,
      v_row.price_evidence,
      'active',
      now(),
      v_active.id,
      p_actor_id,
      now()
    );
  else
    raise exception using errcode = '22023', message = 'INVALID_PRICE_BASELINE_ACTION';
  end if;

  update public.price_baseline_governance_heads as governance_head
  set
    revision = governance_head.revision + 1,
    updated_by = p_actor_id,
    updated_at = now()
  where governance_head.service_problem_id = v_row.service_problem_id
    and governance_head.district_code = v_row.district_code
    and governance_head.complexity = v_row.complexity
  returning governance_head.* into v_head;

  insert into public.price_baseline_governance_audit(
    baseline_version_id,
    event,
    from_version,
    to_version,
    revision,
    actor_id,
    reason
  ) values (
    v_row.id,
    case p_action
      when 'approve' then 'approved'
      when 'rollback' then 'rolled_back'
      else 'published'
    end,
    v_from,
    v_row.version,
    v_head.revision,
    p_actor_id,
    btrim(p_reason)
  );

  return next v_row;
end;
$function$;

revoke all on function public.admin_transition_price_baseline(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_transition_price_baseline(uuid, uuid, integer, text, text)
  to service_role;

commit;
