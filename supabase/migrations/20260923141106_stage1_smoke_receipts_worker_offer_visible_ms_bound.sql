begin;

-- Mirrors 20260923140621_stage1_worker_offer_visibility_cron_budget.sql: the RPC-level bound was
-- widened there, but this table's own CHECK constraint enforced the same stale 10s limit
-- independently, so an otherwise-valid receipt still failed the INSERT.
alter table public.stage1_synthetic_smoke_receipts
  drop constraint stage1_synthetic_smoke_receipts_worker_offer_visible_ms_check,
  add constraint stage1_synthetic_smoke_receipts_worker_offer_visible_ms_check
    check (worker_offer_visible_ms >= 0 and worker_offer_visible_ms <= 80000);

commit;
