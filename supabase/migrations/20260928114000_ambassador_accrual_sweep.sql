begin;

-- Points are credited by a scheduled sweep over settled payments rather than a trigger on
-- the payment ledger, so a bug here can delay points but can never block a payment.
create table public.program_accrual_marks (
  source_ledger_id uuid primary key references public.worker_payment_ledger(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,
  accrued_worker_id uuid references public.worker_profiles(id) on delete restrict,
  link_id uuid references public.customer_worker_links(id) on delete restrict,
  points_milli bigint not null default 0 check (points_milli >= 0),
  membership_points integer not null default 0 check (membership_points >= 0),
  processed_at timestamptz not null default now(),
  reversed_at timestamptz
);

alter table public.program_accrual_marks enable row level security;
revoke all on table public.program_accrual_marks from public, anon, authenticated;
grant select on table public.program_accrual_marks to service_role;

create or replace function private.accrue_program_points(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_program public.ambassador_program_versions%rowtype;
  v_row record;
  v_link public.customer_worker_links%rowtype;
  v_state record;
  v_multiplier integer;
  v_points bigint;
  v_membership integer;
  v_same_worker_jobs integer;
  v_processed integer := 0;
  v_accrued integer := 0;
  v_links integer := 0;
  v_reversed integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('ambassador-accrual-sweep', 0)) then
    return pg_catalog.jsonb_build_object('skipped', 'already_running');
  end if;

  v_program := private.current_ambassador_program();
  if v_program.id is null then
    return pg_catalog.jsonb_build_object('skipped', 'no_program');
  end if;

  for v_row in
    select ledger.id as ledger_id, ledger.job_id, ledger.platform_fee, ledger.gross_amount,
      job.customer_id, job.worker_id, job.paid_at
    from public.worker_payment_ledger as ledger
    join public.jobs as job on job.id = ledger.job_id
    where ledger.payment_state = 'available'
      and ledger.payment_provider = 'platform_bank_manual'
      and job.status in ('paid'::public.job_status, 'reviewed'::public.job_status)
      and job.paid_at is not null
      and exists (
        select 1 from public.job_payment_orders as payment_order
        where payment_order.job_id = job.id
          and payment_order.payment_method = 'platform_bank_manual'
          and payment_order.status = 'manual_verified'
      )
      and not exists (select 1 from public.job_refund_obligations as refund where refund.job_id = job.id)
      and not exists (select 1 from public.program_accrual_marks as mark where mark.source_ledger_id = ledger.id)
    order by job.paid_at, ledger.id
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    v_processed := v_processed + 1;
    v_link := null;
    v_points := 0;

    perform private.close_expired_customer_link(v_row.customer_id);
    select * into v_link from public.customer_worker_links
    where customer_id = v_row.customer_id and ended_at is null;

    -- A customer who found the app alone joins the network of the worker they come back to.
    if v_link.id is null and v_row.worker_id is not null and v_row.worker_id <> v_row.customer_id then
      select count(*)::integer + 1 into v_same_worker_jobs
      from public.program_accrual_marks as mark
      join public.jobs as prior_job on prior_job.id = mark.job_id
      where prior_job.customer_id = v_row.customer_id
        and prior_job.worker_id = v_row.worker_id
        and mark.reversed_at is null;

      if v_same_worker_jobs >= v_program.rebook_min_jobs then
        insert into public.customer_worker_links (
          customer_id, worker_id, source, program_version_id, formed_at, expires_at, formed_by_job_id
        ) values (
          v_row.customer_id, v_row.worker_id, 'rebook', v_program.id, pg_catalog.now(),
          pg_catalog.now() + pg_catalog.make_interval(months => v_program.link_months), v_row.job_id
        ) returning * into v_link;
        v_links := v_links + 1;
      end if;
    end if;

    if v_link.id is not null
       and (v_link.formed_by_job_id = v_row.job_id or v_row.paid_at >= v_link.formed_at) then
      select * into v_state from private.worker_discipline_state(v_link.worker_id);
      if not v_state.banned then
        select network.multiplier_bps into v_multiplier from private.worker_ambassador_network(v_link.worker_id) as network;
        v_points := pg_catalog.floor(
          v_row.platform_fee::numeric * 1000 * v_multiplier / 10000 / v_program.commission_vnd_per_point
        )::bigint;
        if v_points > 0 then
          insert into public.worker_ambassador_point_entries (
            worker_id, entry_kind, points_milli, source_ledger_id, job_id, customer_id, link_id,
            commission_basis_vnd, multiplier_bps, program_version_id, idempotency_key
          ) values (
            v_link.worker_id, 'order_accrual', v_points, v_row.ledger_id, v_row.job_id, v_row.customer_id,
            v_link.id, v_row.platform_fee, v_multiplier, v_program.id, 'accrual:' || v_row.ledger_id
          );
          v_accrued := v_accrued + 1;
        end if;
      end if;
    end if;

    v_membership := pg_catalog.floor(v_row.gross_amount::numeric / v_program.customer_vnd_per_point)::integer;
    if v_membership > 0 then
      insert into public.customer_membership_point_entries (
        customer_id, job_id, source_ledger_id, entry_kind, points, program_version_id
      ) values (
        v_row.customer_id, v_row.job_id, v_row.ledger_id, 'accrual', v_membership, v_program.id
      );
    end if;

    insert into public.program_accrual_marks (
      source_ledger_id, job_id, accrued_worker_id, link_id, points_milli, membership_points
    ) values (
      v_row.ledger_id, v_row.job_id,
      case when v_points > 0 then v_link.worker_id end,
      case when v_points > 0 then v_link.id end,
      greatest(v_points, 0), greatest(v_membership, 0)
    );
  end loop;

  -- A refunded or reversed payment takes back exactly what it earned, for both sides.
  for v_row in
    select mark.*
    from public.program_accrual_marks as mark
    join public.worker_payment_ledger as ledger on ledger.id = mark.source_ledger_id
    where mark.reversed_at is null
      and (ledger.payment_state = 'reversed'
        or exists (select 1 from public.job_refund_obligations as refund where refund.job_id = mark.job_id))
    limit 500
  loop
    if v_row.points_milli > 0 then
      insert into public.worker_ambassador_point_entries (
        worker_id, entry_kind, points_milli, source_ledger_id, job_id, link_id, program_version_id, idempotency_key
      ) values (
        v_row.accrued_worker_id, 'accrual_reversal', -v_row.points_milli, v_row.source_ledger_id, v_row.job_id,
        v_row.link_id, v_program.id, 'reversal:' || v_row.source_ledger_id
      ) on conflict (idempotency_key) do nothing;
    end if;
    if v_row.membership_points > 0 then
      insert into public.customer_membership_point_entries (
        customer_id, job_id, source_ledger_id, entry_kind, points, program_version_id
      )
      select entry.customer_id, entry.job_id, entry.source_ledger_id, 'reversal', -entry.points, v_program.id
      from public.customer_membership_point_entries as entry
      where entry.job_id = v_row.job_id and entry.entry_kind = 'accrual'
      on conflict (job_id, entry_kind) do nothing;
    end if;
    update public.program_accrual_marks set reversed_at = pg_catalog.now()
    where source_ledger_id = v_row.source_ledger_id;
    v_reversed := v_reversed + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'processed', v_processed, 'accrued', v_accrued, 'links_formed', v_links, 'reversed', v_reversed
  );
end;
$function$;

revoke all on function private.accrue_program_points(integer) from public, anon, authenticated;
grant execute on function private.accrue_program_points(integer) to service_role;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ambassador-accrual-sweep') then
    perform cron.unschedule('ambassador-accrual-sweep');
  end if;
end $$;

select cron.schedule(
  'ambassador-accrual-sweep',
  '*/10 * * * *',
  $$select private.accrue_program_points(200)$$
);

commit;
