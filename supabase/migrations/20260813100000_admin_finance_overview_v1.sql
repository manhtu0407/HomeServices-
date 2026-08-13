begin;

create table public.admin_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique check (source_key ~ '^[A-Za-z0-9._:-]{1,120}$'),
  adjustment_type text not null check (adjustment_type in ('refund', 'commission_reversal', 'worker_credit')),
  realization_status text not null default 'completed' check (realization_status = 'completed'),
  job_id uuid not null references public.jobs(id) on delete restrict,
  payment_order_id uuid references public.job_payment_orders(id) on delete restrict,
  dispute_id uuid references public.disputes(id) on delete restrict,
  worker_id uuid references public.worker_profiles(id) on delete restrict,
  gross_refund_vnd integer not null default 0 check (gross_refund_vnd >= 0),
  commission_reversal_vnd integer not null default 0 check (commission_reversal_vnd >= 0),
  worker_credit_vnd integer not null default 0 check (worker_credit_vnd >= 0),
  cash_outflow_vnd integer not null default 0 check (cash_outflow_vnd >= 0),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{3,80}$'),
  safe_metadata jsonb not null default '{}'::jsonb,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  realized_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (pg_catalog.jsonb_typeof(safe_metadata) = 'object'),
  check (not safe_metadata ?| array[
    'phone', 'email', 'full_name', 'address', 'bank_account',
    'account_number', 'customer_name', 'worker_name'
  ]),
  check (
    (adjustment_type = 'refund'
      and gross_refund_vnd > 0
      and commission_reversal_vnd <= gross_refund_vnd
      and worker_credit_vnd = 0
      and cash_outflow_vnd = gross_refund_vnd)
    or (adjustment_type = 'commission_reversal'
      and gross_refund_vnd = 0
      and commission_reversal_vnd > 0
      and worker_credit_vnd = 0
      and cash_outflow_vnd = 0)
    or (adjustment_type = 'worker_credit'
      and gross_refund_vnd = 0
      and commission_reversal_vnd = 0
      and worker_credit_vnd > 0
      and cash_outflow_vnd = 0
      and worker_id is not null)
  )
);

create index admin_financial_adjustments_realized_idx
  on public.admin_financial_adjustments (realized_at desc, id desc);
create index admin_financial_adjustments_job_idx
  on public.admin_financial_adjustments (job_id, realized_at desc);
create index admin_financial_adjustments_worker_idx
  on public.admin_financial_adjustments (worker_id, realized_at desc)
  where worker_id is not null;

create table public.admin_finance_tax_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null check (policy_key ~ '^[a-z0-9_]{3,64}$'),
  version integer not null check (version > 0),
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 3 and 120),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  subject_type text not null check (subject_type in ('platform', 'worker')),
  effective_from date not null,
  effective_to date,
  source_reference text check (source_reference is null or pg_catalog.char_length(pg_catalog.btrim(source_reference)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  approval_evidence_ref text,
  retired_by uuid references public.profiles(id) on delete restrict,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_key, version),
  check (effective_to is null or effective_to >= effective_from),
  check (approval_evidence_ref is null or pg_catalog.char_length(pg_catalog.btrim(approval_evidence_ref)) between 3 and 500),
  check (
    (status = 'draft' and approved_by is null and approved_at is null and retired_by is null and retired_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null and approval_evidence_ref is not null and retired_by is null and retired_at is null)
    or (status = 'retired' and approved_by is not null and approved_at is not null and approval_evidence_ref is not null and retired_by is not null and retired_at is not null)
  )
);

create table public.admin_finance_tax_rules (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.admin_finance_tax_policies(id) on delete restrict,
  tax_code text not null check (tax_code ~ '^[a-z0-9_]{2,40}$'),
  label text not null check (pg_catalog.char_length(pg_catalog.btrim(label)) between 2 and 120),
  calculation_basis text not null check (calculation_basis in (
    'gmv', 'commission_collected', 'commission_retained', 'worker_net_paid',
    'platform_commission', 'worker_net'
  )),
  rate_bps integer not null check (rate_bps between 1 and 10000),
  service_type public.service_type,
  created_at timestamptz not null default now(),
  unique (policy_id, tax_code, service_type)
);

create index admin_finance_tax_policies_status_effective_idx
  on public.admin_finance_tax_policies (status, effective_from, effective_to);
create index admin_finance_tax_rules_policy_idx
  on public.admin_finance_tax_rules (policy_id);

alter table public.admin_financial_adjustments enable row level security;
alter table public.admin_finance_tax_policies enable row level security;
alter table public.admin_finance_tax_rules enable row level security;

revoke all on table public.admin_financial_adjustments from public, anon, authenticated;
revoke all on table public.admin_finance_tax_policies from public, anon, authenticated;
revoke all on table public.admin_finance_tax_rules from public, anon, authenticated;
grant all on table public.admin_financial_adjustments to service_role;
grant all on table public.admin_finance_tax_policies to service_role;
grant all on table public.admin_finance_tax_rules to service_role;

create or replace function private.prevent_admin_financial_adjustment_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'FINANCIAL_ADJUSTMENT_IMMUTABLE' using errcode = 'P0001';
end;
$function$;

create trigger admin_financial_adjustments_immutable
before update or delete on public.admin_financial_adjustments
for each row execute function private.prevent_admin_financial_adjustment_mutation();

create or replace function private.validate_admin_financial_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_existing_refund bigint;
  v_existing_reversal bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.job_id::text, 0));

  select job.* into strict v_job
  from public.jobs as job
  where job.id = new.job_id
  for update;

  if v_job.status not in ('paid'::public.job_status, 'reviewed'::public.job_status)
    or v_job.paid_at is null
    or coalesce(v_job.gross_amount, v_job.payment_amount_received, v_job.final_price) is null
    or v_job.platform_fee is null then
    raise exception 'PAID_JOB_FINANCIAL_SNAPSHOT_REQUIRED' using errcode = 'P0001';
  end if;

  if new.payment_order_id is not null and not exists (
    select 1 from public.job_payment_orders as payment_order
    where payment_order.id = new.payment_order_id and payment_order.job_id = new.job_id
  ) then
    raise exception 'PAYMENT_ORDER_JOB_MISMATCH' using errcode = '23514';
  end if;

  if new.dispute_id is not null and not exists (
    select 1 from public.disputes as dispute
    where dispute.id = new.dispute_id and dispute.job_id = new.job_id
  ) then
    raise exception 'DISPUTE_JOB_MISMATCH' using errcode = '23514';
  end if;

  if new.worker_id is not null and new.worker_id is distinct from v_job.worker_id then
    raise exception 'WORKER_JOB_MISMATCH' using errcode = '23514';
  end if;

  select
    coalesce(sum(adjustment.gross_refund_vnd), 0),
    coalesce(sum(adjustment.commission_reversal_vnd), 0)
  into v_existing_refund, v_existing_reversal
  from public.admin_financial_adjustments as adjustment
  where adjustment.job_id = new.job_id;

  if v_existing_refund + new.gross_refund_vnd
      > coalesce(v_job.gross_amount, v_job.payment_amount_received, v_job.final_price)
    or v_existing_reversal + new.commission_reversal_vnd > v_job.platform_fee then
    raise exception 'ADJUSTMENT_EXCEEDS_JOB_SNAPSHOT' using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger admin_financial_adjustments_validate
before insert on public.admin_financial_adjustments
for each row execute function private.validate_admin_financial_adjustment();

create or replace function private.finance_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger admin_finance_tax_policies_touch_updated_at
before update on public.admin_finance_tax_policies
for each row execute function private.finance_touch_updated_at();

create or replace function private.enforce_finance_tax_policy_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transition text := pg_catalog.current_setting('app.finance_tax_transition', true);
begin
  if tg_op = 'DELETE' then
    raise exception 'TAX_POLICY_IMMUTABLE' using errcode = 'P0001';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    return new;
  end if;

  if v_transition = old.id::text || ':' || new.status
    and ((old.status = 'draft' and new.status = 'approved')
      or (old.status = 'approved' and new.status = 'retired')) then
    return new;
  end if;

  raise exception 'INVALID_TAX_POLICY_TRANSITION' using errcode = 'P0001';
end;
$function$;

create trigger admin_finance_tax_policies_lifecycle
before update or delete on public.admin_finance_tax_policies
for each row execute function private.enforce_finance_tax_policy_lifecycle();

create or replace function private.enforce_finance_tax_rule_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy_id uuid := case when tg_op = 'DELETE' then old.policy_id else new.policy_id end;
  v_status text;
begin
  if tg_op = 'UPDATE' and new.policy_id is distinct from old.policy_id then
    raise exception 'TAX_RULE_POLICY_IMMUTABLE' using errcode = 'P0001';
  end if;

  select policy.status into v_status
  from public.admin_finance_tax_policies as policy
  where policy.id = v_policy_id;

  if v_status is distinct from 'draft' then
    raise exception 'TAX_RULES_REQUIRE_DRAFT_POLICY' using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger admin_finance_tax_rules_draft_only
before insert or update or delete on public.admin_finance_tax_rules
for each row execute function private.enforce_finance_tax_rule_draft();

create or replace function private.assert_finance_reader(p_actor_id uuid)
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
      and 'finance.read' = any(operator_account.capabilities)
  ) then
    return;
  end if;

  raise exception 'FINANCE_READ_REQUIRED' using errcode = 'P0001';
end;
$function$;

create or replace function private.assert_finance_tax_manager(p_actor_id uuid)
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
      and 'finance.tax.manage' = any(operator_account.capabilities)
  ) then
    return;
  end if;

  raise exception 'FINANCE_TAX_MANAGE_REQUIRED' using errcode = 'P0001';
end;
$function$;

revoke all on function private.assert_finance_reader(uuid) from public, anon, authenticated;
revoke all on function private.assert_finance_tax_manager(uuid) from public, anon, authenticated;
grant execute on function private.assert_finance_reader(uuid) to service_role;
grant execute on function private.assert_finance_tax_manager(uuid) to service_role;

update public.admin_operator_accounts as operator_account
set capabilities = pg_catalog.array_append(operator_account.capabilities, 'finance.read')
where operator_account.status = 'active'
  and not ('finance.read' = any(operator_account.capabilities));

create or replace function public.admin_set_sub_admin_access_atomic(
  p_owner_id uuid,
  p_target_id uuid,
  p_action text,
  p_capabilities text[] default '{}',
  p_reason text default null
)
returns table(
  ok boolean,
  error_code text,
  user_id uuid,
  status_out text,
  role_out public.user_role,
  capabilities_out text[],
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target public.profiles%rowtype;
  v_account public.admin_operator_accounts%rowtype;
  v_nomination public.admin_manager_nominations%rowtype;
  v_role_out public.user_role;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_capabilities text[] := coalesce(p_capabilities, '{}'::text[]);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles as owner_profile
    where owner_profile.id = p_owner_id and owner_profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'OWNER_REQUIRED'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if p_target_id is null or p_target_id = p_owner_id then
    return query select false, 'INVALID_TARGET'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_action not in ('grant', 'update', 'revoke') then
    return query select false, 'INVALID_ACTION'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if pg_catalog.cardinality(v_capabilities) > 11
    or exists (
      select 1 from pg_catalog.unnest(v_capabilities) as capability
      where capability not in (
        'operations.read', 'workers.read', 'workers.review', 'workers.manage',
        'transactions.read', 'finance.read', 'finance.reconcile',
        'finance.tax.manage', 'payouts.read', 'payouts.process', 'team.read'
      )
    )
    or (select count(*) from pg_catalog.unnest(v_capabilities))
      <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
    or (v_action = 'revoke' and (pg_catalog.char_length(v_reason) < 3 or pg_catalog.char_length(v_reason) > 500)) then
    return query select false, 'INVALID_INPUT'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_action in ('grant', 'update') and not ('finance.read' = any(v_capabilities)) then
    v_capabilities := pg_catalog.array_append(v_capabilities, 'finance.read');
  end if;

  select profile_row.* into v_target
  from public.profiles as profile_row
  where profile_row.id = p_target_id
  for update;

  if not found then
    return query select false, 'TARGET_NOT_FOUND'::text, p_target_id, null::text, null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  if v_target.role = 'admin'::public.user_role then
    return query select false, 'OWNER_CANNOT_BE_OPERATOR'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select account_row.* into v_account
  from public.admin_operator_accounts as account_row
  where account_row.user_id = p_target_id
  for update;

  if v_action = 'grant' then
    if found then
      if v_target.role not in ('admin_operator'::public.user_role, v_account.baseline_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, v_account.capabilities, null::timestamptz;
        return;
      end if;

      update public.admin_operator_accounts as operator_account
      set capabilities = v_capabilities,
          status = 'active',
          last_changed_by = p_owner_id,
          revoked_at = null
      where operator_account.user_id = p_target_id
      returning * into v_account;
    else
      if v_target.role not in ('customer'::public.user_role, 'worker'::public.user_role) then
        return query select false, 'INVALID_TARGET_ROLE'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
        return;
      end if;

      select nomination_row.* into v_nomination
      from public.admin_manager_nominations as nomination_row
      where nomination_row.target_user_id = p_target_id
        and nomination_row.nominated_by = p_owner_id
        and nomination_row.status = 'pending'
      for update;

      if not found then
        return query select false, 'NOMINATION_REQUIRED'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
        return;
      end if;

      insert into public.admin_operator_accounts (
        user_id, baseline_role, capabilities, status, granted_by, last_changed_by
      ) values (
        p_target_id, v_target.role, v_capabilities, 'active', p_owner_id, p_owner_id
      ) returning * into v_account;

      update public.admin_manager_nominations
      set status = 'granted', granted_at = v_now
      where id = v_nomination.id;
    end if;

    update public.profiles set role = 'admin_operator'::public.user_role where id = p_target_id;
  elsif v_action = 'update' then
    if not found or v_account.status <> 'active' or v_target.role <> 'admin_operator'::public.user_role then
      return query select false, 'OPERATOR_NOT_ACTIVE'::text, p_target_id, null::text, v_target.role, coalesce(v_account.capabilities, '{}'::text[]), null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = v_capabilities, last_changed_by = p_owner_id
    where operator_account.user_id = p_target_id
    returning * into v_account;
  else
    if not found then
      return query select false, 'OPERATOR_NOT_FOUND'::text, p_target_id, null::text, v_target.role, '{}'::text[], null::timestamptz;
      return;
    end if;

    update public.admin_operator_accounts as operator_account
    set capabilities = '{}', status = 'revoked', last_changed_by = p_owner_id, revoked_at = v_now
    where operator_account.user_id = p_target_id
    returning * into v_account;

    update public.profiles
    set role = v_account.baseline_role
    where id = p_target_id and role = 'admin_operator'::public.user_role;
  end if;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_owner_id, 'admin', 'admin_sub_admin_access', v_action, 'admin_operator',
    case when v_action = 'revoke' then 'deny' else 'allow' end,
    'admin_operator_' || v_action,
    pg_catalog.jsonb_build_object(
      'target_id', p_target_id,
      'capability_count', pg_catalog.cardinality(v_account.capabilities),
      'reason_provided', v_reason <> ''
    )
  );

  select role into v_role_out from public.profiles where id = p_target_id;
  return query select true, null::text, p_target_id, v_account.status, v_role_out, v_account.capabilities, v_account.updated_at;
end;
$function$;

revoke all on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.admin_set_sub_admin_access_atomic(uuid, uuid, text, text[], text)
  to service_role;

create or replace function public.admin_save_finance_tax_policy_draft(
  p_actor_id uuid,
  p_policy_id uuid,
  p_policy_key text,
  p_version integer,
  p_name text,
  p_subject_type text,
  p_effective_from date,
  p_effective_to date,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.admin_finance_tax_policies%rowtype;
  v_rule_count integer;
begin
  perform private.assert_finance_tax_manager(p_actor_id);

  if p_policy_key is null or p_policy_key !~ '^[a-z0-9_]{3,64}$'
    or p_version is null or p_version <= 0
    or p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 3 and 120
    or p_subject_type not in ('platform', 'worker')
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or p_rules is null or pg_catalog.jsonb_typeof(p_rules) <> 'array'
    or pg_catalog.jsonb_array_length(p_rules) not between 1 and 20 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;

  select count(*) into v_rule_count
  from pg_catalog.jsonb_to_recordset(p_rules) as rule(
    tax_code text,
    label text,
    calculation_basis text,
    rate_bps integer,
    service_type text
  )
  where rule.tax_code ~ '^[a-z0-9_]{2,40}$'
    and pg_catalog.char_length(pg_catalog.btrim(rule.label)) between 2 and 120
    and rule.calculation_basis in (
      'gmv', 'commission_collected', 'commission_retained', 'worker_net_paid',
      'platform_commission', 'worker_net'
    )
    and rule.rate_bps between 1 and 10000
    and (rule.service_type is null or rule.service_type in (
      select enum_value::text from pg_catalog.enum_range(null::public.service_type) as enum_value
    ));

  if v_rule_count <> pg_catalog.jsonb_array_length(p_rules)
    or exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rules) as rule(tax_code text, service_type text)
      group by rule.tax_code, rule.service_type
      having count(*) > 1
    ) then
    raise exception 'INVALID_TAX_RULE_INPUT' using errcode = '22023';
  end if;

  if p_policy_id is null then
    insert into public.admin_finance_tax_policies (
      policy_key, version, name, subject_type, effective_from, effective_to, created_by
    ) values (
      p_policy_key, p_version, pg_catalog.btrim(p_name), p_subject_type,
      p_effective_from, p_effective_to, p_actor_id
    ) returning * into v_policy;
  else
    select policy.* into v_policy
    from public.admin_finance_tax_policies as policy
    where policy.id = p_policy_id
    for update;

    if not found then
      raise exception 'TAX_POLICY_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_policy.status <> 'draft' then
      raise exception 'TAX_POLICY_NOT_DRAFT' using errcode = 'P0001';
    end if;

    update public.admin_finance_tax_policies
    set policy_key = p_policy_key,
        version = p_version,
        name = pg_catalog.btrim(p_name),
        subject_type = p_subject_type,
        effective_from = p_effective_from,
        effective_to = p_effective_to
    where id = p_policy_id
    returning * into v_policy;

    delete from public.admin_finance_tax_rules where policy_id = p_policy_id;
  end if;

  insert into public.admin_finance_tax_rules (
    policy_id, tax_code, label, calculation_basis, rate_bps, service_type
  )
  select
    v_policy.id,
    rule.tax_code,
    pg_catalog.btrim(rule.label),
    rule.calculation_basis,
    rule.rate_bps,
    case when rule.service_type is null then null else rule.service_type::public.service_type end
  from pg_catalog.jsonb_to_recordset(p_rules) as rule(
    tax_code text,
    label text,
    calculation_basis text,
    rate_bps integer,
    service_type text
  );

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_finance_tax_policy',
    'save_draft',
    'finance_tax_policy',
    'allow',
    'finance_tax_policy_draft_saved',
    pg_catalog.jsonb_build_object('policy_id', v_policy.id, 'version', v_policy.version, 'rule_count', v_rule_count)
  );

  return pg_catalog.jsonb_build_object(
    'policy_id', v_policy.id,
    'status', v_policy.status,
    'version', v_policy.version,
    'rule_count', v_rule_count
  );
end;
$function$;

create or replace function public.admin_transition_finance_tax_policy(
  p_actor_id uuid,
  p_policy_id uuid,
  p_action text,
  p_approval_evidence_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_policy public.admin_finance_tax_policies%rowtype;
  v_rule public.admin_finance_tax_rules%rowtype;
  v_action text := lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_evidence text := pg_catalog.btrim(coalesce(p_approval_evidence_ref, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_actor_id and profile.role = 'admin'::public.user_role
  ) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0001';
  end if;

  if v_action not in ('approve', 'retire') then
    raise exception 'INVALID_TAX_POLICY_ACTION' using errcode = '22023';
  end if;

  select policy.* into v_policy
  from public.admin_finance_tax_policies as policy
  where policy.id = p_policy_id
  for update;

  if not found then
    raise exception 'TAX_POLICY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_action = 'approve' then
    if v_policy.status <> 'draft'
      or pg_catalog.char_length(v_evidence) not between 3 and 500
      or not exists (select 1 from public.admin_finance_tax_rules as rule where rule.policy_id = v_policy.id) then
      raise exception 'TAX_POLICY_NOT_APPROVABLE' using errcode = 'P0001';
    end if;

    if exists (
      select 1
      from public.admin_finance_tax_policies as approved
      where approved.id <> v_policy.id
        and approved.policy_key = v_policy.policy_key
        and approved.status in ('approved', 'retired')
        and approved.effective_from <= coalesce(v_policy.effective_to, 'infinity'::date)
        and v_policy.effective_from <= coalesce(approved.effective_to, 'infinity'::date)
    ) then
      raise exception 'TAX_POLICY_EFFECTIVE_RANGE_OVERLAP' using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config('app.finance_tax_transition', v_policy.id::text || ':approved', true);
    update public.admin_finance_tax_policies
    set status = 'approved', approved_by = p_actor_id, approved_at = v_now,
        approval_evidence_ref = v_evidence
    where id = v_policy.id
    returning * into v_policy;
  else
    if v_policy.status <> 'approved' then
      raise exception 'TAX_POLICY_NOT_RETIRABLE' using errcode = 'P0001';
    end if;

    perform pg_catalog.set_config('app.finance_tax_transition', v_policy.id::text || ':retired', true);
    update public.admin_finance_tax_policies
    set status = 'retired', retired_by = p_actor_id, retired_at = v_now,
        effective_to = coalesce(
          effective_to,
          greatest(effective_from, (v_now at time zone 'Asia/Ho_Chi_Minh')::date)
        )
    where id = v_policy.id
    returning * into v_policy;
  end if;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, 'admin', 'admin_finance_tax_policy', v_action,
    'finance_tax_policy', 'allow', 'finance_tax_policy_' || v_action,
    pg_catalog.jsonb_build_object('policy_id', v_policy.id, 'version', v_policy.version)
  );

  select rule.* into strict v_rule
  from public.admin_finance_tax_rules as rule
  where rule.policy_id = v_policy.id
  order by rule.tax_code, rule.service_type nulls first
  limit 1;

  return pg_catalog.jsonb_build_object(
    'id', v_policy.id,
    'status', v_policy.status,
    'version', v_policy.version,
    'name', v_policy.name,
    'tax_type', v_rule.tax_code,
    'subject', v_policy.subject_type,
    'basis', v_rule.calculation_basis,
    'rate_bps', v_rule.rate_bps,
    'effective_from', v_policy.effective_from,
    'effective_to', v_policy.effective_to,
    'source_reference', v_policy.source_reference,
    'approved_at', v_policy.approved_at,
    'approved_by', v_policy.approved_by,
    'created_at', v_policy.created_at,
    'updated_at', v_policy.updated_at
  );
end;
$function$;

revoke all on function public.admin_save_finance_tax_policy_draft(uuid, uuid, text, integer, text, text, date, date, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_transition_finance_tax_policy(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_save_finance_tax_policy_draft(uuid, uuid, text, integer, text, text, date, date, jsonb)
  to service_role;
grant execute on function public.admin_transition_finance_tax_policy(uuid, uuid, text, text)
  to service_role;

create or replace function private.admin_finance_period_snapshot(
  p_from timestamptz,
  p_to timestamptz,
  p_service_type public.service_type default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_gmv bigint;
  v_paid_jobs bigint;
  v_missing_financial bigint;
  v_commission_accrued bigint;
  v_commission_collected bigint;
  v_commission_reversed bigint;
  v_commission_retained bigint;
  v_commission_receivable bigint;
  v_platform_incoming bigint;
  v_payout_outflow bigint;
  v_refund_outflow bigint;
  v_worker_net_paid bigint;
  v_kael_spend numeric(18,6);
  v_kael_rows bigint;
begin
  select
    coalesce(sum(coalesce(job.gross_amount, job.payment_amount_received, job.final_price)), 0)::bigint,
    count(*)::bigint,
    count(*) filter (
      where job.gross_amount is null or job.platform_fee is null or job.worker_net is null
    )::bigint,
    coalesce(sum(job.platform_fee), 0)::bigint,
    coalesce(sum(job.worker_net), 0)::bigint
  into v_gmv, v_paid_jobs, v_missing_financial, v_commission_accrued, v_worker_net_paid
  from public.jobs as job
  where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.paid_at >= p_from and job.paid_at < p_to
    and (p_service_type is null or job.service_type = p_service_type);

  select coalesce(sum(job.platform_fee), 0)::bigint
  into v_commission_collected
  from public.jobs as job
  where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.payment_provider in ('platform_bank_manual', 'sepay_vietqr')
    and job.paid_at >= p_from and job.paid_at < p_to
    and (p_service_type is null or job.service_type = p_service_type);

  select v_commission_collected + coalesce(sum(
    cash_ledger.cash_commission_collected
    + least(cash_ledger.cash_commission_due, coalesce((
      select sum(reconciliation.amount)
      from public.worker_cash_commission_reconciliations as reconciliation
      where reconciliation.cash_commission_ledger_id = cash_ledger.id
    ), 0)::integer)
  ), 0)::bigint
  into v_commission_collected
  from public.worker_cash_commission_ledger as cash_ledger
  join public.jobs as job on job.id = cash_ledger.job_id
  where cash_ledger.confirmed_at >= p_from and cash_ledger.confirmed_at < p_to
    and (p_service_type is null or job.service_type = p_service_type);

  select
    coalesce(sum(adjustment.commission_reversal_vnd), 0)::bigint,
    coalesce(sum(adjustment.cash_outflow_vnd), 0)::bigint
  into v_commission_reversed, v_refund_outflow
  from public.admin_financial_adjustments as adjustment
  join public.jobs as job on job.id = adjustment.job_id
  where adjustment.realization_status = 'completed'
    and adjustment.realized_at >= p_from and adjustment.realized_at < p_to
    and (p_service_type is null or job.service_type = p_service_type);

  v_commission_retained := v_commission_collected - v_commission_reversed;
  v_commission_receivable := greatest(
    0::bigint,
    v_commission_accrued - v_commission_reversed - v_commission_collected
  );

  select coalesce(sum(job.payment_amount_received), 0)::bigint
  into v_platform_incoming
  from public.jobs as job
  where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
    and job.payment_provider in ('platform_bank_manual', 'sepay_vietqr')
    and job.payment_received_at >= p_from and job.payment_received_at < p_to
    and (p_service_type is null or job.service_type = p_service_type);

  select coalesce(sum(request.amount_vnd), 0)::bigint
  into v_payout_outflow
  from public.worker_withdrawal_requests as request
  where request.status = 'paid'
    and request.processed_at >= p_from and request.processed_at < p_to
    and (
      p_service_type is null
      or exists (
        select 1 from public.worker_payment_ledger as ledger
        join public.jobs as job on job.id = ledger.job_id
        where ledger.worker_id = request.worker_id and job.service_type = p_service_type
      )
    );

  select
    coalesce(sum(spend.total_cost_usd), 0)::numeric(18,6),
    count(*)::bigint
  into v_kael_spend, v_kael_rows
  from public.kael_provider_spend_daily as spend
  where p_service_type is null
    and spend.spend_date >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date
    and spend.spend_date <= ((p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date;

  return pg_catalog.jsonb_build_object(
    'gmv', v_gmv,
    'paid_job_count', v_paid_jobs,
    'average_order_value', case when v_paid_jobs = 0 or v_missing_financial > 0 then null else pg_catalog.round(v_gmv::numeric / v_paid_jobs)::bigint end,
    'commission_accrued', v_commission_accrued,
    'commission_collected', v_commission_collected,
    'commission_reversed', v_commission_reversed,
    'commission_retained', v_commission_retained,
    'commission_receivable', v_commission_receivable,
    'platform_incoming', v_platform_incoming,
    'payout_outflow', v_payout_outflow,
    'refund_outflow', v_refund_outflow,
    'net_cash_flow', v_platform_incoming - v_payout_outflow - v_refund_outflow,
    'worker_net_paid', v_worker_net_paid,
    'kael_ai_spend_usd', case when p_service_type is null then v_kael_spend else null end,
    'missing_paid_financial_rows', v_missing_financial,
    'kael_spend_record_count', case when p_service_type is null then v_kael_rows else null end
  );
end;
$function$;

revoke all on function private.admin_finance_period_snapshot(timestamptz, timestamptz, public.service_type)
  from public, anon, authenticated;

create or replace function public.admin_finance_overview(
  p_actor_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_previous_from timestamptz;
  v_current jsonb;
  v_previous jsonb;
  v_series jsonb;
  v_payment_breakdown jsonb;
  v_service_breakdown jsonb;
  v_worker_hold bigint;
  v_worker_available bigint;
  v_payout_pending bigint;
  v_opening integer;
  v_closing integer;
  v_tax jsonb;
  v_bucket_interval interval;
  v_local_start timestamp;
  v_local_last timestamp;
begin
  perform private.assert_finance_reader(p_actor_id);

  if p_from is null or p_to is null or p_from >= p_to
    or p_to - p_from > interval '366 days'
    or p_bucket not in ('hour', 'day', 'month') then
    raise exception 'INVALID_FINANCE_RANGE' using errcode = '22023';
  end if;

  v_previous_from := p_from - (p_to - p_from);
  v_current := private.admin_finance_period_snapshot(p_from, p_to, null);
  v_previous := private.admin_finance_period_snapshot(v_previous_from, p_from, null);
  v_bucket_interval := case p_bucket
    when 'hour' then interval '1 hour'
    when 'day' then interval '1 day'
    else interval '1 month'
  end;
  v_local_start := pg_catalog.date_trunc(p_bucket, p_from at time zone 'Asia/Ho_Chi_Minh');
  v_local_last := pg_catalog.date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh');

  with bucket_snapshots as (
    select
      greatest(p_from, bucket.local_from at time zone 'Asia/Ho_Chi_Minh') as bucket_from,
      least(p_to, (bucket.local_from + v_bucket_interval) at time zone 'Asia/Ho_Chi_Minh') as bucket_to,
      private.admin_finance_period_snapshot(
        greatest(p_from, bucket.local_from at time zone 'Asia/Ho_Chi_Minh'),
        least(p_to, (bucket.local_from + v_bucket_interval) at time zone 'Asia/Ho_Chi_Minh'),
        null
      ) as metrics
    from pg_catalog.generate_series(v_local_start, v_local_last, v_bucket_interval) as bucket(local_from)
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'bucket_start', snapshot.bucket_from,
    'bucket_end', snapshot.bucket_to,
    'gmv_vnd', (snapshot.metrics->>'gmv')::bigint,
    'commission_collected_vnd', (snapshot.metrics->>'commission_collected')::bigint,
    'paid_jobs', (snapshot.metrics->>'paid_job_count')::bigint,
    'data_quality', case when (snapshot.metrics->>'missing_paid_financial_rows')::bigint = 0 then 'available' else 'partial' end,
    'unavailable_reason', case when (snapshot.metrics->>'missing_paid_financial_rows')::bigint = 0 then null else 'PAID_FINANCIALS_PARTIAL' end
  ) order by snapshot.bucket_from), '[]'::jsonb)
  into v_series
  from bucket_snapshots as snapshot;

  with paid_jobs as (
    select
      coalesce(payment_order.payment_method, job.payment_provider, 'unknown') as payment_method,
      coalesce(job.gross_amount, job.payment_amount_received, job.final_price)::bigint as gross_amount,
      job.gross_amount is null or job.platform_fee is null or job.worker_net is null as is_partial
    from public.jobs as job
    left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
    where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
      and job.paid_at >= p_from and job.paid_at < p_to
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'payment_method', grouped.payment_method,
    'gmv_vnd', grouped.gmv,
    'paid_jobs', grouped.paid_job_count,
    'share_percent', case when (v_current->>'gmv')::bigint = 0 then 0 else
      pg_catalog.round(grouped.gmv::numeric * 100 / (v_current->>'gmv')::numeric, 2) end,
    'data_quality', case when grouped.is_partial then 'partial' else 'available' end,
    'unavailable_reason', case when grouped.is_partial then 'PAID_FINANCIALS_PARTIAL' else null end
  ) order by grouped.payment_method), '[]'::jsonb)
  into v_payment_breakdown
  from (
    select payment_method, coalesce(sum(gross_amount), 0)::bigint as gmv,
      count(*)::bigint as paid_job_count, bool_or(is_partial) as is_partial
    from paid_jobs group by payment_method
  ) as grouped;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'service_type', grouped.service_type,
    'gmv_vnd', (grouped.metrics->>'gmv')::bigint,
    'commission_collected_vnd', (grouped.metrics->>'commission_collected')::bigint,
    'paid_jobs', (grouped.metrics->>'paid_job_count')::bigint,
    'data_quality', case when (grouped.metrics->>'missing_paid_financial_rows')::bigint = 0 then 'available' else 'partial' end,
    'unavailable_reason', case when (grouped.metrics->>'missing_paid_financial_rows')::bigint = 0 then null else 'PAID_FINANCIALS_PARTIAL' end
  ) order by grouped.service_type), '[]'::jsonb)
  into v_service_breakdown
  from (
    select job.service_type::text as service_type,
      private.admin_finance_period_snapshot(p_from, p_to, job.service_type) as metrics
    from public.jobs as job
    where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
      and job.paid_at >= p_from and job.paid_at < p_to
    group by job.service_type
  ) as grouped;

  select coalesce(sum(ledger.worker_net) filter (where ledger.payment_state = 'on_hold'), 0)::bigint
  into v_worker_hold
  from public.worker_payment_ledger as ledger;

  with worker_ids as (
    select worker_id from public.worker_payment_ledger
    union select worker_id from public.worker_cash_commission_ledger
    union select worker_id from public.worker_withdrawal_requests
    union select worker_id from public.worker_direct_payment_collateral_reservations
    union select worker_id from public.admin_financial_adjustments where worker_id is not null
  ), worker_balances as (
    select worker.worker_id,
      coalesce((select sum(ledger.worker_net) from public.worker_payment_ledger as ledger
        where ledger.worker_id = worker.worker_id and ledger.payment_state = 'available'), 0)::bigint as available_credits,
      coalesce((select sum(adjustment.worker_credit_vnd) from public.admin_financial_adjustments as adjustment
        where adjustment.worker_id = worker.worker_id and adjustment.realization_status = 'completed'), 0)::bigint as adjustment_credits,
      coalesce((select sum(cash_ledger.cash_commission_collected + least(
          cash_ledger.cash_commission_due,
          coalesce((select sum(reconciliation.amount) from public.worker_cash_commission_reconciliations as reconciliation
            where reconciliation.cash_commission_ledger_id = cash_ledger.id), 0)::integer
        )) from public.worker_cash_commission_ledger as cash_ledger
        where cash_ledger.worker_id = worker.worker_id), 0)::bigint as collected_commission,
      coalesce((select sum(request.amount_vnd) from public.worker_withdrawal_requests as request
        where request.worker_id = worker.worker_id and request.status in ('pending', 'processing', 'paid')), 0)::bigint as reserved_or_paid_payout,
      coalesce((select sum(reservation.collateral_amount) from public.worker_direct_payment_collateral_reservations as reservation
        where reservation.worker_id = worker.worker_id and reservation.status = 'held'), 0)::bigint as held_collateral
    from worker_ids as worker
  )
  select coalesce(sum(greatest(
    0::bigint,
    available_credits + adjustment_credits - collected_commission - reserved_or_paid_payout - held_collateral
  )), 0)::bigint
  into v_worker_available
  from worker_balances;

  select coalesce(sum(request.amount_vnd) filter (where request.status in ('pending', 'processing')), 0)::bigint
  into v_payout_pending
  from public.worker_withdrawal_requests as request;

  select snapshot.balance_vnd into v_opening
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary' and snapshot.observed_at <= p_from
  order by snapshot.observed_at desc limit 1;
  select snapshot.balance_vnd into v_closing
  from public.platform_bank_balance_snapshots as snapshot
  where snapshot.account_key = 'platform_secondary'
    and snapshot.observed_at > p_from and snapshot.observed_at <= p_to
  order by snapshot.observed_at desc limit 1;

  with applicable_rules as (
    select policy.id as policy_id, policy.version, policy.policy_key, rule.tax_code,
      rule.label, rule.calculation_basis, rule.rate_bps, rule.service_type,
      greatest(p_from, policy.effective_from::timestamp at time zone 'Asia/Ho_Chi_Minh') as rule_from,
      least(
        p_to,
        coalesce((policy.effective_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh', p_to)
      ) as rule_to
    from public.admin_finance_tax_policies as policy
    join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
    where policy.status in ('approved', 'retired')
      and policy.effective_from <= ((p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date
      and coalesce(policy.effective_to, 'infinity'::date) >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date
  ), calculated as (
    select applicable.*,
      private.admin_finance_period_snapshot(applicable.rule_from, applicable.rule_to, applicable.service_type) as metrics
    from applicable_rules as applicable
    where applicable.rule_from < applicable.rule_to
  ), estimates as (
    select calculated.*,
      case calculated.calculation_basis
        when 'gmv' then (calculated.metrics->>'gmv')::bigint
        when 'commission_collected' then (calculated.metrics->>'commission_collected')::bigint
        when 'commission_retained' then (calculated.metrics->>'commission_retained')::bigint
        when 'platform_commission' then (calculated.metrics->>'commission_retained')::bigint
        when 'worker_net' then (calculated.metrics->>'worker_net_paid')::bigint
        else (calculated.metrics->>'worker_net_paid')::bigint
      end as basis_vnd
    from calculated
  )
  select case when count(*) = 0 then
    pg_catalog.jsonb_build_object('status', 'unconfigured', 'estimated_vnd', null, 'rules', '[]'::jsonb)
  else pg_catalog.jsonb_build_object(
    'status', 'estimated',
    'estimated_vnd', sum(pg_catalog.round(estimates.basis_vnd::numeric * estimates.rate_bps / 10000.0))::bigint,
    'rules', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'policy_id', estimates.policy_id,
      'policy_key', estimates.policy_key,
      'version', estimates.version,
      'tax_code', estimates.tax_code,
      'label', estimates.label,
      'calculation_basis', estimates.calculation_basis,
      'basis_vnd', estimates.basis_vnd,
      'rate_bps', estimates.rate_bps,
      'estimated_vnd', pg_catalog.round(estimates.basis_vnd::numeric * estimates.rate_bps / 10000.0)::bigint
    ) order by estimates.policy_key, estimates.version, estimates.tax_code)
  ) end
  into v_tax
  from estimates;

  return pg_catalog.jsonb_build_object(
    'range', pg_catalog.jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'Asia/Ho_Chi_Minh', 'bucket', p_bucket),
    'metrics', v_current,
    'previous_period', pg_catalog.jsonb_build_object('from', v_previous_from, 'to', p_from, 'metrics', v_previous),
    'comparison', pg_catalog.jsonb_build_object(
      'gmv_delta', (v_current->>'gmv')::bigint - (v_previous->>'gmv')::bigint,
      'gmv_percent', case when (v_previous->>'gmv')::bigint = 0 then null else
        pg_catalog.round((((v_current->>'gmv')::numeric - (v_previous->>'gmv')::numeric) * 100) / (v_previous->>'gmv')::numeric, 2) end,
      'paid_job_count_delta', (v_current->>'paid_job_count')::bigint - (v_previous->>'paid_job_count')::bigint,
      'commission_retained_delta', (v_current->>'commission_retained')::bigint - (v_previous->>'commission_retained')::bigint,
      'net_cash_flow_delta', (v_current->>'net_cash_flow')::bigint - (v_previous->>'net_cash_flow')::bigint
    ),
    'series', v_series,
    'payment_method_breakdown', v_payment_breakdown,
    'service_breakdown', v_service_breakdown,
    'current_worker_balances', pg_catalog.jsonb_build_object(
      'as_of', pg_catalog.statement_timestamp(),
      'on_hold', v_worker_hold,
      'available', v_worker_available,
      'payout_pending', v_payout_pending
    ),
    'bank_reconciliation', pg_catalog.jsonb_build_object(
      'opening_balance', v_opening,
      'closing_balance', v_closing,
      'expected_change', case when v_opening is null or v_closing is null then null else
        (v_current->>'platform_incoming')::bigint - (v_current->>'payout_outflow')::bigint - (v_current->>'refund_outflow')::bigint end,
      'actual_change', case when v_opening is null or v_closing is null then null else v_closing::bigint - v_opening::bigint end,
      'unexplained_variance', case when v_opening is null or v_closing is null then null else
        (v_closing::bigint - v_opening::bigint)
        - ((v_current->>'platform_incoming')::bigint - (v_current->>'payout_outflow')::bigint - (v_current->>'refund_outflow')::bigint) end
    ),
    'tax', v_tax,
    'data_quality', pg_catalog.jsonb_build_object(
      'paid_financials', case when (v_current->>'missing_paid_financial_rows')::bigint = 0 then 'complete' else 'partial' end,
      'bank_snapshots', case when v_opening is not null and v_closing is not null then 'complete' else 'missing' end,
      'kael_spend', case when (v_current->>'kael_spend_record_count')::bigint > 0 then 'recorded' else 'no_records' end,
      'tax_policy', v_tax->>'status',
      'adjustments', 'completed_only'
    )
  );
end;
$function$;

revoke all on function public.admin_finance_overview(uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.admin_finance_overview(uuid, timestamptz, timestamptz, text)
  to service_role;

create or replace function public.admin_finance_transactions_page(
  p_actor_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 50,
  p_cursor_paid_at timestamptz default null,
  p_cursor_job_id uuid default null,
  p_payment_method text default null,
  p_service_type public.service_type default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
  v_has_more boolean;
  v_last_paid_at timestamptz;
  v_last_job_id uuid;
begin
  perform private.assert_finance_reader(p_actor_id);

  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '366 days'
    or p_limit not between 1 and 100
    or ((p_cursor_paid_at is null) <> (p_cursor_job_id is null))
    or (p_payment_method is not null and p_payment_method not in (
      'platform_bank_manual', 'sepay_vietqr', 'direct_worker', 'cash', 'unknown'
    ))
    or (p_status is not null and p_status not in ('paid', 'reviewed')) then
    raise exception 'INVALID_FINANCE_TRANSACTION_FILTER' using errcode = '22023';
  end if;

  with adjustment_totals as (
    select adjustment.job_id,
      sum(adjustment.gross_refund_vnd)::bigint as refund_vnd,
      sum(adjustment.commission_reversal_vnd)::bigint as commission_reversal_vnd,
      sum(adjustment.worker_credit_vnd)::bigint as worker_credit_vnd
    from public.admin_financial_adjustments as adjustment
    where adjustment.realization_status = 'completed'
    group by adjustment.job_id
  ), fetched as (
    select
      coalesce(payment_order.id, job.id) as transaction_id,
      job.id as job_id,
      job.display_code,
      'C-' || upper(pg_catalog.substr(pg_catalog.md5(job.customer_id::text), 1, 8)) as customer_ref,
      case when job.worker_id is null then null
        else 'W-' || upper(pg_catalog.substr(pg_catalog.md5(job.worker_id::text), 1, 8)) end as worker_ref,
      job.paid_at,
      job.service_type::text as service_type,
      coalesce(payment_order.payment_method, job.payment_provider, 'unknown') as payment_method,
      job.status::text as status,
      coalesce(job.gross_amount, job.payment_amount_received, job.final_price)::bigint as gross_amount_vnd,
      job.platform_fee::bigint as platform_fee_vnd,
      job.worker_net::bigint as worker_net_vnd,
      case when coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
        in ('platform_bank_manual', 'sepay_vietqr') then job.payment_amount_received::bigint
        else 0::bigint end as platform_received_vnd,
      coalesce(adjustment.refund_vnd, 0)::bigint as refund_amount_vnd,
      coalesce(adjustment.commission_reversal_vnd, 0)::bigint as commission_reversal_vnd,
      coalesce(adjustment.worker_credit_vnd, 0)::bigint as worker_credit_vnd,
      case when coalesce(job.gross_amount, job.payment_amount_received, job.final_price) is null
          or job.platform_fee is null
          or job.worker_net is null
          or (coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
            in ('platform_bank_manual', 'sepay_vietqr') and job.payment_amount_received is null)
        then 'unavailable' else 'available' end as data_quality,
      case when coalesce(job.gross_amount, job.payment_amount_received, job.final_price) is null
          or job.platform_fee is null
          or job.worker_net is null
          or (coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
            in ('platform_bank_manual', 'sepay_vietqr') and job.payment_amount_received is null)
        then 'PAID_FINANCIAL_SNAPSHOT_INCOMPLETE' else null end as unavailable_reason
    from public.jobs as job
    left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
    left join adjustment_totals as adjustment on adjustment.job_id = job.id
    where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
      and job.paid_at >= p_from and job.paid_at < p_to
      and (p_cursor_paid_at is null or (job.paid_at, job.id) < (p_cursor_paid_at, p_cursor_job_id))
      and (p_payment_method is null or coalesce(payment_order.payment_method, job.payment_provider, 'unknown') = p_payment_method)
      and (p_service_type is null or job.service_type = p_service_type)
      and (p_status is null or job.status::text = p_status)
    order by job.paid_at desc, job.id desc
    limit p_limit + 1
  ), numbered as (
    select fetched.*, pg_catalog.row_number() over (order by fetched.paid_at desc, fetched.job_id desc) as row_number
    from fetched
  )
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(numbered) - 'row_number' order by numbered.row_number)
      filter (where numbered.row_number <= p_limit), '[]'::jsonb),
    count(*) > p_limit,
    max(numbered.paid_at) filter (where numbered.row_number = p_limit),
    (pg_catalog.array_agg(numbered.job_id)
      filter (where numbered.row_number = p_limit))[1]
  into v_rows, v_has_more, v_last_paid_at, v_last_job_id
  from numbered;

  return pg_catalog.jsonb_build_object(
    'rows', v_rows,
    'has_more', v_has_more,
    'next_cursor', case when v_has_more then pg_catalog.jsonb_build_object(
      'paid_at', v_last_paid_at,
      'job_id', v_last_job_id
    ) else null end,
    'limit', p_limit,
    'pii', 'masked'
  );
end;
$function$;

create or replace function public.admin_finance_export_rows(
  p_actor_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 50000,
  p_payment_method text default null,
  p_service_type public.service_type default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
begin
  perform private.assert_finance_reader(p_actor_id);

  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '366 days'
    or p_limit not between 1 and 50001
    or (p_payment_method is not null and p_payment_method not in (
      'platform_bank_manual', 'sepay_vietqr', 'direct_worker', 'cash', 'unknown'
    ))
    or (p_status is not null and p_status not in ('paid', 'reviewed')) then
    raise exception 'INVALID_FINANCE_EXPORT_RANGE' using errcode = '22023';
  end if;

  with adjustment_totals as (
    select adjustment.job_id,
      sum(adjustment.gross_refund_vnd)::bigint as refund_vnd,
      sum(adjustment.commission_reversal_vnd)::bigint as commission_reversal_vnd,
      sum(adjustment.worker_credit_vnd)::bigint as worker_credit_vnd
    from public.admin_financial_adjustments as adjustment
    where adjustment.realization_status = 'completed'
    group by adjustment.job_id
  ), export_rows as (
    select
      coalesce(payment_order.id, job.id) as transaction_id,
      job.id as job_id,
      job.display_code,
      'C-' || upper(pg_catalog.substr(pg_catalog.md5(job.customer_id::text), 1, 8)) as customer_ref,
      case when job.worker_id is null then null
        else 'W-' || upper(pg_catalog.substr(pg_catalog.md5(job.worker_id::text), 1, 8)) end as worker_ref,
      job.paid_at,
      job.service_type::text as service_type,
      coalesce(payment_order.payment_method, job.payment_provider, 'unknown') as payment_method,
      job.status::text as status,
      coalesce(job.gross_amount, job.payment_amount_received, job.final_price)::bigint as gross_amount_vnd,
      job.platform_fee::bigint as platform_fee_vnd,
      job.worker_net::bigint as worker_net_vnd,
      case when coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
        in ('platform_bank_manual', 'sepay_vietqr') then job.payment_amount_received::bigint
        else 0::bigint end as platform_received_vnd,
      coalesce(adjustment.refund_vnd, 0)::bigint as refund_amount_vnd,
      coalesce(adjustment.commission_reversal_vnd, 0)::bigint as commission_reversal_vnd,
      coalesce(adjustment.worker_credit_vnd, 0)::bigint as worker_credit_vnd,
      case when coalesce(job.gross_amount, job.payment_amount_received, job.final_price) is null
          or job.platform_fee is null
          or job.worker_net is null
          or (coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
            in ('platform_bank_manual', 'sepay_vietqr') and job.payment_amount_received is null)
        then 'unavailable' else 'available' end as data_quality,
      case when coalesce(job.gross_amount, job.payment_amount_received, job.final_price) is null
          or job.platform_fee is null
          or job.worker_net is null
          or (coalesce(payment_order.payment_method, job.payment_provider, 'unknown')
            in ('platform_bank_manual', 'sepay_vietqr') and job.payment_amount_received is null)
        then 'PAID_FINANCIAL_SNAPSHOT_INCOMPLETE' else null end as unavailable_reason
    from public.jobs as job
    left join public.job_payment_orders as payment_order on payment_order.job_id = job.id
    left join adjustment_totals as adjustment on adjustment.job_id = job.id
    where job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
      and job.paid_at >= p_from and job.paid_at < p_to
      and (p_payment_method is null or coalesce(payment_order.payment_method, job.payment_provider, 'unknown') = p_payment_method)
      and (p_service_type is null or job.service_type = p_service_type)
      and (p_status is null or job.status::text = p_status)
    order by job.paid_at desc, job.id desc
    limit p_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(export_rows)), '[]'::jsonb)
  into v_rows
  from export_rows;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    (select profile.role::text from public.profiles as profile where profile.id = p_actor_id),
    'admin_finance_export', 'export', 'finance_transactions', 'allow',
    'admin_finance_export_generated',
    pg_catalog.jsonb_build_object('from', p_from, 'to', p_to, 'row_count', pg_catalog.jsonb_array_length(v_rows))
  );

  return pg_catalog.jsonb_build_object('rows', v_rows, 'row_count', pg_catalog.jsonb_array_length(v_rows), 'pii', 'masked');
end;
$function$;

create or replace function public.admin_create_finance_tax_policy_draft(
  p_actor_id uuid,
  p_policy jsonb
)
returns table (
  id uuid,
  version integer,
  name text,
  tax_type text,
  subject text,
  basis text,
  rate_bps integer,
  status text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tax_type text := lower(pg_catalog.btrim(coalesce(p_policy->>'tax_type', '')));
  v_policy_key text;
  v_version integer;
  v_result jsonb;
  v_source_reference text := pg_catalog.btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if v_tax_type !~ '^[a-z0-9_]{2,40}$'
    or pg_catalog.char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;

  v_policy_key := pg_catalog.regexp_replace(v_tax_type, '[^a-z0-9]+', '_', 'g');
  select coalesce(max(policy.version), 0) + 1 into v_version
  from public.admin_finance_tax_policies as policy
  where policy.policy_key = v_policy_key;

  v_result := public.admin_save_finance_tax_policy_draft(
    p_actor_id,
    null,
    v_policy_key,
    v_version,
    p_policy->>'name',
    p_policy->>'subject',
    (p_policy->>'effective_from')::date,
    nullif(p_policy->>'effective_to', '')::date,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'tax_code', v_tax_type,
      'label', p_policy->>'name',
      'calculation_basis', p_policy->>'basis',
      'rate_bps', (p_policy->>'rate_bps')::integer,
      'service_type', null
    ))
  );

  update public.admin_finance_tax_policies as policy
  set source_reference = v_source_reference
  where policy.id = (v_result->>'policy_id')::uuid;

  return query
  select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at,
    policy.approved_by, policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = (v_result->>'policy_id')::uuid;
end;
$function$;

create or replace function public.admin_update_finance_tax_policy_draft(
  p_actor_id uuid,
  p_policy_id uuid,
  p_policy jsonb
)
returns table (
  id uuid,
  version integer,
  name text,
  tax_type text,
  subject text,
  basis text,
  rate_bps integer,
  status text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.admin_finance_tax_policies%rowtype;
  v_tax_type text := lower(pg_catalog.btrim(coalesce(p_policy->>'tax_type', '')));
  v_source_reference text := pg_catalog.btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if v_tax_type !~ '^[a-z0-9_]{2,40}$'
    or pg_catalog.char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;

  select policy.* into strict v_existing
  from public.admin_finance_tax_policies as policy
  where policy.id = p_policy_id;

  perform public.admin_save_finance_tax_policy_draft(
    p_actor_id,
    p_policy_id,
    v_existing.policy_key,
    v_existing.version,
    p_policy->>'name',
    p_policy->>'subject',
    (p_policy->>'effective_from')::date,
    nullif(p_policy->>'effective_to', '')::date,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'tax_code', v_tax_type,
      'label', p_policy->>'name',
      'calculation_basis', p_policy->>'basis',
      'rate_bps', (p_policy->>'rate_bps')::integer,
      'service_type', null
    ))
  );

  update public.admin_finance_tax_policies as policy
  set source_reference = v_source_reference
  where policy.id = p_policy_id;

  return query
  select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at,
    policy.approved_by, policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = p_policy_id;
end;
$function$;

create or replace function public.admin_approve_finance_tax_policy(
  p_actor_id uuid,
  p_policy_id uuid,
  p_accountant_approval_reference text
)
returns table (
  id uuid,
  version integer,
  name text,
  tax_type text,
  subject text,
  basis text,
  rate_bps integer,
  status text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.admin_transition_finance_tax_policy(
    p_actor_id, p_policy_id, 'approve', p_accountant_approval_reference
  );

  return query
  select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at,
    policy.approved_by, policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = p_policy_id;
end;
$function$;

create or replace function public.admin_retire_finance_tax_policy(
  p_actor_id uuid,
  p_policy_id uuid,
  p_reason text
)
returns table (
  id uuid,
  version integer,
  name text,
  tax_type text,
  subject text,
  basis text,
  rate_bps integer,
  status text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'INVALID_RETIRE_REASON' using errcode = '22023';
  end if;

  perform public.admin_transition_finance_tax_policy(
    p_actor_id, p_policy_id, 'retire', p_reason
  );

  return query
  select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at,
    policy.approved_by, policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = p_policy_id;
end;
$function$;

create or replace function public.admin_finance_tax_policies(p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_policies jsonb;
  v_active_policy_ids jsonb;
begin
  perform private.assert_finance_reader(p_actor_id);
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', policy.id,
    'name', policy.name,
    'tax_type', rule.tax_code,
    'subject', policy.subject_type,
    'basis', rule.calculation_basis,
    'rate_bps', rule.rate_bps,
    'effective_from', policy.effective_from,
    'effective_to', policy.effective_to,
    'source_reference', policy.source_reference,
    'status', policy.status,
    'version', policy.version,
    'approved_at', policy.approved_at,
    'approved_by', policy.approved_by,
    'created_at', policy.created_at,
    'updated_at', policy.updated_at
  ) order by policy.policy_key, policy.version desc), '[]'::jsonb)
  into v_policies
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id;

  select coalesce(pg_catalog.jsonb_agg(policy.id order by policy.policy_key, policy.version desc), '[]'::jsonb)
  into v_active_policy_ids
  from public.admin_finance_tax_policies as policy
  where policy.status = 'approved'
    and policy.effective_from <= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    and coalesce(policy.effective_to, 'infinity'::date)
      >= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;

  return pg_catalog.jsonb_build_object(
    'tax_policies', v_policies,
    'active_policy_id', v_active_policy_ids->>0,
    'active_policy_ids', v_active_policy_ids
  );
end;
$function$;

create or replace function public.admin_list_finance_tax_policies(p_actor_id uuid)
returns table (
  id uuid,
  version integer,
  name text,
  tax_type text,
  subject text,
  basis text,
  rate_bps integer,
  status text,
  effective_from date,
  effective_to date,
  source_reference text,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  active_policy_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform private.assert_finance_reader(p_actor_id);
  return query
  with active_policy as (
    select policy.id
    from public.admin_finance_tax_policies as policy
    where policy.status = 'approved'
      and policy.effective_from <= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
      and coalesce(policy.effective_to, 'infinity'::date)
        >= (pg_catalog.statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    order by policy.policy_key, policy.version desc
    limit 1
  )
  select policy.id, policy.version, policy.name, rule.tax_code,
    policy.subject_type, rule.calculation_basis, rule.rate_bps, policy.status,
    policy.effective_from, policy.effective_to, policy.source_reference,
    policy.approved_at, policy.approved_by, policy.created_at, policy.updated_at,
    (select active.id from active_policy as active)
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  order by policy.policy_key, policy.version desc, rule.tax_code;
end;
$function$;

revoke all on function public.admin_finance_transactions_page(uuid, timestamptz, timestamptz, integer, timestamptz, uuid, text, public.service_type, text)
  from public, anon, authenticated;
revoke all on function public.admin_finance_export_rows(uuid, timestamptz, timestamptz, integer, text, public.service_type, text)
  from public, anon, authenticated;
revoke all on function public.admin_create_finance_tax_policy_draft(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_update_finance_tax_policy_draft(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_approve_finance_tax_policy(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_retire_finance_tax_policy(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_finance_tax_policies(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_list_finance_tax_policies(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_finance_transactions_page(uuid, timestamptz, timestamptz, integer, timestamptz, uuid, text, public.service_type, text)
  to service_role;
grant execute on function public.admin_finance_export_rows(uuid, timestamptz, timestamptz, integer, text, public.service_type, text)
  to service_role;
grant execute on function public.admin_create_finance_tax_policy_draft(uuid, jsonb)
  to service_role;
grant execute on function public.admin_update_finance_tax_policy_draft(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.admin_approve_finance_tax_policy(uuid, uuid, text)
  to service_role;
grant execute on function public.admin_retire_finance_tax_policy(uuid, uuid, text)
  to service_role;
grant execute on function public.admin_finance_tax_policies(uuid)
  to service_role;
grant execute on function public.admin_list_finance_tax_policies(uuid)
  to service_role;

commit;
