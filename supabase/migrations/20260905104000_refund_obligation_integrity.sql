begin;

create table if not exists public.job_refund_obligations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  payment_order_id uuid references public.job_payment_orders(id) on delete restrict,
  source_type text not null check (source_type in ('approved_dispute', 'paid_cancellation')),
  source_id uuid not null,
  state text not null default 'refund_required' check (state = 'refund_required'),
  amount_vnd integer not null check (amount_vnd > 0),
  verified_paid_amount_vnd integer not null check (verified_paid_amount_vnd >= amount_vnd),
  synthetic_cohort_id text references public.synthetic_matching_cohorts(cohort_id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (source_type, source_id),
  check (payment_order_id is not null or synthetic_cohort_id is not null)
);
create index if not exists job_refund_obligations_job_idx on public.job_refund_obligations(job_id, created_at);
create index if not exists job_refund_obligations_real_idx on public.job_refund_obligations(created_at)
  where synthetic_cohort_id is null;
alter table public.job_refund_obligations enable row level security;
revoke all on public.job_refund_obligations from public, anon, authenticated, service_role;
grant select on public.job_refund_obligations to service_role;

create or replace function private.verified_refund_payment(p_job_id uuid)
returns table (payment_order_id uuid, paid_amount_vnd integer)
language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_order public.job_payment_orders%rowtype;
begin
  select * into strict v_job from public.jobs where id = p_job_id;
  if v_job.status is null or v_job.status not in ('paid', 'reviewed', 'cancelled') or v_job.paid_at is null or v_job.payment_received_at is null
    or coalesce(v_job.payment_amount_received, 0) <= 0 then
    raise exception 'REFUND_PAYMENT_UNVERIFIED' using errcode = 'P0001';
  end if;
  if v_job.synthetic_cohort_id is not null then
    if v_job.payment_provider is distinct from 'staging_simulator' or v_job.payment_status is distinct from 'received' then
      raise exception 'REFUND_PAYMENT_UNVERIFIED' using errcode = 'P0001';
    end if;
    return query select null::uuid, v_job.payment_amount_received;
    return;
  end if;
  select * into v_order from public.job_payment_orders where job_id = p_job_id;
  if not found or v_order.customer_id is distinct from v_job.customer_id
    or v_order.worker_id is distinct from v_job.worker_id
    or v_order.payment_method is distinct from 'platform_bank_manual' or v_order.status is distinct from 'manual_verified'
    or v_order.verified_at is null or v_order.verified_by is null or v_order.credited_at is null
    or v_order.bank_reference_hash is null or v_order.bank_reference_hash !~ '^[0-9a-f]{64}$'
    or v_job.payment_provider is distinct from 'platform_bank_manual'
    or v_job.payment_status is distinct from 'manual_verified'
    or v_order.amount_received is distinct from v_job.payment_amount_received
    or coalesce(v_order.amount_received, 0) <= 0 or coalesce(v_order.gross_amount, 0) <= 0 then
    raise exception 'REFUND_PAYMENT_UNVERIFIED' using errcode = 'P0001';
  end if;
  return query select v_order.id, least(v_order.amount_received, v_order.gross_amount);
end;
$func$;

create or replace function private.record_refund_obligation(
  p_job_id uuid, p_source_type text, p_source_id uuid, p_amount_vnd integer, p_approved_by uuid
) returns uuid language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_receipt record;
  v_existing public.job_refund_obligations%rowtype;
  v_reserved bigint;
  v_completed bigint;
  v_amount integer;
  v_id uuid;
begin
  if p_job_id is null or p_source_id is null or p_source_type is null
    or p_source_type not in ('approved_dispute', 'paid_cancellation')
    or (p_source_type = 'approved_dispute' and (p_amount_vnd is null or p_approved_by is null))
    or (p_source_type = 'paid_cancellation' and (p_source_id is distinct from p_job_id
      or p_amount_vnd is not null or p_approved_by is not null)) then
    raise exception 'REFUND_SOURCE_CONFLICT' using errcode = 'P0001';
  end if;
  if p_amount_vnd is not null and p_amount_vnd <= 0 then
    raise exception 'REFUND_AMOUNT_EXCEEDS_PAID' using errcode = 'P0001';
  end if;
  select * into strict v_job from public.jobs where id = p_job_id for update;
  if p_source_type = 'paid_cancellation' and v_job.status is distinct from 'cancelled' then
    raise exception 'REFUND_SOURCE_CONFLICT' using errcode = 'P0001';
  end if;
  select * into v_existing from public.job_refund_obligations
    where source_type = p_source_type and source_id = p_source_id;
  if found then
    if v_existing.job_id is distinct from p_job_id
      or (p_amount_vnd is not null and v_existing.amount_vnd <> p_amount_vnd) then
      raise exception 'REFUND_SOURCE_CONFLICT' using errcode = 'P0001';
    end if;
    return v_existing.id;
  end if;
  select * into strict v_receipt from private.verified_refund_payment(p_job_id);
  select coalesce(sum(amount_vnd), 0) into v_reserved from public.job_refund_obligations where job_id = p_job_id;
  select coalesce(sum(gross_refund_vnd), 0) into v_completed from public.admin_financial_adjustments where job_id = p_job_id;
  v_amount := coalesce(p_amount_vnd, greatest(0, v_receipt.paid_amount_vnd - v_reserved - v_completed)::integer);
  if v_amount = 0 and p_source_type = 'paid_cancellation' then return null; end if;
  if v_amount <= 0 or v_reserved + v_completed + v_amount > v_receipt.paid_amount_vnd then
    raise exception 'REFUND_AMOUNT_EXCEEDS_PAID' using errcode = 'P0001';
  end if;
  if p_source_type = 'approved_dispute' then
    if not exists (select 1 from public.disputes where id = p_source_id and job_id = p_job_id
      and status = 'admin_decided' and admin_decision_by = p_approved_by
      and synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
      and (admin_decision->>'refund_amount')::numeric = v_amount) then
      raise exception 'REFUND_SOURCE_CONFLICT' using errcode = 'P0001';
    end if;
    perform private.assert_finance_reconciler(p_approved_by);
  end if;
  insert into public.job_refund_obligations(job_id, payment_order_id, source_type, source_id,
    amount_vnd, verified_paid_amount_vnd, synthetic_cohort_id, approved_by)
  values (p_job_id, v_receipt.payment_order_id, p_source_type, p_source_id,
    v_amount, v_receipt.paid_amount_vnd, v_job.synthetic_cohort_id, p_approved_by)
  returning id into v_id;
  insert into public.job_events(job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
  values (p_job_id, p_approved_by, case when p_approved_by is null then null else 'admin'::public.user_role end,
    'refund_required', v_job.status, v_job.status,
    jsonb_build_object('obligation_id', v_id, 'source_type', p_source_type, 'source_id', p_source_id,
      'amount_vnd', v_amount, 'receipt_verification_available', false));
  return v_id;
end;
$func$;

create or replace function private.capture_dispute_refund_obligation()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if new.status = 'admin_decided' and coalesce((new.admin_decision->>'refund_amount')::numeric, 0) > 0 then
    perform private.record_refund_obligation(new.job_id, 'approved_dispute', new.id,
      (new.admin_decision->>'refund_amount')::integer, new.admin_decision_by);
  end if;
  return new;
end;
$func$;

create or replace function private.capture_paid_cancellation_refund()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status and old.paid_at is not null then
    if new.paid_at is distinct from old.paid_at or new.payment_received_at is distinct from old.payment_received_at
      or new.payment_amount_received is distinct from old.payment_amount_received
      or new.payment_status is distinct from old.payment_status
      or new.payment_provider is distinct from old.payment_provider then
      raise exception 'REFUND_PAID_FACTS_IMMUTABLE' using errcode = 'P0001';
    end if;
    perform private.record_refund_obligation(new.id, 'paid_cancellation', new.id, null, null);
  end if;
  return new;
end;
$func$;

create or replace function private.reject_unverified_refund_completion()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  -- An outbound receipt intake and distinct maker/checker verification must exist before this rail can open.
  if new.adjustment_type = 'refund' then
    if private.synthetic_job_cohort(new.job_id) is not null then
      raise exception 'SYNTHETIC_FINANCE_FORBIDDEN' using errcode = '42501';
    end if;
    raise exception 'REFUND_RECEIPT_VERIFICATION_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$func$;

create or replace function private.protect_refund_obligation()
returns trigger language plpgsql security definer set search_path = '' as $func$
begin
  raise exception 'REFUND_OBLIGATION_IMMUTABLE' using errcode = 'P0001';
end;
$func$;

do $triggers$
begin
  if not exists (select 1 from pg_trigger where tgname = 'dispute_refund_obligation' and tgrelid = 'public.disputes'::regclass) then
    create trigger dispute_refund_obligation after insert or update of status, admin_decision on public.disputes
      for each row execute function private.capture_dispute_refund_obligation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'paid_cancellation_refund_obligation' and tgrelid = 'public.jobs'::regclass) then
    create trigger paid_cancellation_refund_obligation after update of status on public.jobs
      for each row execute function private.capture_paid_cancellation_refund();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'admin_financial_adjustments_refund_receipt' and tgrelid = 'public.admin_financial_adjustments'::regclass) then
    create trigger admin_financial_adjustments_refund_receipt before insert on public.admin_financial_adjustments
      for each row execute function private.reject_unverified_refund_completion();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'refund_obligation_immutable' and tgrelid = 'public.job_refund_obligations'::regclass) then
    create trigger refund_obligation_immutable before update or delete on public.job_refund_obligations
      for each row execute function private.protect_refund_obligation();
  end if;
end;
$triggers$;

create or replace function public.request_paid_cancellation_review_atomic(
  p_job_id uuid, p_customer_id uuid, p_reason_code text, p_reason_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_request public.customer_cancellation_records%rowtype;
  v_dispute_id uuid;
  v_dispute record;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles where id = p_customer_id and role = 'customer') then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.status not in ('paid', 'reviewed') or v_job.paid_at is null then
    raise exception 'PAID_REVIEW_STATUS_CHANGED' using errcode = 'P0001';
  end if;
  select * into v_request from public.customer_cancellation_records
    where job_id = p_job_id and customer_id = p_customer_id
      and safe_metadata->>'paid_cancellation_review' = 'true'
    order by created_at limit 1;
  if not found then
    if not exists (select 1 from public.customer_cancellation_reason_taxonomy where code = p_reason_code and is_active)
      or length(coalesce(p_reason_note, '')) > 2000 then
      raise exception 'INVALID_REASON' using errcode = 'P0001';
    end if;
    select id into v_dispute_id from public.disputes where job_id = p_job_id
      and status in ('open', 'awaiting_counter_party', 'admin_review') order by created_at limit 1;
    if v_dispute_id is null then
      select * into v_dispute from public.open_dispute_atomic(p_job_id, p_customer_id, 'customer', 'other',
        coalesce(nullif(btrim(p_reason_note), ''), 'Khách đề nghị xem xét hủy giao dịch đã thanh toán.'),
        array[]::text[], 'Khách đề nghị xem xét hủy sau thanh toán. Chưa phê duyệt hủy hoặc hoàn tiền.');
      if not v_dispute.ok then raise exception 'REFUND_REVIEW_UNAVAILABLE' using errcode = 'P0001'; end if;
      v_dispute_id := v_dispute.dispute_id;
    end if;
    insert into public.customer_cancellation_records(job_id, customer_id, worker_id, sub_case,
      reason_code, reason_category, reason_note, status, admin_review_required, phase0_no_monetary_penalty, safe_metadata)
    values (p_job_id, p_customer_id, v_job.worker_id, 'after_worker_completed_trigger_dispute',
      p_reason_code, 'needs_admin_review', nullif(btrim(p_reason_note), ''), 'dispute_pending', true, false,
      jsonb_build_object('paid_cancellation_review', true, 'dispute_id', v_dispute_id)) returning * into v_request;
    insert into public.job_events(job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata)
    values (p_job_id, p_customer_id, 'customer', 'paid_cancellation_review_requested', v_job.status, v_job.status,
      jsonb_build_object('cancellation_id', v_request.id, 'dispute_id', v_dispute_id, 'refund_state', 'review_required'));
  end if;
  return jsonb_build_object('cancellation_id', v_request.id, 'dispute_id', v_request.safe_metadata->>'dispute_id',
    'job_id', p_job_id, 'job_status', v_job.status, 'created_at', v_request.created_at);
end;
$func$;

create or replace function public.read_job_refund_summary(p_job_id uuid, p_real_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_amount bigint;
  v_ids jsonb;
  v_requested_at timestamptz;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or (p_real_only and v_job.synthetic_cohort_id is not null) then return null; end if;
  select sum(amount_vnd), jsonb_agg(id order by created_at, id), min(created_at)
    into v_amount, v_ids, v_requested_at from public.job_refund_obligations
    where job_id = p_job_id and synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id;
  if v_amount > 0 then
    return jsonb_build_object('state', 'refund_required', 'amount_vnd', v_amount,
      'obligation_ids', v_ids, 'requested_at', v_requested_at, 'receipt_verification_available', false);
  end if;
  select min(request.created_at) into v_requested_at from public.customer_cancellation_records request
    join public.disputes dispute on dispute.id::text = request.safe_metadata->>'dispute_id'
    where request.job_id = p_job_id and request.safe_metadata->>'paid_cancellation_review' = 'true'
      and dispute.status in ('open', 'awaiting_counter_party', 'admin_review');
  if v_requested_at is null then return null; end if;
  return jsonb_build_object('state', 'review_required', 'amount_vnd', null,
    'obligation_ids', '[]'::jsonb, 'requested_at', v_requested_at, 'receipt_verification_available', false);
end;
$func$;

revoke all on function private.verified_refund_payment(uuid),
  private.record_refund_obligation(uuid,text,uuid,integer,uuid), private.capture_dispute_refund_obligation(),
  private.capture_paid_cancellation_refund(), private.reject_unverified_refund_completion(), private.protect_refund_obligation()
  from public, anon, authenticated, service_role;
revoke all on function public.request_paid_cancellation_review_atomic(uuid,uuid,text,text),
  public.read_job_refund_summary(uuid,boolean) from public, anon, authenticated;
grant execute on function public.request_paid_cancellation_review_atomic(uuid,uuid,text,text),
  public.read_job_refund_summary(uuid,boolean) to service_role;

commit;
