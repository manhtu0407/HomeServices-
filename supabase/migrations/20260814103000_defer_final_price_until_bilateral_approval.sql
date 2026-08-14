-- A confirmed estimate ceiling authorizes matching, not payment. Keep the
-- legacy RPC argument for deployed-client compatibility, validate it against
-- the server estimate, and leave jobs.final_price unset until an exact price
-- has both worker confirmation and customer approval.
create or replace function public.begin_job_matching_preference_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_final_price integer,
  p_worker_brief_core jsonb
)
returns table (
  ok boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  if p_job_id is null
     or p_customer_id is null
     or p_final_price is null
     or p_final_price <= 0
     or p_worker_brief_core is null then
    return query select false, 'INVALID_INPUT'::text;
    return;
  end if;

  select *
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;
  if v_job.customer_id is distinct from p_customer_id then
    return query select false, 'NOT_OWNER'::text;
    return;
  end if;
  if v_job.status is distinct from 'awaiting_customer_confirm'::public.job_status then
    return query select false, 'INVALID_STATUS'::text;
    return;
  end if;
  if p_final_price is distinct from v_job.kael_price_max then
    return query select false, 'PRICE_CAP_CHANGED'::text;
    return;
  end if;
  if exists (
    select 1
    from public.job_matching_preferences as preference
    where preference.job_id = p_job_id
    for update
  ) then
    return query select false, 'PREFERENCE_LOCKED'::text;
    return;
  end if;

  update public.jobs as job
  set status = 'broadcasting'::public.job_status,
      broadcast_at = now(),
      confirmed_search_at = now(),
      final_price = null,
      kael_worker_brief_core = p_worker_brief_core
  where job.id = p_job_id;

  insert into public.job_matching_preferences (
    job_id,
    customer_id,
    strategy,
    preferred_worker_id,
    auto_general
  ) values (
    p_job_id,
    p_customer_id,
    'pending',
    null,
    true
  );

  return query select true, null::text;
end;
$$;

revoke execute on function public.begin_job_matching_preference_atomic(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_job_matching_preference_atomic(uuid, uuid, integer, jsonb)
  to service_role;

comment on function public.begin_job_matching_preference_atomic(uuid, uuid, integer, jsonb) is
  'Starts customer-selected matching after validating the confirmed estimate ceiling. It never promotes that ceiling to jobs.final_price.';

create or replace function public.guard_bilateral_final_price_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.final_price is null
    or (tg_op = 'UPDATE' and new.final_price is not distinct from old.final_price)
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.scope_change_requests as scope
    where scope.job_id = new.id
      and scope.status = 'approved_by_customer'::public.scope_change_status
      and scope.kael_computed_min = new.final_price
      and scope.kael_computed_max = new.final_price
      and jsonb_typeof(scope.kael_review) = 'object'
      and scope.kael_review ->> 'price_source' = 'verified_baseline'
      and scope.kael_review ->> 'pricing_mode' = 'full_scope_total'
      and scope.kael_review ->> 'selection_rule'
        = 'verified_neutral_midpoint_with_bilateral_confirmation'
      and scope.kael_review #>> '{worker_price_confirmation,confirmed}' = 'true'
      and nullif(btrim(scope.kael_review #>> '{worker_price_confirmation,quote_id}'), '') is not null
      and nullif(btrim(scope.kael_review #>> '{worker_price_confirmation,confirmed_at}'), '') is not null
      and scope.kael_review #>> '{stakeholder_balance,customer_confirmation_required}' = 'true'
      and scope.kael_review #>> '{stakeholder_balance,worker_confirmation_required}' = 'true'
      and (scope.kael_review #>> '{stakeholder_balance,customer_total}')::numeric
        = new.final_price
  ) then
    raise exception using
      errcode = '23514',
      message = 'final price requires bilateral verified approval';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_bilateral_final_price_lock on public.jobs;
create constraint trigger guard_bilateral_final_price_lock
after insert or update on public.jobs
deferrable initially deferred
for each row execute function public.guard_bilateral_final_price_lock();

revoke all on function public.guard_bilateral_final_price_lock() from public;

comment on column public.jobs.final_price is
  'Exact payable service price. Null during estimate and matching; set only after a source-verified point quote is confirmed by the worker and explicitly approved by the customer.';
