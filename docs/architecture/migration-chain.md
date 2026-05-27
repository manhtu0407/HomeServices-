# Migration Chain

This file records the active Supabase migration chain used by the Kael P3-P17 backend work. The directory `supabase/migrations/` remains the source of truth; this document explains the ordering and verification intent so later agents do not replay phases out of sequence.

## Staging Target

- Project ref: `xyylanuyflrjzbjzhqfl`
- Production project `iwevizmsedyqozxlawwl` was promoted on 2026-05-26 after Tu's audit request. Post-promotion audit shows `71` migrations, P3-P17 tables/columns present, and production dry-run up to date.
- Every new migration must be dry-run checked, pushed to staging, smoke tested, and reviewed with Supabase advisors before its Plan checkbox is marked complete.

## Baseline Before Kael Agentic Harness

The early chain creates the production schema and hardens workflow tables:

- `20260511000000_init_schema.sql`
- `20260512000000_security_hardening.sql`
- `20260513114845_align_structures_workflow.sql`
- `20260516075331_worker_registration_fields.sql`
- `20260516141919_worker_registration_fields.sql`
- `20260516143403_atomic_rpc_functions.sql` through `20260516144400_atomic_rpc_functions.sql`
- `20260517225000_scope_change_decision_check.sql`
- `20260517234500_accept_broadcast_worker_eligibility.sql`
- `20260518001200_lock_direct_client_writes_for_edge_runtime.sql`
- `20260518002000_accept_broadcast_lock_worker_profile.sql` through `20260518071000_accept_broadcast_privacy_guard_v2.sql`
- `20260519090200_supabase_boxes_notifications_media_cancellation.sql`
- `20260519120720_fix_worker_cancellation_race_and_media_stage_rls.sql`
- `20260520130514_kael_chat_sessions.sql`
- `20260520141200_worker_cancellation_auto_reassign.sql`
- `20260521120000_geo_matching_and_worker_auto_suspend.sql`
- `20260524000000_kael_final_price_authority.sql`
- `20260524010000_worker_approved_notification_trigger.sql`
- `20260524105341_pr29_workflow_risk_fixes.sql`

## Active P3-P17 Chain

| Phase | Migration | Purpose |
| --- | --- | --- |
| P3 | `20260525101441_ai_provider_routing.sql` | Provider routing catalog and AI routing controls. |
| P3 | `20260525101442_jobs_kael_progress.sql` | Job-level Kael progress events for realtime tracking. |
| P3 | `20260525104648_kael_vision_latency_buffer.sql` | Vision latency and pipeline tolerance buffer. |
| P4 | `20260525111707_kael_output_format_p4.sql` | Estimate card v3, worker brief fields, worker Q&A log. |
| P5 | `20260525113639_kael_permission_policy_p5.sql` | Permission policy and advisory audit surfaces. |
| P6 | `20260525114839_kael_memory_governance_p6.sql` | Memory budget, audit, self-view, self-delete. |
| P7 | `20260525121445_kael_learning_skills_p7.sql` | Learning skill registry and rule lifecycle tables. |
| P7 | `20260525122335_consolidate_kael_memory_read_policies.sql` | Consolidated memory read policies. |
| P8 | `20260525124010_kael_charter_audit_p8.sql` | Charter audit and response style enforcement. |
| P10 | `20260525132115_kael_demanding_customer_case_p10.sql` | Demanding-customer queue, interaction log, safety patterns. |
| P11 | `20260525140826_kael_worker_cancel_case_p11.sql` | Worker cancellation reason taxonomy, atomic RPC, anti-abuse review. |
| P11 | `20260525230054_fix_worker_no_show_reason_code_ambiguity.sql` | Worker no-show reason-code ambiguity fix. |
| P12 | `20260525231655_kael_customer_cancel_case_p12.sql` | Customer cancellation taxonomy, records, atomic RPC. |
| P12 | `20260525233112_fix_customer_cancel_scope_change_table_p12.sql` | Scope-change table compatibility fix. |
| P12 | `20260525233322_fix_customer_cancel_records_rls_p12.sql` | Customer cancellation records RLS fix. |
| P13 | `20260525234746_kael_dispute_case_p13.sql` | Evidence snapshots, disputes, immutable evidence, admin decision RPCs. |
| P14 | `20260526002253_backend_gaps_cleanup_p14.sql` | api_logs purpose invariant, worker district seed cleanup, orphan analyzing cron cleanup. |
| P14 | `20260526003315_fix_worker_cancellation_reason_category_ambiguity_p14.sql` | Follow-up for Supabase lint: qualifies P11 worker cancellation `reason_category` references. |
| P17 | `20260526012712_kael_p17_monitoring_ab_setup.sql` | Monitoring dashboard views and running A/B #6 experiment shell for `price_synthesis`. |
| Section 24 Q1 | `20260526090000_kael_cost_optimization_q1.sql` | Cost dashboard views, quality baseline table, and per-call optimization metric telemetry. |
| Section 25 R5 | `20260526195300_source_trust_registry_f26.sql` | Source trust registry with Tier 1 seed domains and admin RLS. |
| Plan 26 F7 | `20260526203000_f26_fk_performance_indexes.sql` | Covering indexes for remaining advisor-reported unindexed foreign keys. |
| Plan 26 F7 | `20260526203100_f26_drop_unused_indexes.sql` | Drop advisor-reported zero-scan secondary indexes while retaining FK-supporting indexes. |

## P14 Notes

- `api_logs.purpose` is backfilled and set `not null`; future provider logs must supply a purpose.
- Worker seed data removes broad `hcmc_all` only when concrete districts are already present.
- Orphan analyzing cleanup is a database function scheduled through Supabase Cron (`pg_cron`) using `cron.schedule`.
- Direct writes to `cron.job` are intentionally avoided.
- Supabase `db lint` is part of the P14 gate. If it reports PL/pgSQL output-column shadowing in older RPCs, add a forward migration that replaces the function with qualified table aliases instead of editing already-applied migrations.
