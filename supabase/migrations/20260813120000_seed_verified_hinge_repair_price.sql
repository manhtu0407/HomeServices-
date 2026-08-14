-- The booking catalog exposes hinge adjustment as a concrete small handyman job,
-- so a complete intake must have a source-backed range instead of a dead-end.
-- Sources:
-- - https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/
-- - https://suachuatainha.com.vn/bao-gia-sua-chua-moc/
-- The union covers one sagging cabinet door with usable hinges. Replacement,
-- damaged wood, multiple doors, and hidden work remain outside this baseline.
insert into public.price_baselines as baseline (
  service_type,
  service_problem_id,
  complexity,
  district_code,
  price_min,
  price_max,
  source
)
select
  'handyman'::public.service_type,
  problem.id,
  'small'::public.complexity_level,
  'hcmc_all',
  150000,
  350000,
  'daiphong_hinge_adjustment_and_sagging_door_2026_08'
from public.service_problems as problem
where problem.service_type = 'handyman'
  and problem.slug = 'repair_hinge_or_handle'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  version = baseline.version + 1,
  updated_at = now();
