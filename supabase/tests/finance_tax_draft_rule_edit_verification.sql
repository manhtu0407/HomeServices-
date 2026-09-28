-- @pillar id: P283-tax-draft-rules-edit-in-place-sql
-- @pillar invariant: Saving an existing tax policy draft updates its saved rules in place and adds new ones, never deleting a row; a save that leaves out a saved rule is refused with TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT and changes nothing
-- @pillar authority: governance/RULES.md #7 | Plan moonlit-singing-phoenix R1: the release gate forbids DELETE in stored SQL
-- @pillar target: supabase/migrations/20260928112000_ambassador_points_and_redemptions.sql
-- @pillar layer: sql
-- @pillar siblings: P262-redemption-idempotent-balance-sql
-- @pillar mutation: Delete the TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT check from admin_save_finance_tax_policy_draft; the save that omits a rule succeeds and P283 raises P283_RULE_REMOVAL_ALLOWED

begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('c2830000-0000-4000-8000-000000000001','authenticated','authenticated','tax-p283-admin@example.test',
  '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role = 'admin' where id = 'c2830000-0000-4000-8000-000000000001';

do $tax_edit$
declare
  v_admin constant uuid := 'c2830000-0000-4000-8000-000000000001';
  v_policy jsonb;
  v_policy_id uuid;
  v_bonus_rule_id uuid;
  v_rejected boolean := false;
begin
  v_policy := public.admin_save_finance_tax_policy_draft(
    v_admin, null, 'worker_tax_p283', 1, 'Thuế thợ thử nghiệm', 'worker', '2030-01-01', null,
    '[{"tax_code":"pit_bonus","label":"Thuế thưởng","calculation_basis":"worker_bonus","rate_bps":1000,"applies_at_or_above_vnd":2000000},
      {"tax_code":"pit_net","label":"Thuế thu nhập","calculation_basis":"worker_net","rate_bps":500}]'::jsonb
  );
  v_policy_id := (v_policy->>'policy_id')::uuid;
  select id into strict v_bonus_rule_id from public.admin_finance_tax_rules
  where policy_id = v_policy_id and tax_code = 'pit_bonus';

  perform public.admin_save_finance_tax_policy_draft(
    v_admin, v_policy_id, 'worker_tax_p283', 1, 'Thuế thợ thử nghiệm', 'worker', '2030-01-01', null,
    '[{"tax_code":"pit_bonus","label":"Thuế thưởng mới","calculation_basis":"worker_bonus","rate_bps":1200,"applies_at_or_above_vnd":2500000},
      {"tax_code":"pit_net","label":"Thuế thu nhập","calculation_basis":"worker_net","rate_bps":500},
      {"tax_code":"pit_extra","label":"Thuế bổ sung","calculation_basis":"worker_net","rate_bps":100}]'::jsonb
  );
  if not exists (
    select 1 from public.admin_finance_tax_rules
    where id = v_bonus_rule_id and rate_bps = 1200 and label = 'Thuế thưởng mới' and applies_at_or_above_vnd = 2500000
  ) then
    raise exception 'P283_RULE_NOT_EDITED_IN_PLACE';
  end if;
  if (select count(*) from public.admin_finance_tax_rules where policy_id = v_policy_id) <> 3 then
    raise exception 'P283_NEW_RULE_NOT_ADDED';
  end if;

  begin
    perform public.admin_save_finance_tax_policy_draft(
      v_admin, v_policy_id, 'worker_tax_p283', 1, 'Thuế thợ thử nghiệm', 'worker', '2030-01-01', null,
      '[{"tax_code":"pit_bonus","label":"Thuế thưởng","calculation_basis":"worker_bonus","rate_bps":900}]'::jsonb
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'P283_RULE_REMOVAL_ALLOWED';
  end if;
  if (select count(*) from public.admin_finance_tax_rules where policy_id = v_policy_id) <> 3
     or (select rate_bps from public.admin_finance_tax_rules where id = v_bonus_rule_id) <> 1200 then
    raise exception 'P283_REFUSED_SAVE_CHANGED_RULES';
  end if;
end;
$tax_edit$;

rollback;
