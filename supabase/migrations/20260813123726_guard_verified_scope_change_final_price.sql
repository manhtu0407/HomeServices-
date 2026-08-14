-- New scope proposals must carry a source-bound, case-specific point price.
-- Keep the constraint NOT VALID so historical rows remain readable; every new
-- or updated waiting decision must satisfy it.
alter table public.scope_change_requests
  add constraint scope_change_waiting_requires_verified_case_price
  check (
    case
      when status <> 'waiting_customer_decision'::public.scope_change_status then true
      when jsonb_typeof(kael_review) = 'object'
        and jsonb_typeof(kael_review -> 'reference_price_min') = 'number'
        and jsonb_typeof(kael_review -> 'reference_price_max') = 'number'
        and jsonb_typeof(kael_review -> 'stakeholder_balance') = 'object'
        and jsonb_typeof(kael_review -> 'worker_price_confirmation') = 'object'
        and jsonb_typeof(kael_review #> '{stakeholder_balance,customer_total}') = 'number'
        and jsonb_typeof(kael_review #> '{stakeholder_balance,platform_fee}') = 'number'
        and jsonb_typeof(kael_review #> '{stakeholder_balance,worker_net}') = 'number'
        and jsonb_typeof(kael_review #> '{stakeholder_balance,commission_rate_bps}') = 'number'
        and jsonb_typeof(kael_review #> '{worker_price_confirmation,confirmed}') = 'boolean'
        and jsonb_typeof(kael_review #> '{worker_price_confirmation,quote_id}') = 'string'
        and jsonb_typeof(kael_review #> '{worker_price_confirmation,confirmed_at}') = 'string'
      then
        kael_computed_min is not null
        and kael_computed_max is not null
        and kael_computed_min = kael_computed_max
        and kael_computed_min >= (kael_review ->> 'reference_price_min')::numeric
        and kael_computed_max <= (kael_review ->> 'reference_price_max')::numeric
        and kael_review ->> 'price_source' = 'verified_baseline'
        and kael_review ->> 'pricing_mode' = 'full_scope_total'
        and kael_review ->> 'selection_rule' = 'verified_neutral_midpoint_with_bilateral_confirmation'
        and nullif(btrim(kael_review ->> 'baseline_used'), '') is not null
        and nullif(btrim(kael_review ->> 'baseline_source'), '') is not null
        and kael_review #>> '{stakeholder_balance,worker_confirmation_required}' = 'true'
        and kael_review #>> '{stakeholder_balance,customer_confirmation_required}' = 'true'
        and (kael_review #>> '{stakeholder_balance,customer_total}')::numeric = kael_computed_min
        and (kael_review #>> '{stakeholder_balance,platform_fee}')::numeric >= 0
        and (kael_review #>> '{stakeholder_balance,worker_net}')::numeric > 0
        and (kael_review #>> '{stakeholder_balance,platform_fee}')::numeric
          + (kael_review #>> '{stakeholder_balance,worker_net}')::numeric
          = kael_computed_min
        and (kael_review #>> '{stakeholder_balance,commission_rate_bps}')::numeric
          between 0 and 1500
        and kael_review #>> '{worker_price_confirmation,confirmed}' = 'true'
        and nullif(btrim(kael_review #>> '{worker_price_confirmation,quote_id}'), '') is not null
        and nullif(btrim(kael_review #>> '{worker_price_confirmation,confirmed_at}'), '') is not null
      else false
    end
  ) not valid;

-- The trigger also guards old rows if a caller invokes the atomic decision RPC
-- directly instead of going through Edge. Invalid historical proposals can be
-- rejected or re-created, but cannot become an unverified final price.
create or replace function public.guard_verified_scope_change_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved_by_customer'::public.scope_change_status
    and old.status is distinct from new.status
  then
    if jsonb_typeof(new.kael_review) is distinct from 'object'
      or jsonb_typeof(new.kael_review -> 'reference_price_min') is distinct from 'number'
      or jsonb_typeof(new.kael_review -> 'reference_price_max') is distinct from 'number'
      or jsonb_typeof(new.kael_review -> 'stakeholder_balance') is distinct from 'object'
      or jsonb_typeof(new.kael_review -> 'worker_price_confirmation') is distinct from 'object'
      or jsonb_typeof(new.kael_review #> '{stakeholder_balance,customer_total}') is distinct from 'number'
      or jsonb_typeof(new.kael_review #> '{stakeholder_balance,platform_fee}') is distinct from 'number'
      or jsonb_typeof(new.kael_review #> '{stakeholder_balance,worker_net}') is distinct from 'number'
      or jsonb_typeof(new.kael_review #> '{stakeholder_balance,commission_rate_bps}') is distinct from 'number'
      or jsonb_typeof(new.kael_review #> '{worker_price_confirmation,confirmed}') is distinct from 'boolean'
      or jsonb_typeof(new.kael_review #> '{worker_price_confirmation,quote_id}') is distinct from 'string'
      or jsonb_typeof(new.kael_review #> '{worker_price_confirmation,confirmed_at}') is distinct from 'string'
    then
      raise exception using
        errcode = '23514',
        message = 'scope change final price lacks verified case receipt';
    end if;
    if new.kael_computed_min is null
      or new.kael_computed_max is null
      or new.kael_computed_min <> new.kael_computed_max
      or new.kael_computed_min < (new.kael_review ->> 'reference_price_min')::numeric
      or new.kael_computed_max > (new.kael_review ->> 'reference_price_max')::numeric
      or new.kael_review ->> 'price_source' is distinct from 'verified_baseline'
      or new.kael_review ->> 'pricing_mode' is distinct from 'full_scope_total'
      or new.kael_review ->> 'selection_rule' is distinct from 'verified_neutral_midpoint_with_bilateral_confirmation'
      or nullif(btrim(new.kael_review ->> 'baseline_used'), '') is null
      or nullif(btrim(new.kael_review ->> 'baseline_source'), '') is null
      or new.kael_review #>> '{stakeholder_balance,worker_confirmation_required}' is distinct from 'true'
      or new.kael_review #>> '{stakeholder_balance,customer_confirmation_required}' is distinct from 'true'
      or (new.kael_review #>> '{stakeholder_balance,customer_total}')::numeric
        is distinct from new.kael_computed_min::numeric
      or (new.kael_review #>> '{stakeholder_balance,platform_fee}')::numeric < 0
      or (new.kael_review #>> '{stakeholder_balance,worker_net}')::numeric <= 0
      or (new.kael_review #>> '{stakeholder_balance,platform_fee}')::numeric
        + (new.kael_review #>> '{stakeholder_balance,worker_net}')::numeric
        is distinct from new.kael_computed_min::numeric
      or (new.kael_review #>> '{stakeholder_balance,commission_rate_bps}')::numeric
        not between 0 and 1500
      or new.kael_review #>> '{worker_price_confirmation,confirmed}' is distinct from 'true'
      or nullif(btrim(new.kael_review #>> '{worker_price_confirmation,quote_id}'), '') is null
      or nullif(btrim(new.kael_review #>> '{worker_price_confirmation,confirmed_at}'), '') is null
    then
      raise exception using
        errcode = '23514',
        message = 'scope change final price lacks verified case receipt';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_verified_scope_change_approval
  on public.scope_change_requests;
create trigger guard_verified_scope_change_approval
before update of status on public.scope_change_requests
for each row execute function public.guard_verified_scope_change_approval();

revoke all on function public.guard_verified_scope_change_approval() from public;
