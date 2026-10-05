-- @pillar id: P307-customer-invite-claim-status-sql
-- @pillar invariant: The membership summary reports whether an invite claim could still succeed, in the same order claim_referral_code decides it — linked before window closed before already paid — and the status follows a real claim from open to linked across the whole worker-code-to-customer-link flow
-- @pillar authority: governance/RULES.md #8 | governance/structures/pricing-fees-scope.md (Ambassador program: claim window, before any paid order, one active link)
-- @pillar target: supabase/migrations/20261005100000_customer_membership_invite_claim_status.sql
-- @pillar layer: sql
-- @pillar siblings: P263-referral-claim-window-sql, P264-customer-membership-ledger-sql
-- @pillar mutation: Check the paid-order branch before the window branch, or drop the open-link branch, in get_customer_membership_summary; the old or linked customer reports the wrong status and P307 raises P307_STATUS_WRONG

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('c3070000-0000-4000-8000-00000000000' || n)::uuid, 'authenticated', 'authenticated',
  'invite-status-p307-' || n || '@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 6) as n;
-- 1, 2 = workers; 3 = new customer; 4 = customer past the window; 5 = paying customer;
-- 6 = old customer who is also linked, so linked must win over the closed window.
update public.profiles set role = 'worker', full_name = 'Invite Status Worker'
where id in ('c3070000-0000-4000-8000-000000000001', 'c3070000-0000-4000-8000-000000000002');
update public.profiles set created_at = now() - interval '30 days'
where id in ('c3070000-0000-4000-8000-000000000004', 'c3070000-0000-4000-8000-000000000006');

insert into public.worker_profiles (
  id, service_types, districts, is_approved, is_available, rating,
  total_jobs, verification_status, is_suspended, legal_name, date_of_birth
)
select id, array['plumbing']::public.service_type[], array['q7'], true, true, 4.9, 10, 'approved', false,
  'Invite Status Fixture Worker', '1990-01-01'
from (values ('c3070000-0000-4000-8000-000000000001'::uuid), ('c3070000-0000-4000-8000-000000000002'::uuid)) as w(id)
on conflict (id) do update set is_approved = true, verification_status = 'approved', is_suspended = false;

insert into public.jobs (id, customer_id, worker_id, service_type, description, status, final_price,
  gross_amount, platform_fee, worker_net, display_code, created_at, paid_at)
values ('c3070000-0000-4000-8000-000000000101', 'c3070000-0000-4000-8000-000000000005',
  'c3070000-0000-4000-8000-000000000002', 'plumbing', 'Invite status fixture', 'paid', 300000, 300000,
  45000, 255000, 'P307-0001', now(), now());

do $statuses$
declare
  v_program public.ambassador_program_versions%rowtype := private.current_ambassador_program();
  v_summary jsonb;
begin
  if v_program.id is null then
    raise exception 'P307_NO_APPROVED_PROGRAM';
  end if;

  v_summary := public.get_customer_membership_summary('c3070000-0000-4000-8000-000000000004');
  if v_summary #>> '{invite_claim,status}' <> 'window_closed' then
    raise exception 'P307_STATUS_WRONG: old customer reads %', v_summary #>> '{invite_claim,status}';
  end if;

  v_summary := public.get_customer_membership_summary('c3070000-0000-4000-8000-000000000005');
  if v_summary #>> '{invite_claim,status}' <> 'transacted' then
    raise exception 'P307_STATUS_WRONG: paying customer reads %', v_summary #>> '{invite_claim,status}';
  end if;

  insert into public.customer_worker_links (customer_id, worker_id, source, program_version_id, formed_at, expires_at)
  values ('c3070000-0000-4000-8000-000000000006', 'c3070000-0000-4000-8000-000000000002', 'rebook',
    v_program.id, now(), now() + interval '12 months');
  v_summary := public.get_customer_membership_summary('c3070000-0000-4000-8000-000000000006');
  if v_summary #>> '{invite_claim,status}' <> 'linked' then
    raise exception 'P307_STATUS_WRONG: linked old customer reads %', v_summary #>> '{invite_claim,status}';
  end if;
end;
$statuses$;

-- The whole flow: a worker creates a code, a new customer sees an open claim, a typo is
-- refused without linking, the real code links, and a second worker's code is refused.
do $flow$
declare
  v_new constant uuid := 'c3070000-0000-4000-8000-000000000003';
  v_program public.ambassador_program_versions%rowtype := private.current_ambassador_program();
  v_code_a text := public.ensure_worker_referral_code('c3070000-0000-4000-8000-000000000001');
  v_code_b text := public.ensure_worker_referral_code('c3070000-0000-4000-8000-000000000002');
  v_created_at timestamptz := (select created_at from public.profiles where id = v_new);
  v_summary jsonb;
  v_result record;
begin
  v_summary := public.get_customer_membership_summary(v_new);
  if v_summary #>> '{invite_claim,status}' <> 'open'
     or (v_summary #>> '{invite_claim,closes_at}')::timestamptz
        <> v_created_at + pg_catalog.make_interval(days => v_program.invite_claim_days)
     or (v_summary #>> '{invite_claim,claim_days}')::integer <> v_program.invite_claim_days
     or (v_summary #>> '{invite_claim,link_months}')::integer <> v_program.link_months
     or v_summary -> 'linked_worker' <> 'null'::jsonb then
    raise exception 'P307_OPEN_SUMMARY_WRONG: %', v_summary -> 'invite_claim';
  end if;

  select * into v_result from public.claim_referral_code(v_new, 'NOPE2345');
  if v_result.outcome <> 'CODE_NOT_FOUND'
     or public.get_customer_membership_summary(v_new) #>> '{invite_claim,status}' <> 'open' then
    raise exception 'P307_TYPO_CHANGED_STATUS: %', v_result.outcome;
  end if;

  select * into v_result from public.claim_referral_code(v_new, v_code_a);
  if v_result.outcome <> 'LINKED' then
    raise exception 'P307_VALID_CLAIM_REFUSED: %', v_result.outcome;
  end if;

  v_summary := public.get_customer_membership_summary(v_new);
  if v_summary #>> '{invite_claim,status}' <> 'linked'
     or v_summary #>> '{linked_worker,worker_id}' <> 'c3070000-0000-4000-8000-000000000001'
     or v_summary #>> '{linked_worker,source}' <> 'invite_code'
     or v_summary #>> '{linked_worker,display_name}' <> 'Invite Status Worker' then
    raise exception 'P307_LINK_NOT_REPORTED: %', v_summary;
  end if;

  select * into v_result from public.claim_referral_code(v_new, v_code_b);
  if v_result.outcome <> 'LINKED_TO_OTHER_WORKER' then
    raise exception 'P307_SECOND_WORKER_ACCEPTED: %', v_result.outcome;
  end if;
end;
$flow$;

rollback;
