-- =============================================================================
-- Migration: 20260516000000_expand_service_taxonomy.sql
-- Expand service taxonomy to 14 problem categories (STRUCTURES.md S5)
-- Seed 42 price baselines (14 problems x 3 complexities for hcmc_all)
-- =============================================================================

-- =============================================================================
-- ELECTRICAL PROBLEMS (7 categories)
-- =============================================================================

insert into service_problems (
  service_category_id, service_type, slug, label_vi, default_complexity, sort_order
) values
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'power_outage_one_room',
    'Máº¥t Ä‘iá»‡n má»™t phÃ²ng', 'small', 10
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'power_outage_whole_unit',
    'Máº¥t Ä‘iá»‡n toÃ n cÄƒn', 'medium', 20
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'outlet_or_switch_broken',
    'á»” cáº¯m/cÃ´ng táº¯c há»�ng', 'small', 30
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'breaker_trip',
    'Cáº§u dao trip', 'medium', 40
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'flickering_light',
    'Ä�Ã¨n cháº­p chá»�n', 'small', 50
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'install_device',
    'Láº¯p thÃªm thiáº¿t bá»‹', 'small', 60
  ),
  (
    (select id from service_categories where service_type = 'electrical'),
    'electrical', 'other_electrical',
    'Váº¥n Ä‘á»� khÃ¡c', 'medium', 70
  )
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  updated_at = now();

-- =============================================================================
-- PLUMBING PROBLEMS (7 categories)
-- =============================================================================

insert into service_problems (
  service_category_id, service_type, slug, label_vi, default_complexity, sort_order
) values
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'pipe_leak',
    'á»�ng rÃ² rá»‰', 'medium', 10
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'clogged_drain_or_sink',
    'Táº¯c cá»‘ng/bá»“n', 'small', 20
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'toilet_flush_issue',
    'Toilet khÃ´ng xáº£', 'small', 30
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'faucet_broken',
    'VÃ²i há»�ng', 'small', 40
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'weak_water_pressure',
    'Ã�p nÆ°á»›c yáº¿u', 'medium', 50
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'install_or_replace_fixture',
    'Láº¯p/thay thiáº¿t bá»‹', 'small', 60
  ),
  (
    (select id from service_categories where service_type = 'plumbing'),
    'plumbing', 'other_plumbing',
    'Váº¥n Ä‘á»� khÃ¡c', 'medium', 70
  )
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  updated_at = now();

-- =============================================================================
-- PRICE BASELINES â€” 42 rows (14 problems x 3 complexities)
-- District: hcmc_all (city-wide fallback)
-- Source: admin_seed (market research baseline)
-- Prices in VND, managed by admin â€” never hardcoded in source code
-- =============================================================================

-- Electrical baselines
insert into price_baselines (service_type, service_problem_id, complexity, district_code, price_min, price_max, source)
select 'electrical'::service_type, sp.id, c.complexity::complexity_level, 'hcmc_all', c.price_min, c.price_max, 'admin_seed'
from service_problems sp
cross join (values
  ('small',  100000,  300000),
  ('medium', 300000,  700000),
  ('large',  700000, 2000000)
) as c(complexity, price_min, price_max)
where sp.service_type = 'electrical'
  and sp.slug != 'electrical-general'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  updated_at = now();

-- Plumbing baselines
insert into price_baselines (service_type, service_problem_id, complexity, district_code, price_min, price_max, source)
select 'plumbing'::service_type, sp.id, c.complexity::complexity_level, 'hcmc_all', c.price_min, c.price_max, 'admin_seed'
from service_problems sp
cross join (values
  ('small',  150000,  350000),
  ('medium', 350000,  800000),
  ('large',  800000, 2500000)
) as c(complexity, price_min, price_max)
where sp.service_type = 'plumbing'
  and sp.slug != 'plumbing-general'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  updated_at = now();
;
