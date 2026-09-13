-- Customer completion and manual-bank order creation are one durable operation.
-- Legacy direct-payment data remains readable for recovery, but no new public write is executable.

begin;

create table if not exists public.completion_payment_operations (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique
    check (request_id ~ '^completion-payment:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  payment_order_id uuid not null unique references public.job_payment_orders(id) on delete restrict,
  final_price integer not null check (final_price > 0),
  response_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $trigger_guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgname = 'completion_payment_operations_updated_at'
      and tgrelid = 'public.completion_payment_operations'::regclass
      and not tgisinternal
  ) then
    create trigger completion_payment_operations_updated_at
    before update on public.completion_payment_operations
    for each row execute function public.update_updated_at();
  end if;
end;
$trigger_guard$;

alter table public.completion_payment_operations enable row level security;
revoke all on public.completion_payment_operations from public, anon, authenticated;
grant select, insert, update on public.completion_payment_operations to service_role;

create or replace function public.confirm_completion_manual_bank_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_request_id text,
  p_expected_final_price integer,
  p_payment_code text,
  p_transfer_content text,
  p_qr_image_url text,
  p_observed_at timestamptz default now()
) returns table (
  operation_id uuid,
  request_id text,
  job_id uuid,
  status public.job_status,
  final_price integer,
  payment_order_id uuid,
  payment_status text,
  gross_amount integer,
  payment_code text,
  payment_transfer_content text,
  payment_qr_image_url text,
  payment_updated_at timestamptz,
  already_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected_request_id text;
  v_job public.jobs%rowtype;
  v_operation public.completion_payment_operations%rowtype;
  v_order public.job_payment_orders%rowtype;
  v_payment record;
  v_now timestamptz := coalesce(p_observed_at, pg_catalog.clock_timestamp());
begin
  v_expected_request_id := 'completion-payment:' || p_job_id::text || ':' || p_customer_id::text;
  if p_job_id is null
    or p_customer_id is null
    or p_request_id is distinct from v_expected_request_id
    or p_expected_final_price is null
    or p_expected_final_price <= 0
    or p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or p_transfer_content is distinct from p_payment_code
    or p_qr_image_url !~ '^https://vietqr\.app/img\?'
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found or v_job.customer_id is distinct from p_customer_id then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.synthetic_cohort_id is not null then
    raise exception 'SYNTHETIC_PAYMENT_PATH_REQUIRED' using errcode = 'P0001';
  end if;

  select operation.* into v_operation
  from public.completion_payment_operations as operation
  where operation.job_id = p_job_id
     or operation.request_id = p_request_id
  for update;

  if found then
    if v_operation.job_id is distinct from p_job_id
      or v_operation.customer_id is distinct from p_customer_id
      or v_operation.request_id is distinct from p_request_id
    then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select payment_order.* into strict v_order
    from public.job_payment_orders as payment_order
    where payment_order.id = v_operation.payment_order_id;
    return query select
      v_operation.id,
      v_operation.request_id,
      v_job.id,
      v_job.status,
      v_operation.final_price,
      v_order.id,
      v_order.status,
      v_order.gross_amount,
      v_order.payment_code,
      v_order.transfer_content,
      v_order.qr_image_url,
      v_order.updated_at,
      true;
    return;
  end if;

  if v_job.status in (
    'payment_pending'::public.job_status,
    'paid'::public.job_status,
    'reviewed'::public.job_status
  ) then
    select payment_order.* into v_order
    from public.job_payment_orders as payment_order
    where payment_order.job_id = v_job.id
      and payment_order.payment_method = 'platform_bank_manual'
    for update;
    if not found then
      raise exception 'PAYMENT_METHOD_LOCKED' using errcode = 'P0001';
    end if;
    insert into public.completion_payment_operations(
      request_id, job_id, customer_id, payment_order_id, final_price, response_snapshot
    ) values (
      p_request_id,
      v_job.id,
      p_customer_id,
      v_order.id,
      v_order.gross_amount,
      pg_catalog.jsonb_build_object(
        'job_status', v_job.status,
        'payment_status', v_order.status,
        'recovered_existing_order', true
      )
    ) returning * into v_operation;
    return query select
      v_operation.id,
      v_operation.request_id,
      v_job.id,
      v_job.status,
      v_operation.final_price,
      v_order.id,
      v_order.status,
      v_order.gross_amount,
      v_order.payment_code,
      v_order.transfer_content,
      v_order.qr_image_url,
      v_order.updated_at,
      true;
    return;
  end if;

  if v_job.status is distinct from 'completed_by_worker'::public.job_status
    or v_job.worker_id is null
    or v_job.final_price is null
    or v_job.final_price <= 0
    or v_job.final_price is distinct from p_expected_final_price
  then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  if coalesce(pg_catalog.cardinality(v_job.completion_photo_urls), 0) = 0 then
    raise exception 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' using errcode = 'P0001';
  end if;

  update public.jobs as job
  set status = 'confirmed_by_customer'::public.job_status,
    confirmed_at = coalesce(job.confirmed_at, v_now)
  where job.id = v_job.id
    and job.customer_id = p_customer_id
    and job.status = 'completed_by_worker'::public.job_status;
  if not found then
    raise exception 'STATUS_CHANGED' using errcode = 'P0001';
  end if;

  insert into public.job_events(
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id,
    p_customer_id,
    'customer'::public.user_role,
    'customer_confirmed_completion',
    'completed_by_worker'::public.job_status,
    'confirmed_by_customer'::public.job_status,
    pg_catalog.jsonb_build_object(
      'completion_evidence', pg_catalog.jsonb_build_object(
        'note_present', v_job.completion_notes is not null,
        'photo_count', pg_catalog.cardinality(v_job.completion_photo_urls)
      )
    )
  );

  select * into strict v_payment
  from public.create_manual_bank_payment_order(
    v_job.id,
    p_customer_id,
    p_expected_final_price,
    p_payment_code,
    p_transfer_content,
    p_qr_image_url,
    v_now
  );

  select payment_order.* into strict v_order
  from public.job_payment_orders as payment_order
  where payment_order.job_id = v_job.id
    and payment_order.payment_method = 'platform_bank_manual';

  insert into public.completion_payment_operations(
    request_id, job_id, customer_id, payment_order_id, final_price, response_snapshot
  ) values (
    p_request_id,
    v_job.id,
    p_customer_id,
    v_order.id,
    p_expected_final_price,
    pg_catalog.jsonb_build_object(
      'job_status', v_payment.status,
      'payment_status', v_payment.payment_status,
      'customer_completion_confirmed', true
    )
  ) returning * into v_operation;

  return query select
    v_operation.id,
    v_operation.request_id,
    v_job.id,
    v_payment.status,
    p_expected_final_price,
    v_order.id,
    v_payment.payment_status,
    v_payment.gross_amount,
    v_payment.payment_code,
    v_payment.payment_transfer_content,
    v_payment.payment_qr_image_url,
    v_payment.payment_updated_at,
    false;
end;
$function$;

revoke execute on function public.confirm_completion_manual_bank_atomic(
  uuid,uuid,text,integer,text,text,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.confirm_completion_manual_bank_atomic(
  uuid,uuid,text,integer,text,text,text,timestamptz
) to service_role;

revoke execute on function public.select_direct_worker_payment(uuid,uuid,text)
from public, anon, authenticated, service_role;
revoke execute on function public.respond_to_direct_worker_payment(uuid,uuid,text,boolean)
from public, anon, authenticated, service_role;
revoke execute on function public.acknowledge_worker_cash_payment(uuid,uuid,boolean)
from public, anon, authenticated, service_role;
revoke execute on function public.confirm_worker_cash_payment(uuid,uuid)
from public, anon, authenticated, service_role;
revoke execute on function public.create_worker_vietqr_payment_intent(
  uuid,uuid,integer,text,text,text,timestamptz
) from public, anon, authenticated, service_role;
comment on table public.completion_payment_operations is
  'One durable Customer completion plus manual-bank order receipt per real job.';
comment on function public.confirm_completion_manual_bank_atomic(
  uuid,uuid,text,integer,text,text,text,timestamptz
) is 'Customer-owned atomic completion and manual-bank order creation. Service-role only.';

commit;
