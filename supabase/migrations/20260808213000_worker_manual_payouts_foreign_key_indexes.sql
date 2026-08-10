-- Covers the foreign-key lookups created by the manual payout workflow.
-- These indexes keep profile and payout-method referential checks bounded as the queue grows.
create index if not exists worker_payout_methods_reviewed_by_idx
  on public.worker_payout_methods (reviewed_by);

create index if not exists worker_withdrawal_requests_payout_method_id_idx
  on public.worker_withdrawal_requests (payout_method_id);

create index if not exists worker_withdrawal_requests_processed_by_idx
  on public.worker_withdrawal_requests (processed_by);
