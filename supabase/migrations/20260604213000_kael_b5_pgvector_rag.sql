-- =============================================================================
-- Plan §31 B5: pgvector semantic retrieval contract for Kael knowledge.
--
-- Uses a 64-dim local deterministic embedding contract for the current corpus.
-- This keeps runtime server-side and fail-safe until a first-class embedding
-- provider is approved in the AI provider routing contract.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

alter table public.service_knowledge_boxes
  add column if not exists embedding extensions.vector(64),
  add column if not exists embedding_model text,
  add column if not exists embedding_text text,
  add column if not exists embedding_updated_at timestamptz;

alter table public.worker_safety_patterns
  add column if not exists embedding extensions.vector(64),
  add column if not exists embedding_model text,
  add column if not exists embedding_text text,
  add column if not exists embedding_updated_at timestamptz;

alter table public.legal_awareness_patterns
  add column if not exists embedding extensions.vector(64),
  add column if not exists embedding_model text,
  add column if not exists embedding_text text,
  add column if not exists embedding_updated_at timestamptz;

create index if not exists service_knowledge_boxes_embedding_hnsw_idx
  on public.service_knowledge_boxes
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists worker_safety_patterns_embedding_hnsw_idx
  on public.worker_safety_patterns
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists legal_awareness_patterns_embedding_hnsw_idx
  on public.legal_awareness_patterns
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create table if not exists public.kael_knowledge_usage_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  session_id uuid,
  knowledge_table text not null check (
    knowledge_table in (
      'service_knowledge_boxes',
      'worker_safety_patterns',
      'legal_awareness_patterns'
    )
  ),
  knowledge_id uuid,
  citation_id text not null check (char_length(citation_id) between 3 and 220),
  similarity real check (similarity is null or (similarity >= 0 and similarity <= 1)),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists kael_knowledge_usage_log_job_idx
  on public.kael_knowledge_usage_log(job_id, created_at desc);
create index if not exists kael_knowledge_usage_log_citation_idx
  on public.kael_knowledge_usage_log(citation_id, created_at desc);

alter table public.kael_knowledge_usage_log enable row level security;

drop policy if exists "Admins read kael knowledge usage log" on public.kael_knowledge_usage_log;
create policy "Admins read kael knowledge usage log"
  on public.kael_knowledge_usage_log
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.kael_knowledge_usage_log from public;
revoke all on public.kael_knowledge_usage_log from anon;
revoke all on public.kael_knowledge_usage_log from authenticated;
revoke insert, update, delete on public.kael_knowledge_usage_log from authenticated;
grant select on public.kael_knowledge_usage_log to authenticated;
grant all on public.kael_knowledge_usage_log to service_role;

create or replace function public.match_kael_knowledge(
  p_query_embedding extensions.vector(64),
  p_service_type text default null,
  p_limit integer default 6,
  p_min_similarity real default 0.68
) returns table (
  knowledge_table text,
  knowledge_id uuid,
  record_key text,
  service_type text,
  title text,
  content text,
  citation_id text,
  similarity real,
  safe_metadata jsonb
) language sql stable
set search_path = public, extensions, pg_catalog
as $func$
  with candidates as (
    select
      'service_knowledge_boxes'::text as knowledge_table,
      box.id as knowledge_id,
      box.service_type::text as record_key,
      box.service_type::text as service_type,
      box.label_vi::text as title,
      box.purpose::text as content,
      ('service_knowledge_boxes:' || box.service_type::text)::text as citation_id,
      (1 - (box.embedding <=> p_query_embedding))::real as similarity,
      box.safe_metadata
    from public.service_knowledge_boxes as box
    where box.embedding is not null
      and box.is_active
      and (p_service_type is null or box.service_type::text = p_service_type)

    union all

    select
      'worker_safety_patterns'::text as knowledge_table,
      pattern.id as knowledge_id,
      pattern.pattern_key as record_key,
      pattern.service_type,
      pattern.severity as title,
      pattern.response_guidance as content,
      ('worker_safety_patterns:' || pattern.pattern_key)::text as citation_id,
      (1 - (pattern.embedding <=> p_query_embedding))::real as similarity,
      pattern.safe_metadata
    from public.worker_safety_patterns as pattern
    where pattern.embedding is not null
      and pattern.is_enabled
      and (p_service_type is null or pattern.service_type in (p_service_type, 'general'))

    union all

    select
      'legal_awareness_patterns'::text as knowledge_table,
      legal.id as knowledge_id,
      legal.pattern_key as record_key,
      null::text as service_type,
      legal.boundary_type as title,
      legal.response_guidance as content,
      ('legal_awareness_patterns:' || legal.pattern_key)::text as citation_id,
      (1 - (legal.embedding <=> p_query_embedding))::real as similarity,
      legal.safe_metadata
    from public.legal_awareness_patterns as legal
    where legal.embedding is not null
      and legal.is_enabled
  )
  select
    candidates.knowledge_table,
    candidates.knowledge_id,
    candidates.record_key,
    candidates.service_type,
    candidates.title,
    candidates.content,
    candidates.citation_id,
    candidates.similarity,
    candidates.safe_metadata
  from candidates
  where candidates.similarity >= greatest(0, least(1, p_min_similarity))
  order by candidates.similarity desc
  limit least(greatest(coalesce(p_limit, 6), 1), 10);
$func$;

revoke execute on function public.match_kael_knowledge(extensions.vector(64), text, integer, real) from public;
revoke execute on function public.match_kael_knowledge(extensions.vector(64), text, integer, real) from anon;
revoke execute on function public.match_kael_knowledge(extensions.vector(64), text, integer, real) from authenticated;
grant execute on function public.match_kael_knowledge(extensions.vector(64), text, integer, real) to service_role;

comment on function public.match_kael_knowledge(extensions.vector(64), text, integer, real) is
  'Plan §31 B5 semantic retrieval over approved Kael knowledge tables. Returns citation IDs and safe metadata; Edge falls back to key lookup on error.';
