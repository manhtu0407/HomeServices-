-- =============================================================================
-- Cleaning service box.
--
-- Adds the third active service taxonomy and a Kael market artifact table so
-- Perplexity-backed price research can be stored by service/problem box instead
-- of being mixed with customer PII or generic workflow tables.
-- =============================================================================

create table if not exists service_knowledge_boxes (
  id            uuid primary key default gen_random_uuid(),
  service_type  service_type not null unique,
  slug          text not null unique,
  label_vi      text not null,
  purpose       text not null,
  is_active     boolean not null default true,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger service_knowledge_boxes_updated_at
  before update on service_knowledge_boxes
  for each row execute function update_updated_at();

create table if not exists kael_market_artifacts (
  id                 uuid primary key default gen_random_uuid(),
  service_type       service_type not null,
  service_problem_id uuid references service_problems on delete set null,
  problem_slug       text not null,
  district_code      text not null default 'hcmc_all',
  complexity         complexity_level not null,
  provider           api_provider not null default 'perplexity',
  market_range_min   int,
  market_range_max   int,
  confidence         numeric(4,3),
  sources_summary    text,
  failure_reason     text,
  safe_metadata      jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  constraint kael_market_artifacts_price_range_check
    check (
      market_range_min is null
      or market_range_max is null
      or market_range_max >= market_range_min
    )
);

create index if not exists kael_market_artifacts_service_problem_idx
  on kael_market_artifacts (service_type, problem_slug, district_code, created_at desc);

create index if not exists kael_market_artifacts_service_problem_id_idx
  on kael_market_artifacts (service_problem_id);

insert into service_categories (service_type, slug, label_vi, sort_order, is_active) values
  ('cleaning', 'cleaning', 'Ve sinh/don dep', 30, true)
on conflict (service_type) do update
set
  slug = excluded.slug,
  label_vi = excluded.label_vi,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into service_knowledge_boxes (service_type, slug, label_vi, purpose, safe_metadata) values
  (
    'electrical',
    'electrical',
    'Sua dien',
    'Electrical repair taxonomy, baselines, market research, and Kael analysis artifacts.',
    '{"active_scope": true}'::jsonb
  ),
  (
    'plumbing',
    'plumbing',
    'Sua nuoc',
    'Plumbing repair taxonomy, baselines, market research, and Kael analysis artifacts.',
    '{"active_scope": true}'::jsonb
  ),
  (
    'cleaning',
    'cleaning',
    'Ve sinh/don dep',
    'Home cleaning taxonomy, baselines, market research, and Kael analysis artifacts.',
    '{"active_scope": true}'::jsonb
  )
on conflict (service_type) do update
set
  slug = excluded.slug,
  label_vi = excluded.label_vi,
  purpose = excluded.purpose,
  safe_metadata = excluded.safe_metadata,
  is_active = true,
  updated_at = now();

insert into service_problems (
  service_category_id, service_type, slug, label_vi, default_complexity, sort_order
) values
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'standard_home_cleaning',
    'Don dep nha', 'small', 10
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'kitchen_deep_clean',
    'Ve sinh bep', 'medium', 20
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'bathroom_deep_clean',
    'Ve sinh phong tam', 'medium', 30
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'deep_cleaning',
    'Tong ve sinh', 'large', 40
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'post_repair_cleaning',
    'Don sau sua chua', 'large', 50
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'window_cleaning',
    'Ve sinh cua kinh', 'small', 60
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'other_cleaning',
    'Van de khac', 'medium', 70
  ),
  (
    (select id from service_categories where service_type = 'cleaning'),
    'cleaning', 'cleaning-general',
    'Ve sinh tong quat', 'medium', 80
  )
on conflict (service_category_id, slug) do update
set
  label_vi = excluded.label_vi,
  default_complexity = excluded.default_complexity,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into price_baselines (service_type, service_problem_id, complexity, district_code, price_min, price_max, source)
select 'cleaning'::service_type, sp.id, c.complexity::complexity_level, 'hcmc_all', c.price_min, c.price_max, 'admin_seed'
from service_problems sp
cross join (values
  ('small',  120000,  280000),
  ('medium', 280000,  650000),
  ('large',  650000, 1500000)
) as c(complexity, price_min, price_max)
where sp.service_type = 'cleaning'
on conflict (service_problem_id, district_code, complexity) do update
set
  price_min = excluded.price_min,
  price_max = excluded.price_max,
  source = excluded.source,
  updated_at = now();

alter table service_knowledge_boxes enable row level security;
alter table kael_market_artifacts enable row level security;

create policy "Authenticated users read active service knowledge boxes"
  on service_knowledge_boxes for select
  to authenticated
  using (is_active = true or private.is_admin());

create policy "Admins manage service knowledge boxes"
  on service_knowledge_boxes for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "Admins read Kael market artifacts"
  on kael_market_artifacts for select
  to authenticated
  using (private.is_admin());

create policy "Admins manage Kael market artifacts"
  on kael_market_artifacts for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

grant select on service_knowledge_boxes to authenticated;
grant select on kael_market_artifacts to authenticated;
grant all on service_knowledge_boxes to service_role;
grant all on kael_market_artifacts to service_role;
