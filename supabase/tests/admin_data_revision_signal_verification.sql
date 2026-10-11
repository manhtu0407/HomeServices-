-- @pillar id: P347-admin-data-revision-signal-sql
-- @pillar invariant: Admin section revisions expose only authorized section counters and source writes increment the matching counter
-- @pillar authority: governance/RULES.md #5 and #8 | Admin Gates live-refresh plan
-- @pillar target: supabase/migrations/20261011110000_admin_data_revision_signal.sql
-- @pillar layer: sql
-- @pillar siblings: P52-admin-finance-focused-capabilities
-- @pillar mutation: Combine profile INSERT and DELETE in one trigger condition that references NEW; PostgreSQL rejects the migration

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c3470000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-p347@example.test',
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c3470000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'operator-p347@example.test',
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c3470000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'worker-p347@example.test',
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c3470000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'operator-ops-p347@example.test',
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'admin' where id = 'c3470000-0000-4000-8000-000000000001';
update public.profiles set role = 'admin_operator' where id = 'c3470000-0000-4000-8000-000000000002';
update public.profiles set role = 'worker' where id = 'c3470000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin_operator' where id = 'c3470000-0000-4000-8000-000000000004';
insert into public.admin_operator_accounts (user_id, baseline_role, capabilities, status, granted_by, last_changed_by)
values ('c3470000-0000-4000-8000-000000000002', 'customer', array['finance.read', 'system.read']::text[], 'active',
  'c3470000-0000-4000-8000-000000000001', 'c3470000-0000-4000-8000-000000000001'),
  ('c3470000-0000-4000-8000-000000000004', 'customer', array['operations.read', 'transactions.read', 'workers.read', 'team.read']::text[], 'active',
  'c3470000-0000-4000-8000-000000000001', 'c3470000-0000-4000-8000-000000000001');

do $grants$
begin
  if not has_table_privilege('authenticated', 'public.admin_data_revisions', 'select')
    or has_table_privilege('authenticated', 'public.admin_data_revisions', 'insert')
    or has_table_privilege('authenticated', 'public.admin_data_revisions', 'update')
    or has_table_privilege('authenticated', 'public.admin_data_revisions', 'delete')
    or has_table_privilege('anon', 'public.admin_data_revisions', 'select') then
    raise exception 'P347_REVISION_GRANTS_EXCEED_READ_ONLY_AUTHENTICATED';
  end if;
end;
$grants$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3470000-0000-4000-8000-000000000001';

do $owner_read$
declare v_sections integer;
begin
  select count(*) into v_sections from public.admin_data_revisions;
  if v_sections <> 6 then raise exception 'P347_ADMIN_CANNOT_READ_ALL_SECTIONS: %', v_sections; end if;
  begin
    insert into public.admin_data_revisions (section) values ('finance');
    raise exception 'P347_ADMIN_MUTATED_REVISION_SIGNAL';
  exception when insufficient_privilege then null;
  end;
end;
$owner_read$;

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3470000-0000-4000-8000-000000000002';

do $operator_read$
declare v_sections integer; v_allowed text[];
begin
  select count(*), array_agg(section order by section) into v_sections, v_allowed
  from public.admin_data_revisions;
  if v_sections <> 2 or v_allowed <> array['finance', 'system']::text[] then
    raise exception 'P347_OPERATOR_CAPABILITY_SCOPE_WRONG: count %, sections %', v_sections, v_allowed;
  end if;
end;
$operator_read$;

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3470000-0000-4000-8000-000000000004';

do $operator_scope_read$
declare v_sections integer; v_allowed text[];
begin
  select count(*), array_agg(section order by section) into v_sections, v_allowed
  from public.admin_data_revisions;
  if v_sections <> 4 or v_allowed <> array['operations', 'overview', 'team', 'workers']::text[] then
    raise exception 'P347_OPERATIONS_CAPABILITY_SCOPE_WRONG: count %, sections %', v_sections, v_allowed;
  end if;
end;
$operator_scope_read$;

reset role;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'c3470000-0000-4000-8000-000000000003';

do $worker_read$
declare v_sections integer;
begin
  select count(*) into v_sections from public.admin_data_revisions;
  if v_sections <> 0 then raise exception 'P347_NON_ADMIN_READ_REVISION_SIGNAL: %', v_sections; end if;
end;
$worker_read$;

reset role;
do $bump$
declare v_before bigint; v_after bigint;
begin
  select revision into strict v_before from public.admin_data_revisions where section = 'team';
  update public.admin_operator_accounts set updated_at = now() where user_id = 'c3470000-0000-4000-8000-000000000002';
  select revision into strict v_after from public.admin_data_revisions where section = 'team';
  if v_after <= v_before then raise exception 'P347_TEAM_WRITE_DID_NOT_BUMP_REVISION'; end if;
end;
$bump$;

do $profile_events$
declare v_before jsonb; v_unchanged integer;
begin
  select jsonb_object_agg(section, revision) into strict v_before
  from public.admin_data_revisions;
  delete from public.profiles where id = 'c3470000-0000-4000-8000-000000000003';
  select count(*) into v_unchanged
  from public.admin_data_revisions
  where revision <= (v_before ->> section)::bigint;
  if v_unchanged <> 0 then raise exception 'P347_PROFILE_DELETE_DID_NOT_BUMP_ALL_REVISIONS: %', v_unchanged; end if;

  select jsonb_object_agg(section, revision) into strict v_before
  from public.admin_data_revisions;
  insert into public.profiles (id, role)
  values ('c3470000-0000-4000-8000-000000000003', 'worker');
  select count(*) into v_unchanged
  from public.admin_data_revisions
  where revision <= (v_before ->> section)::bigint;
  if v_unchanged <> 0 then raise exception 'P347_PROFILE_INSERT_DID_NOT_BUMP_ALL_REVISIONS: %', v_unchanged; end if;
end;
$profile_events$;

do $source_triggers$
declare v_table text; v_required text[] := array[
  'admin_support_case_notes', 'admin_support_case_preparations', 'admin_model_health_daily',
  'evidence_snapshots', 'job_media_assets', 'kael_cost_daily_summary', 'kael_estimate_accuracy',
  'matching_capacity_reservations', 'workflow_recovery_action_audit'
];
begin
  foreach v_table in array v_required loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise exception 'P347_REQUIRED_ADMIN_SOURCE_TABLE_MISSING: %', v_table;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_trigger
      where tgrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table))
        and tgname = 'admin_revision_' || v_table
        and not tgisinternal
    ) then
      raise exception 'P347_ADMIN_SOURCE_WRITE_HAS_NO_REVISION_TRIGGER: %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass and tgname = 'admin_revision_profiles_update' and not tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass and tgname = 'admin_revision_profiles_insert'
      and not tgisinternal and (tgtype & 4) = 4
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass and tgname = 'admin_revision_profiles_delete'
      and not tgisinternal and (tgtype & 8) = 8
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.api_logs'::regclass and tgname = 'admin_revision_api_logs_signal' and not tgisinternal
  ) or not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.chat_messages'::regclass and tgname = 'admin_revision_chat_messages_support_only' and not tgisinternal
  ) then
    raise exception 'P347_FOCUSED_ADMIN_SOURCE_TRIGGER_MISSING';
  end if;
end;
$source_triggers$;

select 'PASS: Admin revision rows are capability scoped, read-only, and source writes advance their section counter' as result;
rollback;
