-- Plan §40 S1: preserve legacy source-trust callers while storing the
-- evidence required for deterministic T1–T5 classification in S2.

begin;

alter table public.source_trust_registry
  add column if not exists criteria_met jsonb not null default
    '{"A":false,"B":false,"C":false,"D":false,"E":false,"F":false,"G":false}'::jsonb
    check (jsonb_typeof(criteria_met) = 'object'),
  add column if not exists auto_tier smallint not null default 5
    check (auto_tier between 1 and 5),
  add column if not exists entity_type text,
  add column if not exists region text,
  add column if not exists established_year integer
    check (established_year between 1800 and 2100),
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_price_seen_at timestamptz,
  add column if not exists price_unit text,
  add column if not exists integrity_flag boolean not null default false;

-- Preserve current runtime behavior until S2 switches consumers to the
-- deterministic evidence rulebook. The legacy enum-like text remains intact.
update public.source_trust_registry
set auto_tier = case tier
  when 'tier_1' then 1
  when 'tier_2' then 2
  when 'tier_3' then 3
  when 'blocked' then 5
  else 5
end;

create index if not exists source_trust_registry_auto_tier_active_idx
  on public.source_trust_registry (auto_tier, is_active, trust_score desc);

alter table public.source_trust_registry enable row level security;
revoke insert, update, delete on public.source_trust_registry from authenticated;
grant select on public.source_trust_registry to authenticated;
grant all on public.source_trust_registry to service_role;

comment on column public.source_trust_registry.auto_tier is
  'Plan §40 S1 compatibility remap. S2 overwrites from criteria_met evidence using the deterministic T1–T5 rulebook.';
comment on column public.source_trust_registry.criteria_met is
  'Plan §40 A–G evidence flags. LLM claims are not trusted as classification authority.';

commit;
