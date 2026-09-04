begin;

update public.admin_operator_accounts
set capabilities = pg_catalog.array_append(capabilities, 'system.read')
where status = 'active'
  and not capabilities @> array['system.read']::text[];

alter table public.service_categories
  add column if not exists label_en text,
  add column if not exists revision integer not null default 1;

alter table public.service_problems
  add column if not exists label_en text;

update public.service_categories
set label_en = case service_type
  when 'electrical' then 'Electrical repair'
  when 'plumbing' then 'Plumbing repair'
  when 'cleaning' then 'Cleaning'
  when 'hvac' then 'Air conditioning & air care'
  when 'upholstery' then 'Upholstery care'
  when 'handyman' then 'Minor repairs & installation'
end
where label_en is null;

update public.service_problems
set label_en = case
  when label_vi = 'Mất điện một phòng' then 'One room has no power'
  when label_vi = 'Mất điện toàn căn' then 'Whole apartment outage'
  when label_vi = 'Ổ cắm/công tắc hỏng' then 'Outlet or switch issue'
  when label_vi = 'Cầu dao trip' then 'Breaker trips'
  when label_vi = 'Đèn chập chờn' then 'Flickering light'
  when label_vi = 'Lắp thêm thiết bị' then 'Install a fixture'
  when label_vi = 'Ống rò rỉ' then 'Pipe leak'
  when label_vi = 'Tắc cống/bồn' then 'Drain or sink clog'
  when label_vi = 'Vòi hỏng' then 'Broken faucet'
  when label_vi = 'Toilet không xả' then 'Toilet flush issue'
  when label_vi = 'Áp nước yếu' then 'Weak water pressure'
  when label_vi = 'Lắp/thay thiết bị' then 'Install or replace fixture'
  when label_vi = 'Dọn dẹp nhà' then 'Home cleaning'
  when label_vi = 'Vệ sinh bếp' then 'Kitchen cleaning'
  when label_vi = 'Vệ sinh phòng tắm' then 'Bathroom cleaning'
  when label_vi = 'Tổng vệ sinh' then 'Deep cleaning'
  when label_vi = 'Dọn sau sửa chữa' then 'Post-repair cleaning'
  when label_vi = 'Vệ sinh cửa kính' then 'Window cleaning'
  when label_vi = 'Vệ sinh điều hòa' then 'Air-conditioner cleaning'
  when label_vi = 'Máy lạnh yếu' then 'Weak cooling'
  when label_vi = 'Máy không mát' then 'Not cooling'
  when label_vi = 'Chảy nước' then 'Water leak'
  when label_vi = 'Kêu bất thường' then 'Unusual noise'
  when label_vi = 'Có mã lỗi' then 'Error code'
  when label_vi = 'Vệ sinh sofa' then 'Sofa cleaning'
  when label_vi = 'Vệ sinh nệm' then 'Mattress cleaning'
  when label_vi = 'Vệ sinh rèm' then 'Curtain cleaning'
  when label_vi = 'Vệ sinh thảm' then 'Carpet cleaning'
  when label_vi = 'Vết bẩn' then 'Stain treatment'
  when label_vi = 'Mùi hôi/ẩm mốc' then 'Odor or mold'
  when label_vi = 'Khoan/lắp kệ' then 'Drill or mount shelf'
  when label_vi = 'Lắp thanh rèm' then 'Install curtain rod'
  when label_vi = 'Lắp đèn/thiết bị nhỏ' then 'Install light or small fixture'
  when label_vi = 'Sửa bản lề/tay nắm' then 'Fix hinge or handle'
  when label_vi = 'Lắp thiết bị phòng tắm' then 'Install bathroom fixture'
  when label_vi = 'Lắp TV/nội thất' then 'Mount TV or furniture'
  when label_vi = 'Việc nhỏ khác' then 'Other small task'
  when label_vi = 'Vấn đề khác' and service_type = 'electrical' then 'Other electrical issue'
  when label_vi = 'Vấn đề khác' and service_type = 'plumbing' then 'Other plumbing issue'
  when label_vi = 'Vấn đề khác' and service_type = 'cleaning' then 'Other cleaning request'
  when label_vi = 'Vấn đề khác' and service_type = 'hvac' then 'Other air-conditioning issue'
  when label_vi = 'Vấn đề khác' and service_type = 'upholstery' then 'Other upholstery request'
  else label_en
end
where label_en is null;

alter table public.service_categories
  add constraint service_categories_revision_check check (revision > 0);

create table public.service_taxonomy_revisions (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  revision integer not null check (revision > 0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 1000),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (service_type, revision)
);

create index service_taxonomy_revisions_cursor_idx
  on public.service_taxonomy_revisions (service_type, revision desc);

alter table public.service_taxonomy_revisions enable row level security;
revoke all on public.service_taxonomy_revisions from public, anon, authenticated;
grant all on public.service_taxonomy_revisions to service_role;

alter table public.price_baselines
  add column if not exists lifecycle text not null default 'active',
  add column if not exists effective_from timestamptz,
  add column if not exists retired_at timestamptz,
  add column if not exists supersedes_id uuid references public.price_baselines(id) on delete restrict,
  add column if not exists created_by uuid references public.profiles(id) on delete restrict;

update public.price_baselines
set lifecycle = 'active',
    effective_from = coalesce(effective_from, created_at)
where lifecycle is null or lifecycle = 'active';

alter table public.price_baselines
  add constraint price_baselines_lifecycle_check check (lifecycle in ('active', 'superseded', 'retired')),
  drop constraint if exists price_baselines_problem_district_complexity_key;

create unique index price_baselines_one_active_key_idx
  on public.price_baselines (service_problem_id, district_code, complexity)
  where lifecycle = 'active';

create index price_baselines_admin_cursor_idx
  on public.price_baselines (lifecycle, updated_at desc, id desc);

create table public.admin_price_evidence_packages (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null check (schema_version = 'baseline_price_evidence.v1'),
  package_hash text not null unique check (package_hash ~ '^[0-9a-f]{64}$'),
  service_type public.service_type not null,
  service_problem_id uuid not null references public.service_problems(id) on delete restrict,
  complexity public.complexity_level not null,
  district_code text not null,
  aggregate_min integer not null check (aggregate_min > 0),
  aggregate_max integer not null check (aggregate_max >= aggregate_min),
  unit text not null,
  evidence_document jsonb not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint admin_price_evidence_packages_shape_check check (
    evidence_document ->> 'schema_version' = 'baseline_price_evidence.v1'
    and jsonb_typeof(evidence_document -> 'sources') = 'array'
  )
);

create index admin_price_evidence_packages_lookup_idx
  on public.admin_price_evidence_packages (service_problem_id, complexity, district_code, verified_at desc);

alter table public.admin_price_evidence_packages enable row level security;
revoke all on public.admin_price_evidence_packages from public, anon, authenticated;
grant select, insert on public.admin_price_evidence_packages to service_role;

drop trigger if exists admin_price_evidence_packages_immutable on public.admin_price_evidence_packages;
create trigger admin_price_evidence_packages_immutable
before update or delete on public.admin_price_evidence_packages
for each row execute function public.reject_harness_append_only_mutation();

create table public.admin_system_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  operation text not null,
  resource_id text not null,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_id, client_request_id)
);

create index admin_system_mutation_receipts_resource_idx
  on public.admin_system_mutation_receipts (resource_id, created_at desc);

alter table public.admin_system_mutation_receipts enable row level security;
revoke all on public.admin_system_mutation_receipts from public, anon, authenticated;
grant all on public.admin_system_mutation_receipts to service_role;

create or replace function private.admin_system_actor_can_manage(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles as profile
    where profile.id = p_actor_id and profile.role = 'admin'::public.user_role
  ) or exists (
    select 1 from public.admin_operator_accounts as account
    where account.user_id = p_actor_id
      and account.status = 'active'
      and account.capabilities @> array['system.manage']::text[]
  );
$function$;

revoke all on function private.admin_system_actor_can_manage(uuid) from public, anon, authenticated;
grant execute on function private.admin_system_actor_can_manage(uuid) to service_role;

create or replace function public.admin_publish_price_baseline_version(
  p_actor_id uuid,
  p_baseline_id uuid,
  p_evidence_package_id uuid,
  p_effective_from timestamptz,
  p_expected_version integer,
  p_client_request_id uuid,
  p_reason text
)
returns table(event_id uuid, action text, resource_id text, actor_id uuid, recorded_at timestamptz, new_version integer, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.price_baselines%rowtype;
  v_package public.admin_price_evidence_packages%rowtype;
  v_new public.price_baselines%rowtype;
  v_prior public.admin_system_mutation_receipts%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_request jsonb;
  v_response jsonb;
begin
  if not private.admin_system_actor_can_manage(p_actor_id) then raise exception using errcode = '42501', message = 'SYSTEM_MANAGE_REQUIRED'; end if;
  if p_client_request_id is null or p_evidence_package_id is null or p_expected_version is null or p_expected_version < 0 or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  v_request := jsonb_build_object('baseline_id', p_baseline_id, 'evidence_package_id', p_evidence_package_id, 'expected_version', p_expected_version, 'effective_from', p_effective_from, 'reason', left(trim(p_reason), 1000));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_client_request_id::text, 0));
  select receipt.* into v_prior from public.admin_system_mutation_receipts as receipt where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior.operation <> 'price_publish' or v_prior.request <> v_request then raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return query select (v_prior.response->>'event_id')::uuid, v_prior.response->>'action', v_prior.response->>'resource_id', p_actor_id, (v_prior.response->>'recorded_at')::timestamptz, (v_prior.response->>'new_version')::integer, true;
    return;
  end if;
  select package.* into v_package from public.admin_price_evidence_packages as package where package.id = p_evidence_package_id;
  if not found then raise exception using errcode = 'P0002', message = 'EVIDENCE_PACKAGE_NOT_FOUND'; end if;
  if p_baseline_id is not null then
    select baseline.* into v_current from public.price_baselines as baseline where baseline.id = p_baseline_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'BASELINE_NOT_FOUND'; end if;
    if v_current.version <> p_expected_version or v_current.lifecycle <> 'active' then raise exception using errcode = '40001', message = 'VERSION_CONFLICT'; end if;
    if v_current.service_type <> v_package.service_type or v_current.service_problem_id <> v_package.service_problem_id or v_current.complexity <> v_package.complexity or v_current.district_code <> v_package.district_code then
      raise exception using errcode = '22023', message = 'PRICING_KEY_MISMATCH';
    end if;
  elsif p_expected_version <> 0 then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if p_baseline_id is not null then
    update public.price_baselines set lifecycle = 'superseded', updated_at = v_now where id = p_baseline_id;
  end if;
  insert into public.price_baselines(service_type, service_problem_id, complexity, district_code, price_min, price_max, source, price_evidence, version, lifecycle, effective_from, supersedes_id, created_by)
  values(v_package.service_type, v_package.service_problem_id, v_package.complexity, v_package.district_code, v_package.aggregate_min, v_package.aggregate_max, 'admin_evidence_package:' || v_package.id::text, v_package.evidence_document, coalesce(v_current.version, 0) + 1, 'active', coalesce(p_effective_from, v_now), p_baseline_id, p_actor_id)
  returning * into v_new;
  v_response := jsonb_build_object('event_id', v_event_id, 'action', 'publish_version', 'resource_id', v_new.id::text, 'actor_id', p_actor_id, 'recorded_at', v_now, 'new_version', v_new.version);
  insert into public.admin_system_mutation_receipts(actor_id, client_request_id, operation, resource_id, request, response) values(p_actor_id, p_client_request_id, 'price_publish', v_new.id::text, v_request, v_response);
  return query select v_event_id, 'publish_version'::text, v_new.id::text, p_actor_id, v_now, v_new.version, false;
end;
$function$;

create or replace function public.admin_retire_price_baseline(
  p_actor_id uuid,
  p_baseline_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_reason text
)
returns table(event_id uuid, action text, resource_id text, actor_id uuid, recorded_at timestamptz, new_version integer, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_baseline public.price_baselines%rowtype;
  v_prior public.admin_system_mutation_receipts%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_request jsonb := jsonb_build_object('baseline_id', p_baseline_id, 'expected_version', p_expected_version, 'reason', left(trim(coalesce(p_reason, '')), 1000));
  v_response jsonb;
begin
  if not private.admin_system_actor_can_manage(p_actor_id) then raise exception using errcode = '42501', message = 'SYSTEM_MANAGE_REQUIRED'; end if;
  if p_client_request_id is null or p_baseline_id is null or p_expected_version is null or char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_client_request_id::text, 0));
  select receipt.* into v_prior from public.admin_system_mutation_receipts as receipt where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior.operation <> 'price_retire' or v_prior.request <> v_request then raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return query select (v_prior.response->>'event_id')::uuid, v_prior.response->>'action', v_prior.response->>'resource_id', p_actor_id, (v_prior.response->>'recorded_at')::timestamptz, (v_prior.response->>'new_version')::integer, true;
    return;
  end if;
  select baseline.* into v_baseline from public.price_baselines as baseline where baseline.id = p_baseline_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'BASELINE_NOT_FOUND'; end if;
  if v_baseline.version <> p_expected_version or v_baseline.lifecycle <> 'active' then raise exception using errcode = '40001', message = 'VERSION_CONFLICT'; end if;
  update public.price_baselines set lifecycle = 'retired', retired_at = v_now, updated_at = v_now where id = p_baseline_id;
  v_response := jsonb_build_object('event_id', v_event_id, 'action', 'retire', 'resource_id', p_baseline_id::text, 'actor_id', p_actor_id, 'recorded_at', v_now, 'new_version', v_baseline.version);
  insert into public.admin_system_mutation_receipts(actor_id, client_request_id, operation, resource_id, request, response) values(p_actor_id, p_client_request_id, 'price_retire', p_baseline_id::text, v_request, v_response);
  return query select v_event_id, 'retire'::text, p_baseline_id::text, p_actor_id, v_now, v_baseline.version, false;
end;
$function$;

create or replace function public.admin_apply_service_taxonomy_revision(
  p_actor_id uuid,
  p_service_type public.service_type,
  p_expected_revision integer,
  p_client_request_id uuid,
  p_reason text,
  p_service_patch jsonb,
  p_problem_changes jsonb
)
returns table(event_id uuid, action text, resource_id text, actor_id uuid, recorded_at timestamptz, new_version integer, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_category public.service_categories%rowtype;
  v_problem public.service_problems%rowtype;
  v_change jsonb;
  v_before jsonb;
  v_after jsonb;
  v_prior public.admin_system_mutation_receipts%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_request jsonb;
  v_response jsonb;
begin
  if not private.admin_system_actor_can_manage(p_actor_id) then raise exception using errcode = '42501', message = 'SYSTEM_MANAGE_REQUIRED'; end if;
  if p_client_request_id is null or p_expected_revision is null or p_expected_revision < 1 or char_length(trim(coalesce(p_reason, ''))) < 3 or jsonb_typeof(coalesce(p_service_patch, '{}'::jsonb)) <> 'object' or jsonb_typeof(coalesce(p_problem_changes, '[]'::jsonb)) <> 'array' then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  v_request := jsonb_build_object('service_type', p_service_type, 'expected_revision', p_expected_revision, 'reason', left(trim(p_reason), 1000), 'service_patch', coalesce(p_service_patch, '{}'::jsonb), 'problem_changes', coalesce(p_problem_changes, '[]'::jsonb));
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_client_request_id::text, 0));
  select receipt.* into v_prior from public.admin_system_mutation_receipts as receipt where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior.operation <> 'taxonomy_update' or v_prior.request <> v_request then raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return query select (v_prior.response->>'event_id')::uuid, v_prior.response->>'action', v_prior.response->>'resource_id', p_actor_id, (v_prior.response->>'recorded_at')::timestamptz, (v_prior.response->>'new_version')::integer, true;
    return;
  end if;
  select category.* into v_category from public.service_categories as category where category.service_type = p_service_type for update;
  if not found then raise exception using errcode = 'P0002', message = 'SERVICE_NOT_FOUND'; end if;
  if v_category.revision <> p_expected_revision then raise exception using errcode = '40001', message = 'VERSION_CONFLICT'; end if;
  select jsonb_build_object('service', to_jsonb(v_category), 'problems', coalesce(jsonb_agg(to_jsonb(problem) order by problem.sort_order), '[]'::jsonb)) into v_before
  from public.service_problems as problem where problem.service_category_id = v_category.id;
  update public.service_categories set
    label_vi = coalesce(nullif(trim(p_service_patch->>'label_vi'), ''), label_vi),
    label_en = coalesce(nullif(trim(p_service_patch->>'label_en'), ''), label_en)
  where id = v_category.id;
  for v_change in select value from jsonb_array_elements(coalesce(p_problem_changes, '[]'::jsonb)) loop
    if v_change->>'action' = 'create' then
      insert into public.service_problems(service_category_id, service_type, slug, label_vi, label_en, default_complexity, is_active, sort_order)
      values(v_category.id, p_service_type, v_change#>>'{value,slug}', v_change#>>'{value,label_vi}', v_change#>>'{value,label_en}', (v_change#>>'{value,default_complexity}')::public.complexity_level, false, (v_change#>>'{value,sort_order}')::integer);
    elsif v_change->>'action' in ('update', 'activate', 'deactivate', 'reorder') then
      select problem.* into v_problem from public.service_problems as problem where problem.id = (v_change->>'id')::uuid and problem.service_category_id = v_category.id for update;
      if not found then raise exception using errcode = 'P0002', message = 'PROBLEM_NOT_FOUND'; end if;
      if v_change->>'action' = 'update' then
        update public.service_problems set
          label_vi = coalesce(nullif(trim(v_change#>>'{patch,label_vi}'), ''), label_vi),
          label_en = coalesce(nullif(trim(v_change#>>'{patch,label_en}'), ''), label_en),
          default_complexity = coalesce((v_change#>>'{patch,default_complexity}')::public.complexity_level, default_complexity)
        where id = v_problem.id;
      elsif v_change->>'action' = 'activate' then
        if not exists (select 1 from public.price_baselines as baseline where baseline.service_problem_id = v_problem.id and baseline.lifecycle = 'active') then raise exception using errcode = '22023', message = 'QUOTE_READY_BASELINE_REQUIRED'; end if;
        update public.service_problems set is_active = true where id = v_problem.id;
      elsif v_change->>'action' = 'deactivate' then
        update public.service_problems set is_active = false where id = v_problem.id;
      elsif v_change->>'action' = 'reorder' then
        update public.service_problems set sort_order = (v_change->>'sort_order')::integer where id = v_problem.id;
      end if;
    else
      raise exception using errcode = '22023', message = 'UNKNOWN_TAXONOMY_ACTION';
    end if;
  end loop;
  update public.service_categories set revision = revision + 1 where id = v_category.id returning * into v_category;
  if (select count(*) from public.service_categories where service_type in ('electrical','plumbing','cleaning','hvac','upholstery','handyman')) <> 6 then raise exception using errcode = '23514', message = 'CANONICAL_SERVICE_SET_REQUIRED'; end if;
  select jsonb_build_object('service', to_jsonb(v_category), 'problems', coalesce(jsonb_agg(to_jsonb(problem) order by problem.sort_order), '[]'::jsonb)) into v_after
  from public.service_problems as problem where problem.service_category_id = v_category.id;
  insert into public.service_taxonomy_revisions(service_type, revision, actor_id, reason, before_snapshot, after_snapshot) values(p_service_type, v_category.revision, p_actor_id, left(trim(p_reason), 1000), v_before, v_after);
  v_response := jsonb_build_object('event_id', v_event_id, 'action', 'taxonomy_update', 'resource_id', p_service_type::text, 'actor_id', p_actor_id, 'recorded_at', v_now, 'new_version', v_category.revision);
  insert into public.admin_system_mutation_receipts(actor_id, client_request_id, operation, resource_id, request, response) values(p_actor_id, p_client_request_id, 'taxonomy_update', p_service_type::text, v_request, v_response);
  return query select v_event_id, 'taxonomy_update'::text, p_service_type::text, p_actor_id, v_now, v_category.revision, false;
end;
$function$;

create or replace function public.revoke_learning_rule_with_provenance(p_rule_id uuid, p_rule_version integer, p_admin_id uuid, p_reason text, p_release_id text)
returns table(ok boolean, error_code text, rule_id uuid, rule_version integer, cascaded_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  if p_rule_id is null or p_rule_version is null or p_admin_id is null or nullif(trim(coalesce(p_reason, '')), '') is null then return query select false, 'INVALID_INPUT'::text, p_rule_id, p_rule_version, 0; return; end if;
  if not private.admin_system_actor_can_manage(p_admin_id) then return query select false, 'SYSTEM_MANAGE_REQUIRED'::text, p_rule_id, p_rule_version, 0; return; end if;
  if not exists (select 1 from public.learning_rule_versions as version where version.rule_id = p_rule_id and version.version = p_rule_version) then return query select false, 'RULE_VERSION_NOT_FOUND'::text, p_rule_id, p_rule_version, 0; return; end if;
  update public.learning_rule_dependencies as dependency set status = 'revoked', revoked_at = now() where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version and dependency.status = 'active';
  get diagnostics v_count = row_count;
  update public.learning_rule_versions as rule_version set status = 'rolled_back'::public.learning_rule_status where rule_version.rule_id = p_rule_id and rule_version.version = p_rule_version;
  update public.learning_rules set status = case when active_version = p_rule_version then 'rolled_back'::public.learning_rule_status else status end where id = p_rule_id;
  insert into public.learning_rule_revocations(rule_id, rule_version, revoked_by, reason, release_id, cascaded_dependency_count) values(p_rule_id, p_rule_version, p_admin_id, left(trim(p_reason), 500), left(coalesce(p_release_id, 'unreleased'), 160), v_count) on conflict on constraint learning_rule_revocations_rule_id_rule_version_key do nothing;
  update public.learning_candidate_provenance as provenance set provenance_status = 'revoked', consent_status = 'revoked', updated_at = now() where provenance.candidate_id in (select dependency.candidate_id from public.learning_rule_dependencies as dependency where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version);
  update public.service_knowledge_boxes as box set is_active = false, updated_at = now() where box.safe_metadata->>'source_candidate_id' in (select dependency.candidate_id::text from public.learning_rule_dependencies as dependency where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version);
  update public.worker_safety_patterns as pattern set is_enabled = false, updated_at = now() where pattern.safe_metadata->>'source_candidate_id' in (select dependency.candidate_id::text from public.learning_rule_dependencies as dependency where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version);
  return query select true, null::text, p_rule_id, p_rule_version, v_count;
end;
$function$;

create or replace function public.admin_rollback_learning_rule_atomic(p_actor_id uuid, p_rule_id uuid, p_target_version integer, p_expected_version integer, p_client_request_id uuid, p_reason text)
returns table(event_id uuid, action text, resource_id text, actor_id uuid, recorded_at timestamptz, new_version integer, replayed boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_rule public.learning_rules%rowtype;
  v_target public.learning_rule_versions%rowtype;
  v_skill_id text;
  v_result record;
  v_prior public.admin_system_mutation_receipts%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_new_version integer;
  v_request jsonb := jsonb_build_object('rule_id', p_rule_id, 'target_version', p_target_version, 'expected_version', p_expected_version, 'reason', left(trim(coalesce(p_reason, '')), 1000));
  v_response jsonb;
begin
  if not private.admin_system_actor_can_manage(p_actor_id) then raise exception using errcode = '42501', message = 'SYSTEM_MANAGE_REQUIRED'; end if;
  if p_client_request_id is null or p_target_version is null or p_target_version < 1 or char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_client_request_id::text, 0));
  select receipt.* into v_prior from public.admin_system_mutation_receipts as receipt where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior.operation <> 'learning_rollback' or v_prior.request <> v_request then raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return query select (v_prior.response->>'event_id')::uuid, v_prior.response->>'action', v_prior.response->>'resource_id', p_actor_id, (v_prior.response->>'recorded_at')::timestamptz, (v_prior.response->>'new_version')::integer, true; return;
  end if;
  select rule.* into v_rule from public.learning_rules as rule where rule.id = p_rule_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'RULE_NOT_FOUND'; end if;
  if v_rule.active_version <> p_expected_version or v_rule.status <> 'active' or not v_rule.rollback_available then raise exception using errcode = '40001', message = 'VERSION_CONFLICT'; end if;
  select version.* into v_target from public.learning_rule_versions as version where version.rule_id = p_rule_id and version.version = p_target_version;
  if not found or p_target_version >= v_rule.active_version then raise exception using errcode = '22023', message = 'TARGET_VERSION_INVALID'; end if;
  select lifecycle.skill_id into v_skill_id
  from public.learning_rule_dependencies as dependency
  join public.kael_rule_lifecycle_log as lifecycle
    on lifecycle.rule_id = dependency.rule_id
   and lifecycle.candidate_id = dependency.candidate_id
  where dependency.rule_id = p_rule_id
    and dependency.rule_version = v_rule.active_version
    and dependency.status = 'active'
  order by lifecycle.created_at desc, lifecycle.id desc
  limit 1;
  if v_skill_id is null then raise exception using errcode = '22023', message = 'PROVENANCE_REQUIRED'; end if;
  select rollback.* into v_result from public.rollback_learning_rule(p_rule_id, v_skill_id, left(trim(p_reason), 120), jsonb_build_object('actor_id', p_actor_id, 'target_version', p_target_version)) as rollback;
  if v_result.ok is not true then raise exception using errcode = 'P0001', message = coalesce(v_result.error_code, 'ROLLBACK_FAILED'); end if;
  v_new_version := v_rule.active_version + 1;
  insert into public.learning_rule_versions(rule_id, version, rule_payload, change_reason, status) values(p_rule_id, v_new_version, v_target.rule_payload, left(trim(p_reason), 1000), 'active');
  insert into public.learning_rule_dependencies(rule_id, rule_version, candidate_id, source_hash, evidence_hash, release_id, status)
  select p_rule_id, v_new_version, dependency.candidate_id, dependency.source_hash, dependency.evidence_hash, dependency.release_id, 'active' from public.learning_rule_dependencies as dependency where dependency.rule_id = p_rule_id and dependency.rule_version = p_target_version and dependency.status = 'active' on conflict do nothing;
  update public.learning_rules set rule_payload = v_target.rule_payload, active_version = v_new_version, status = 'active', rollback_available = p_target_version > 1 where id = p_rule_id;
  v_response := jsonb_build_object('event_id', v_event_id, 'action', 'rollback', 'resource_id', p_rule_id::text, 'actor_id', p_actor_id, 'recorded_at', v_now, 'new_version', v_new_version);
  insert into public.admin_system_mutation_receipts(actor_id, client_request_id, operation, resource_id, request, response) values(p_actor_id, p_client_request_id, 'learning_rollback', p_rule_id::text, v_request, v_response);
  return query select v_event_id, 'rollback'::text, p_rule_id::text, p_actor_id, v_now, v_new_version, false;
end;
$function$;

create or replace function public.admin_revoke_learning_rule_atomic(p_actor_id uuid, p_rule_id uuid, p_target_version integer, p_expected_version integer, p_client_request_id uuid, p_reason text)
returns table(event_id uuid, action text, resource_id text, actor_id uuid, recorded_at timestamptz, new_version integer, replayed boolean)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_rule public.learning_rules%rowtype;
  v_result record;
  v_prior public.admin_system_mutation_receipts%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_release_id text;
  v_request jsonb := jsonb_build_object('rule_id', p_rule_id, 'target_version', p_target_version, 'expected_version', p_expected_version, 'reason', left(trim(coalesce(p_reason, '')), 1000));
  v_response jsonb;
begin
  if not private.admin_system_actor_can_manage(p_actor_id) then raise exception using errcode = '42501', message = 'SYSTEM_MANAGE_REQUIRED'; end if;
  if p_client_request_id is null or char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_client_request_id::text, 0));
  select receipt.* into v_prior from public.admin_system_mutation_receipts as receipt where receipt.actor_id = p_actor_id and receipt.client_request_id = p_client_request_id;
  if found then
    if v_prior.operation <> 'learning_revoke' or v_prior.request <> v_request then raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED'; end if;
    return query select (v_prior.response->>'event_id')::uuid, v_prior.response->>'action', v_prior.response->>'resource_id', p_actor_id, (v_prior.response->>'recorded_at')::timestamptz, (v_prior.response->>'new_version')::integer, true; return;
  end if;
  select rule.* into v_rule from public.learning_rules as rule where rule.id = p_rule_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'RULE_NOT_FOUND'; end if;
  if v_rule.active_version <> p_expected_version or v_rule.status <> 'active' then raise exception using errcode = '40001', message = 'VERSION_CONFLICT'; end if;
  select dependency.release_id into v_release_id from public.learning_rule_dependencies as dependency where dependency.rule_id = p_rule_id and dependency.rule_version = v_rule.active_version order by dependency.created_at desc limit 1;
  select revoked.* into v_result from public.revoke_learning_rule_with_provenance(p_rule_id, v_rule.active_version, p_actor_id, p_reason, coalesce(v_release_id, 'admin-system')) as revoked;
  if v_result.ok is not true then raise exception using errcode = 'P0001', message = coalesce(v_result.error_code, 'REVOKE_FAILED'); end if;
  v_response := jsonb_build_object('event_id', v_event_id, 'action', 'revoke', 'resource_id', p_rule_id::text, 'actor_id', p_actor_id, 'recorded_at', v_now, 'new_version', v_rule.active_version);
  insert into public.admin_system_mutation_receipts(actor_id, client_request_id, operation, resource_id, request, response) values(p_actor_id, p_client_request_id, 'learning_revoke', p_rule_id::text, v_request, v_response);
  return query select v_event_id, 'revoke'::text, p_rule_id::text, p_actor_id, v_now, v_rule.active_version, false;
end;
$function$;

create or replace view public.admin_model_health_daily
with (security_invoker = true)
as
select
  date_trunc('day', log.created_at)::date as day,
  log.purpose,
  log.provider,
  log.model,
  count(*)::integer as call_count,
  count(*) filter (where log.success)::integer as success_count,
  count(*) filter (where not log.success)::integer as failure_count,
  count(*) filter (where log.fallback_used)::integer as fallback_count,
  coalesce(round(sum(log.cost_usd)::numeric, 6), 0)::numeric(12,6) as total_cost_usd,
  round(avg(log.latency_ms)::numeric, 2) as avg_latency_ms,
  percentile_cont(0.95) within group (order by log.latency_ms) filter (where log.latency_ms is not null) as p95_latency_ms,
  case when count(*) filter (where not log.success) = 0 then null else coalesce(max(log.error_code) filter (where not log.success), 'PROVIDER_FAILURE') end as failure_kind,
  max(log.created_at) as updated_at
from public.api_logs as log
where log.purpose is not null
group by 1, 2, 3, 4;

revoke all on public.admin_model_health_daily from public, anon, authenticated;
grant select on public.admin_model_health_daily to service_role;

revoke all on function public.admin_publish_price_baseline_version(uuid, uuid, uuid, timestamptz, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_retire_price_baseline(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_apply_service_taxonomy_revision(uuid, public.service_type, integer, uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_rollback_learning_rule_atomic(uuid, uuid, integer, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_learning_rule_atomic(uuid, uuid, integer, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_publish_price_baseline_version(uuid, uuid, uuid, timestamptz, integer, uuid, text) to service_role;
grant execute on function public.admin_retire_price_baseline(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.admin_apply_service_taxonomy_revision(uuid, public.service_type, integer, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.admin_rollback_learning_rule_atomic(uuid, uuid, integer, integer, uuid, text) to service_role;
grant execute on function public.admin_revoke_learning_rule_atomic(uuid, uuid, integer, integer, uuid, text) to service_role;

commit;
