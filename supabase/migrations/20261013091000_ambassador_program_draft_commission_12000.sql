begin;

-- WHY: Tu 2026-10-13 wants referral points to accrue slower so the platform keeps more of every referred
-- order. One point is now earned per 12,000 VND of platform fee instead of 10,000; milestones,
-- multipliers and every other setting stay as the approved version has them. The change is created as a
-- draft only: approval stays with an admin who holds workers.bonus.manage and is not the creator, so no
-- migration can put a program live on its own.
do $draft$
declare
  v_current public.ambassador_program_versions%rowtype;
  v_draft_id uuid;
  v_problems text[];
begin
  select * into v_current from public.ambassador_program_versions where status = 'approved';
  if not found or v_current.commission_vnd_per_point >= 12000 then
    return;
  end if;
  -- An open draft is an admin's unfinished work; leave it for them to finish or replace.
  if exists (select 1 from public.ambassador_program_versions where status = 'draft') then
    raise notice 'ambassador program draft left untouched: an admin draft is already open';
    return;
  end if;

  insert into public.ambassador_program_versions (
    version, commission_vnd_per_point, customer_vnd_per_point, link_months,
    network_window_days, rebook_min_jobs, invite_claim_days
  ) values (
    (select coalesce(max(version), 0) + 1 from public.ambassador_program_versions),
    12000, v_current.customer_vnd_per_point, v_current.link_months,
    v_current.network_window_days, v_current.rebook_min_jobs, v_current.invite_claim_days
  ) returning id into v_draft_id;

  insert into public.ambassador_milestones (version_id, rank, title_vi, title_en, points_required, reward_vnd)
  select v_draft_id, milestone.rank, milestone.title_vi, milestone.title_en, milestone.points_required, milestone.reward_vnd
  from public.ambassador_milestones as milestone
  where milestone.version_id = v_current.id;

  insert into public.ambassador_multiplier_tiers (version_id, min_active_customers, multiplier_bps)
  select v_draft_id, tier.min_active_customers, tier.multiplier_bps
  from public.ambassador_multiplier_tiers as tier
  where tier.version_id = v_current.id;

  v_problems := private.ambassador_program_violations(v_draft_id);
  if pg_catalog.cardinality(v_problems) > 0 then
    raise exception 'ambassador draft invalid: %', v_problems;
  end if;
end;
$draft$;

commit;
