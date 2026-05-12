-- =============================================================================
-- Seed data for local development
-- Run: supabase db reset (applies migrations + seed)
--
-- Test accounts (use Supabase Studio > Authentication to create auth.users,
-- then this seed populates public.profiles and related tables)
-- =============================================================================

-- Test UUIDs (deterministic for local dev)
-- Customer: 00000000-0000-0000-0000-000000000001
-- Worker:   00000000-0000-0000-0000-000000000002
-- Admin:    00000000-0000-0000-0000-000000000003

-- Note: In production, profiles are created by the handle_new_user() trigger.
-- For local dev, we insert directly since we don't go through auth.users signup.

insert into profiles (id, role, full_name, phone) values
  ('00000000-0000-0000-0000-000000000001', 'customer', 'Nguyen Van A', '0901000001'),
  ('00000000-0000-0000-0000-000000000002', 'worker',   'Tran Van B',   '0901000002'),
  ('00000000-0000-0000-0000-000000000003', 'admin',    'Admin Dev',    '0901000003')
on conflict (id) do nothing;

insert into customer_profiles (id, building_name, unit_number, floor, district) values
  ('00000000-0000-0000-0000-000000000001', 'Vinhomes Central Park', 'A-1205', '12', 'Binh Thanh')
on conflict (id) do nothing;

insert into worker_profiles (
  id, service_types, years_experience, districts,
  is_approved, is_available, rating, total_jobs
) values
  (
    '00000000-0000-0000-0000-000000000002',
    array['electrical', 'plumbing']::service_type[],
    5,
    array['Binh Thanh', 'Quan 1', 'Quan 2'],
    true, true, 4.50, 12
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
    200000,
    now() - interval '3 days',
    now() - interval '3 days' + interval '5 minutes',
    now() - interval '3 days' + interval '1 hour',
    now() - interval '3 days' + interval '1 hour 10 minutes',
    now() - interval '3 days' + interval '1 hour 15 minutes'
  )
on conflict (id) do nothing;

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
    'pending'
  )
on conflict (id) do nothing;
