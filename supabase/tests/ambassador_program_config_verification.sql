-- @pillar id: P212-milestone-cap-sql
-- @pillar invariant: No ambassador program version can be approved if any milestone, at the highest multiplier, pays back more than 60% of the commission its points stand for, or if milestones do not grow in both points and reward; the editor cannot approve their own draft, an approved version cannot be edited, and only one version is approved at a time
-- @pillar authority: governance/RULES.md #7 | Tu 2026-09-25: NestScout keeps at least 40% of referred commission
-- @pillar target: supabase/migrations/20260925110000_ambassador_program_config.sql
-- @pillar layer: sql
-- @pillar siblings: P211-ambassador-accrual-sql
-- @pillar mutation: Change the 6000 in private.ambassador_program_violations to 7000; the 60.0001% draft reports no violation and P212 raises P212_VIOLATION_NOT_REPORTED (observed)

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2120000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'ambassador-p212-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 3) as n;
update public.profiles set role = 'admin'
where id in ('c2120000-0000-4000-8000-000000000001', 'c2120000-0000-4000-8000-000000000002');
-- 3 stays a customer and holds no capability.

create or replace function pg_temp.program(p_top_reward integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'commission_vnd_per_point', 10000, 'customer_vnd_per_point', 10000, 'link_months', 12,
    'network_window_days', 90, 'rebook_min_jobs', 2, 'invite_claim_days', 7,
    'milestones', jsonb_build_array(
      jsonb_build_object('rank', 1, 'title_vi', 'Khởi động', 'title_en', 'Starter', 'points_required', 10, 'reward_vnd', 20000),
      jsonb_build_object('rank', 2, 'title_vi', 'Đại sứ', 'title_en', 'Ambassador', 'points_required', 2000, 'reward_vnd', p_top_reward)
    ),
    'multipliers', jsonb_build_array(
      jsonb_build_object('min_active_customers', 5, 'multiplier_bps', 11000),
      jsonb_build_object('min_active_customers', 10, 'multiplier_bps', 12000)
    )
  )
$$;

do $cap$
declare
  v_editor constant uuid := 'c2120000-0000-4000-8000-000000000001';
  v_approver constant uuid := 'c2120000-0000-4000-8000-000000000002';
  v_outsider constant uuid := 'c2120000-0000-4000-8000-000000000003';
  v_draft jsonb;
  v_seed_id uuid := (select id from public.ambassador_program_versions where status = 'approved');
begin
  begin
    perform public.admin_save_ambassador_program_draft(v_outsider, pg_temp.program(10000000));
    raise exception 'P212_OUTSIDER_SAVED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ADMIN_CAPABILITY_REQUIRED' then raise; end if;
  end;

  -- 10,000,001 VND for 2,000 points at 1.2x is 60.0001% of 20,000,000 VND commission.
  v_draft := public.admin_save_ambassador_program_draft(v_editor, pg_temp.program(10000001));
  if jsonb_array_length(v_draft->'violations') = 0 then
    raise exception 'P212_VIOLATION_NOT_REPORTED';
  end if;
  begin
    perform public.admin_approve_ambassador_program(v_approver, (v_draft->>'id')::uuid);
    raise exception 'P212_CAP_NOT_ENFORCED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'AMBASSADOR_PROGRAM_INVALID' then raise; end if;
  end;

  -- The same draft at exactly 60% passes, but not for the person who wrote it.
  v_draft := public.admin_save_ambassador_program_draft(v_editor, pg_temp.program(10000000));
  if jsonb_array_length(v_draft->'violations') <> 0 then
    raise exception 'P212_BOUNDARY_REJECTED: %', v_draft->'violations';
  end if;
  begin
    perform public.admin_approve_ambassador_program(v_editor, (v_draft->>'id')::uuid);
    raise exception 'P212_SELF_APPROVAL_ALLOWED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'AMBASSADOR_PROGRAM_SELF_APPROVAL' then raise; end if;
  end;

  perform public.admin_approve_ambassador_program(v_approver, (v_draft->>'id')::uuid);
  if (select count(*) from public.ambassador_program_versions where status = 'approved') <> 1
     or (select status from public.ambassador_program_versions where id = v_seed_id) <> 'retired'
     or (select status from public.ambassador_program_versions where id = (v_draft->>'id')::uuid) <> 'approved' then
    raise exception 'P212_APPROVAL_STATE_WRONG';
  end if;

  begin
    update public.ambassador_program_versions set link_months = 24 where id = (v_draft->>'id')::uuid;
    raise exception 'P212_APPROVED_EDITED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'AMBASSADOR_PROGRAM_IMMUTABLE' then raise; end if;
  end;
  begin
    update public.ambassador_milestones set reward_vnd = 99000000 where version_id = (v_draft->>'id')::uuid and rank = 2;
    raise exception 'P212_APPROVED_MILESTONE_EDITED';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'AMBASSADOR_PROGRAM_NOT_DRAFT' then raise; end if;
  end;
end;
$cap$;

do $monotonic$
declare
  v_program jsonb := pg_temp.program(10000000);
  v_draft jsonb;
begin
  v_program := jsonb_set(v_program, '{milestones,1,reward_vnd}', '15000');
  v_draft := public.admin_save_ambassador_program_draft('c2120000-0000-4000-8000-000000000001', v_program);
  if not (v_draft->'violations') ? 'NOT_INCREASING_RANK_2' then
    raise exception 'P212_NON_INCREASING_ACCEPTED: %', v_draft->'violations';
  end if;
end;
$monotonic$;

rollback;
