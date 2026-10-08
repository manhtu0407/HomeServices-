-- Auto-quote may rest on live research that met a stricter quorum of two high-trust sources,
-- not only on a governed baseline. Specific problems that were RFQ because no baseline
-- evidence existed move to auto-quote; broad `*-general` problems remain RFQ because their
-- scope is too wide for a problem-keyed price. The old policy version is retired, not edited.
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
      not (p_requirements ? 'allow_live_market_evidence')
      or jsonb_typeof(p_requirements -> 'allow_live_market_evidence') = 'boolean'
    )
    and (
      p_quote_mode <> 'kael_auto_quote'::public.service_quote_mode
      or (
        (p_requirements ->> 'requires_active_baseline')::boolean
        and (p_requirements ->> 'minimum_source_count')::integer >= 2
        and (p_requirements ->> 'minimum_high_trust_source_count')::integer >= 1
      )
      or (
        coalesce((p_requirements ->> 'allow_live_market_evidence')::boolean, false)
        and (p_requirements ->> 'minimum_source_count')::integer >= 2
        and (p_requirements ->> 'minimum_high_trust_source_count')::integer >= 2
      )
    );
$function$;

-- Publishing a live-evidence policy cannot be gated on a baseline that the policy does not
-- require; the quorum is checked per request at quote time instead.
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

create temporary table live_quote_policy_moves on commit drop as
select policy.*,
  (
    select max(existing.version) + 1
    from public.service_intake_policies as existing
    where existing.service_problem_id = policy.service_problem_id
  ) as next_version
from public.service_intake_policies as policy
join public.service_problems as problem on problem.id = policy.service_problem_id
where policy.status = 'active'
  and policy.quote_mode = 'rfq'::public.service_quote_mode
  and problem.slug not like '%-general'
  and problem.is_active;

update public.service_intake_policies as policy
set status = 'retired', updated_at = now()
from live_quote_policy_moves as moved
where policy.id = moved.id;

insert into public.service_intake_policies(
  service_problem_id, service_type, problem_slug, version, status, quote_mode,
  tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
  capability_requirements, evidence_requirements, reason,
  created_by, approved_by, approved_at, published_by, published_at, updated_by
)
select
  moved.service_problem_id,
  moved.service_type,
  moved.problem_slug,
  moved.next_version,
  'active',
  'kael_auto_quote'::public.service_quote_mode,
  moved.tier_a_fields,
  moved.tier_b_slots,
  moved.question_overrides,
  moved.safety_requirements,
  moved.capability_requirements,
  jsonb_build_object(
    'minimum_source_count', 2,
    'minimum_high_trust_source_count', 2,
    'requires_active_baseline', false,
    'allow_live_market_evidence', true
  ),
  'Auto-quote from live research with a two high-trust source quorum',
  null, null, now(), null, now(), null
from live_quote_policy_moves as moved;

update public.service_intake_policy_heads as head
set active_version = moved.next_version,
  revision = head.revision + 1,
  updated_at = now()
from live_quote_policy_moves as moved
where head.service_problem_id = moved.service_problem_id;

commit;
