# Backend Domain Map

Status: active drift-guard contract (§44.4 D3).

Every table and view in the `public` schema belongs to exactly one domain here. A new database
object cannot appear without a human assigning it a domain: `backend-domain-map-drift.test.ts`
reads this file and the committed `packages/shared/src/types/database.types.ts`, and fails if any
object is unclassified, missing, or listed under two domains. That is the gate — a stray
`kael_foo` table stops at the door instead of drifting into production unnoticed.

**Authority:** `governance/STRUCTURES.md` is the workflow source of truth and `governance/Plan.md`
§44.3 is the code-domain axis this map reuses. This file maps the *data* to those same domains; it
does not invent a parallel taxonomy. Domain names match the `services/*` and `kael/*` code folders
(see `code-ownership-map.md`), except for a few data-only concerns (`identity`, `payments`,
`observability`) that have no single code folder and are noted as such.

**How the drift test reads this file:** it parses only the block between the
`BEGIN/END generated:table-domain-map` markers — each `### <domain>` heading starts a domain, and
every `- `name`` bullet under it is one object. To classify a new table, add its bullet under the
right domain and regenerate the object count in the header. Do not hand-edit bullets in a way the
generator would not reproduce.


<!-- BEGIN generated:table-domain-map — parsed by apps/api/src/__tests__/schema/backend-domain-map-drift.test.ts -->
Every public table and view below has exactly one domain. Count: **89 tables + 6 views = 95 objects**.

### cancellation
Code owner: services/cancellation

- `customer_cancellation_reason_taxonomy`
- `customer_cancellation_records`
- `worker_cancellation_reason_taxonomy`
- `worker_cancellation_requests`

### catalog
Code owner: services/catalog

- `price_baselines`
- `service_categories`
- `service_problems`

### completion-review
Code owner: services/completion-review

- `disputes`
- `reviews`

### identity
Code owner: services/workers + services/kael-chat (profile bootstrap); no dedicated service folder

- `customer_profiles`
- `profiles`
- `worker_profiles`

### jobs
Code owner: services/jobs

- `chat_messages`
- `evidence_snapshots`
- `job_events`
- `job_media_assets`
- `job_media_upload_intents`
- `jobs`

### kael-case-work
Code owner: kael/case-work

- `kael_analysis_artifacts`
- `kael_job_incident_events`
- `kael_job_incidents`

### kael-chat
Code owner: services/kael-chat + kael/stages

- `kael_chat_media_upload_intents`
- `kael_chat_pre_intake_memory`
- `kael_chat_rate_limit_log`
- `kael_chat_sessions`
- `kael_chat_turns`
- `kael_customer_conversation_turns`
- `kael_customer_conversations`

### kael-guards
Code owner: kael/guards

- `kael_admin_queue`
- `kael_advisory_audit`
- `kael_autonomy_decision_audit`
- `kael_charter_audit`
- `kael_guardrail_trip_audit`
- `kael_interaction_log`
- `kael_permission_audit`

### kael-learning
Code owner: kael/skills + kael/cron (P7 learning)

- `kael_learning_queue`
- `kael_optimization_metrics`
- `kael_quality_baseline`
- `kael_region_lexicon_candidate`
- `kael_rule_application_log`
- `kael_rule_lifecycle_log`
- `learning_candidates`
- `learning_observation_receipts`
- `learning_rule_versions`
- `learning_rules`

### kael-market
Code owner: kael/market

- `kael_ab_experiments`
- `kael_ab_price_synthesis_cases`
- `kael_market_artifacts`
- `kael_market_cache`

### kael-memory
Code owner: services/kael-memory + kael/memory

- `customer_kael_feedback`
- `customer_kael_memory`
- `kael_memory_archive`
- `kael_memory_audit`
- `kael_memory_update_receipts`

### kael-provider
Code owner: kael/provider

- `ai_provider_routing`
- `kael_ai_batch_items`
- `kael_ai_batches`
- `kael_ai_spend_log`
- `kael_provider_circuit`
- `kael_provider_spend_daily`
- `kael_rate_counter`

### kael-source-trust
Code owner: kael/source-trust

- `kael_knowledge_usage_log`
- `legal_awareness_patterns`
- `service_knowledge_boxes`
- `source_trust_registry`
- `worker_safety_patterns`

### kael-voice
Code owner: kael/stages/voice-transcript.ts

- `kael_voice_transcript`

### matching
Code owner: services/matching

- `customer_favorite_workers`
- `job_broadcast_retry_claims`
- `job_broadcasts`
- `job_worker_candidates`

### notifications
Code owner: services/notifications

- `device_push_tokens`
- `notifications`

### observability
Code owner: kael/observability + api_logs

- `api_logs`
- `kael_cost_daily_summary`
- `kael_cost_projection_daily`
- `kael_monitoring_ab_price_synthesis`
- `kael_monitoring_provider_daily`

### payments
Code owner: gated to P9 (§44 C1 "payment absent"); table pre-built

- `customer_payment_methods`

### profile-insights
Code owner: services/profile-insights (+ views from B7 P3a migration)

- `customer_overview`
- `customer_stats`
- `worker_overview`
- `worker_stats`

### scope-change
Code owner: services/scope-change

- `scope_change_request_commands`
- `scope_change_request_effects`
- `scope_change_requests`
- `worker_scope_change_stats`

### worker-kael
Code owner: services/worker-kael

- `kael_worker_chat_rate_limit_log`
- `kael_worker_chat_sessions`
- `kael_worker_chat_turn_requests`
- `kael_worker_chat_turns`
- `kael_worker_qa_log`
- `worker_kael_feedback`
- `worker_kael_memory`
- `worker_kael_training_consent`

<!-- END generated:table-domain-map -->

## Migration index by domain

177 migrations, grouped by the domain they primarily touch (foundational/cross-cutting ones under `foundation`).

<details><summary><strong>cancellation</strong> (3)</summary>

- `20260519090200_supabase_boxes_notifications_media_cancellation.sql`
- `20260520141200_worker_cancellation_auto_reassign.sql`
- `20260526003315_fix_worker_cancellation_reason_category_ambiguity_p14.sql`

</details>
<details><summary><strong>catalog</strong> (6)</summary>

- `20260516075310_expand_service_taxonomy.sql`
- `20260516141918_expand_service_taxonomy.sql`
- `20260519090000_add_cleaning_service_type.sql`
- `20260519090100_add_cleaning_service_box.sql`
- `20260519145538_fix_vietnamese_catalog_labels.sql`
- `20260711060000_six_service_taxonomy_verified_prices.sql`

</details>
<details><summary><strong>completion-review</strong> (5)</summary>

- `20260517154846_submit_review_atomic_rpc.sql`
- `20260525234746_kael_dispute_case_p13.sql`
- `20260604180000_learning_candidate_manual_review_status.sql`
- `20260604181000_learning_candidate_admin_review_rpc.sql`
- `20260711067000_review_requires_paid.sql`

</details>
<details><summary><strong>foundation</strong> (56)</summary>

- `20260511000000_init_schema.sql`
- `20260512000000_security_hardening.sql`
- `20260513114845_align_structures_workflow.sql`
- `20260513125704_harden_function_execution.sql`
- `20260513131949_revoke_rls_auto_enable_rpc.sql`
- `20260516085408_add_fk_indexes.sql`
- `20260516141920_add_fk_indexes.sql`
- `20260516143403_atomic_rpc_functions.sql`
- `20260516143540_atomic_rpc_functions_v2.sql`
- `20260516143856_atomic_rpc_functions_v3.sql`
- `20260516144400_atomic_rpc_functions.sql`
- `20260517155954_mobile_rpc_security_invoker.sql`
- `20260517192455_harden_auth_signup_trigger.sql`
- `20260518001200_lock_direct_client_writes_for_edge_runtime.sql`
- `20260518032000_revoke_authenticated_workflow_dml.sql`
- `20260518043000_harden_private_rls_helper_execution.sql`
- `20260518044500_consolidate_admin_rls_select_policies.sql`
- `20260519120720_fix_worker_cancellation_race_and_media_stage_rls.sql`
- `20260519122000_consolidate_box_admin_rls_policies.sql`
- `20260524000000_kael_final_price_authority.sql`
- `20260524105341_pr29_workflow_risk_fixes.sql`
- `20260525091146_kael_audit_tables.sql`
- `20260525101442_jobs_kael_progress.sql`
- `20260525104648_kael_vision_latency_buffer.sql`
- `20260525111707_kael_output_format_p4.sql`
- `20260525113639_kael_permission_policy_p5.sql`
- `20260525132115_kael_demanding_customer_case_p10.sql`
- `20260525231655_kael_customer_cancel_case_p12.sql`
- `20260525233322_fix_customer_cancel_records_rls_p12.sql`
- `20260526002253_backend_gaps_cleanup_p14.sql`
- `20260526203000_f26_fk_performance_indexes.sql`
- `20260526203100_f26_drop_unused_indexes.sql`
- `20260527090118_allow_vietmap_geo_source.sql`
- `20260529100000_add_idempotency_keys.sql`
- `20260529130000_scrub_chat_turns_pii.sql`
- `20260530100110_fix_recent_pr_audit_gaps.sql`
- `20260604090000_revoke_anon_public_grants.sql`
- `20260604090100_revoke_residual_authenticated_dml.sql`
- `20260604090200_harden_default_privileges_public.sql`
- `20260604091224_harden_public_grants_followup.sql`
- `20260604093025_harden_global_function_default_privileges.sql`
- `20260604100550_revoke_authenticated_table_ddl_privileges.sql`
- `20260604213000_kael_b5_pgvector_rag.sql`
- `20260604214000_kael_b5_embedding_backfill.sql`
- `20260604231500_disintermediation_admin_queue.sql`
- `20260604232500_apartment_access_release.sql`
- `20260605003000_fix_plan31_post_advisor_warnings.sql`
- `20260605004000_fix_plan31_rpc_lint_warnings.sql`
- `20260610075217_apartment_access_checkin_media_stage.sql`
- `20260614120000_kael_rate_limit_log_deny_all_policy.sql`
- `20260630120000_jobs_display_code_sequence.sql`
- `20260703000000_harden_source_trust_registry_grant.sql`
- `20260710082120_kael_durable_guards.sql`
- `20260711030833_six_service_casework_foundation.sql`
- `20260714103000_exact_profile_and_earnings_aggregates.sql`
- `20260714104000_qualify_kael_media_intent_columns.sql`

</details>
<details><summary><strong>jobs</strong> (3)</summary>

- `20260517233000_cancel_job_before_accept_atomic.sql`
- `20260711065000_job_media_analysis_audio_guard.sql`
- `20260714092842_job_media_upload_intents.sql`

</details>
<details><summary><strong>kael-case-work</strong> (3)</summary>

- `20260711033644_kael_case_work_artifact.sql`
- `20260712124241_kael_job_incident_case.sql`
- `20260714107000_atomic_job_incident_transitions.sql`

</details>
<details><summary><strong>kael-guards</strong> (3)</summary>

- `20260525124010_kael_charter_audit_p8.sql`
- `20260604220000_kael_c_autonomy_audit_apply.sql`
- `20260604221500_kael_d_guardrail_trip_audit.sql`

</details>
<details><summary><strong>kael-learning</strong> (10)</summary>

- `20260525121445_kael_learning_skills_p7.sql`
- `20260526142000_kael_q4_background_optimization.sql`
- `20260604170000_rollback_learning_rule_rpc.sql`
- `20260605001000_fix_kael_rollback_learning_rule_ambiguity.sql`
- `20260714101000_atomic_learning_autopromotion.sql`
- `20260714102000_atomic_learning_observations.sql`
- `20260714109000_atomic_learning_queue_claims.sql`
- `20260714110000_atomic_learning_batch_results.sql`
- `20260715011209_atomic_learning_effect_commits.sql`
- `20260715114000_atomic_learning_admin_approval.sql`

</details>
<details><summary><strong>kael-market</strong> (2)</summary>

- `20260526012712_kael_p17_monitoring_ab_setup.sql`
- `20260526131000_kael_market_cache_q3.sql`

</details>
<details><summary><strong>kael-memory/kael-chat</strong> (18)</summary>

- `20260520130514_kael_chat_sessions.sql`
- `20260525091142_customer_kael_memory.sql`
- `20260525114839_kael_memory_governance_p6.sql`
- `20260525122335_consolidate_kael_memory_read_policies.sql`
- `20260529090000_kael_chat_unsupported_status.sql`
- `20260529110000_kael_chat_rate_limit_log.sql`
- `20260602090000_customer_kael_feedback.sql`
- `20260604095731_combine_customer_kael_feedback_select_policy.sql`
- `20260604223000_kael_chat_session_progress.sql`
- `20260620123000_kael_chat_media_bucket.sql`
- `20260628120000_kael_chat_collecting_evidence_status.sql`
- `20260629114000_extend_kael_chat_media_bucket.sql`
- `20260711061000_kael_chat_media_privacy.sql`
- `20260711063000_kael_chat_media_upload_intents.sql`
- `20260711066000_kael_chat_media_retention_worker.sql`
- `20260713163851_customer_kael_conversations.sql`
- `20260714024500_index_customer_kael_conversation_turn_owners.sql`
- `20260714106000_atomic_kael_memory_updates.sql`

</details>
<details><summary><strong>kael-provider</strong> (7)</summary>

- `20260525101441_ai_provider_routing.sql`
- `20260526090000_kael_cost_optimization_q1.sql`
- `20260613120000_kael_provider_spend_cap.sql`
- `20260614120500_kael_ai_spend_gate.sql`
- `20260615120000_kael_ai_spend_reserve.sql`
- `20260710123000_preserve_provider_global_circuit.sql`
- `20260715115000_align_ai_provider_routing_catalog.sql`

</details>
<details><summary><strong>kael-source-trust</strong> (4)</summary>

- `20260526195300_source_trust_registry_f26.sql`
- `20260604203000_kael_b3_knowledge_corpus.sql`
- `20260604210000_kael_b4_knowledge_governance.sql`
- `20260710082345_kael_source_trust_tiering.sql`

</details>
<details><summary><strong>kael-voice</strong> (1)</summary>

- `20260706120000_kael_voice_transcript.sql`

</details>
<details><summary><strong>matching</strong> (18)</summary>

- `20260517234500_accept_broadcast_worker_eligibility.sql`
- `20260518002000_accept_broadcast_lock_worker_profile.sql`
- `20260518005000_accept_broadcast_lock_job_first.sql`
- `20260518010500_availability_offline_expires_sent_broadcasts.sql`
- `20260518011500_reassign_all_sent_broadcasts_on_accept.sql`
- `20260518013000_accept_broadcast_service_district_guard.sql`
- `20260518040500_qualify_accept_broadcast_columns.sql`
- `20260518041500_remove_accept_broadcast_created_at_order.sql`
- `20260518070000_accept_broadcast_privacy_guard.sql`
- `20260518071000_accept_broadcast_privacy_guard_v2.sql`
- `20260521120000_geo_matching_and_worker_auto_suspend.sql`
- `20260604160000_promote_learning_candidate_rpc.sql`
- `20260619160017_worker_matching_indexes.sql`
- `20260711050000_customer_worker_candidate_gate.sql`
- `20260711053000_candidate_cancel_release.sql`
- `20260712031420_harden_display_code_and_candidate_broadcast_index.sql`
- `20260714074000_accept_broadcast_candidate_privacy_guard.sql`
- `20260715113000_broadcast_retry_claims.sql`

</details>
<details><summary><strong>notifications</strong> (2)</summary>

- `20260524010000_worker_approved_notification_trigger.sql`
- `20260714084815_device_push_token_single_owner.sql`

</details>
<details><summary><strong>payments</strong> (2)</summary>

- `20260614093000_sepay_vietqr_payment_gate.sql`
- `20260627143000_customer_payment_methods.sql`

</details>
<details><summary><strong>profile-insights</strong> (1)</summary>

- `20260619151536_worker_customer_stats.sql`

</details>
<details><summary><strong>scope-change</strong> (8)</summary>

- `20260517163541_harden_scope_change_rpc_races.sql`
- `20260517225000_scope_change_decision_check.sql`
- `20260518181500_scope_change_reject_cancels_job.sql`
- `20260525233112_fix_customer_cancel_scope_change_table_p12.sql`
- `20260604230500_scope_change_kael_progress.sql`
- `20260711062000_unified_scope_change_timing.sql`
- `20260711064000_scope_change_private_media_refs.sql`
- `20260714111000_atomic_scope_change_idempotency.sql`

</details>
<details><summary><strong>worker-kael</strong> (10)</summary>

- `20260525091145_worker_kael_memory.sql`
- `20260604225500_worker_kael_feedback_consent.sql`
- `20260605005000_scope_worker_kael_chat_idempotency_by_job.sql`
- `20260627090000_worker_kael_turn_idempotency.sql`
- `20260713042558_archive_worker_kael_chat_sessions.sql`
- `20260713051818_title_worker_kael_chat_sessions.sql`
- `20260713124007_partition_worker_kael_sessions_by_chat_mode.sql`
- `20260713132500_pin_worker_kael_chat_sessions.sql`
- `20260714080000_worker_kael_reference_media.sql`
- `20260714108000_atomic_worker_kael_turns.sql`

</details>
<details><summary><strong>workers</strong> (15)</summary>

- `20260516075331_worker_registration_fields.sql`
- `20260516141919_worker_registration_fields.sql`
- `20260518003500_set_worker_availability_atomic.sql`
- `20260525140826_kael_worker_cancel_case_p11.sql`
- `20260525230054_fix_worker_no_show_reason_code_ambiguity.sql`
- `20260529120000_normalize_worker_districts.sql`
- `20260604224500_kael_worker_chat_sessions.sql`
- `20260605006000_drop_worker_profiles_districts_backup_x3.sql`
- `20260612120000_worker_application_admin_queue.sql`
- `20260701120000_worker_application_idempotency.sql`
- `20260712042000_worker_availability_preference.sql`
- `20260713143000_worker_avatar_and_app_activity.sql`
- `20260714105000_atomic_worker_registration.sql`
- `20260715105143_worker_earnings_daily_aggregate.sql`
- `20260716121927_worker_verification_draft_cleanup.sql`

</details>
