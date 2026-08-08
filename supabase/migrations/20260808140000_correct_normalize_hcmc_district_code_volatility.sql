-- `substring(... from regex)` is STABLE under the active collation, so this
-- helper must not claim IMMUTABLE and be eligible for stale expression plans.
alter function public.normalize_hcmc_district_code(text) stable;
