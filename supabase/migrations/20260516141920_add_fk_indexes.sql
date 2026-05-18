-- =============================================================================
-- Migration: 20260516160000_add_fk_indexes.sql
-- Add covering indexes for foreign keys flagged by Supabase performance advisor.
--
-- Why: unindexed FKs force sequential scans on parent-row deletes/updates and
-- on join queries that filter by the FK. With workers + jobs scaling, queries
-- like "list reviews for worker X" or "find events by actor Y" would slow down.
--
-- Idempotent: IF NOT EXISTS prevents re-run errors.
-- Non-destructive: CREATE INDEX adds storage but does not modify rows or break
-- existing queries. Safe to apply on live production.
-- =============================================================================

create index if not exists chat_messages_sender_id_idx
  on public.chat_messages (sender_id);

create index if not exists job_events_actor_id_idx
  on public.job_events (actor_id);

create index if not exists reviews_customer_id_idx
  on public.reviews (customer_id);

create index if not exists reviews_worker_id_idx
  on public.reviews (worker_id);
;
