begin;

create or replace function public.service_intake_evidence_requirements_valid(
  p_quote_mode public.service_quote_mode,
  p_requirements jsonb
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select jsonb_typeof(p_requirements) = 'object'
    and jsonb_typeof(p_requirements -> 'minimum_source_count') = 'number'
    and coalesce(p_requirements ->> 'minimum_source_count', '') ~ '^[0-9]+$'
    and (p_requirements ->> 'minimum_source_count')::integer between 0 and 50
    and jsonb_typeof(p_requirements -> 'minimum_high_trust_source_count') = 'number'
    and coalesce(p_requirements ->> 'minimum_high_trust_source_count', '') ~ '^[0-9]+$'
    and (p_requirements ->> 'minimum_high_trust_source_count')::integer between 0 and 50
    and (p_requirements ->> 'minimum_high_trust_source_count')::integer
      <= (p_requirements ->> 'minimum_source_count')::integer
    and jsonb_typeof(p_requirements -> 'requires_active_baseline') = 'boolean'
    and (
      p_quote_mode <> 'kael_auto_quote'::public.service_quote_mode
      or (
        (p_requirements ->> 'requires_active_baseline')::boolean
        and (p_requirements ->> 'minimum_source_count')::integer >= 2
        and (p_requirements ->> 'minimum_high_trust_source_count')::integer >= 1
      )
    );
$function$;

alter table public.service_intake_policies
  add column evidence_requirements jsonb;

update public.service_intake_policies
set evidence_requirements = case
  when quote_mode = 'kael_auto_quote'::public.service_quote_mode then
    '{"minimum_source_count":2,"minimum_high_trust_source_count":1,"requires_active_baseline":true}'::jsonb
  else
    '{"minimum_source_count":0,"minimum_high_trust_source_count":0,"requires_active_baseline":false}'::jsonb
end;

alter table public.service_intake_policies
  alter column evidence_requirements set not null,
  add constraint service_intake_policies_evidence_requirements_check
    check (public.service_intake_evidence_requirements_valid(quote_mode, evidence_requirements));

create or replace function public.protect_service_intake_policy_content()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if row(old.service_problem_id, old.service_type, old.problem_slug, old.version, old.quote_mode,
      old.tier_a_fields, old.tier_b_slots, old.question_overrides, old.safety_requirements,
      old.capability_requirements, old.evidence_requirements, old.reason, old.created_by, old.created_at)
    is distinct from
    row(new.service_problem_id, new.service_type, new.problem_slug, new.version, new.quote_mode,
      new.tier_a_fields, new.tier_b_slots, new.question_overrides, new.safety_requirements,
      new.capability_requirements, new.evidence_requirements, new.reason, new.created_by, new.created_at)
  then
    raise exception using errcode = '23514', message = 'INTAKE_POLICY_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$function$;

create or replace function public.service_problem_has_policy_price_evidence(
  p_problem_id uuid,
  p_requirements jsonb
) returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when not coalesce((p_requirements ->> 'requires_active_baseline')::boolean, false) then true
    else exists (
      select 1
      from public.price_baselines as baseline
      where baseline.service_problem_id = p_problem_id
        and public.price_evidence_has_quorum(baseline.price_evidence)
        and (
          select count(distinct source.value ->> 'domain')
          from jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
        ) >= (p_requirements ->> 'minimum_source_count')::integer
        and (
          select count(distinct source.value ->> 'domain')
          from jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
          join public.source_trust_registry as registry
            on registry.domain = source.value ->> 'domain'
          where registry.is_active
            and registry.integrity_flag
            and registry.auto_tier <= 2
        ) >= (p_requirements ->> 'minimum_high_trust_source_count')::integer
    )
  end;
$function$;

create or replace function public.admin_draft_service_intake_policy(
  p_actor_id uuid,
  p_problem_id uuid,
  p_expected_revision integer,
  p_quote_mode public.service_quote_mode,
  p_tier_a_fields jsonb,
  p_tier_b_slots jsonb,
  p_question_overrides jsonb,
  p_safety_requirements jsonb,
  p_capability_requirements jsonb,
  p_evidence_requirements jsonb,
  p_reason text
) returns setof public.service_intake_policies
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_problem public.service_problems%rowtype;
  v_head public.service_intake_policy_heads%rowtype;
  v_row public.service_intake_policies%rowtype;
  v_version integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED';
  end if;
  if not public.service_intake_evidence_requirements_valid(p_quote_mode, p_evidence_requirements) then
    raise exception using errcode = '23514', message = 'INTAKE_POLICY_EVIDENCE_REQUIREMENTS_INVALID';
  end if;
  select * into strict v_problem
  from public.service_problems
  where id = p_problem_id and is_active;
  insert into public.service_intake_policy_heads(service_problem_id, service_type, problem_slug)
  values (v_problem.id, v_problem.service_type, v_problem.slug)
  on conflict do nothing;
  select * into strict v_head
  from public.service_intake_policy_heads
  where service_problem_id = p_problem_id
  for update;
  if v_head.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'STALE_POLICY_REVISION';
  end if;
  perform public.assert_intake_policy_floor(
    v_problem.service_type,
    p_tier_a_fields,
    p_tier_b_slots,
    p_question_overrides,
    p_safety_requirements,
    p_capability_requirements
  );
  select coalesce(max(version), 0) + 1 into v_version
  from public.service_intake_policies
  where service_problem_id = p_problem_id;
  insert into public.service_intake_policies(
    service_problem_id, service_type, problem_slug, version, quote_mode, tier_a_fields,
    tier_b_slots, question_overrides, safety_requirements, capability_requirements,
    evidence_requirements, reason, created_by, updated_by
  ) values (
    v_problem.id, v_problem.service_type, v_problem.slug, v_version, p_quote_mode,
    p_tier_a_fields, p_tier_b_slots, p_question_overrides, p_safety_requirements,
    p_capability_requirements, p_evidence_requirements, btrim(p_reason), p_actor_id, p_actor_id
  ) returning * into v_row;
  update public.service_intake_policy_heads
  set revision = revision + 1,
    updated_by = p_actor_id,
    updated_at = now()
  where service_problem_id = p_problem_id
  returning * into v_head;
  insert into public.service_intake_policy_audit(
    policy_id, service_problem_id, event, from_version, to_version, revision, actor_id, reason
  ) values (
    v_row.id, p_problem_id, 'drafted', v_head.active_version, v_version,
    v_head.revision, p_actor_id, btrim(p_reason)
  );
  return next v_row;
end;
$function$;

create or replace function public.admin_draft_service_intake_policy(
  p_actor_id uuid,
  p_problem_id uuid,
  p_expected_revision integer,
  p_quote_mode public.service_quote_mode,
  p_tier_a_fields jsonb,
  p_tier_b_slots jsonb,
  p_question_overrides jsonb,
  p_safety_requirements jsonb,
  p_capability_requirements jsonb,
  p_reason text
) returns setof public.service_intake_policies
language sql
security definer
set search_path = ''
as $function$
  select *
  from public.admin_draft_service_intake_policy(
    p_actor_id,
    p_problem_id,
    p_expected_revision,
    p_quote_mode,
    p_tier_a_fields,
    p_tier_b_slots,
    p_question_overrides,
    p_safety_requirements,
    p_capability_requirements,
    case
      when p_quote_mode = 'kael_auto_quote'::public.service_quote_mode then
        '{"minimum_source_count":2,"minimum_high_trust_source_count":1,"requires_active_baseline":true}'::jsonb
      else
        '{"minimum_source_count":0,"minimum_high_trust_source_count":0,"requires_active_baseline":false}'::jsonb
    end,
    p_reason
  );
$function$;

create or replace function public.admin_transition_service_intake_policy(
  p_actor_id uuid,
  p_policy_id uuid,
  p_expected_revision integer,
  p_action text,
  p_reason text
) returns setof public.service_intake_policies
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.service_intake_policies%rowtype;
  v_head public.service_intake_policy_heads%rowtype;
  v_from integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED';
  end if;
  select * into strict v_policy
  from public.service_intake_policies
  where id = p_policy_id
  for update;
  select * into strict v_head
  from public.service_intake_policy_heads
  where service_problem_id = v_policy.service_problem_id
  for update;
  if v_head.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'STALE_POLICY_REVISION';
  end if;
  v_from := v_head.active_version;
  if p_action = 'approve' then
    if v_policy.status <> 'draft' or v_policy.created_by = p_actor_id then
      raise exception using errcode = '42501', message = 'POLICY_MAKER_CHECKER_REQUIRED';
    end if;
    update public.service_intake_policies
    set status = 'approved', approved_by = p_actor_id, approved_at = now(),
      updated_by = p_actor_id, updated_at = now()
    where id = p_policy_id
    returning * into v_policy;
  elsif p_action in ('publish', 'rollback') then
    if v_policy.status not in ('approved', 'retired') or v_policy.created_by = p_actor_id then
      raise exception using errcode = '42501', message = 'POLICY_MAKER_CHECKER_REQUIRED';
    end if;
    if not public.service_problem_has_policy_price_evidence(
      v_policy.service_problem_id,
      v_policy.evidence_requirements
    ) then
      raise exception using errcode = '23514', message = 'POLICY_PRICE_EVIDENCE_REQUIREMENTS_UNMET';
    end if;
    update public.service_intake_policies
    set status = 'retired', updated_by = p_actor_id, updated_at = now()
    where service_problem_id = v_policy.service_problem_id and status = 'active';
    update public.service_intake_policies
    set status = 'active', published_by = p_actor_id, published_at = now(),
      updated_by = p_actor_id, updated_at = now()
    where id = p_policy_id
    returning * into v_policy;
    update public.service_intake_policy_heads
    set active_version = v_policy.version
    where service_problem_id = v_policy.service_problem_id;
  else
    raise exception using errcode = '22023', message = 'INVALID_POLICY_ACTION';
  end if;
  update public.service_intake_policy_heads
  set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
  where service_problem_id = v_policy.service_problem_id
  returning * into v_head;
  insert into public.service_intake_policy_audit(
    policy_id, service_problem_id, event, from_version, to_version, revision, actor_id, reason
  ) values (
    v_policy.id,
    v_policy.service_problem_id,
    case p_action when 'approve' then 'approved' when 'rollback' then 'rolled_back' else 'published' end,
    v_from,
    v_policy.version,
    v_head.revision,
    p_actor_id,
    btrim(p_reason)
  );
  return next v_policy;
end;
$function$;

create or replace function public.admin_preview_service_intake_policy_v2(
  p_problem_id uuid,
  p_version integer default null
) returns table(
  policy_id uuid,
  service_type public.service_type,
  problem_slug text,
  version integer,
  revision integer,
  quote_mode public.service_quote_mode,
  tier_a_fields jsonb,
  tier_b_slots jsonb,
  question_overrides jsonb,
  safety_requirements jsonb,
  capability_requirements jsonb,
  evidence_requirements jsonb,
  status public.admin_governance_status
)
language sql
security definer
set search_path = ''
stable
as $function$
  select policy.id, policy.service_type, policy.problem_slug, policy.version, head.revision,
    policy.quote_mode, policy.tier_a_fields, policy.tier_b_slots, policy.question_overrides,
    policy.safety_requirements, policy.capability_requirements, policy.evidence_requirements,
    policy.status
  from public.service_intake_policies as policy
  join public.service_intake_policy_heads as head using (service_problem_id)
  where policy.service_problem_id = p_problem_id
    and ((p_version is null and policy.status = 'active') or policy.version = p_version)
  order by policy.version desc
  limit 1;
$function$;

revoke all on function public.service_intake_evidence_requirements_valid(public.service_quote_mode,jsonb),
  public.service_problem_has_policy_price_evidence(uuid,jsonb),
  public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_transition_service_intake_policy(uuid,uuid,integer,text,text),
  public.admin_preview_service_intake_policy_v2(uuid,integer)
from public, anon, authenticated;

grant execute on function public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_transition_service_intake_policy(uuid,uuid,integer,text,text),
  public.admin_preview_service_intake_policy_v2(uuid,integer)
to service_role;

grant execute on function public.service_intake_evidence_requirements_valid(public.service_quote_mode,jsonb),
  public.service_problem_has_policy_price_evidence(uuid,jsonb)
to service_role;

comment on column public.service_intake_policies.evidence_requirements is
  'Immutable per-version source-count, high-trust-source, and active-baseline requirements. Auto-quote policies fail closed unless the governed evidence remains available.';
comment on function public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,text) is
  'Expand-window compatibility wrapper that supplies conservative evidence requirements for older Edge bundles.';

commit;
