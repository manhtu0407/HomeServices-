-- Worker-matching indexes (#5 §S2, A4 scale). queryEligibleWorkers was a sequential scan because
-- worker_profiles carried only its primary key. The matching query filters:
--   is_approved AND is_available AND NOT is_suspended
--   AND service_types @> [service]  AND (districts @> [district] OR districts @> ['hcmc_all'])
-- ordered by rating DESC. These indexes let the planner drive that query by index at scale.

-- Array-containment (@>) support for service-type and district matching.
create index if not exists worker_profiles_service_types_gin
  on public.worker_profiles using gin (service_types);
create index if not exists worker_profiles_districts_gin
  on public.worker_profiles using gin (districts);

-- Partial index over the eligible candidate set only (available + approved + not suspended),
-- so the planner can restrict to bookable workers without scanning the whole table.
create index if not exists worker_profiles_available_idx
  on public.worker_profiles (is_available)
  where is_available and is_approved and not is_suspended;
