begin;

-- The base fee is policy data. Higher tiers can only reduce this rate.
create table if not exists public.worker_commission_tiers (
  level smallint primary key check (level >= 1),
  min_completed_jobs integer not null check (min_completed_jobs >= 0),
  min_average_rating numeric not null check (min_average_rating between 0 and 5),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 1500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.enforce_worker_commission_tier_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  -- Serialize policy edits so concurrent admin writes cannot break tier monotonicity.
  perform pg_advisory_xact_lock(pg_catalog.hashtext('worker_commission_tiers_policy'));

  if exists (
    select 1
    from public.worker_commission_tiers tier
    where tier.level < new.level
      and tier.commission_rate_bps < new.commission_rate_bps
  ) then
    raise exception 'higher tiers must not have a higher commission rate';
  end if;

  if exists (
    select 1
    from public.worker_commission_tiers tier
    where tier.level > new.level
      and tier.commission_rate_bps > new.commission_rate_bps
  ) then
    raise exception 'higher tiers must not have a higher commission rate';
  end if;

  if exists (
    select 1
    from public.worker_commission_tiers tier
    where tier.level < new.level
      and (
        tier.min_completed_jobs > new.min_completed_jobs
        or tier.min_average_rating > new.min_average_rating
      )
  ) then
    raise exception 'higher tiers must not have weaker qualification thresholds';
  end if;

  if exists (
    select 1
    from public.worker_commission_tiers tier
    where tier.level > new.level
      and (
        tier.min_completed_jobs < new.min_completed_jobs
        or tier.min_average_rating < new.min_average_rating
      )
  ) then
    raise exception 'higher tiers must not have weaker qualification thresholds';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists worker_commission_tiers_policy_guard on public.worker_commission_tiers;
create trigger worker_commission_tiers_policy_guard
before insert or update on public.worker_commission_tiers
for each row execute function private.enforce_worker_commission_tier_policy();

insert into public.worker_commission_tiers (
  level,
  min_completed_jobs,
  min_average_rating,
  commission_rate_bps,
  is_active
) values (1, 0, 0, 1500, true)
on conflict (level) do nothing;

alter table public.worker_commission_tiers enable row level security;
drop policy if exists "Admins manage worker commission tiers" on public.worker_commission_tiers;
create policy "Admins manage worker commission tiers"
  on public.worker_commission_tiers for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
revoke all on table public.worker_commission_tiers from anon, authenticated;
grant select, insert, update, delete on table public.worker_commission_tiers to authenticated;
grant all on table public.worker_commission_tiers to service_role;

alter table public.jobs
  add column if not exists worker_commission_level smallint,
  add column if not exists worker_commission_rate_bps integer;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint where conname = 'jobs_worker_commission_level_check'
  ) then
    alter table public.jobs add constraint jobs_worker_commission_level_check
      check (worker_commission_level is null or worker_commission_level >= 1);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint where conname = 'jobs_worker_commission_rate_bps_check'
  ) then
    alter table public.jobs add constraint jobs_worker_commission_rate_bps_check
      check (worker_commission_rate_bps is null or worker_commission_rate_bps between 0 and 1500);
  end if;
end;
$block$;

-- This is the in-app payable ledger. It intentionally stores no bank-account data.
create table if not exists public.worker_payment_ledger (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  worker_id uuid not null references public.worker_profiles(id) on delete restrict,
  payment_provider text not null check (payment_provider = 'sepay_vietqr'),
  payment_state text not null check (payment_state in ('pending', 'available', 'on_hold', 'reversed')),
  gross_amount integer not null check (gross_amount > 0),
  platform_fee integer not null check (platform_fee >= 0),
  worker_net integer not null check (worker_net > 0),
  commission_level smallint not null check (commission_level >= 1),
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 1500),
  available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (gross_amount = platform_fee + worker_net)
);

-- Preserve only legacy SePay rows whose frozen amounts prove the previous policy.
do $block$
declare
  v_legacy_rate_bps integer;
begin
  select round(private.platform_fee_worker_rate() * 10000)::integer
  into v_legacy_rate_bps;

  if v_legacy_rate_bps not between 0 and 1500 then
    raise exception 'legacy worker commission rate is outside the supported policy range';
  end if;

  if exists (
    select 1
    from public.jobs job
    where job.payment_provider = 'sepay_vietqr'
      and (
        (job.status = 'paid'::public.job_status and job.payment_status = 'received')
        or (
          job.status = 'payment_pending'::public.job_status
          and job.payment_status in ('vietqr_ready', 'amount_mismatch')
        )
      )
      and (
        job.worker_id is null
        or not exists (
          select 1 from public.worker_profiles worker where worker.id = job.worker_id
        )
        or job.gross_amount is null
        or job.gross_amount <= 0
        or job.platform_fee is null
        or job.platform_fee < 0
        or job.worker_net is null
        or job.worker_net <= 0
        or job.gross_amount <> job.platform_fee + job.worker_net
        or coalesce(job.worker_commission_level, 1) < 1
        or coalesce(job.worker_commission_rate_bps, v_legacy_rate_bps) not between 0 and 1500
        or job.platform_fee <> round(
          job.gross_amount::numeric
          * coalesce(job.worker_commission_rate_bps, v_legacy_rate_bps)
          / 10000.0
        )
      )
  ) then
    raise exception 'legacy SePay payment rows need reconciliation before worker-ledger migration';
  end if;

  update public.jobs job
  set
    worker_commission_level = coalesce(job.worker_commission_level, 1),
    worker_commission_rate_bps = coalesce(job.worker_commission_rate_bps, v_legacy_rate_bps)
  where job.payment_provider = 'sepay_vietqr'
    and (
      (job.status = 'paid'::public.job_status and job.payment_status = 'received')
      or (
        job.status = 'payment_pending'::public.job_status
        and job.payment_status in ('vietqr_ready', 'amount_mismatch')
      )
    );

  insert into public.worker_payment_ledger (
    job_id,
    worker_id,
    payment_provider,
    payment_state,
    gross_amount,
    platform_fee,
    worker_net,
    commission_level,
    commission_rate_bps,
    available_at,
    created_at,
    updated_at
  )
  select
    job.id,
    job.worker_id,
    'sepay_vietqr',
    case
      when job.status = 'paid'::public.job_status then 'available'
      when job.payment_status = 'amount_mismatch' then 'on_hold'
      else 'pending'
    end,
    job.gross_amount,
    job.platform_fee,
    job.worker_net,
    job.worker_commission_level,
    job.worker_commission_rate_bps,
    case
      when job.status = 'paid'::public.job_status
        then coalesce(job.payment_received_at, job.paid_at, job.payment_updated_at, job.updated_at, now())
      else null
    end,
    coalesce(job.payment_updated_at, job.updated_at, now()),
    coalesce(job.payment_updated_at, job.updated_at, now())
  from public.jobs job
  where job.payment_provider = 'sepay_vietqr'
    and (
      (job.status = 'paid'::public.job_status and job.payment_status = 'received')
      or (
        job.status = 'payment_pending'::public.job_status
        and job.payment_status in ('vietqr_ready', 'amount_mismatch')
      )
    );
end;
$block$;

create index if not exists worker_payment_ledger_worker_state_created_idx
  on public.worker_payment_ledger (worker_id, payment_state, created_at desc);

create or replace function private.protect_worker_payment_ledger_amounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
begin
  if new.job_id is distinct from old.job_id
    or new.worker_id is distinct from old.worker_id
    or new.payment_provider is distinct from old.payment_provider
    or new.gross_amount is distinct from old.gross_amount
    or new.platform_fee is distinct from old.platform_fee
    or new.worker_net is distinct from old.worker_net
    or new.commission_level is distinct from old.commission_level
    or new.commission_rate_bps is distinct from old.commission_rate_bps then
    raise exception 'worker payment ledger financial fields are immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists worker_payment_ledger_immutable_amounts on public.worker_payment_ledger;
create trigger worker_payment_ledger_immutable_amounts
before update on public.worker_payment_ledger
for each row execute function private.protect_worker_payment_ledger_amounts();

alter table public.worker_payment_ledger enable row level security;
drop policy if exists "Workers read own payment ledger" on public.worker_payment_ledger;
create policy "Workers read own payment ledger"
  on public.worker_payment_ledger for select
  to authenticated
  using ((select auth.uid()) = worker_id or private.is_admin());
revoke all on table public.worker_payment_ledger from anon, authenticated;
grant select on table public.worker_payment_ledger to authenticated;
grant all on table public.worker_payment_ledger to service_role;

create or replace function private.resolve_worker_commission_tier(p_worker_id uuid)
returns table (
  commission_level smallint,
  commission_rate_bps integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select
    tier.level,
    tier.commission_rate_bps
  from public.worker_profiles worker
  cross join lateral (
    select policy.level, policy.commission_rate_bps
    from public.worker_commission_tiers policy
    where policy.is_active
      and policy.min_completed_jobs <= worker.total_jobs
      and policy.min_average_rating <= coalesce(worker.rating, 0)
    order by policy.level desc
    limit 1
  ) tier
  where worker.id = p_worker_id;
$function$;

revoke all on function private.resolve_worker_commission_tier(uuid)
  from public, anon, authenticated;
grant execute on function private.resolve_worker_commission_tier(uuid)
  to service_role;

create or replace function public.get_worker_current_commission_tier(p_worker_id uuid)
returns table (
  commission_level smallint,
  commission_rate_bps integer
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $function$
  select commission_level, commission_rate_bps
  from private.resolve_worker_commission_tier(p_worker_id);
$function$;

revoke all on function public.get_worker_current_commission_tier(uuid)
  from public, anon, authenticated;
grant execute on function public.get_worker_current_commission_tier(uuid)
  to service_role;

create or replace function public.create_worker_vietqr_payment_intent(
  p_job_id uuid,
  p_customer_id uuid,
  p_expected_gross_amount integer,
  p_payment_code text,
  p_transfer_content text,
  p_qr_image_url text,
  p_payment_updated_at timestamptz default now()
)
returns table (
  job_id uuid,
  job_status public.job_status,
  gross_amount integer,
  platform_fee integer,
  worker_net integer,
  commission_level smallint,
  commission_rate_bps integer,
  payment_code text,
  transfer_content text,
  qr_image_url text,
  payment_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_job record;
  v_ledger record;
  v_tier record;
  v_worker record;
  v_now timestamptz := coalesce(p_payment_updated_at, now());
  v_platform_fee integer;
  v_worker_net integer;
begin
  if p_job_id is null
    or p_customer_id is null
    or p_expected_gross_amount is null
    or p_expected_gross_amount <= 0
    or p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or nullif(btrim(p_transfer_content), '') is null
    or char_length(p_transfer_content) > 120
    or p_qr_image_url not like 'https://vietqr.app/img?%' then
    raise exception 'invalid VietQR payment intent input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_job_id::text));

  select
    id,
    customer_id,
    worker_id,
    status,
    final_price,
    payment_provider,
    payment_status,
    payment_code,
    payment_transfer_content,
    payment_qr_image_url,
    payment_updated_at,
    gross_amount,
    platform_fee,
    worker_net,
    worker_commission_level,
    worker_commission_rate_bps
  into v_job
  from public.jobs
  where id = p_job_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'payment job not found' using errcode = 'P0001';
  end if;

  if v_job.status = 'payment_pending'::public.job_status then
    if v_job.payment_provider is distinct from 'sepay_vietqr'
      or v_job.payment_status is distinct from 'vietqr_ready' then
      raise exception 'payment intent is unavailable' using errcode = 'P0001';
    end if;

    select * into v_ledger
    from public.worker_payment_ledger
    where job_id = v_job.id
    for update;

    if not found then
      raise exception 'payment ledger is missing' using errcode = 'P0001';
    end if;

    return query select
      v_job.id,
      v_job.status,
      v_ledger.gross_amount,
      v_ledger.platform_fee,
      v_ledger.worker_net,
      v_ledger.commission_level,
      v_ledger.commission_rate_bps,
      v_job.payment_code,
      v_job.payment_transfer_content,
      v_job.payment_qr_image_url,
      v_job.payment_updated_at;
    return;
  end if;

  if v_job.status is distinct from 'confirmed_by_customer'::public.job_status
    or v_job.final_price is null
    or v_job.final_price <> p_expected_gross_amount then
    raise exception 'payment intent is unavailable' using errcode = 'P0001';
  end if;

  if v_job.worker_id is null then
    raise exception 'payment worker is missing' using errcode = 'P0001';
  end if;

  select id, total_jobs, rating into v_worker
  from public.worker_profiles
  where id = v_job.worker_id
    and is_approved is true
  for update;

  if not found then
    raise exception 'payment worker is not approved' using errcode = 'P0001';
  end if;

  select * into v_tier
  from private.resolve_worker_commission_tier(v_worker.id);
  if not found then
    raise exception 'worker commission tier is not configured' using errcode = 'P0001';
  end if;

  v_platform_fee := round(v_job.final_price::numeric * v_tier.commission_rate_bps / 10000.0);
  v_worker_net := v_job.final_price - v_platform_fee;
  if v_worker_net <= 0 then
    raise exception 'worker net must be positive' using errcode = 'P0001';
  end if;

  update public.jobs
  set
    gross_amount = v_job.final_price,
    platform_fee = v_platform_fee,
    worker_net = v_worker_net,
    worker_commission_level = v_tier.commission_level,
    worker_commission_rate_bps = v_tier.commission_rate_bps,
    payment_amount_received = null,
    payment_code = p_payment_code,
    payment_expires_at = null,
    payment_failure_reason = null,
    payment_provider = 'sepay_vietqr',
    payment_qr_image_url = p_qr_image_url,
    payment_received_at = null,
    payment_status = 'vietqr_ready',
    payment_transfer_content = p_transfer_content,
    payment_updated_at = v_now,
    sepay_reference_code = null,
    sepay_transaction_id = null,
    status = 'payment_pending'::public.job_status
  where id = v_job.id;

  insert into public.worker_payment_ledger (
    job_id,
    worker_id,
    payment_provider,
    payment_state,
    gross_amount,
    platform_fee,
    worker_net,
    commission_level,
    commission_rate_bps
  ) values (
    v_job.id,
    v_worker.id,
    'sepay_vietqr',
    'pending',
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps
  );

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    v_job.id,
    p_customer_id,
    'customer'::public.user_role,
    'kael_decided_payment',
    'confirmed_by_customer'::public.job_status,
    'payment_pending'::public.job_status,
    jsonb_build_object(
      'payment_mode', 'sepay_vietqr',
      'commission_level', v_tier.commission_level
    )
  );

  return query select
    v_job.id,
    'payment_pending'::public.job_status,
    v_job.final_price,
    v_platform_fee,
    v_worker_net,
    v_tier.commission_level,
    v_tier.commission_rate_bps,
    p_payment_code,
    p_transfer_content,
    p_qr_image_url,
    v_now;
end;
$function$;

revoke all on function public.create_worker_vietqr_payment_intent(uuid, uuid, integer, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_worker_vietqr_payment_intent(uuid, uuid, integer, text, text, text, timestamptz)
  to service_role;

create or replace function public.apply_sepay_vietqr_payment_webhook(
  p_payment_code text,
  p_transaction_id text,
  p_transfer_amount integer,
  p_reference_code text default null
)
returns table (
  ok boolean,
  outcome text,
  job_id uuid,
  job_status public.job_status,
  payment_status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_existing_transaction record;
  v_job record;
  v_ledger record;
  v_now timestamptz := now();
  v_reference_code text := nullif(left(btrim(p_reference_code), 120), '');
begin
  if p_payment_code !~ '^NS[A-Z0-9]{24}$'
    or p_transaction_id !~ '^[0-9]{1,30}$'
    or p_transfer_amount is null
    or p_transfer_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(pg_catalog.hashtext(p_transaction_id));

  select id, payment_code, status, payment_status
  into v_existing_transaction
  from public.jobs
  where sepay_transaction_id = p_transaction_id
  for update;

  if found then
    if v_existing_transaction.payment_code = p_payment_code then
      return query select true, 'duplicate', v_existing_transaction.id, v_existing_transaction.status, v_existing_transaction.payment_status;
    end if;
    return query select true, 'transaction_conflict', v_existing_transaction.id, v_existing_transaction.status, v_existing_transaction.payment_status;
    return;
  end if;

  select id, worker_id, status, payment_provider, payment_status, gross_amount, platform_fee, worker_net
  into v_job
  from public.jobs
  where payment_code = p_payment_code
  for update;

  if not found
    or v_job.payment_provider is distinct from 'sepay_vietqr'
    or v_job.payment_status is distinct from 'vietqr_ready'
    or v_job.status is distinct from 'payment_pending'::public.job_status
    or v_job.worker_id is null
    or v_job.gross_amount is null
    or v_job.gross_amount <= 0 then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  select * into v_ledger
  from public.worker_payment_ledger
  where job_id = v_job.id
  for update;

  if not found
    or v_ledger.worker_id is distinct from v_job.worker_id
    or v_ledger.payment_provider is distinct from 'sepay_vietqr'
    or v_ledger.payment_state is distinct from 'pending'
    or v_ledger.gross_amount is distinct from v_job.gross_amount
    or v_ledger.platform_fee is distinct from v_job.platform_fee
    or v_ledger.worker_net is distinct from v_job.worker_net then
    return query select true, 'ignored', null::uuid, null::public.job_status, null::text;
    return;
  end if;

  if v_job.gross_amount <> p_transfer_amount then
    update public.jobs
    set
      payment_amount_received = p_transfer_amount,
      payment_failure_reason = 'amount_mismatch',
      payment_received_at = v_now,
      payment_status = 'amount_mismatch',
      payment_updated_at = v_now,
      sepay_reference_code = v_reference_code,
      sepay_transaction_id = p_transaction_id
    where id = v_job.id;

    update public.worker_payment_ledger
    set payment_state = 'on_hold', updated_at = v_now
    where id = v_ledger.id;

    insert into public.job_events (
      job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
    ) values (
      v_job.id, null, null, 'payment_amount_mismatch',
      'payment_pending'::public.job_status, 'payment_pending'::public.job_status,
      jsonb_build_object('payment_mode', 'sepay_vietqr')
    );

    return query select true, 'amount_mismatch', v_job.id, 'payment_pending'::public.job_status, 'amount_mismatch';
    return;
  end if;

  update public.jobs
  set
    paid_at = coalesce(paid_at, v_now),
    payment_amount_received = p_transfer_amount,
    payment_failure_reason = null,
    payment_received_at = v_now,
    payment_status = 'received',
    payment_updated_at = v_now,
    sepay_reference_code = v_reference_code,
    sepay_transaction_id = p_transaction_id,
    status = 'paid'::public.job_status
  where id = v_job.id;

  update public.worker_payment_ledger
  set
    payment_state = 'available',
    available_at = coalesce(available_at, v_now),
    updated_at = v_now
  where id = v_ledger.id;

  insert into public.job_events (
    job_id, actor_id, actor_role, event_type, from_status, to_status, safe_metadata
  ) values (
    v_job.id, null, null, 'payment_confirmed',
    'payment_pending'::public.job_status, 'paid'::public.job_status,
    jsonb_build_object('payment_mode', 'sepay_vietqr')
  );

  return query select true, 'paid', v_job.id, 'paid'::public.job_status, 'received';
end;
$function$;

revoke all on function public.apply_sepay_vietqr_payment_webhook(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_sepay_vietqr_payment_webhook(text, text, integer, text)
  to service_role;

create or replace function private.platform_fee_worker_rate()
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $function$ select 0.15::numeric $function$;

comment on function private.platform_fee_worker_rate() is
  'Base worker commission fallback (15%). Real VietQR payments freeze the configured worker tier rate in worker_payment_ledger.';

drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz, numeric);
drop function if exists public.get_worker_earnings_summary(uuid, timestamptz, timestamptz);

create function public.get_worker_earnings_summary(
  p_worker_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  worker_id uuid,
  total_jobs_paid bigint,
  gross_earnings bigint,
  platform_fee_total bigint,
  net_earnings bigint,
  available_balance bigint,
  pending_payment_count bigint,
  pending_payment_amount bigint,
  on_hold_amount bigint,
  current_commission_level smallint,
  current_commission_rate_bps integer,
  recent_transactions jsonb,
  daily_earnings jsonb,
  from_date timestamptz,
  to_date timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $function$
begin
  if p_worker_id is null then
    raise exception 'worker id is required' using errcode = '22023';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'invalid earnings range' using errcode = '22023';
  end if;

  return query
  with current_tier as (
    select commission_level, commission_rate_bps
    from private.resolve_worker_commission_tier(p_worker_id)
  ), all_worker_ledger as (
    select
      ledger.id,
      ledger.job_id,
      ledger.payment_state,
      ledger.gross_amount,
      ledger.platform_fee,
      ledger.worker_net,
      ledger.commission_level,
      ledger.commission_rate_bps,
      ledger.created_at,
      ledger.available_at,
      job.display_code,
      coalesce(ledger.available_at, ledger.created_at) as recorded_at
    from public.worker_payment_ledger ledger
    left join public.jobs job on job.id = ledger.job_id
    where ledger.worker_id = p_worker_id
  ), filtered_ledger as (
    select *
    from all_worker_ledger ledger
    where (p_from is null or ledger.recorded_at >= p_from)
      and (p_to is null or ledger.recorded_at <= p_to)
  ), available_ledger as (
    select *
    from filtered_ledger ledger
    where ledger.payment_state = 'available'
  ), daily_available as (
    select
      (ledger.available_at at time zone 'Asia/Ho_Chi_Minh')::date as paid_date,
      sum(ledger.gross_amount)::bigint as gross_earnings,
      sum(ledger.platform_fee)::bigint as platform_fee_total,
      sum(ledger.worker_net)::bigint as net_earnings,
      count(*)::bigint as paid_job_count
    from available_ledger ledger
    group by (ledger.available_at at time zone 'Asia/Ho_Chi_Minh')::date
  ), recent_ledger as (
    select *
    from filtered_ledger ledger
    order by ledger.recorded_at desc, ledger.id desc
    limit 20
  )
  select
    p_worker_id,
    coalesce((select count(*) from available_ledger), 0)::bigint,
    coalesce((select sum(gross_amount) from available_ledger), 0)::bigint,
    coalesce((select sum(platform_fee) from available_ledger), 0)::bigint,
    coalesce((select sum(worker_net) from available_ledger), 0)::bigint,
    -- Current balance and holds must never change when a report range is selected.
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'available'), 0)::bigint,
    coalesce((select count(*) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'pending'), 0)::bigint,
    coalesce((select sum(ledger.worker_net) from all_worker_ledger ledger where ledger.payment_state = 'on_hold'), 0)::bigint,
    tier.commission_level,
    tier.commission_rate_bps,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'job_id', ledger.job_id,
          'display_code', ledger.display_code,
          'payment_state', ledger.payment_state,
          'gross_amount', ledger.gross_amount,
          'platform_fee', ledger.platform_fee,
          'worker_net', ledger.worker_net,
          'commission_level', ledger.commission_level,
          'commission_rate_bps', ledger.commission_rate_bps,
          'recorded_at', ledger.recorded_at,
          'available_at', ledger.available_at
        ) order by ledger.recorded_at desc, ledger.id desc
      )
      from recent_ledger ledger
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.paid_date,
          'gross_earnings', daily.gross_earnings,
          'platform_fee_total', daily.platform_fee_total,
          'net_earnings', daily.net_earnings,
          'paid_job_count', daily.paid_job_count
        ) order by daily.paid_date desc
      )
      from (
        select * from daily_available order by paid_date desc limit 366
      ) daily
    ), '[]'::jsonb),
    p_from,
    p_to
  from current_tier tier;
end;
$function$;

revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.get_worker_earnings_summary(uuid, timestamptz, timestamptz) to service_role;

commit;
