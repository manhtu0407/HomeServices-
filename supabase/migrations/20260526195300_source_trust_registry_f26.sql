-- Plan 26 F5: durable source trust registry for market evidence.

create table if not exists public.source_trust_registry (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain ~ '^[a-z0-9.-]+$'),
  tier text not null check (tier in ('tier_1', 'tier_2', 'tier_3', 'blocked')),
  trust_score numeric not null check (trust_score between 0 and 1),
  description text,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_reviewer_id uuid references public.profiles(id) on delete set null,
  review_notes text,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists source_trust_registry_lookup_idx
  on public.source_trust_registry (domain, is_active);

create index if not exists source_trust_registry_tier_active_idx
  on public.source_trust_registry (tier, is_active, trust_score desc);

alter table public.source_trust_registry enable row level security;

drop policy if exists "Admin write source trust" on public.source_trust_registry;
create policy "Admin write source trust"
  on public.source_trust_registry for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke all on public.source_trust_registry from public;
revoke all on public.source_trust_registry from anon;
revoke all on public.source_trust_registry from authenticated;
grant select, insert, update, delete on public.source_trust_registry to authenticated;
grant all on public.source_trust_registry to service_role;

insert into public.source_trust_registry (
  domain,
  tier,
  trust_score,
  description,
  last_reviewed_at,
  review_notes,
  is_active,
  metadata
) values
  ('btaskee.com', 'tier_1', 1, 'Cleaning market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_market","seed":"plan_25_r1"}'),
  ('jupviec.vn', 'tier_1', 1, 'Cleaning market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_market","seed":"plan_25_r1"}'),
  ('tuoitre.vn', 'tier_1', 1, 'Vietnamese reference source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"news_reference","seed":"plan_25_r1"}'),
  ('thanhnien.vn', 'tier_1', 1, 'Vietnamese reference source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"news_reference","seed":"plan_25_r1"}'),
  ('dienmayxanh.com', 'tier_1', 1, 'Repair reference source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_reference","seed":"plan_25_r1"}'),
  ('suachuatainha.com.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('tktclean.com', 'tier_1', 1, 'Cleaning market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_market","seed":"plan_25_r1"}'),
  ('cleanipedia.com', 'tier_1', 1, 'Cleaning reference source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_reference","seed":"plan_25_r1"}'),
  ('hoanmyclean.vn', 'tier_1', 1, 'Cleaning market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_market","seed":"plan_25_r1"}'),
  ('thoviet.com.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('thosaigon.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('suadiennuocnamviet.com', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('khodiennuoc.com', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('f24.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('suadiennuocvn.net', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('saigonfix.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('diennuochonglinh.com', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('moitruongmiendong.com', 'tier_1', 1, 'Cleaning market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"cleaning_market","seed":"plan_25_r1"}'),
  ('drhome.com.vn', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}'),
  ('diennuochuongthinh.com', 'tier_1', 1, 'Repair market source from Plan 25 R1', '2026-05-26T00:00:00Z', 'Initial F26 seed', true, '{"category":"repair_market","seed":"plan_25_r1"}')
on conflict (domain) do update
set tier = excluded.tier,
    trust_score = excluded.trust_score,
    description = excluded.description,
    last_reviewed_at = excluded.last_reviewed_at,
    review_notes = excluded.review_notes,
    is_active = excluded.is_active,
    effective_until = null,
    metadata = public.source_trust_registry.metadata || excluded.metadata;

comment on table public.source_trust_registry is
  'Plan 26 F5 trusted-domain registry for Perplexity market citations. Admin-tunable through RLS; service role used by Edge.';
