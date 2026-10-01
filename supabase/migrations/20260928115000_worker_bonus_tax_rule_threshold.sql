begin;

-- The tax editor posts rules as JSON; both entry points now carry the optional threshold so a
-- worker bonus rule can withhold only from payouts at or above it.

CREATE OR REPLACE FUNCTION public.admin_create_finance_tax_policy_draft(p_actor_id uuid, p_policy jsonb)
 RETURNS TABLE(id uuid, version integer, name text, tax_type text, subject text, basis text, rate_bps integer, status text, effective_from date, effective_to date, source_reference text, approved_at timestamp with time zone, approved_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rules jsonb;
  v_subject text;
  v_tax_type text;
  v_policy_key text;
  v_version integer;
  v_result jsonb;
  v_source_reference text := btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if jsonb_typeof(p_policy->'rules') <> 'array' or jsonb_array_length(p_policy->'rules') not between 1 and 20
     or char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;
  v_subject := p_policy->'rules'->0->>'subject';
  v_tax_type := lower(btrim(p_policy->'rules'->0->>'tax_type'));
  if v_subject not in ('platform', 'worker') or v_tax_type !~ '^[a-z0-9_]{2,40}$'
     or exists (
       select 1 from jsonb_array_elements(p_policy->'rules') as item
       where item->>'subject' is distinct from v_subject
     ) then
    raise exception 'INVALID_TAX_POLICY_RULES' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object(
    'tax_code', lower(btrim(item->>'tax_type')),
    'label', p_policy->>'name',
    'calculation_basis', item->>'basis',
    'rate_bps', (item->>'rate_bps')::integer,
    'service_type', null,
    'applies_at_or_above_vnd', nullif(item->>'applies_at_or_above_vnd', '')::integer
  )) into v_rules from jsonb_array_elements(p_policy->'rules') as item;
  v_policy_key := regexp_replace(v_tax_type, '[^a-z0-9]+', '_', 'g');
  select coalesce(max(policy.version), 0) + 1 into v_version
  from public.admin_finance_tax_policies as policy where policy.policy_key = v_policy_key;
  v_result := public.admin_save_finance_tax_policy_draft(
    p_actor_id, null, v_policy_key, v_version, p_policy->>'name', v_subject,
    (p_policy->>'effective_from')::date, nullif(p_policy->>'effective_to', '')::date, v_rules
  );
  update public.admin_finance_tax_policies as policy set source_reference = v_source_reference
  where policy.id = (v_result->>'policy_id')::uuid;
  return query select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at, policy.approved_by,
    policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = (v_result->>'policy_id')::uuid
  order by rule.created_at asc, rule.id asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_finance_tax_policy_draft(p_actor_id uuid, p_policy_id uuid, p_policy jsonb)
 RETURNS TABLE(id uuid, version integer, name text, tax_type text, subject text, basis text, rate_bps integer, status text, effective_from date, effective_to date, source_reference text, approved_at timestamp with time zone, approved_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing public.admin_finance_tax_policies%rowtype;
  v_rules jsonb;
  v_subject text;
  v_source_reference text := btrim(coalesce(p_policy->>'source_reference', ''));
begin
  perform private.assert_finance_tax_manager(p_actor_id);
  if jsonb_typeof(p_policy->'rules') <> 'array' or jsonb_array_length(p_policy->'rules') not between 1 and 20
     or char_length(v_source_reference) not between 3 and 500 then
    raise exception 'INVALID_TAX_POLICY_INPUT' using errcode = '22023';
  end if;
  v_subject := p_policy->'rules'->0->>'subject';
  if v_subject not in ('platform', 'worker') or exists (
    select 1 from jsonb_array_elements(p_policy->'rules') as item
    where item->>'subject' is distinct from v_subject
  ) then raise exception 'INVALID_TAX_POLICY_RULES' using errcode = '22023'; end if;
  select policy.* into strict v_existing from public.admin_finance_tax_policies as policy where policy.id = p_policy_id;
  select jsonb_agg(jsonb_build_object(
    'tax_code', lower(btrim(item->>'tax_type')), 'label', p_policy->>'name',
    'calculation_basis', item->>'basis', 'rate_bps', (item->>'rate_bps')::integer,
    'service_type', null,
    'applies_at_or_above_vnd', nullif(item->>'applies_at_or_above_vnd', '')::integer
  )) into v_rules from jsonb_array_elements(p_policy->'rules') as item;
  perform public.admin_save_finance_tax_policy_draft(
    p_actor_id, p_policy_id, v_existing.policy_key, v_existing.version,
    p_policy->>'name', v_subject, (p_policy->>'effective_from')::date,
    nullif(p_policy->>'effective_to', '')::date, v_rules
  );
  update public.admin_finance_tax_policies as policy set source_reference = v_source_reference where policy.id = p_policy_id;
  return query select policy.id, policy.version, policy.name, rule.tax_code, policy.subject_type,
    rule.calculation_basis, rule.rate_bps, policy.status, policy.effective_from,
    policy.effective_to, policy.source_reference, policy.approved_at, policy.approved_by,
    policy.created_at, policy.updated_at
  from public.admin_finance_tax_policies as policy
  join public.admin_finance_tax_rules as rule on rule.policy_id = policy.id
  where policy.id = p_policy_id order by rule.created_at asc, rule.id asc;
end;
$function$;


-- The policy list shows each rule's threshold, so a bonus rule never reads as applying to
-- every payout when it only applies above a floor.
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
    'applies_at_or_above_vnd', rule.applies_at_or_above_vnd,
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

commit;
