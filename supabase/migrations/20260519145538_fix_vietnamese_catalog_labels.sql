-- Fix user-facing Vietnamese catalog labels for the three active services.
-- The earlier production seed used unaccented Vietnamese in a few label_vi fields.

update public.service_categories as category
set
  label_vi = labels.label_vi,
  updated_at = now()
from (
  values
    ('electrical'::public.service_type, 'Sửa điện'),
    ('plumbing'::public.service_type, 'Sửa nước'),
    ('cleaning'::public.service_type, 'Vệ sinh/dọn dẹp')
) as labels(service_type, label_vi)
where category.service_type = labels.service_type;

update public.service_knowledge_boxes as box
set
  label_vi = labels.label_vi,
  updated_at = now()
from (
  values
    ('electrical'::public.service_type, 'Sửa điện'),
    ('plumbing'::public.service_type, 'Sửa nước'),
    ('cleaning'::public.service_type, 'Vệ sinh/dọn dẹp')
) as labels(service_type, label_vi)
where box.service_type = labels.service_type;

update public.service_problems as problem
set
  label_vi = labels.label_vi,
  updated_at = now()
from (
  values
    ('electrical'::public.service_type, 'electrical-general', 'Sự cố điện tổng quát'),
    ('electrical'::public.service_type, 'power_outage_one_room', 'Mất điện một phòng'),
    ('electrical'::public.service_type, 'power_outage_whole_unit', 'Mất điện toàn căn'),
    ('electrical'::public.service_type, 'outlet_or_switch_broken', 'Ổ cắm/công tắc hỏng'),
    ('electrical'::public.service_type, 'breaker_trip', 'Cầu dao trip'),
    ('electrical'::public.service_type, 'flickering_light', 'Đèn chập chờn'),
    ('electrical'::public.service_type, 'install_device', 'Lắp thêm thiết bị'),
    ('electrical'::public.service_type, 'other_electrical', 'Vấn đề khác'),
    ('plumbing'::public.service_type, 'plumbing-general', 'Sự cố nước tổng quát'),
    ('plumbing'::public.service_type, 'pipe_leak', 'Ống rò rỉ'),
    ('plumbing'::public.service_type, 'clogged_drain_or_sink', 'Tắc cống/bồn'),
    ('plumbing'::public.service_type, 'toilet_flush_issue', 'Toilet không xả'),
    ('plumbing'::public.service_type, 'faucet_broken', 'Vòi hỏng'),
    ('plumbing'::public.service_type, 'weak_water_pressure', 'Áp nước yếu'),
    ('plumbing'::public.service_type, 'install_or_replace_fixture', 'Lắp/thay thiết bị'),
    ('plumbing'::public.service_type, 'other_plumbing', 'Vấn đề khác'),
    ('cleaning'::public.service_type, 'standard_home_cleaning', 'Dọn dẹp nhà'),
    ('cleaning'::public.service_type, 'kitchen_deep_clean', 'Vệ sinh bếp'),
    ('cleaning'::public.service_type, 'bathroom_deep_clean', 'Vệ sinh phòng tắm'),
    ('cleaning'::public.service_type, 'deep_cleaning', 'Tổng vệ sinh'),
    ('cleaning'::public.service_type, 'post_repair_cleaning', 'Dọn sau sửa chữa'),
    ('cleaning'::public.service_type, 'window_cleaning', 'Vệ sinh cửa kính'),
    ('cleaning'::public.service_type, 'other_cleaning', 'Vấn đề khác'),
    ('cleaning'::public.service_type, 'cleaning-general', 'Vệ sinh tổng quát')
) as labels(service_type, slug, label_vi)
where problem.service_type = labels.service_type
  and problem.slug = labels.slug;
