-- Live price research keeps what it verified so the next customer with the same problem is
-- priced from the same sources without another provider call. Rows are written only by the
-- Edge runtime after deterministic source-trust validation; admins can read and quarantine.
begin;

alter table public.source_trust_registry
  add column if not exists service_types text[] not null default '{}'::text[];

alter table public.source_trust_registry
  drop constraint if exists source_trust_registry_service_types_check;
alter table public.source_trust_registry
  add constraint source_trust_registry_service_types_check
  check (
    service_types <@ array[
      'electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'
    ]::text[]
  );

-- Only domains that already pass every A-G criterion are scoped. Unreviewed seeds stay
-- unscoped and keep their current search and quorum behaviour.
update public.source_trust_registry as registry
set service_types = scoped.service_types
from (values
  ('1fix.vn', array['electrical', 'plumbing', 'hvac', 'handyman']::text[]),
  ('thoviet.com.vn', array['electrical', 'plumbing', 'handyman']::text[]),
  ('suachuatainha.com.vn', array['electrical', 'plumbing', 'handyman']::text[]),
  ('dienmayxanh.com', array['hvac', 'electrical']::text[]),
  ('kythuatdiennuochaphat.com', array['electrical', 'plumbing']::text[]),
  ('aloviecnha.com', array['electrical', 'plumbing', 'handyman']::text[]),
  ('nhabepsaigon.vn', array['handyman']::text[]),
  ('be.com.vn', array['cleaning']::text[]),
  ('cogiupviec.com', array['cleaning']::text[]),
  ('vesinhnhao24h.com', array['cleaning', 'upholstery']::text[]),
  ('vesinhmastercare.com', array['upholstery', 'cleaning']::text[])
) as scoped(domain, service_types)
where registry.domain = scoped.domain
  and registry.criteria_met = jsonb_build_object(
    'A', true, 'B', true, 'C', true, 'D', true, 'E', true, 'F', true, 'G', true
  );

create table if not exists public.kael_price_knowledge (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  problem_slug text not null,
  service_problem_id uuid references public.service_problems on delete set null,
  district_scope text not null default 'hcmc_all',
  status text not null,
  unit text,
  aggregate_min integer,
  aggregate_max integer,
  accepted_source_count integer not null default 0,
  high_trust_source_count integer not null default 0,
  required_quorum integer,
  sources jsonb not null default '[]'::jsonb,
  market_artifact_id uuid references public.kael_market_artifacts on delete set null,
  research_fingerprint text not null,
  failure_reason text,
  policy_id text not null default 'kael.live_price_research.v1',
  reuse_count integer not null default 0,
  demand_count integer not null default 1,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kael_price_knowledge_status_check
    check (status in ('active', 'insufficient', 'quarantined', 'superseded')),
  constraint kael_price_knowledge_unit_check
    check (unit is null or unit in ('per_visit', 'per_repair_point', 'per_item')),
  constraint kael_price_knowledge_slug_check
    check (problem_slug ~ '^[a-z0-9_-]{1,80}$'),
  constraint kael_price_knowledge_fingerprint_check
    check (research_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint kael_price_knowledge_counts_check
    check (
      accepted_source_count >= 0
      and high_trust_source_count >= 0
      and high_trust_source_count <= accepted_source_count
      and reuse_count >= 0
      and demand_count >= 1
    ),
  -- A row a customer can be priced from carries a full, reconcilable Tier 1-2 quorum.
  constraint kael_price_knowledge_evidence_check
    check (
      status not in ('active', 'quarantined', 'superseded')
      or (
        unit is not null
        and aggregate_min is not null
        and aggregate_min > 0
        and aggregate_max is not null
        and aggregate_max >= aggregate_min
        and high_trust_source_count >= 2
        and required_quorum is not null
        and required_quorum >= 2
        and high_trust_source_count >= required_quorum
        and jsonb_typeof(sources) = 'array'
        and jsonb_array_length(sources) = accepted_source_count
      )
    ),
  constraint kael_price_knowledge_gap_check
    check (
      status <> 'insufficient'
      or (aggregate_min is null and aggregate_max is null and failure_reason is not null)
    ),
  constraint kael_price_knowledge_expiry_check
    check (expires_at > verified_at),
  constraint kael_price_knowledge_metadata_check
    check (
      jsonb_typeof(safe_metadata) = 'object'
      and pg_catalog.pg_column_size(safe_metadata) <= 16384
      and pg_catalog.pg_column_size(sources) <= 16384
    )
);

create unique index if not exists kael_price_knowledge_one_active_idx
  on public.kael_price_knowledge (service_type, problem_slug, district_scope)
  where status = 'active';

create index if not exists kael_price_knowledge_lookup_idx
  on public.kael_price_knowledge (service_type, problem_slug, district_scope, status, expires_at desc);

create index if not exists kael_price_knowledge_service_problem_idx
  on public.kael_price_knowledge (service_problem_id);

create index if not exists kael_price_knowledge_market_artifact_idx
  on public.kael_price_knowledge (market_artifact_id);

-- Model-derived findings only. No media reference, customer, session, or address column
-- exists here, so a finding cannot be traced back to a person or a photo.
create table if not exists public.kael_case_knowledge (
  id uuid primary key default gen_random_uuid(),
  service_type public.service_type not null,
  problem_slug text not null,
  finding text not null,
  recommended_scope text,
  severity_indicators text[] not null default '{}'::text[],
  complexity_hint public.complexity_level,
  price_knowledge_id uuid references public.kael_price_knowledge on delete set null,
  created_at timestamptz not null default now(),
  constraint kael_case_knowledge_slug_check
    check (problem_slug ~ '^[a-z0-9_-]{1,80}$'),
  constraint kael_case_knowledge_text_check
    check (
      char_length(finding) between 1 and 500
      and (recommended_scope is null or char_length(recommended_scope) between 1 and 400)
      and cardinality(severity_indicators) <= 5
    )
);

create index if not exists kael_case_knowledge_lookup_idx
  on public.kael_case_knowledge (service_type, problem_slug, created_at desc);

create index if not exists kael_case_knowledge_price_knowledge_idx
  on public.kael_case_knowledge (price_knowledge_id);

alter table public.kael_price_knowledge enable row level security;
alter table public.kael_case_knowledge enable row level security;

revoke all on table public.kael_price_knowledge from anon, authenticated;
revoke all on table public.kael_case_knowledge from anon, authenticated;
grant select, update on table public.kael_price_knowledge to authenticated;
grant select on table public.kael_case_knowledge to authenticated;
grant all on table public.kael_price_knowledge to service_role;
grant all on table public.kael_case_knowledge to service_role;

drop policy if exists "Admins read Kael price knowledge" on public.kael_price_knowledge;
create policy "Admins read Kael price knowledge"
  on public.kael_price_knowledge for select
  to authenticated
  using (private.is_admin());

drop policy if exists "Admins quarantine Kael price knowledge" on public.kael_price_knowledge;
create policy "Admins quarantine Kael price knowledge"
  on public.kael_price_knowledge for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin() and status in ('quarantined', 'superseded'));

drop policy if exists "Admins read Kael case knowledge" on public.kael_case_knowledge;
create policy "Admins read Kael case knowledge"
  on public.kael_case_knowledge for select
  to authenticated
  using (private.is_admin());

commit;
