begin;

create or replace function private.is_valid_original_scope_price_quote(
  p_quote jsonb,
  p_job_id uuid,
  p_worker_id uuid,
  p_broadcast_id uuid,
  p_expires_at timestamptz,
  p_require_worker_confirmation boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reference_min integer;
  v_reference_max integer;
  v_customer_total integer;
  v_platform_fee integer;
  v_worker_net integer;
  v_commission_level integer;
  v_commission_rate_bps integer;
  v_receipt jsonb;
  v_scenarios jsonb;
  v_fairness jsonb;
  v_baseline jsonb;
  v_baseline_sources integer := 0;
  v_market_sources integer := 0;
  v_high_trust_sources integer := 0;
  v_required_quorum integer := 0;
  v_confidence text;
  v_quote_expires_at timestamptz;
  v_worker_confirmed_at timestamptz;
  v_baseline_quorum boolean := false;
  v_market_quorum boolean := false;
begin
  if p_quote is null
    or pg_catalog.jsonb_typeof(p_quote) <> 'object'
    or p_quote ->> 'schema_version' <> 'original_scope_price_quote.v1'
    or p_quote ->> 'selection_rule'
      <> 'verified_neutral_midpoint_with_bilateral_confirmation'
    or p_quote -> 'worker_confirmation_required' <> 'true'::jsonb
    or p_quote -> 'customer_confirmation_required' <> 'true'::jsonb
    or p_quote ->> 'job_id' is distinct from p_job_id::text
    or p_quote ->> 'worker_id' is distinct from p_worker_id::text
    or p_quote ->> 'broadcast_id' is distinct from p_broadcast_id::text
    or p_quote ->> 'quote_id'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(p_quote -> 'reference_price_min') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'reference_price_max') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'customer_total') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'platform_fee') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'worker_net') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'commission_level') <> 'number'
    or pg_catalog.jsonb_typeof(p_quote -> 'commission_rate_bps') <> 'number'
    or nullif(pg_catalog.btrim(p_quote ->> 'price_source'), '') is null
    or nullif(pg_catalog.btrim(p_quote ->> 'expires_at'), '') is null
  then
    return false;
  end if;

  v_reference_min := (p_quote ->> 'reference_price_min')::integer;
  v_reference_max := (p_quote ->> 'reference_price_max')::integer;
  v_customer_total := (p_quote ->> 'customer_total')::integer;
  v_platform_fee := (p_quote ->> 'platform_fee')::integer;
  v_worker_net := (p_quote ->> 'worker_net')::integer;
  v_commission_level := (p_quote ->> 'commission_level')::integer;
  v_commission_rate_bps := (p_quote ->> 'commission_rate_bps')::integer;
  v_quote_expires_at := (p_quote ->> 'expires_at')::timestamptz;

  if p_quote ->> 'worker_confirmed_at' is not null then
    v_worker_confirmed_at := (p_quote ->> 'worker_confirmed_at')::timestamptz;
  end if;

  if v_reference_min <= 0
    or v_reference_max < v_reference_min
    or v_customer_total <> pg_catalog.round(
      ((v_reference_min + v_reference_max)::numeric / 2) / 1000
    )::integer * 1000
    or v_customer_total not between v_reference_min and v_reference_max
    or v_platform_fee < 0
    or v_worker_net <= 0
    or v_commission_level < 1
    or v_commission_rate_bps not between 0 and 1500
    or v_platform_fee <> pg_catalog.round(
      v_customer_total::numeric * v_commission_rate_bps / 10000.0
    )::integer
    or v_worker_net <> v_customer_total - v_platform_fee
    or v_quote_expires_at is distinct from p_expires_at
    or (
      p_require_worker_confirmation
      and (v_worker_confirmed_at is null or v_worker_confirmed_at > v_quote_expires_at)
    )
    or (not p_require_worker_confirmation and v_worker_confirmed_at is not null)
  then
    return false;
  end if;

  v_receipt := p_quote -> 'reasoning_receipt';
  v_scenarios := v_receipt -> 'scenarios';
  v_fairness := v_receipt -> 'fairness';
  if pg_catalog.jsonb_typeof(v_receipt) <> 'object'
    or v_receipt ->> 'schema_version' <> 'price_reasoning_receipt.v1'
    or pg_catalog.jsonb_typeof(v_scenarios) <> 'object'
    or pg_catalog.jsonb_typeof(v_fairness) <> 'object'
    or (v_scenarios #>> '{low,total}')::integer <> v_reference_min
    or (v_scenarios #>> '{high,total}')::integer <> v_reference_max
    or v_fairness ->> 'price_source' is distinct from p_quote ->> 'price_source'
    or nullif(pg_catalog.btrim(v_fairness ->> 'cap_statement'), '') is null
    or pg_catalog.jsonb_typeof(v_fairness -> 'confidence') <> 'string'
  then
    return false;
  end if;

  v_confidence := v_fairness ->> 'confidence';
  if v_confidence not in ('low', 'medium', 'high') then
    return false;
  end if;

  v_baseline := v_fairness -> 'baseline_evidence';
  if pg_catalog.jsonb_typeof(v_baseline) = 'object'
    and v_baseline ->> 'schema_version' = 'baseline_price_evidence_receipt.v1'
    and v_baseline -> 'quorum_met' = 'true'::jsonb
    and pg_catalog.jsonb_typeof(v_baseline -> 'sources') = 'array'
  then
    v_baseline_sources := (v_baseline ->> 'accepted_source_count')::integer;
    v_high_trust_sources := (v_baseline ->> 'high_trust_source_count')::integer;
    v_required_quorum := (v_baseline ->> 'required_quorum')::integer;
    v_baseline_quorum := v_baseline_sources > 0
      and v_required_quorum > 0
      and v_high_trust_sources >= v_required_quorum
      and pg_catalog.jsonb_array_length(v_baseline -> 'sources') = v_baseline_sources;
  end if;

  if pg_catalog.jsonb_typeof(v_fairness -> 'market_source_count') = 'number' then
    v_market_sources := (v_fairness ->> 'market_source_count')::integer;
  end if;
  if pg_catalog.jsonb_typeof(v_fairness -> 'high_trust_source_count') = 'number' then
    v_high_trust_sources := (v_fairness ->> 'high_trust_source_count')::integer;
  end if;
  v_market_quorum := v_fairness -> 'quorum_met' = 'true'::jsonb
    and v_market_sources >= 2
    and v_high_trust_sources >= 1;

  return v_baseline_quorum or v_market_quorum;
exception
  when others then
    return false;
end;
$$;

comment on function private.is_valid_original_scope_price_quote(
  jsonb, uuid, uuid, uuid, timestamptz, boolean
) is 'Validates immutable bilateral price quotes against the canonical categorical confidence receipt.';

commit;
