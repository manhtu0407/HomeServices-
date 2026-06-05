# Kael Plan 31 Staging Apply And K-FINAL Evidence

Date: 2026-06-05
Scope: Plan.md Section 31 PR #58 continuation after the local final gates.

## Result

Staging evidence is now present for Plan31 core database/Edge rollout and the full P15 staging E2E harness. This report does not claim production rollout. It records the staging proof, the audit bugs found while going deeper, and the gates rerun after each fix.

## Staging Target

- Staging project ref: `xyylanuyflrjzbjzhqfl`.
- Production project ref observed but not linked/mutated: `iwevizmsedyqozxlawwl`.
- Supabase CLI was run through a temporary staging workdir: `tmp/supabase-staging-readonly`.
- `supabase projects list` showed staging linked in the temp workdir; production remained unlinked there.

## K0 Baseline

- Pre-apply Plan31 migration count on staging: `0`.
- Pre-apply totals:
  - `learning_rules_total=0`
  - `learning_candidates_total=0`
  - `kael_rule_lifecycle_log_total=0`
  - `kael_learning_queue_total=0`
  - `worker_safety_patterns_total=3`
  - `legal_awareness_patterns_total=2`
  - `service_knowledge_boxes_total=3`
- Pre-apply service boxes existed for `electrical`, `plumbing`, and `cleaning`.
- Supabase advisors:
  - Security: existing Auth leaked password protection warning.
  - Performance: no issues.

## Migration Drift Fixed

Dry-run initially found remote migrations already present in staging but absent locally. The source history was restored by adding these local files:

- `20260604090000_revoke_anon_public_grants.sql`
- `20260604090100_revoke_residual_authenticated_dml.sql`
- `20260604090200_harden_default_privileges_public.sql`
- `20260604091224_harden_public_grants_followup.sql`
- `20260604093025_harden_global_function_default_privileges.sql`
- `20260604095731_combine_customer_kael_feedback_select_policy.sql`
- `20260604100550_revoke_authenticated_table_ddl_privileges.sql`

Focused schema tests passed after restoring the migration history.

## Staging Apply

The first staging `db push` applied 15 Plan31 migrations and failed on `20260604232500_apartment_access_release.sql` because it referenced `private.set_updated_at()`, which does not exist on staging.

Fix applied:

- `20260604232500_apartment_access_release.sql` now uses the existing `update_updated_at()` trigger function.
- Regression assertion added to `mobile-api-edge-schema.test.ts`.

After the fix, the final Plan31 migration applied successfully.

Additional audit found the A3 rollback RPC failed at runtime because `learning_rule_versions.rule_id` was ambiguous against the function output parameter. Fix applied:

- `20260604170000_rollback_learning_rule_rpc.sql` now aliases `learning_rule_versions as version_row`.
- New staging fix migration: `20260605001000_fix_kael_rollback_learning_rule_ambiguity.sql`.
- Regression assertions added to `kael-q1-cost-optimization.test.ts`.

Post-apply migration count:

- Plan31 plus fix migrations: `17`.
- First: `20260604160000`.
- Last: `20260605001000`.

## Staging Flags And Edge

Staging flags were set by name only; raw values were not logged:

- `KAEL_LEARNING_READ_ENABLED`
- `KAEL_LEARNING_WRITE_ENABLED`
- `KAEL_LEARNING_KILL_SWITCH`
- `KAEL_LEARNING_AB_PERCENTAGE`
- `KAEL_LEARNING_AUTO_ROLLBACK`
- `KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED`
- `KAEL_AUTONOMY_FULL_ENABLED`
- Existing `PERPLEXITY_API_KEY` remained present in staging secrets.

Edge deploys:

- `mobile-api` version `90` after the first Plan31 deploy.
- `mobile-api` version `91` after adding the C3 autonomy audit hook.

Public smoke:

- `curl https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api/kael/charter` returned HTTP 200 with `charter_version: "2026-05-25.p8"`.

## Remote DB Proofs

Post-apply row/RPC snapshot:

- `worker_safety_patterns_total=26`
- `legal_awareness_patterns_total=9`
- `service_knowledge_boxes_total=3`
- RPCs present: `apply_kael_autonomy_decision`, `match_kael_knowledge`, `promote_learning_candidate`, `rollback_learning_rule`.
- Each `service_knowledge_boxes` row includes problem-hint metadata.

Focused smoke proofs:

- B5 `match_kael_knowledge` returned `match_count=5`, citations including electrical safety and legal redirect rows, similarity range `0.7551..1.0000`.
- A1/A3 promotion then rollback succeeded on a `codex_plan31_smoke_only` scope:
  - `promote_ok=true`
  - `rollback_ok=true`
  - final rule status verified separately as `rolled_back`
  - lifecycle rows verified as `3`
- C negative gate smoke returned `audit_not_found` for a random audit id.
- C3 audit smoke row inserted with `gate_result=allow`, `reason_code=ALLOW_AUTONOMY_DECISION`, `resulting_event=kael_started_matching`; no job/user attached.
- D guardrail smoke row inserted with `reason_code=CODEX_PLAN31_SQL_SMOKE`, `source=self_check`; no job/user attached.

## K-FINAL E2E

Full P15 staging E2E passed after harness updates for Plan31 autonomy behavior.

Report: `docs/test-logs/2026-06-05_kael-plan31-p15-staging-e2e.md`.

Highlights:

- Status: `passed`.
- Matrix:
  - normal transaction: `10`
  - demanding customer: `5`
  - worker cancellation: `10` (`5` explicit, `5` no-show)
  - customer cancellation: `5`
  - dispute: `3`
- Realtime `kael_progress`: verified.
- Intake p95: `9381ms` under the `12000ms` limit.
- Worst transaction cost: `$0.000079` under the `$0.30` limit.
- Provider rows: `40`; jobs with API logs: `20`.
- Cleanup: `ok=true`, all tracked counts `0`.

Harness fixes made during the audit:

- Accept Plan31 autonomy v2 create-job behavior where `/jobs` can return `broadcasting` immediately.
- Accept worker completion auto-confirming to `confirmed_by_customer`.
- Require `P15_SUPABASE_WORKDIR` for cleanup so mutable staging cleanup never depends on a root workdir linked to another project.
- Add run-id based cleanup for jobs inserted before the response returns.
- Add failure diagnostics that capture autonomy audit reason codes before cleanup.

## Verification Commands

- `apps/api: vitest run src/__tests__/schema/kael-q1-cost-optimization.test.ts` passed `9/9`.
- `apps/api: vitest run src/__tests__/schema/kael-p15-staging-harness.test.ts` passed `2/2`.
- `apps/api: vitest run src/__tests__/unit/mobile-api-kael-orchestrator-facade.test.ts src/__tests__/unit/mobile-api-kael-autonomy-gate.test.ts` passed `9/9`.
- `apps/api: tsc --noEmit` passed after the C3 audit hook.
- `node --check apps/api/scripts/kael-p15-staging-e2e.mjs` passed.
- `git diff --check` for touched migration/harness/Edge files passed with CRLF warnings only.

## Remaining Non-Production Notes

- This is a staging rollout and E2E proof, not a production deploy.
- Native iOS/Android full visual journey proof remains separate frontend evidence.
- Deno check could not run because `deno` is unavailable in this shell.
