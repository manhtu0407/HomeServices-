-- Plan 26 F7: drop advisor-reported unused secondary indexes with
-- pg_stat_user_indexes.idx_scan = 0 since the 2026-05-07 stats reset.
--
-- FK-covering indexes from the unused list are intentionally retained:
-- chat_messages_job_id_idx, jobs_service_problem_id_idx,
-- kael_analysis_artifacts_problem_idx,
-- kael_market_artifacts_service_problem_id_idx,
-- kael_rule_application_log_rule_idx,
-- kael_rule_lifecycle_log_rule_idx,
-- kael_rule_lifecycle_log_candidate_idx.

drop index if exists public.api_logs_provider_idx;
drop index if exists public.api_logs_request_id_idx;
drop index if exists public.price_baselines_district_idx;
drop index if exists public.kael_ab_experiments_status_idx;
drop index if exists public.job_broadcasts_batch_id_idx;
drop index if exists public.job_events_event_type_idx;
drop index if exists public.scope_change_requests_status_idx;
drop index if exists public.learning_candidates_status_idx;
drop index if exists public.learning_rules_status_idx;
drop index if exists public.worker_scope_change_stats_rate_idx;
drop index if exists public.kael_optimization_metrics_request_idx;
drop index if exists public.kael_optimization_metrics_purpose_provider_idx;
drop index if exists public.kael_analysis_artifacts_box_idx;
drop index if exists public.job_media_assets_service_idx;
drop index if exists public.worker_cancellation_requests_status_idx;
drop index if exists public.customer_kael_memory_last_observed_idx;
drop index if exists public.kael_chat_sessions_status_idx;
drop index if exists public.kael_market_artifacts_service_problem_idx;
drop index if exists public.worker_kael_memory_archived_at_idx;
drop index if exists public.worker_kael_memory_last_observed_idx;
drop index if exists public.kael_permission_audit_purpose_idx;
drop index if exists public.kael_advisory_audit_purpose_idx;
drop index if exists public.kael_memory_audit_subject_idx;
drop index if exists public.kael_memory_audit_purpose_idx;
drop index if exists public.kael_memory_archive_subject_idx;
drop index if exists public.worker_safety_patterns_lookup_idx;
drop index if exists public.legal_awareness_patterns_lookup_idx;
drop index if exists public.kael_charter_audit_created_at_idx;
drop index if exists public.kael_charter_audit_version_idx;
drop index if exists public.kael_interaction_log_escalation_idx;
drop index if exists public.kael_learning_queue_skill_state_idx;
drop index if exists public.worker_cancellation_reason_taxonomy_active_idx;
drop index if exists public.worker_cancellation_requests_admin_review_idx;
drop index if exists public.customer_cancellation_reason_taxonomy_category_idx;
drop index if exists public.customer_cancellation_reason_taxonomy_active_idx;
drop index if exists public.customer_cancellation_records_review_idx;
drop index if exists public.source_trust_registry_lookup_idx;
