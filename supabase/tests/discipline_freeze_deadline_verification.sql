-- @pillar id: P269-freeze-deadline-auto-unfreeze-sql
-- @pillar invariant: An open level-3-or-higher case blocks redemption only until its admin decision deadline; once the deadline passes undecided, redemption opens again without any admin action, and a level-1 or level-2 proposal never blocks it
-- @pillar authority: Tu 2026-09-25: pending serious case freezes redemption with an admin deadline, overdue auto-unfreezes
-- @pillar target: supabase/migrations/20260925120000_worker_discipline_foundation.sql
-- @pillar layer: sql
-- @pillar siblings: P267-no-penalty-without-admin-sql, P262-redemption-idempotent-balance-sql
-- @pillar mutation: Drop "and decision_deadline_at > now()" from the pending CTE in private.worker_discipline_state; the overdue case keeps redemption frozen and P220 raises P269_OVERDUE_STILL_FROZEN

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c2200000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'discipline-p220-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 2) as n;
update public.profiles set role = 'worker' where id = 'c2200000-0000-4000-8000-000000000001';
insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
) values (
  'c2200000-0000-4000-8000-000000000001', array['plumbing']::public.service_type[], array['q7'],
  true, true, 4.9, 10, 'approved', false, 'Freeze Fixture Worker', '1990-01-01'
) on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;
insert into public.worker_ambassador_point_entries (worker_id, entry_kind, points_milli, actor_id, reason, idempotency_key)
values ('c2200000-0000-4000-8000-000000000001', 'admin_correction', 20000,
  'c2200000-0000-4000-8000-000000000002', 'Verification fixture balance', 'p220-fixture');

do $deadline$
declare
  v_worker constant uuid := 'c2200000-0000-4000-8000-000000000001';
  v_case uuid;
  v_result record;
begin
  perform private.propose_violation_case(v_worker, null, null, 'no_show', 'admin', null, null, '{}', 'p220-l2');
  if (select redemption_frozen_until from private.worker_discipline_state(v_worker)) is not null then
    raise exception 'P269_L2_PROPOSAL_FROZE';
  end if;

  v_case := private.propose_violation_case(v_worker, null, null, 'fake_review', 'admin', null, null, '{}', 'p220-l4');
  if (select redemption_frozen_until from private.worker_discipline_state(v_worker))
     is distinct from (select decision_deadline_at from public.worker_violation_cases where id = v_case) then
    raise exception 'P269_PENDING_FREEZE_NOT_AT_DEADLINE';
  end if;
  select * into v_result from public.redeem_ambassador_milestone(v_worker,
    (select milestone.id from public.ambassador_milestones as milestone
     join public.ambassador_program_versions as version on version.id = milestone.version_id
     where version.status = 'approved' and milestone.rank = 1), gen_random_uuid());
  if v_result.error_code <> 'REDEMPTION_FROZEN' then
    raise exception 'P269_PENDING_REDEMPTION_ALLOWED: %', v_result.error_code;
  end if;

  update public.worker_violation_cases set decision_deadline_at = now() - interval '1 minute' where id = v_case;
  if (select redemption_frozen_until from private.worker_discipline_state(v_worker)) is not null then
    raise exception 'P269_OVERDUE_STILL_FROZEN';
  end if;
end;
$deadline$;

rollback;
