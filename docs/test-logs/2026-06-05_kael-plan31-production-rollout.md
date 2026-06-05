# Kael Plan 31 Production Rollout

Date: 2026-06-05
Scope: Promote Plan.md Section 31 Kael AI core database, flags, and `mobile-api` Edge runtime from staging-proven state to production.

## Result

Passed. Production `iwevizmsedyqozxlawwl` now has the Plan31 core migration chain, two production post-advisor fix migrations, Plan31 runtime flags, and `mobile-api` redeployed after flag enablement.

## Target

- Production project ref: `iwevizmsedyqozxlawwl`.
- Production function URL: `https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api`.
- Temporary rollout workdir: `tmp/supabase-production-plan31-20260605`.
- Root repo link was observed as production; rollout still used the temporary workdir to avoid accidental staging/production confusion.

## Preflight

- Authority stack and protocols reloaded: `critical.md`, `RULES.md`, `STRUCTURES.md`, `AGENTS.md`, `CLAUDE.md`, `protocols/ai-data-security.md`, `protocols/tdd.md`, ownership map, production checklist, Plan31 docs, and `MEMORY.md` last.
- Production baseline before apply:
  - migration total: `92`
  - latest migration: `20260604100550`
  - Plan31 core count: `0`
  - worker safety/legal/service knowledge rows: `3 / 2 / 3`
  - Plan31 RPCs absent: `apply_kael_autonomy_decision`, `match_kael_knowledge`, `promote_learning_candidate`, `rollback_learning_rule`
- Production app data existed before apply, so no production fixture E2E was created:
  - `profiles=3`, `customer_profiles=1`, `worker_profiles=1`, `jobs=24`, `job_events=73`, `job_broadcasts=1`, `api_logs=71`
- Docker-based `supabase db dump` was unavailable because Docker Desktop was not running. A scoped non-PII backup/export was created under `tmp/supabase-production-plan31-20260605/backups/`.
- Pre-apply gates:
  - security advisor: only existing `auth_leaked_password_protection`
  - performance advisor: no issues
  - schema lint: no schema errors
  - dry-run: exact 17 Plan31 migrations, no unexpected migration

## Local Gates Before Apply

- `apps/api: tsc --noEmit`: passed
- `apps/api: vitest run`: 89 files passed, 1453 tests passed, 3 files / 59 tests skipped
- `packages/shared: tsc --noEmit`: passed
- `packages/shared: vitest run`: 15 files passed, 586 tests passed
- `apps/mobile: tsc --noEmit`: passed
- `apps/mobile: jest --runInBand`: 14 suites passed, 134 tests passed

## Final Local Gates After Production Fixes

- `apps/api: vitest run`: passed after the production fix migrations, 89 files / 1454 tests passed, 3 files / 59 tests skipped.
- `apps/api: next build --webpack`: passed; compiled successfully and generated 14 static pages.
- `apps/api: next build` using default Turbopack: blocked by local Windows process-spawn permission (`Access is denied`) while processing `globals.css`; webpack build was used as the build evidence.
- `turbo build`: blocked in this shell because Turbo could not resolve the package-manager binary; package-level API build above passed.
- high-entropy secret scan: no persisted `pplx-...` or Supabase service-role token found outside ignored `tmp`/`.git`/`node_modules`.

## Production Apply

Applied the exact 17 Plan31 migrations:

- `20260604160000_promote_learning_candidate_rpc.sql`
- `20260604170000_rollback_learning_rule_rpc.sql`
- `20260604180000_learning_candidate_manual_review_status.sql`
- `20260604181000_learning_candidate_admin_review_rpc.sql`
- `20260604203000_kael_b3_knowledge_corpus.sql`
- `20260604210000_kael_b4_knowledge_governance.sql`
- `20260604213000_kael_b5_pgvector_rag.sql`
- `20260604214000_kael_b5_embedding_backfill.sql`
- `20260604220000_kael_c_autonomy_audit_apply.sql`
- `20260604221500_kael_d_guardrail_trip_audit.sql`
- `20260604223000_kael_chat_session_progress.sql`
- `20260604224500_kael_worker_chat_sessions.sql`
- `20260604225500_worker_kael_feedback_consent.sql`
- `20260604230500_scope_change_kael_progress.sql`
- `20260604231500_disintermediation_admin_queue.sql`
- `20260604232500_apartment_access_release.sql`
- `20260605001000_fix_kael_rollback_learning_rule_ambiguity.sql`

Post-apply dry-run returned `Remote database is up to date`.

## Production Audit Fixes

The first post-apply advisor/lint pass found production-only quality gaps. Both were fixed with forward migrations, then applied to production:

- `20260605003000_fix_plan31_post_advisor_warnings.sql`
  - fixed `private.kael_b4_json_int` and `private.kael_b4_service_label_vi` mutable `search_path`
  - fixed `kael_chat_pre_intake_memory` RLS initplan by using `(select auth.uid())` / `(select private.is_admin())`
- `20260605004000_fix_plan31_rpc_lint_warnings.sql`
  - used promotion RPC actor/job audit params in `kael_rule_lifecycle_log.safe_metadata`
  - removed the unused `v_job` variable from `apply_kael_autonomy_decision`

Focused regression tests passed:

- `mobile-api-edge-schema.test.ts`: 68 tests passed
- `kael-q1-cost-optimization.test.ts` + `kael-c-autonomy-supabase.test.ts`: 13 tests passed

## Flags And Edge

Plan31 production flags were set by name only; no raw secret values were read or written to docs:

- `KAEL_LEARNING_READ_ENABLED`
- `KAEL_LEARNING_WRITE_ENABLED`
- `KAEL_LEARNING_KILL_SWITCH`
- `KAEL_LEARNING_AB_PERCENTAGE`
- `KAEL_LEARNING_AUTO_ROLLBACK`
- `KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED`
- `KAEL_AUTONOMY_FULL_ENABLED`

Edge deploys:

- Pre-rollout production `mobile-api`: v22
- First Plan31 deploy: v23
- Final redeploy after setting flags: v25, status `ACTIVE`

## Final Production Snapshot

- migration total: `111`
- latest migration: `20260605004000`
- Plan31 core count: `17`
- Plan31 rows:
  - `worker_safety_patterns=26`
  - `legal_awareness_patterns=9`
  - `service_knowledge_boxes=3`
  - `learning_rules=0`
  - `learning_candidates=0`
  - `kael_rule_lifecycle_log=0`
  - `kael_autonomy_decision_audit=0`
  - `kael_guardrail_trip_audit=0`
  - `kael_knowledge_usage_log=0`
- RPCs present:
  - `apply_kael_autonomy_decision`
  - `match_kael_knowledge`
  - `promote_learning_candidate`
  - `rollback_learning_rule`

Production app row counts remained unchanged from pre-smoke counts, confirming no fixture residue:

- `profiles=3`, `customer_profiles=1`, `worker_profiles=1`, `jobs=24`, `job_events=73`, `job_broadcasts=1`, `api_logs=71`
- zero rows remained in `chat_messages`, reviews, cancellation records, disputes, and evidence snapshots.

## Smoke

- `GET /kael/charter`: HTTP `200`, `charter_version="2026-05-25.p8"`.
- `match_kael_knowledge` production smoke:
  - match count: `5`
  - similarity range: `0.787221..1`
  - citations included electrical safety and plumbing post-repair rows.
- `apply_kael_autonomy_decision` negative smoke:
  - returned `ok=false`, `error="audit_not_found"`
  - no job or user fixture was created.

## Final Remote Gates

- `supabase db push --dry-run --linked`: remote database up to date.
- `supabase db lint --linked`: no schema errors found.
- security advisors: only existing `auth_leaked_password_protection`.
- performance advisors: no issues found.
- production secrets list confirmed Plan31 flag names and provider key names were present without exposing raw values.

## Limitations

- Production auth-gated E2E with synthetic users/jobs was intentionally not run because production already has real app data; this rollout used no fixture creation and no cleanup mutation.
- Native iOS/Android UI validation is separate frontend evidence.
- `deno check` was not available in this shell.
- A5 live-provider eval mode was not rerun against production; deterministic A5/B6 and staging P15 E2E remain the behavioral proof.
- Root `turbo build` and default Turbopack build were blocked by local Windows/package-manager execution constraints; API `next build --webpack` passed.
