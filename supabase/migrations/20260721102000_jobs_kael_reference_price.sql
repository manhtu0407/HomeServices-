-- The learning loop needs a price it did not produce.
--
-- jobs.kael_price_min/max stores the estimate after a learned price rule and the
-- market blend have already been applied, and the loop was reading that back as its
-- "baseline". Measuring against its own output makes confidence rise with anchoring
-- rather than with accuracy. These columns keep the admin-owned price_baselines band
-- that was in force when the estimate was made, so the loop has an independent
-- reference. STRUCTURES.md section 10A already treats "Kael estimate" and "baseline
-- used" as separate inputs; this is the column that makes the distinction real.
--
-- Server-owned observation data: never shown to a customer or worker.

alter table public.jobs
  add column if not exists kael_reference_price_min integer,
  add column if not exists kael_reference_price_max integer;

alter table public.jobs
  drop constraint if exists jobs_kael_reference_price_range_check;

alter table public.jobs
  add constraint jobs_kael_reference_price_range_check
  check (
    (kael_reference_price_min is null and kael_reference_price_max is null)
    or (
      kael_reference_price_min > 0
      and kael_reference_price_max >= kael_reference_price_min
    )
  );

comment on column public.jobs.kael_reference_price_min is
  'Admin-owned price_baselines lower bound at estimate time, picked at the analysis complexity hint. Excludes learned rules and market blending. Learning-loop reference only; not user-facing.';

comment on column public.jobs.kael_reference_price_max is
  'Admin-owned price_baselines upper bound at estimate time, picked at the analysis complexity hint. Excludes learned rules and market blending. Learning-loop reference only; not user-facing.';

-- Rollback: alter table public.jobs drop constraint jobs_kael_reference_price_range_check,
-- drop column kael_reference_price_min, drop column kael_reference_price_max.
