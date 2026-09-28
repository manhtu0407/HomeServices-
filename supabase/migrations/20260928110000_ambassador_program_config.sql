begin;

-- Worker ambassador program: milestone rewards replace the retired "higher level, lower fee"
-- promise. Every number lives in a versioned config an admin drafts and a different admin
-- approves; the database refuses any version that would hand back more than 60% of the
-- commission a point stands for, so no config edit can make fake customers profitable.

create or replace function private.assert_admin_capability(p_actor_id uuid, p_capability text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.profiles as profile
    where profile.id = p_actor_id and profile.role = 'admin'::public.user_role
  ) or exists (
    select 1
    from public.profiles as profile
    join public.admin_operator_accounts as operator_account on operator_account.user_id = profile.id
    where profile.id = p_actor_id
      and profile.role = 'admin_operator'::public.user_role
      and operator_account.status = 'active'
      and p_capability = any(operator_account.capabilities)
  ) then
    return;
  end if;
  raise exception 'ADMIN_CAPABILITY_REQUIRED' using errcode = 'P0001', detail = p_capability;
end;
$function$;

revoke all on function private.assert_admin_capability(uuid, text) from public, anon, authenticated;
grant execute on function private.assert_admin_capability(uuid, text) to service_role;

create table public.ambassador_program_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired', 'superseded')),
  commission_vnd_per_point integer not null check (commission_vnd_per_point between 1000 and 1000000),
  customer_vnd_per_point integer not null check (customer_vnd_per_point between 1000 and 1000000),
  link_months smallint not null check (link_months between 1 and 36),
  network_window_days smallint not null check (network_window_days between 7 and 365),
  rebook_min_jobs smallint not null check (rebook_min_jobs between 2 and 10),
  invite_claim_days smallint not null check (invite_claim_days between 1 and 30),
  created_by uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_by is null or approved_by is distinct from created_by),
  check (
    (status = 'draft' and approved_at is null and retired_at is null)
    or (status = 'approved' and approved_at is not null and retired_at is null)
    or (status = 'retired' and approved_at is not null and retired_at is not null)
    or (status = 'superseded' and approved_at is null and retired_at is not null)
  )
);

create unique index ambassador_program_one_approved
  on public.ambassador_program_versions (status) where status = 'approved';
create unique index ambassador_program_one_draft
  on public.ambassador_program_versions (status) where status = 'draft';

create table public.ambassador_milestones (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ambassador_program_versions(id) on delete cascade,
  rank smallint not null check (rank between 1 and 20),
  title_vi text not null check (pg_catalog.char_length(pg_catalog.btrim(title_vi)) between 2 and 40),
  title_en text not null check (pg_catalog.char_length(pg_catalog.btrim(title_en)) between 2 and 40),
  points_required integer not null check (points_required between 1 and 1000000),
  reward_vnd integer not null check (reward_vnd between 1000 and 100000000),
  unique (version_id, rank),
  unique (version_id, points_required)
);

create table public.ambassador_multiplier_tiers (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ambassador_program_versions(id) on delete cascade,
  min_active_customers integer not null check (min_active_customers between 1 and 1000),
  multiplier_bps integer not null check (multiplier_bps between 10001 and 12000),
  unique (version_id, min_active_customers)
);

alter table public.ambassador_program_versions enable row level security;
alter table public.ambassador_milestones enable row level security;
alter table public.ambassador_multiplier_tiers enable row level security;
revoke all on table public.ambassador_program_versions, public.ambassador_milestones,
  public.ambassador_multiplier_tiers from public, anon, authenticated;
grant all on table public.ambassador_program_versions, public.ambassador_milestones,
  public.ambassador_multiplier_tiers to service_role;

-- The cap is a constant in code, not config: the whole point is that config cannot move it.
create or replace function private.ambassador_program_violations(p_version_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_version public.ambassador_program_versions%rowtype;
  v_max_multiplier integer;
  v_problems text[] := '{}';
  v_prev_points integer;
  v_prev_reward integer;
  v_prev_multiplier integer;
  v_row record;
begin
  select * into v_version from public.ambassador_program_versions where id = p_version_id;
  if not found then
    return array['VERSION_NOT_FOUND'];
  end if;

  select coalesce(max(multiplier_bps), 10000) into v_max_multiplier
  from public.ambassador_multiplier_tiers where version_id = p_version_id;

  if not exists (select 1 from public.ambassador_milestones where version_id = p_version_id) then
    v_problems := v_problems || 'NO_MILESTONES';
  end if;

  for v_row in
    select * from public.ambassador_milestones where version_id = p_version_id order by rank
  loop
    if v_row.reward_vnd::numeric * v_max_multiplier
       > v_row.points_required::numeric * v_version.commission_vnd_per_point * 6000 then
      v_problems := v_problems || ('CAP_EXCEEDED_RANK_' || v_row.rank);
    end if;
    if v_prev_points is not null and (
      v_row.points_required <= v_prev_points or v_row.reward_vnd <= v_prev_reward
    ) then
      v_problems := v_problems || ('NOT_INCREASING_RANK_' || v_row.rank);
    end if;
    v_prev_points := v_row.points_required;
    v_prev_reward := v_row.reward_vnd;
  end loop;

  for v_row in
    select * from public.ambassador_multiplier_tiers where version_id = p_version_id order by min_active_customers
  loop
    if v_prev_multiplier is not null and v_row.multiplier_bps <= v_prev_multiplier then
      v_problems := v_problems || ('MULTIPLIER_NOT_INCREASING_' || v_row.min_active_customers);
    end if;
    v_prev_multiplier := v_row.multiplier_bps;
  end loop;

  return v_problems;
end;
$function$;

revoke all on function private.ambassador_program_violations(uuid) from public, anon, authenticated;
grant execute on function private.ambassador_program_violations(uuid) to service_role;

create or replace function private.enforce_ambassador_program_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_problems text[];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'AMBASSADOR_PROGRAM_NOT_DRAFT' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- An approved version may only be retired; nothing else about it can change.
    if not (old.status = 'approved' and new.status = 'retired'
            and (to_jsonb(new) - array['status', 'retired_at', 'updated_at'])
              = (to_jsonb(old) - array['status', 'retired_at', 'updated_at'])) then
      raise exception 'AMBASSADOR_PROGRAM_IMMUTABLE' using errcode = 'P0001';
    end if;
  end if;

  -- Milestones attach after the version row exists, so a version is always born a draft and
  -- is validated at the moment it becomes approved.
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'AMBASSADOR_PROGRAM_MUST_START_DRAFT' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.status = 'draft' and new.status = 'approved' then
    v_problems := private.ambassador_program_violations(new.id);
    if pg_catalog.cardinality(v_problems) > 0 then
      raise exception 'AMBASSADOR_PROGRAM_INVALID' using errcode = '23514',
        detail = pg_catalog.array_to_string(v_problems, ',');
    end if;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

create trigger ambassador_program_versions_lifecycle
before insert or update or delete on public.ambassador_program_versions
for each row execute function private.enforce_ambassador_program_lifecycle();

create or replace function private.enforce_ambassador_program_child_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_version_id uuid := case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  v_status text;
begin
  select status into v_status from public.ambassador_program_versions where id = v_version_id;
  -- A cascade from deleting a draft version finds no parent row; that is allowed.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'AMBASSADOR_PROGRAM_NOT_DRAFT' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger ambassador_milestones_draft_only
before insert or update or delete on public.ambassador_milestones
for each row execute function private.enforce_ambassador_program_child_draft();
create trigger ambassador_multiplier_tiers_draft_only
before insert or update or delete on public.ambassador_multiplier_tiers
for each row execute function private.enforce_ambassador_program_child_draft();

revoke all on function private.enforce_ambassador_program_lifecycle() from public, anon, authenticated;
revoke all on function private.enforce_ambassador_program_child_draft() from public, anon, authenticated;

-- Seed version 1 as a draft so the lifecycle trigger validates it on approval like any other.
do $seed$
declare
  v_id uuid;
  v_problems text[];
begin
  insert into public.ambassador_program_versions (
    version, commission_vnd_per_point, customer_vnd_per_point, link_months,
    network_window_days, rebook_min_jobs, invite_claim_days
  ) values (1, 10000, 10000, 12, 90, 2, 7)
  returning id into v_id;

  insert into public.ambassador_milestones (version_id, rank, title_vi, title_en, points_required, reward_vnd) values
    (v_id, 1, 'Khởi động', 'Starter', 10, 20000),
    (v_id, 2, 'Kết nối', 'Connector', 50, 125000),
    (v_id, 3, 'Uy tín', 'Trusted', 150, 450000),
    (v_id, 4, 'Chuyên gia', 'Expert', 400, 1400000),
    (v_id, 5, 'Thủ lĩnh', 'Leader', 1000, 4000000),
    (v_id, 6, 'Đại sứ NestScout', 'NestScout Ambassador', 2000, 10000000);

  insert into public.ambassador_multiplier_tiers (version_id, min_active_customers, multiplier_bps) values
    (v_id, 5, 11000),
    (v_id, 10, 12000);

  v_problems := private.ambassador_program_violations(v_id);
  if pg_catalog.cardinality(v_problems) > 0 then
    raise exception 'seed program invalid: %', v_problems;
  end if;

  update public.ambassador_program_versions
  set status = 'approved', approved_at = pg_catalog.now()
  where id = v_id;
end;
$seed$;

create or replace function private.ambassador_program_json(p_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'id', version.id,
    'version', version.version,
    'status', version.status,
    'commission_vnd_per_point', version.commission_vnd_per_point,
    'customer_vnd_per_point', version.customer_vnd_per_point,
    'link_months', version.link_months,
    'network_window_days', version.network_window_days,
    'rebook_min_jobs', version.rebook_min_jobs,
    'invite_claim_days', version.invite_claim_days,
    'created_by', version.created_by,
    'approved_by', version.approved_by,
    'approved_at', version.approved_at,
    'updated_at', version.updated_at,
    'violations', pg_catalog.to_jsonb(private.ambassador_program_violations(version.id)),
    'milestones', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', milestone.id,
        'rank', milestone.rank,
        'title_vi', milestone.title_vi,
        'title_en', milestone.title_en,
        'points_required', milestone.points_required,
        'reward_vnd', milestone.reward_vnd
      ) order by milestone.rank)
      from public.ambassador_milestones as milestone
      where milestone.version_id = version.id
    ), '[]'::jsonb),
    'multipliers', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'min_active_customers', tier.min_active_customers,
        'multiplier_bps', tier.multiplier_bps
      ) order by tier.min_active_customers)
      from public.ambassador_multiplier_tiers as tier
      where tier.version_id = version.id
    ), '[]'::jsonb)
  )
  from public.ambassador_program_versions as version
  where version.id = p_version_id;
$function$;

revoke all on function private.ambassador_program_json(uuid) from public, anon, authenticated;
grant execute on function private.ambassador_program_json(uuid) to service_role;

create or replace function public.admin_get_ambassador_program(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.bonus.manage');
  return pg_catalog.jsonb_build_object(
    'approved', (select private.ambassador_program_json(id) from public.ambassador_program_versions where status = 'approved'),
    'draft', (select private.ambassador_program_json(id) from public.ambassador_program_versions where status = 'draft')
  );
end;
$function$;

-- One open draft at a time. Saving marks the open draft superseded and writes a fresh draft
-- with the full milestone and multiplier set, so rows are only ever added, never rewritten, and
-- the editor never has to reconcile partial edits.
create or replace function public.admin_save_ambassador_program_draft(p_actor_id uuid, p_program jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_draft public.ambassador_program_versions%rowtype;
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.bonus.manage');

  if p_program is null or pg_catalog.jsonb_typeof(p_program) <> 'object'
     or pg_catalog.jsonb_typeof(p_program->'milestones') <> 'array'
     or pg_catalog.jsonb_array_length(p_program->'milestones') not between 1 and 20
     or pg_catalog.jsonb_typeof(coalesce(p_program->'multipliers', '[]'::jsonb)) <> 'array'
     or pg_catalog.jsonb_array_length(coalesce(p_program->'multipliers', '[]'::jsonb)) > 10 then
    raise exception 'INVALID_AMBASSADOR_PROGRAM_INPUT' using errcode = '22023';
  end if;

  update public.ambassador_program_versions
  set status = 'superseded', retired_at = pg_catalog.now()
  where status = 'draft';

  insert into public.ambassador_program_versions (
    version, commission_vnd_per_point, customer_vnd_per_point, link_months,
    network_window_days, rebook_min_jobs, invite_claim_days, created_by
  ) values (
    (select coalesce(max(version), 0) + 1 from public.ambassador_program_versions),
    (p_program->>'commission_vnd_per_point')::integer,
    (p_program->>'customer_vnd_per_point')::integer,
    (p_program->>'link_months')::smallint,
    (p_program->>'network_window_days')::smallint,
    (p_program->>'rebook_min_jobs')::smallint,
    (p_program->>'invite_claim_days')::smallint,
    p_actor_id
  ) returning * into v_draft;

  insert into public.ambassador_milestones (version_id, rank, title_vi, title_en, points_required, reward_vnd)
  select v_draft.id, milestone.rank, pg_catalog.btrim(milestone.title_vi), pg_catalog.btrim(milestone.title_en),
    milestone.points_required, milestone.reward_vnd
  from pg_catalog.jsonb_to_recordset(p_program->'milestones') as milestone(
    rank smallint, title_vi text, title_en text, points_required integer, reward_vnd integer
  );

  insert into public.ambassador_multiplier_tiers (version_id, min_active_customers, multiplier_bps)
  select v_draft.id, tier.min_active_customers, tier.multiplier_bps
  from pg_catalog.jsonb_to_recordset(coalesce(p_program->'multipliers', '[]'::jsonb)) as tier(
    min_active_customers integer, multiplier_bps integer
  );

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_ambassador_program', 'save_draft', 'ambassador_program', 'allow',
    'ambassador_program_draft_saved',
    pg_catalog.jsonb_build_object('version_id', v_draft.id, 'version', v_draft.version)
  );

  return private.ambassador_program_json(v_draft.id);
end;
$function$;

create or replace function public.admin_approve_ambassador_program(p_actor_id uuid, p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_draft public.ambassador_program_versions%rowtype;
  v_problems text[];
begin
  perform private.assert_admin_capability(p_actor_id, 'workers.bonus.manage');

  select * into v_draft from public.ambassador_program_versions where id = p_version_id for update;
  if not found or v_draft.status <> 'draft' then
    raise exception 'AMBASSADOR_PROGRAM_NOT_DRAFT' using errcode = 'P0001';
  end if;
  if v_draft.created_by = p_actor_id then
    raise exception 'AMBASSADOR_PROGRAM_SELF_APPROVAL' using errcode = 'P0001';
  end if;

  v_problems := private.ambassador_program_violations(p_version_id);
  if pg_catalog.cardinality(v_problems) > 0 then
    raise exception 'AMBASSADOR_PROGRAM_INVALID' using errcode = '23514',
      detail = pg_catalog.array_to_string(v_problems, ',');
  end if;

  update public.ambassador_program_versions
  set status = 'retired', retired_at = pg_catalog.now()
  where status = 'approved';

  update public.ambassador_program_versions
  set status = 'approved', approved_by = p_actor_id, approved_at = pg_catalog.now()
  where id = p_version_id;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_ambassador_program', 'approve', 'ambassador_program', 'allow',
    'ambassador_program_approved',
    pg_catalog.jsonb_build_object('version_id', p_version_id, 'version', v_draft.version)
  );

  return private.ambassador_program_json(p_version_id);
end;
$function$;

revoke all on function public.admin_get_ambassador_program(uuid) from public, anon, authenticated;
revoke all on function public.admin_save_ambassador_program_draft(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_approve_ambassador_program(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_get_ambassador_program(uuid) to service_role;
grant execute on function public.admin_save_ambassador_program_draft(uuid, jsonb) to service_role;
grant execute on function public.admin_approve_ambassador_program(uuid, uuid) to service_role;

commit;
