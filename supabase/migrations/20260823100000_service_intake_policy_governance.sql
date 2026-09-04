begin;

create type public.service_quote_mode as enum (
  'kael_auto_quote',
  'rfq',
  'inspection_only',
  'blocked'
);

create type public.admin_governance_status as enum (
  'draft',
  'approved',
  'active',
  'retired'
);

create table public.service_intake_policy_floors (
  service_type public.service_type primary key,
  tier_a_fields jsonb not null check (jsonb_typeof(tier_a_fields) = 'array'),
  safety_requirements jsonb not null check (jsonb_typeof(safety_requirements) = 'array'),
  capability_requirements jsonb not null check (jsonb_typeof(capability_requirements) = 'array'),
  created_at timestamptz not null default now()
);

create table public.service_intake_policy_heads (
  service_problem_id uuid primary key references public.service_problems(id) on delete restrict,
  service_type public.service_type not null,
  problem_slug text not null,
  active_version integer,
  revision integer not null default 0 check (revision >= 0),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (service_type, problem_slug)
);

create table public.service_intake_policies (
  id uuid primary key default gen_random_uuid(),
  service_problem_id uuid not null references public.service_problems(id) on delete restrict,
  service_type public.service_type not null,
  problem_slug text not null,
  version integer not null check (version > 0),
  status public.admin_governance_status not null default 'draft',
  quote_mode public.service_quote_mode not null,
  tier_a_fields jsonb not null check (jsonb_typeof(tier_a_fields) = 'array'),
  tier_b_slots jsonb not null check (jsonb_typeof(tier_b_slots) = 'array'),
  question_overrides jsonb not null check (jsonb_typeof(question_overrides) = 'object'),
  safety_requirements jsonb not null check (jsonb_typeof(safety_requirements) = 'array'),
  capability_requirements jsonb not null check (jsonb_typeof(capability_requirements) = 'array'),
  reason text not null check (length(btrim(reason)) >= 8),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (service_type, problem_slug, version),
  unique (service_problem_id, version)
);

create unique index service_intake_policies_one_active_idx
  on public.service_intake_policies(service_problem_id)
  where status = 'active';

create table public.service_intake_policy_audit (
  id bigint generated always as identity primary key,
  policy_id uuid not null references public.service_intake_policies(id) on delete restrict,
  service_problem_id uuid not null references public.service_problems(id) on delete restrict,
  event text not null check (event in ('drafted', 'approved', 'published', 'rolled_back')),
  from_version integer,
  to_version integer not null,
  revision integer not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) >= 8),
  created_at timestamptz not null default now()
);

create table public.price_baseline_governance_heads (
  service_problem_id uuid not null references public.service_problems(id) on delete restrict,
  district_code text not null,
  complexity public.complexity_level not null,
  active_version integer,
  revision integer not null default 0 check (revision >= 0),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (service_problem_id, district_code, complexity)
);

create table public.price_baseline_versions (
  id uuid primary key default gen_random_uuid(),
  service_problem_id uuid not null references public.service_problems(id) on delete restrict,
  service_type public.service_type not null,
  district_code text not null,
  complexity public.complexity_level not null,
  version integer not null check (version > 0),
  status public.admin_governance_status not null default 'draft',
  price_min integer not null check (price_min > 0),
  price_max integer not null check (price_max >= price_min),
  source text not null check (length(btrim(source)) >= 3),
  price_evidence jsonb not null check (
    jsonb_typeof(price_evidence) = 'object'
    and price_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(price_evidence -> 'sources') = 'array'
  ),
  reason text not null check (length(btrim(reason)) >= 8),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (service_problem_id, district_code, complexity, version)
);

create unique index price_baseline_versions_one_active_idx
  on public.price_baseline_versions(service_problem_id, district_code, complexity)
  where status = 'active';

create table public.price_baseline_governance_audit (
  id bigint generated always as identity primary key,
  baseline_version_id uuid not null references public.price_baseline_versions(id) on delete restrict,
  event text not null check (event in ('drafted', 'approved', 'published', 'rolled_back')),
  from_version integer,
  to_version integer not null,
  revision integer not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(btrim(reason)) >= 8),
  created_at timestamptz not null default now()
);

alter table public.service_intake_policy_floors enable row level security;
alter table public.service_intake_policy_heads enable row level security;
alter table public.service_intake_policies enable row level security;
alter table public.service_intake_policy_audit enable row level security;
alter table public.price_baseline_governance_heads enable row level security;
alter table public.price_baseline_versions enable row level security;
alter table public.price_baseline_governance_audit enable row level security;

revoke all on table public.service_intake_policy_floors, public.service_intake_policy_heads,
  public.service_intake_policies, public.service_intake_policy_audit,
  public.price_baseline_governance_heads, public.price_baseline_versions,
  public.price_baseline_governance_audit from public, anon, authenticated;
grant select, insert, update on table public.service_intake_policy_heads,
  public.service_intake_policies, public.price_baseline_governance_heads,
  public.price_baseline_versions to service_role;
grant select, insert on table public.service_intake_policy_audit,
  public.price_baseline_governance_audit to service_role;
grant select on table public.service_intake_policy_floors to service_role;
grant usage, select on sequence public.service_intake_policy_audit_id_seq,
  public.price_baseline_governance_audit_id_seq to service_role;

create or replace function public.assert_stage1_governance_admin(p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $func$
begin
  if not exists (
    select 1 from public.profiles where id = p_actor_id and role = 'admin'::public.user_role
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_GOVERNANCE_FORBIDDEN';
  end if;
end;
$func$;

create or replace function public.protect_service_intake_policy_content()
returns trigger language plpgsql security invoker set search_path = '' as $func$
begin
  if row(old.service_problem_id, old.service_type, old.problem_slug, old.version, old.quote_mode,
      old.tier_a_fields, old.tier_b_slots, old.question_overrides, old.safety_requirements,
      old.capability_requirements, old.reason, old.created_by, old.created_at)
    is distinct from
    row(new.service_problem_id, new.service_type, new.problem_slug, new.version, new.quote_mode,
      new.tier_a_fields, new.tier_b_slots, new.question_overrides, new.safety_requirements,
      new.capability_requirements, new.reason, new.created_by, new.created_at) then
    raise exception using errcode = '23514', message = 'INTAKE_POLICY_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$func$;

create trigger protect_service_intake_policy_content
before update on public.service_intake_policies
for each row execute function public.protect_service_intake_policy_content();

create or replace function public.protect_price_baseline_version_content()
returns trigger language plpgsql security invoker set search_path = '' as $func$
begin
  if row(old.service_problem_id, old.service_type, old.district_code, old.complexity, old.version,
      old.price_min, old.price_max, old.source, old.price_evidence, old.reason, old.created_by, old.created_at)
    is distinct from
    row(new.service_problem_id, new.service_type, new.district_code, new.complexity, new.version,
      new.price_min, new.price_max, new.source, new.price_evidence, new.reason, new.created_by, new.created_at) then
    raise exception using errcode = '23514', message = 'PRICE_BASELINE_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$func$;

create trigger protect_price_baseline_version_content
before update on public.price_baseline_versions
for each row execute function public.protect_price_baseline_version_content();

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
    or not p_tier_a_fields @> v_floor.tier_a_fields
    or not p_safety_requirements @> v_floor.safety_requirements
    or not p_capability_requirements @> v_floor.capability_requirements then
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
language plpgsql security definer set search_path = '' as $func$
declare
  v_problem public.service_problems%rowtype;
  v_head public.service_intake_policy_heads%rowtype;
  v_row public.service_intake_policies%rowtype;
  v_version integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED'; end if;
  select * into strict v_problem from public.service_problems where id = p_problem_id and is_active;
  insert into public.service_intake_policy_heads(service_problem_id, service_type, problem_slug)
  values (v_problem.id, v_problem.service_type, v_problem.slug) on conflict do nothing;
  select * into strict v_head from public.service_intake_policy_heads where service_problem_id = p_problem_id for update;
  if v_head.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'STALE_POLICY_REVISION'; end if;
  perform public.assert_intake_policy_floor(v_problem.service_type, p_tier_a_fields, p_tier_b_slots,
    p_question_overrides, p_safety_requirements, p_capability_requirements);
  select coalesce(max(version), 0) + 1 into v_version from public.service_intake_policies where service_problem_id = p_problem_id;
  insert into public.service_intake_policies(
    service_problem_id, service_type, problem_slug, version, quote_mode, tier_a_fields,
    tier_b_slots, question_overrides, safety_requirements, capability_requirements,
    reason, created_by, updated_by
  ) values (
    v_problem.id, v_problem.service_type, v_problem.slug, v_version, p_quote_mode,
    p_tier_a_fields, p_tier_b_slots, p_question_overrides, p_safety_requirements,
    p_capability_requirements, btrim(p_reason), p_actor_id, p_actor_id
  ) returning * into v_row;
  update public.service_intake_policy_heads set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where service_problem_id = p_problem_id returning * into v_head;
  insert into public.service_intake_policy_audit(policy_id, service_problem_id, event, from_version, to_version, revision, actor_id, reason)
    values (v_row.id, p_problem_id, 'drafted', v_head.active_version, v_version, v_head.revision, p_actor_id, btrim(p_reason));
  return next v_row;
end;
$func$;

create or replace function public.admin_transition_service_intake_policy(
  p_actor_id uuid,
  p_policy_id uuid,
  p_expected_revision integer,
  p_action text,
  p_reason text
) returns setof public.service_intake_policies
language plpgsql security definer set search_path = '' as $func$
declare
  v_policy public.service_intake_policies%rowtype;
  v_head public.service_intake_policy_heads%rowtype;
  v_from integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED'; end if;
  select * into strict v_policy from public.service_intake_policies where id = p_policy_id for update;
  select * into strict v_head from public.service_intake_policy_heads where service_problem_id = v_policy.service_problem_id for update;
  if v_head.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'STALE_POLICY_REVISION'; end if;
  v_from := v_head.active_version;
  if p_action = 'approve' then
    if v_policy.status <> 'draft' or v_policy.created_by = p_actor_id then raise exception using errcode = '42501', message = 'POLICY_MAKER_CHECKER_REQUIRED'; end if;
    update public.service_intake_policies set status = 'approved', approved_by = p_actor_id, approved_at = now(), updated_by = p_actor_id, updated_at = now() where id = p_policy_id returning * into v_policy;
  elsif p_action in ('publish', 'rollback') then
    if v_policy.status not in ('approved', 'retired') or v_policy.created_by = p_actor_id then raise exception using errcode = '42501', message = 'POLICY_MAKER_CHECKER_REQUIRED'; end if;
    update public.service_intake_policies set status = 'retired', updated_by = p_actor_id, updated_at = now()
      where service_problem_id = v_policy.service_problem_id and status = 'active';
    update public.service_intake_policies set status = 'active', published_by = p_actor_id, published_at = now(), updated_by = p_actor_id, updated_at = now() where id = p_policy_id returning * into v_policy;
    update public.service_intake_policy_heads set active_version = v_policy.version where service_problem_id = v_policy.service_problem_id;
  else
    raise exception using errcode = '22023', message = 'INVALID_POLICY_ACTION';
  end if;
  update public.service_intake_policy_heads set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where service_problem_id = v_policy.service_problem_id returning * into v_head;
  insert into public.service_intake_policy_audit(policy_id, service_problem_id, event, from_version, to_version, revision, actor_id, reason)
    values (v_policy.id, v_policy.service_problem_id, case p_action when 'approve' then 'approved' when 'rollback' then 'rolled_back' else 'published' end,
      v_from, v_policy.version, v_head.revision, p_actor_id, btrim(p_reason));
  return next v_policy;
end;
$func$;

create or replace function public.admin_preview_service_intake_policy(p_problem_id uuid, p_version integer default null)
returns table(
  policy_id uuid, service_type public.service_type, problem_slug text, version integer,
  revision integer, quote_mode public.service_quote_mode, tier_a_fields jsonb, tier_b_slots jsonb,
  question_overrides jsonb, safety_requirements jsonb, capability_requirements jsonb, status public.admin_governance_status
) language sql security definer set search_path = '' stable as $func$
  select p.id, p.service_type, p.problem_slug, p.version, h.revision, p.quote_mode,
    p.tier_a_fields, p.tier_b_slots, p.question_overrides, p.safety_requirements,
    p.capability_requirements, p.status
  from public.service_intake_policies p
  join public.service_intake_policy_heads h using (service_problem_id)
  where p.service_problem_id = p_problem_id
    and ((p_version is null and p.status = 'active') or p.version = p_version)
  order by p.version desc limit 1;
$func$;

create or replace function public.price_evidence_has_quorum(p_evidence jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $func$
  select jsonb_typeof(p_evidence) = 'object'
    and p_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(p_evidence -> 'sources') = 'array'
    and (select count(distinct source ->> 'domain') >= 2 from jsonb_array_elements(p_evidence -> 'sources') source)
    and not exists (
      select 1 from jsonb_array_elements(p_evidence -> 'sources') source
      where nullif(btrim(source ->> 'domain'), '') is null
        or nullif(btrim(source ->> 'url'), '') is null
        or coalesce(source ->> 'observed_at', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or nullif(btrim(source ->> 'unit'), '') is null
        or source -> 'signals' ->> 'identity_verified' is distinct from 'true'
        or source -> 'signals' ->> 'hcmc_relevant' is distinct from 'true'
        or source -> 'signals' ->> 'clear_price_and_unit' is distinct from 'true'
        or source -> 'signals' ->> 'integrity_verified' is distinct from 'true'
        or source -> 'signals' ->> 'review_overdue' is distinct from 'false'
        or source -> 'signals' ->> 'price_jump_suspected' is distinct from 'false'
    );
$func$;

create or replace function public.admin_draft_price_baseline(
  p_actor_id uuid, p_problem_id uuid, p_district_code text, p_complexity public.complexity_level,
  p_expected_revision integer, p_price_min integer, p_price_max integer, p_source text,
  p_price_evidence jsonb, p_reason text
) returns setof public.price_baseline_versions
language plpgsql security definer set search_path = '' as $func$
declare
  v_problem public.service_problems%rowtype;
  v_head public.price_baseline_governance_heads%rowtype;
  v_row public.price_baseline_versions%rowtype;
  v_version integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 or p_price_min <= 0 or p_price_max < p_price_min then raise exception using errcode = '22023', message = 'INVALID_PRICE_BASELINE_DRAFT'; end if;
  select * into strict v_problem from public.service_problems where id = p_problem_id and is_active;
  insert into public.price_baseline_governance_heads(service_problem_id, district_code, complexity)
    values (p_problem_id, p_district_code, p_complexity) on conflict do nothing;
  select * into strict v_head from public.price_baseline_governance_heads
    where service_problem_id = p_problem_id and district_code = p_district_code and complexity = p_complexity for update;
  if v_head.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'STALE_PRICE_BASELINE_REVISION'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.price_baseline_versions
    where service_problem_id = p_problem_id and district_code = p_district_code and complexity = p_complexity;
  insert into public.price_baseline_versions(service_problem_id, service_type, district_code, complexity,
    version, price_min, price_max, source, price_evidence, reason, created_by, updated_by)
  values (p_problem_id, v_problem.service_type, p_district_code, p_complexity, v_version,
    p_price_min, p_price_max, p_source, p_price_evidence, btrim(p_reason), p_actor_id, p_actor_id)
  returning * into v_row;
  update public.price_baseline_governance_heads set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where service_problem_id = p_problem_id and district_code = p_district_code and complexity = p_complexity returning * into v_head;
  insert into public.price_baseline_governance_audit(baseline_version_id, event, from_version, to_version, revision, actor_id, reason)
    values (v_row.id, 'drafted', v_head.active_version, v_version, v_head.revision, p_actor_id, btrim(p_reason));
  return next v_row;
end;
$func$;

create or replace function public.admin_transition_price_baseline(
  p_actor_id uuid, p_baseline_version_id uuid, p_expected_revision integer, p_action text, p_reason text
) returns setof public.price_baseline_versions
language plpgsql security definer set search_path = '' as $func$
declare
  v_row public.price_baseline_versions%rowtype;
  v_head public.price_baseline_governance_heads%rowtype;
  v_from integer;
begin
  perform public.assert_stage1_governance_admin(p_actor_id);
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception using errcode = '22023', message = 'GOVERNANCE_REASON_REQUIRED'; end if;
  select * into strict v_row from public.price_baseline_versions where id = p_baseline_version_id for update;
  select * into strict v_head from public.price_baseline_governance_heads
    where service_problem_id = v_row.service_problem_id and district_code = v_row.district_code and complexity = v_row.complexity for update;
  if v_head.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'STALE_PRICE_BASELINE_REVISION'; end if;
  v_from := v_head.active_version;
  if p_action = 'approve' then
    if v_row.status <> 'draft' or v_row.created_by = p_actor_id then raise exception using errcode = '42501', message = 'PRICE_BASELINE_MAKER_CHECKER_REQUIRED'; end if;
    update public.price_baseline_versions set status = 'approved', approved_by = p_actor_id, approved_at = now(), updated_by = p_actor_id, updated_at = now() where id = p_baseline_version_id returning * into v_row;
  elsif p_action in ('publish', 'rollback') then
    if v_row.status not in ('approved', 'retired') or v_row.created_by = p_actor_id then raise exception using errcode = '42501', message = 'PRICE_BASELINE_MAKER_CHECKER_REQUIRED'; end if;
    if not public.price_evidence_has_quorum(v_row.price_evidence) then raise exception using errcode = '23514', message = 'PRICE_EVIDENCE_QUORUM_REQUIRED'; end if;
    update public.price_baseline_versions set status = 'retired', updated_by = p_actor_id, updated_at = now()
      where service_problem_id = v_row.service_problem_id and district_code = v_row.district_code and complexity = v_row.complexity and status = 'active';
    update public.price_baseline_versions set status = 'active', published_by = p_actor_id, published_at = now(), updated_by = p_actor_id, updated_at = now()
      where id = p_baseline_version_id returning * into v_row;
    update public.price_baseline_governance_heads set active_version = v_row.version
      where service_problem_id = v_row.service_problem_id and district_code = v_row.district_code and complexity = v_row.complexity;
    insert into public.price_baselines(service_type, service_problem_id, district_code, complexity, price_min, price_max, source, version, price_evidence, updated_at)
    values (v_row.service_type, v_row.service_problem_id, v_row.district_code, v_row.complexity,
      v_row.price_min, v_row.price_max, v_row.source, v_row.version, v_row.price_evidence, now())
    on conflict (service_problem_id, district_code, complexity) do update set
      service_type = excluded.service_type, price_min = excluded.price_min, price_max = excluded.price_max,
      source = excluded.source, version = excluded.version, price_evidence = excluded.price_evidence, updated_at = now();
  else
    raise exception using errcode = '22023', message = 'INVALID_PRICE_BASELINE_ACTION';
  end if;
  update public.price_baseline_governance_heads set revision = revision + 1, updated_by = p_actor_id, updated_at = now()
    where service_problem_id = v_row.service_problem_id and district_code = v_row.district_code and complexity = v_row.complexity returning * into v_head;
  insert into public.price_baseline_governance_audit(baseline_version_id, event, from_version, to_version, revision, actor_id, reason)
    values (v_row.id, case p_action when 'approve' then 'approved' when 'rollback' then 'rolled_back' else 'published' end,
      v_from, v_row.version, v_head.revision, p_actor_id, btrim(p_reason));
  return next v_row;
end;
$func$;

insert into public.service_intake_policy_floors(service_type, tier_a_fields, safety_requirements, capability_requirements) values
  ('electrical', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["electrical_immediate_hazard","electrical_panel_or_fixed_wiring"]', '["electrical_fault_isolation","fixed_wiring_and_panel_safety","device_repair_or_replacement","electrical_installation"]'),
  ('plumbing', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["plumbing_active_damage_or_contamination","plumbing_concealed_or_building_system"]', '["leak_and_flow_diagnosis","pipe_and_fixture_repair","drain_clearing","fixture_installation"]'),
  ('cleaning', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["cleaning_hazardous_material","cleaning_high_access_or_special_surface"]', '["home_cleaning","deep_cleaning","surface_safe_cleaning","cleaning_equipment_operation"]'),
  ('hvac', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["hvac_electrical_refrigerant_or_burning_hazard","hvac_repair_or_refrigerant_work"]', '["hvac_cleaning","hvac_fault_diagnosis","hvac_electrical_and_control_repair","refrigerant_system_service","safe_height_access"]'),
  ('upholstery', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["fabric_contamination_or_chemical_risk","fabric_unknown_or_delicate_material"]', '["upholstery_material_identification","colorfastness_and_patch_testing","fabric_safe_extraction_cleaning","stain_and_odor_treatment"]'),
  ('handyman', '["service_type","problem_slug","address_district","address_label","scheduled_at","description_min"]', '["handyman_structural_or_concealed_service_risk","handyman_specialist_boundary"]', '["minor_home_repairs","safe_drilling_and_mounting","small_fixture_and_furniture_installation","multi_task_scope_management"]');

with drivers(service_type, slots) as (values
  ('electrical'::public.service_type, '["affected_area_and_power_state","device_or_circuit_type","symptom_and_duration","access_and_concealed_wiring","parts_or_new_device_requirement","urgency_and_repeat_fault"]'::jsonb),
  ('plumbing', '["fixture_pipe_or_drain_type","leak_or_blockage_severity","water_isolation_availability","access_and_concealed_pipework","pipe_or_fixture_material","water_damage_and_urgency"]'),
  ('cleaning', '["area_and_room_count","current_condition_and_cleaning_depth","surface_and_material_mix","occupancy_and_access","equipment_and_supply_requirements","waste_volume_and_time_window"]'),
  ('hvac', '["requested_work_mode","unit_type_count_and_capacity","symptom_and_operating_condition","maintenance_history","indoor_outdoor_unit_access","drain_electrical_or_refrigerant_signs","parts_and_consumables_requirement"]'),
  ('upholstery', '["item_type_count_and_dimensions","material_and_care_label","stain_odor_and_soiling_condition","colorfastness_and_prior_treatment","access_and_movement_requirement","drying_environment_and_time_window"]'),
  ('handyman', '["task_types_and_total_count","item_dimensions_weight_and_quantity","wall_surface_or_substrate","mounting_location_access_and_height","parts_hardware_and_tools_available","concealed_services_and_load_requirement"]')
), prepared as (
  select sp.id, sp.service_type, sp.slug, f.tier_a_fields, f.safety_requirements, f.capability_requirements,
    (select jsonb_agg(jsonb_build_object('key', value, 'enabled', true, 'required_for_quote', false) order by ordinality)
      from jsonb_array_elements_text(d.slots) with ordinality) as tier_b_slots,
    (select jsonb_object_agg(value, jsonb_build_object('vi', 'Anh/chị có thể bổ sung chi tiết này không?', 'en', 'Can you add this detail?'))
      from jsonb_array_elements_text(d.slots)) as questions,
    case when exists (
      select 1 from public.price_baselines pb where pb.service_problem_id = sp.id
        and public.price_evidence_has_quorum(pb.price_evidence)
    ) then 'kael_auto_quote'::public.service_quote_mode else 'rfq'::public.service_quote_mode end as quote_mode
  from public.service_problems sp
  join drivers d using (service_type)
  join public.service_intake_policy_floors f using (service_type)
  where sp.is_active
), inserted as (
  insert into public.service_intake_policies(service_problem_id, service_type, problem_slug, version, status,
    quote_mode, tier_a_fields, tier_b_slots, question_overrides, safety_requirements,
    capability_requirements, reason, created_by, approved_by, approved_at, published_by, published_at, updated_by)
  select p.id, p.service_type, p.slug, 1, 'active', p.quote_mode, p.tier_a_fields, p.tier_b_slots,
    p.questions, p.safety_requirements, p.capability_requirements, 'Conservative Stage 1 system-seeded policy', null, null, now(), null, now(), null
  from prepared p
  on conflict (service_problem_id, version) do nothing returning service_problem_id, service_type, problem_slug, version, updated_by
)
insert into public.service_intake_policy_heads(service_problem_id, service_type, problem_slug, active_version, revision, updated_by)
select service_problem_id, service_type, problem_slug, version, 1, updated_by from inserted
on conflict (service_problem_id) do nothing;

insert into public.price_baseline_versions(service_problem_id, service_type, district_code, complexity, version,
  status, price_min, price_max, source, price_evidence, reason, created_by, approved_by, approved_at, published_by, published_at, updated_by)
select pb.service_problem_id, pb.service_type, pb.district_code, pb.complexity, pb.version,
  case when public.price_evidence_has_quorum(pb.price_evidence) then 'active'::public.admin_governance_status else 'retired'::public.admin_governance_status end,
  pb.price_min, pb.price_max, pb.source, pb.price_evidence, 'Imported existing governed baseline', null,
  null,
  case when public.price_evidence_has_quorum(pb.price_evidence) then now() end,
  null,
  case when public.price_evidence_has_quorum(pb.price_evidence) then now() end, null
from public.price_baselines pb
on conflict (service_problem_id, district_code, complexity, version) do nothing;

insert into public.price_baseline_governance_heads(service_problem_id, district_code, complexity, active_version, revision, updated_by)
select v.service_problem_id, v.district_code, v.complexity,
  max(v.version) filter (where v.status = 'active'), 1, null
from public.price_baseline_versions v group by v.service_problem_id, v.district_code, v.complexity
on conflict do nothing;

revoke execute on function public.assert_stage1_governance_admin(uuid),
  public.protect_service_intake_policy_content(),
  public.protect_price_baseline_version_content(),
  public.assert_intake_policy_floor(public.service_type,jsonb,jsonb,jsonb,jsonb,jsonb),
  public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_transition_service_intake_policy(uuid,uuid,integer,text,text),
  public.admin_preview_service_intake_policy(uuid,integer),
  public.price_evidence_has_quorum(jsonb),
  public.admin_draft_price_baseline(uuid,uuid,text,public.complexity_level,integer,integer,integer,text,jsonb,text),
  public.admin_transition_price_baseline(uuid,uuid,integer,text,text)
from public, anon, authenticated;

grant execute on function public.admin_draft_service_intake_policy(uuid,uuid,integer,public.service_quote_mode,jsonb,jsonb,jsonb,jsonb,jsonb,text),
  public.admin_transition_service_intake_policy(uuid,uuid,integer,text,text),
  public.admin_preview_service_intake_policy(uuid,integer),
  public.admin_draft_price_baseline(uuid,uuid,text,public.complexity_level,integer,integer,integer,text,jsonb,text),
  public.admin_transition_price_baseline(uuid,uuid,integer,text,text)
to service_role;

comment on table public.service_intake_policies is 'Immutable versioned intake and quote-routing policy; lifecycle changes only through service-role Admin RPCs.';
comment on table public.price_baseline_versions is 'Maker-checker governed price baseline versions. Publishing requires two-source provenance and updates the legacy runtime table atomically.';

commit;
