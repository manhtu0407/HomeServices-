-- Plan 26 F7: add covering indexes for foreign keys still flagged by
-- Supabase performance advisor at INFO level.
--
-- Evidence before migration:
-- - stats_reset: 2026-05-07 18:19:10+00
-- - advisor findings: 15 unindexed_foreign_keys

create index if not exists customer_cancellation_records_reason_code_f26_idx
  on public.customer_cancellation_records (reason_code);

create index if not exists disputes_admin_decision_by_f26_idx
  on public.disputes (admin_decision_by);

create index if not exists disputes_evidence_snapshot_id_f26_idx
  on public.disputes (evidence_snapshot_id);

create index if not exists kael_admin_queue_actor_id_f26_idx
  on public.kael_admin_queue (actor_id);

create index if not exists kael_charter_audit_actor_id_f26_idx
  on public.kael_charter_audit (actor_id);

create index if not exists kael_learning_queue_batch_id_f26_idx
  on public.kael_learning_queue (batch_id);

create index if not exists kael_rule_application_candidate_id_f26_idx
  on public.kael_rule_application_log (candidate_id);

create index if not exists kael_rule_application_job_id_f26_idx
  on public.kael_rule_application_log (job_id);

create index if not exists kael_rule_lifecycle_actor_id_f26_idx
  on public.kael_rule_lifecycle_log (actor_id);

create index if not exists kael_rule_lifecycle_job_id_f26_idx
  on public.kael_rule_lifecycle_log (job_id);

create index if not exists kael_worker_qa_log_worker_id_f26_idx
  on public.kael_worker_qa_log (worker_id);

create index if not exists source_trust_registry_added_by_f26_idx
  on public.source_trust_registry (added_by);

create index if not exists source_trust_registry_last_reviewer_f26_idx
  on public.source_trust_registry (last_reviewer_id);

create index if not exists worker_cancel_requests_admin_decision_by_f26_idx
  on public.worker_cancellation_requests (admin_decision_by);

create index if not exists worker_cancel_requests_reason_code_f26_idx
  on public.worker_cancellation_requests (reason_code);
