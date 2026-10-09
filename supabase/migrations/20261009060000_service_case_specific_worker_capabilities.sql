begin;

-- A service capability list is the valid-key catalog for that service. Each case policy
-- selects only the skills required by its confirmed work scope.
comment on column public.service_intake_policy_floors.capability_requirements is
  'Allowed capability keys for this service; each problem policy selects its own required subset.';

alter table public.service_intake_policy_audit
  alter column actor_id drop not null;

alter table public.service_intake_policy_audit
  add column actor_kind text not null default 'admin'
    check (actor_kind in ('admin', 'migration'));

create or replace function public.assert_intake_policy_floor(
  p_service_type public.service_type,
  p_tier_a_fields jsonb,
  p_tier_b_slots jsonb,
  p_question_overrides jsonb,
  p_safety_requirements jsonb,
  p_capability_requirements jsonb
) returns void language plpgsql security definer set search_path = '' as $func$
declare v_floor public.service_intake_policy_floors%rowtype;
begin
  select * into strict v_floor from public.service_intake_policy_floors where service_type = p_service_type;
  if jsonb_typeof(p_tier_a_fields) <> 'array'
    or jsonb_typeof(p_tier_b_slots) <> 'array'
    or jsonb_typeof(p_question_overrides) <> 'object'
    or jsonb_typeof(p_safety_requirements) <> 'array'
    or jsonb_typeof(p_capability_requirements) <> 'array'
    or not p_tier_a_fields @> v_floor.tier_a_fields
    or not p_safety_requirements @> v_floor.safety_requirements
    or not v_floor.capability_requirements @> p_capability_requirements then
    raise exception using errcode = '23514', message = 'INTAKE_POLICY_FLOOR_VIOLATION';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tier_b_slots) slot
    where jsonb_typeof(slot) <> 'object'
      or nullif(btrim(slot ->> 'key'), '') is null
      or jsonb_typeof(slot -> 'enabled') <> 'boolean'
      or jsonb_typeof(slot -> 'required_for_quote') <> 'boolean'
      or nullif(btrim(p_question_overrides -> (slot ->> 'key') ->> 'vi'), '') is null
      or nullif(btrim(p_question_overrides -> (slot ->> 'key') ->> 'en'), '') is null
  ) then
    raise exception using errcode = '23514', message = 'INTAKE_POLICY_BILINGUAL_QUESTION_REQUIRED';
  end if;
end;
$func$;

create temporary table case_worker_capability_requirements (
  service_type public.service_type not null,
  problem_slug text not null,
  capability_requirements text[] not null,
  primary key (service_type, problem_slug)
) on commit drop;

insert into case_worker_capability_requirements(service_type, problem_slug, capability_requirements) values
  ('electrical', 'electrical-general', array['electrical_fault_isolation']),
  ('electrical', 'power_outage_one_room', array['electrical_fault_isolation']),
  ('electrical', 'power_outage_whole_unit', array['electrical_fault_isolation', 'fixed_wiring_and_panel_safety']),
  ('electrical', 'outlet_or_switch_broken', array['electrical_fault_isolation', 'device_repair_or_replacement']),
  ('electrical', 'breaker_trip', array['electrical_fault_isolation', 'fixed_wiring_and_panel_safety']),
  ('electrical', 'flickering_light', array['electrical_fault_isolation', 'device_repair_or_replacement']),
  ('electrical', 'install_device', array['electrical_installation']),
  ('electrical', 'other_electrical', array['electrical_fault_isolation']),
  ('plumbing', 'plumbing-general', array['leak_and_flow_diagnosis']),
  ('plumbing', 'pipe_leak', array['leak_and_flow_diagnosis', 'pipe_and_fixture_repair']),
  ('plumbing', 'clogged_drain_or_sink', array['drain_clearing']),
  ('plumbing', 'toilet_flush_issue', array['leak_and_flow_diagnosis', 'pipe_and_fixture_repair']),
  ('plumbing', 'faucet_broken', array['leak_and_flow_diagnosis', 'pipe_and_fixture_repair']),
  ('plumbing', 'weak_water_pressure', array['leak_and_flow_diagnosis']),
  ('plumbing', 'install_or_replace_fixture', array['fixture_installation']),
  ('plumbing', 'other_plumbing', array['leak_and_flow_diagnosis']),
  ('cleaning', 'cleaning-general', array['home_cleaning']),
  ('cleaning', 'standard_home_cleaning', array['home_cleaning']),
  ('cleaning', 'kitchen_deep_clean', array['deep_cleaning']),
  ('cleaning', 'bathroom_deep_clean', array['deep_cleaning']),
  ('cleaning', 'deep_cleaning', array['deep_cleaning']),
  ('cleaning', 'post_repair_cleaning', array['deep_cleaning', 'surface_safe_cleaning']),
  ('cleaning', 'window_cleaning', array['surface_safe_cleaning']),
  ('cleaning', 'other_cleaning', array['home_cleaning']),
  ('hvac', 'hvac-general', array['hvac_fault_diagnosis']),
  ('hvac', 'routine_hvac_cleaning', array['hvac_cleaning']),
  ('hvac', 'no_cooling', array['hvac_fault_diagnosis']),
  ('hvac', 'weak_cooling', array['hvac_fault_diagnosis']),
  ('hvac', 'water_leak', array['hvac_fault_diagnosis']),
  ('hvac', 'unusual_noise', array['hvac_fault_diagnosis']),
  ('hvac', 'error_code', array['hvac_fault_diagnosis']),
  ('hvac', 'other_hvac', array['hvac_fault_diagnosis']),
  ('upholstery', 'upholstery-general', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning']),
  ('upholstery', 'sofa_cleaning', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning']),
  ('upholstery', 'mattress_cleaning', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning']),
  ('upholstery', 'curtain_cleaning', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning']),
  ('upholstery', 'carpet_cleaning', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning']),
  ('upholstery', 'stain_treatment', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'fabric_safe_extraction_cleaning', 'stain_and_odor_treatment']),
  ('upholstery', 'odor_or_mold', array['upholstery_material_identification', 'colorfastness_and_patch_testing', 'stain_and_odor_treatment']),
  ('upholstery', 'other_upholstery', array['upholstery_material_identification', 'colorfastness_and_patch_testing']),
  ('handyman', 'handyman-general', array['minor_home_repairs']),
  ('handyman', 'drill_or_mount_shelf', array['safe_drilling_and_mounting']),
  ('handyman', 'install_curtain_rod', array['safe_drilling_and_mounting', 'small_fixture_and_furniture_installation']),
  ('handyman', 'mount_tv_or_furniture', array['safe_drilling_and_mounting', 'small_fixture_and_furniture_installation']),
  ('handyman', 'install_small_fixture', array['small_fixture_and_furniture_installation']),
  ('handyman', 'repair_hinge_or_handle', array['minor_home_repairs']),
  ('handyman', 'replace_cabinet_hinges', array['minor_home_repairs']),
  ('handyman', 'install_bathroom_fixture', array['small_fixture_and_furniture_installation']),
  ('handyman', 'other_handyman', array['minor_home_repairs']);

do $check$
begin
  if exists (
    select 1 from public.service_problems problem
    where problem.is_active
      and not exists (
        select 1 from case_worker_capability_requirements mapped
        where mapped.service_type = problem.service_type and mapped.problem_slug = problem.slug
      )
  ) or exists (
    select 1 from case_worker_capability_requirements mapped
    where not exists (
      select 1 from public.service_problems problem
      where problem.is_active
        and problem.service_type = mapped.service_type
        and problem.slug = mapped.problem_slug
    )
  ) then
    raise exception 'case capability mapping must cover exactly the active service taxonomy';
  end if;
  if exists (
    select 1
    from case_worker_capability_requirements mapped
    join public.service_intake_policy_floors floor using (service_type)
    where not floor.capability_requirements @> to_jsonb(mapped.capability_requirements)
  ) then
    raise exception 'case capability mapping contains a key outside its service catalog';
  end if;
end;
$check$;

create temporary table case_worker_policy_moves on commit drop as
select policy.*,
  mapped.capability_requirements as case_capability_requirements,
  (select max(version) + 1 from public.service_intake_policies existing
   where existing.service_problem_id = policy.service_problem_id) as next_version
from public.service_intake_policies policy
join case_worker_capability_requirements mapped
  on mapped.service_type = policy.service_type and mapped.problem_slug = policy.problem_slug
where policy.status = 'active';

do $check$
begin
  if (select count(*) from case_worker_policy_moves) <>
    (select count(*) from public.service_problems where is_active) then
    raise exception 'every active service problem must have an active policy before case capability migration';
  end if;
end;
$check$;

update public.service_intake_policies policy
set status = 'retired', updated_at = now()
from case_worker_policy_moves moved
where policy.id = moved.id;

insert into public.service_intake_policies(
  service_problem_id, service_type, problem_slug, version, status, quote_mode,
  tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
  capability_requirements, evidence_requirements, reason,
  created_by, approved_by, approved_at, published_by, published_at, updated_by
)
select moved.service_problem_id, moved.service_type, moved.problem_slug,
  moved.next_version, 'active', moved.quote_mode,
  moved.tier_a_fields, moved.tier_b_slots, moved.question_overrides,
  moved.safety_requirements, to_jsonb(moved.case_capability_requirements),
  moved.evidence_requirements,
  'Case-specific worker capability requirements; preserve service safety and quote gates',
  null, null, now(), null, now(), null
from case_worker_policy_moves moved;

update public.service_intake_policy_heads head
set active_version = moved.next_version,
  revision = head.revision + 1,
  updated_at = now()
from case_worker_policy_moves moved
where head.service_problem_id = moved.service_problem_id;

insert into public.service_intake_policy_audit(
  policy_id, service_problem_id, event, from_version, to_version,
  revision, actor_id, reason, actor_kind
)
select current_policy.id, current_policy.service_problem_id, 'published',
  moved.version, moved.next_version, head.revision, null,
  'Migration narrowed worker skills to the capabilities required by this case while preserving safety gates',
  'migration'
from case_worker_policy_moves moved
join public.service_intake_policies current_policy
  on current_policy.service_problem_id = moved.service_problem_id
  and current_policy.version = moved.next_version
join public.service_intake_policy_heads head
  on head.service_problem_id = moved.service_problem_id;

commit;
