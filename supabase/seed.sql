-- Local-only deterministic fixtures applied by `supabase db reset`.

-- Test UUIDs (deterministic for local dev)
-- Customer: 00000000-0000-0000-0000-000000000001
-- Worker:   00000000-0000-0000-0000-000000000002
-- Admin:    00000000-0000-0000-0000-000000000003

insert into auth.users (
  id,
  aud,
  role,
  phone,
  phone_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    '000000000001',
    now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    '000000000002',
    now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    '000000000003',
    now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

update public.profiles as profile
set
  role = fixture.role,
  full_name = fixture.full_name,
  phone = fixture.phone,
  updated_at = now()
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'customer'::user_role, 'Nguyen Van A', '000000000001'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'worker'::user_role, 'Tran Van B', '000000000002'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'admin'::user_role, 'Admin Dev', '000000000003')
) as fixture(id, role, full_name, phone)
where profile.id = fixture.id;

insert into customer_profiles (id, building_name, unit_number, floor, district) values
  ('00000000-0000-0000-0000-000000000001', 'Vinhomes Central Park', 'A-1205', '12', 'Binh Thanh')
on conflict (id) do nothing;

insert into worker_profiles (
  id, legal_name, date_of_birth, gender,
  service_types, years_experience, districts,
  is_approved, is_available, verification_status, rating, total_jobs
) values
  (
    '00000000-0000-0000-0000-000000000002',
    'Tran Van B',
    '1990-01-01',
    'male',
    array['electrical', 'plumbing', 'cleaning']::service_type[],
    5,
    array['binh_thanh', 'q1', 'thu_duc'],
    true, true, 'approved', 4.50, 12
  )
on conflict (id) do nothing;

-- Sample completed job for testing history/reviews
insert into jobs (
  id, customer_id, worker_id, service_type,
  problem_chips, description,
  address_building, address_unit, address_floor, address_district,
  status,
  kael_problem_identified, kael_complexity, kael_price_min, kael_price_max,
  final_price,
  broadcast_at, matched_at, completed_at, confirmed_at, paid_at
) values
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'electrical',
    array['Ổ cắm/công tắc hỏng'],
    'Ổ cắm phòng khách bị cháy, không sử dụng được',
    'Vinhomes Central Park', 'A-1205', '12', 'Binh Thanh',
    'paid',
    'Cháy ổ cắm do quá tải', 'small', 150000, 250000,
    null,
    now() - interval '3 days',
    now() - interval '3 days' + interval '5 minutes',
    now() - interval '3 days' + interval '1 hour',
    now() - interval '3 days' + interval '1 hour 10 minutes',
    now() - interval '3 days' + interval '1 hour 15 minutes'
  )
on conflict (id) do nothing;

-- The paid fixture starts without a payable price. Apply the exact price only
-- after the bilateral, source-verified receipt exists.
insert into scope_change_requests (
  id, job_id, worker_id, status,
  original_summary, requested_description, reason,
  price_min, price_max, kael_computed_min, kael_computed_max,
  kael_review, customer_decision_at
) values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'approved_by_customer',
  'Replace the damaged electrical outlet after inspection.',
  'Replace one damaged electrical outlet using the confirmed full-scope price.',
  'The inspection confirmed replacement was required instead of adjustment.',
  200000,
  200000,
  200000,
  200000,
  jsonb_build_object(
    'price_source', 'verified_baseline',
    'pricing_mode', 'full_scope_total',
    'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
    'baseline_used', 'electrical_outlet_replacement_small_hcmc',
    'baseline_source', 'seed_fixture_verified_baseline',
    'reference_price_min', 150000,
    'reference_price_max', 250000,
    'stakeholder_balance', jsonb_build_object(
      'customer_total', 200000,
      'platform_fee', 20000,
      'worker_net', 180000,
      'commission_rate_bps', 1000,
      'worker_confirmation_required', true,
      'customer_confirmation_required', true
    ),
    'worker_price_confirmation', jsonb_build_object(
      'confirmed', true,
      'quote_id', '00000000-0000-0000-0000-000000000040',
      'confirmed_at', '2026-08-14T00:00:00Z'
    )
  ),
  '2026-08-14T00:05:00Z'::timestamptz
)
on conflict (id) do nothing;

update jobs
set final_price = 200000
where id = '00000000-0000-0000-0000-000000000010'
  and final_price is null;

-- Sample review
insert into reviews (id, job_id, customer_id, worker_id, rating, tags, comment) values
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    5,
    array['Đúng giờ', 'Chuyên nghiệp', 'Giá hợp lý'],
    'Thợ sửa nhanh và gọn gàng. Rất hài lòng.'
  )
on conflict (id) do nothing;

-- Sample pending job for testing active workflow
insert into jobs (
  id, customer_id, service_type,
  problem_chips, description,
  address_building, address_unit, address_floor, address_district,
  status
) values
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'plumbing',
    array['Ống rò rỉ'],
    'Ống nước dưới bồn rửa bị rỉ, nước nhỏ giọt liên tục',
    'Vinhomes Central Park', 'A-1205', '12', 'Binh Thanh',
    'analyzing'
  )
on conflict (id) do nothing;
