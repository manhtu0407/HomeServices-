-- Keep cabinet-hinge replacement distinct from the existing adjustment-only
-- problem. This row covers exactly one cabinet door and two compatible hinges;
-- damaged wood, a warped door, specialty hardware, and additional doors remain
-- outside the baseline and must fail closed for another review.
--
-- Source checked 2026-08-13:
-- https://suachuatainha.com.vn/bao-gia-sua-chua-moc/
-- Published damped-hinge replacement: 120,000-180,000 VND per piece.
-- Scope math: 2 x (120,000-180,000 VND) = 240,000-360,000 VND.
insert into public.service_problems (
  service_category_id,
  service_type,
  slug,
  label_vi,
  default_complexity,
  sort_order,
  is_active
)
select
  category.id,
  'handyman'::public.service_type,
  'replace_cabinet_hinges',
  'Thay hai bản lề tủ',
  'small'::public.complexity_level,
  55,
  true
from public.service_categories as category
where category.service_type = 'handyman'
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

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
  240000,
  360000,
  'daiphong_cabinet_hinge_replacement_per_piece_x2_2026_08'
from public.service_problems as problem
where problem.service_type = 'handyman'
  and problem.slug = 'replace_cabinet_hinges'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  version = baseline.version + 1,
  updated_at = now();
