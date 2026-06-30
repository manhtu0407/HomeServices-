-- S4 / F1 (Plan.md §38) — Codex PR#68 P1 follow-up: atomic reserve-before-spend.
--
-- WHY: the original gate (20260614120500) did check_kael_ai_spend (read) THEN the
-- provider call THEN record_kael_ai_spend (insert). Concurrent / parallel callers (the
-- pipeline runs vision + market in parallel) could all read the same below-cap total and
-- proceed — a TOCTOU race that lets spend overshoot the cap. This migration adds an
-- ATOMIC check-and-reserve: under a transaction-scoped advisory lock it re-reads the
-- ledger and, if within caps, inserts the ESTIMATED cost in the same transaction, so a
-- concurrent reservation sees the in-flight row. After the provider call resolves the
-- Edge reconciles the reserved row to the ACTUAL cost (success) or deletes it (failure).
--
-- Builds on public.kael_ai_spend_log (already created in 20260614120500). Enforcement
-- stays Edge-only (service_role); direct clients remain denied by the existing RLS.

-- Atomic check + reserve. Returns the new ledger row id on allow (so the Edge can
-- reconcile/release it), or allowed=false with the first cap that (current + estimate)
-- would exceed. The advisory lock serializes reservations so concurrent callers cannot
-- both observe the same below-cap total.
create or replace function public.reserve_kael_ai_spend(
  p_actor_id uuid,
  p_estimated_usd numeric,
  p_purpose text,
  p_global_daily_cap numeric,
  p_user_daily_cap numeric,
  p_user_monthly_cap numeric
)
returns table (
  allowed boolean,
  blocked_scope text,
  reservation_id bigint
)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_global numeric;
  v_user_day numeric := 0;
  v_user_month numeric := 0;
  v_est numeric := greatest(coalesce(p_estimated_usd, 0), 0);
  v_id bigint;
begin
  -- Serialize all reservations for the window of this transaction so the read+insert
  -- below is atomic against other concurrent reservations (closes the TOCTOU race).
  perform pg_advisory_xact_lock(hashtext('kael_ai_spend_reserve'));

  select coalesce(sum(cost_usd), 0) into v_global
  from public.kael_ai_spend_log
  where created_at >= now() - interval '1 day';

  if p_actor_id is not null then
    select coalesce(sum(cost_usd), 0) into v_user_day
    from public.kael_ai_spend_log
    where actor_id = p_actor_id and created_at >= now() - interval '1 day';

    select coalesce(sum(cost_usd), 0) into v_user_month
    from public.kael_ai_spend_log
    where actor_id = p_actor_id and created_at >= now() - interval '30 days';
  end if;

  if p_global_daily_cap is not null and v_global + v_est > p_global_daily_cap then
    return query select false, 'global_daily'::text, null::bigint;
    return;
  end if;
  if p_actor_id is not null and p_user_daily_cap is not null
     and v_user_day + v_est > p_user_daily_cap then
    return query select false, 'user_daily'::text, null::bigint;
    return;
  end if;
  if p_actor_id is not null and p_user_monthly_cap is not null
     and v_user_month + v_est > p_user_monthly_cap then
    return query select false, 'user_monthly'::text, null::bigint;
    return;
  end if;

  insert into public.kael_ai_spend_log (actor_id, purpose, cost_usd)
  values (p_actor_id, coalesce(nullif(p_purpose, ''), 'reserved'), v_est)
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;

-- Reconcile the reserved row to the actual cost (p_actual_usd > 0), or release it
-- (p_actual_usd <= 0 → delete) so a failed/aborted call does not permanently count.
create or replace function public.finalize_kael_ai_spend(
  p_reservation_id bigint,
  p_actual_usd numeric,
  p_purpose text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
begin
  if p_reservation_id is null then
    return;
  end if;
  if coalesce(p_actual_usd, 0) <= 0 then
    delete from public.kael_ai_spend_log where id = p_reservation_id;
    return;
  end if;
  update public.kael_ai_spend_log
    set cost_usd = p_actual_usd,
        purpose = coalesce(nullif(p_purpose, ''), purpose)
  where id = p_reservation_id;
end;
$$;

revoke all on function public.reserve_kael_ai_spend(uuid, numeric, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_kael_ai_spend(uuid, numeric, text, numeric, numeric, numeric) to service_role;
revoke all on function public.finalize_kael_ai_spend(bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.finalize_kael_ai_spend(bigint, numeric, text) to service_role;

comment on function public.reserve_kael_ai_spend(uuid, numeric, text, numeric, numeric, numeric) is
  'F1/§38 (Codex PR#68 P1): atomic check-and-reserve of estimated AI spend under an advisory lock, before the provider call. Edge-only (service_role). Reconcile/release via finalize_kael_ai_spend().';
