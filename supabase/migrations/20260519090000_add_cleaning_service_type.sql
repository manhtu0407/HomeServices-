-- =============================================================================
-- Add cleaning as the third active service type.
--
-- Kept separate from data inserts because new enum values should not be used by
-- later statements in the same migration transaction on older Postgres runtimes.
-- =============================================================================

alter type service_type add value if not exists 'cleaning';
