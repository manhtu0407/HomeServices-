-- Complete the catalog rows required by the six-service Case Work runtime.
--
-- Price rows are deliberately limited to quote-safe, source-backed work. The
-- remaining diagnostic, hazardous, specialist, or unknown-scope slugs stay
-- unpriced so Edge returns an honest validated_price_evidence blocker instead
-- of inventing a number.
--
-- Market references checked 2026-07-11:
-- - HVAC: https://www.dienmayxanh.com/ve-sinh-may-lanh
-- - Upholstery: https://giatsofahuyhoang.com/
-- - Handyman: https://1fix.vn/dich-vu-khoan-tuong-tai-nha-tphcm
-- Existing price_baselines invariant: check (price_max >= price_min and price_min > 0).

insert into public.service_categories (
  service_type,
  slug,
  label_vi,
  sort_order,
  is_active
) values
  ('hvac'::public.service_type, 'hvac', 'Điều hòa & Không khí', 40, true),
  ('upholstery'::public.service_type, 'upholstery', 'Sofa, nệm, rèm, thảm', 50, true),
  ('handyman'::public.service_type, 'handyman', 'Sửa vặt & Lắp đặt nhỏ', 60, true)
on conflict (service_type) do update
set
  slug = excluded.slug,
  label_vi = excluded.label_vi,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.service_problems (
  service_category_id,
  service_type,
  slug,
  label_vi,
  default_complexity,
  sort_order,
  is_active
) values
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'routine_hvac_cleaning', 'Vệ sinh/bảo trì điều hòa', 'small', 10, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'no_cooling', 'Máy không làm mát', 'medium', 20, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'weak_cooling', 'Làm mát yếu', 'medium', 30, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'water_leak', 'Chảy nước', 'medium', 40, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'unusual_noise', 'Tiếng ồn bất thường', 'medium', 50, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'error_code', 'Báo mã lỗi', 'medium', 60, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'other_hvac', 'Vấn đề điều hòa khác', 'medium', 70, true),
  ((select id from public.service_categories where service_type = 'hvac'), 'hvac', 'hvac-general', 'Điều hòa tổng quát', 'medium', 80, true),

  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'sofa_cleaning', 'Vệ sinh sofa', 'small', 10, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'mattress_cleaning', 'Vệ sinh nệm', 'small', 20, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'curtain_cleaning', 'Vệ sinh rèm', 'medium', 30, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'carpet_cleaning', 'Vệ sinh thảm', 'medium', 40, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'stain_treatment', 'Xử lý vết bẩn', 'medium', 50, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'odor_or_mold', 'Mùi hoặc mốc', 'medium', 60, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'other_upholstery', 'Vấn đề chất liệu khác', 'medium', 70, true),
  ((select id from public.service_categories where service_type = 'upholstery'), 'upholstery', 'upholstery-general', 'Vệ sinh vải nội thất tổng quát', 'medium', 80, true),

  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'drill_or_mount_shelf', 'Khoan hoặc lắp kệ', 'small', 10, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'install_curtain_rod', 'Lắp thanh rèm', 'small', 20, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'mount_tv_or_furniture', 'Treo TV hoặc nội thất', 'medium', 30, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'install_small_fixture', 'Lắp vật dụng nhỏ', 'small', 40, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'repair_hinge_or_handle', 'Sửa bản lề hoặc tay nắm', 'small', 50, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'install_bathroom_fixture', 'Lắp thiết bị phòng tắm nhỏ', 'medium', 60, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'other_handyman', 'Việc nhỏ khác', 'medium', 70, true),
  ((select id from public.service_categories where service_type = 'handyman'), 'handyman', 'handyman-general', 'Sửa vặt/lắp đặt tổng quát', 'medium', 80, true)
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- The public source lists exactly 200,000 VND per wall-mounted AC. Keep one
-- small, single-unit row; other form factors or quantities stay review-first.
insert into public.price_baselines as baseline (
  service_type, service_problem_id, complexity, district_code,
  price_min, price_max, source
)
select
  'hvac'::public.service_type,
  problem.id,
  price.complexity::public.complexity_level,
  'hcmc_all',
  price.price_min,
  price.price_max,
  price.source
from public.service_problems as problem
join (values
  ('routine_hvac_cleaning', 'small', 200000, 200000, 'dienmayxanh_wall_ac_cleaning_per_unit_2026_07')
) as price(slug, complexity, price_min, price_max, source)
  on price.slug = problem.slug
where problem.service_type = 'hvac'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  version = baseline.version + 1,
  updated_at = now();

-- These ranges match the source's disclosed item-size bands. They are stored
-- only as small, single-item rows; other quantities or conditions fail closed.
insert into public.price_baselines as baseline (
  service_type, service_problem_id, complexity, district_code,
  price_min, price_max, source
)
select
  'upholstery'::public.service_type,
  problem.id,
  price.complexity::public.complexity_level,
  'hcmc_all',
  price.price_min,
  price.price_max,
  price.source
from public.service_problems as problem
join (values
  ('sofa_cleaning', 'small', 250000, 450000, 'huy_hoang_sofa_item_size_band_2026_07'),
  ('mattress_cleaning', 'small', 270000, 400000, 'huy_hoang_mattress_item_size_band_2026_07'),
  ('carpet_cleaning', 'small', 290000, 450000, 'huy_hoang_decorative_carpet_item_size_band_2026_07')
) as price(slug, complexity, price_min, price_max, source)
  on price.slug = problem.slug
where problem.service_type = 'upholstery'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  version = baseline.version + 1,
  updated_at = now();

-- The source lists 150,000-200,000 VND per light hanging job and
-- 200,000-300,000 VND per shelf. The combined slug keeps only that union.
insert into public.price_baselines as baseline (
  service_type, service_problem_id, complexity, district_code,
  price_min, price_max, source
)
select
  'handyman'::public.service_type,
  problem.id,
  price.complexity::public.complexity_level,
  'hcmc_all',
  price.price_min,
  price.price_max,
  price.source
from public.service_problems as problem
join (values
  ('drill_or_mount_shelf', 'small', 150000, 300000, 'onefix_drill_or_mount_shelf_per_item_2026_07')
) as price(slug, complexity, price_min, price_max, source)
  on price.slug = problem.slug
where problem.service_type = 'handyman'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  version = baseline.version + 1,
  updated_at = now();

-- intentionally unpriced: no_cooling
-- intentionally unpriced: weak_cooling
-- intentionally unpriced: water_leak
-- intentionally unpriced: unusual_noise
-- intentionally unpriced: error_code
-- intentionally unpriced: other_hvac
-- intentionally unpriced: hvac-general
-- intentionally unpriced: odor_or_mold
-- intentionally unpriced: stain_treatment
-- intentionally unpriced: curtain_cleaning
-- intentionally unpriced: other_upholstery
-- intentionally unpriced: upholstery-general
-- intentionally unpriced: install_curtain_rod
-- intentionally unpriced: mount_tv_or_furniture
-- intentionally unpriced: install_small_fixture
-- intentionally unpriced: repair_hinge_or_handle
-- intentionally unpriced: install_bathroom_fixture
-- intentionally unpriced: other_handyman
-- intentionally unpriced: handyman-general
