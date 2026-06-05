# Kael Plan 31 Claude Review Follow-up

Date: 2026-06-05
Scope: Verify Claude review findings for Plan.md Section 31 and close the highest-risk autonomy/production gaps without touching unrelated Section 32 worktree changes.

## Result

Partial closure with production safety applied.

- Production `KAEL_AUTONOMY_FULL_ENABLED` was reset to `false`.
- Production backup table `public.worker_profiles_districts_backup_x3` was dropped with forward migration `20260605006000`.
- Local code now routes the current service autonomy policy call-sites through `runKaelAutonomyOrchestrator` and adds flag enforcement for C2 full-autonomy policy actions.
- Local tests prove flag OFF rejects full-autonomy policy actions and flag ON still allows gated paths.
- Not claimed: durable G1/G2/K-FINAL production closure on real live traffic. Production Plan31 learning/autonomy/guardrail/knowledge usage counters remain `0`.

## Claude Findings Checked

| Finding | Status | Evidence |
|---|---|---|
| Production full-autonomy flag was enabled too early | Fixed in production | `supabase secrets list --project-ref iwevizmsedyqozxlawwl` showed `KAEL_AUTONOMY_FULL_ENABLED` digest equal to the known `false` digest and equal to `KAEL_LEARNING_KILL_SWITCH` |
| Invariant gate was wired to too few service decision sites | Fixed locally, not deployed in this follow-up | `services.ts` now uses `runPolicyAutonomyGate` for customer cancellation, worker cancellation, worker completion confirmation, scope auto-approval, customer scope decision, and customer completion confirmation |
| Customer/worker cancellation had mutation-before-audit order | Fixed locally | New cancellation requests now read existing rows first, then write `kael_autonomy_decision_audit`, then call the mutating cancellation RPC. Runtime tests assert audit-before-RPC order for both customer and worker cancellation. |
| Production rollout lacks real durable live closure rows | Confirmed, not claimed | Production query shows `learning_rules=0`, `learning_candidates=0`, `kael_autonomy_decision_audit=0`, `kael_guardrail_trip_audit=0`, `kael_knowledge_usage_log=0` |
| Temporary worker district backup table remained in production | Fixed in production | Migration `20260605006000_drop_worker_profiles_districts_backup_x3.sql`; production `to_regclass(...)` returned empty |
| Auth leaked-password protection warning | Still not fixed here | Local Supabase CLI v2.98.2 did not expose `advisors`; previous advisor finding remains a dashboard/Auth setting |

## Production Actions

Commands actually run:

- `supabase secrets set KAEL_AUTONOMY_FULL_ENABLED=false --project-ref iwevizmsedyqozxlawwl`
- Clean redeploy of committed Edge code from `C:\tmp\home-services-pr58-clean-54745f12` to avoid dirty worktree bleed.
- `supabase db push --linked --yes` from the clean worktree with only migration `20260605006000_drop_worker_profiles_districts_backup_x3.sql`.

Latest production verification:

- `supabase secrets list --project-ref iwevizmsedyqozxlawwl`: `KAEL_AUTONOMY_FULL_ENABLED` digest `fcbcf...`, same as `KAEL_LEARNING_KILL_SWITCH=false`.
- `supabase functions list --project-ref iwevizmsedyqozxlawwl`: `mobile-api` ACTIVE v28, updated `2026-06-05 06:12:57 UTC`.
- Production SQL query:
  - `backup_table=""`
  - `latest_migration="20260605006000"`
  - `learning_rules=0`
  - `learning_candidates=0`
  - `kael_autonomy_decision_audit=0`
  - `kael_guardrail_trip_audit=0`
  - `kael_knowledge_usage_log=0`
- `supabase db lint --linked`: no schema errors found.

## Local Code Follow-up

Changed locally:

- `supabase/functions/mobile-api/_shared/kael/autonomy-gate.ts`
  - Added `FLAG_GATED_FULL_AUTONOMY_ACTIONS`.
  - `process_cancellation`, `decide_scope_change`, `confirm_completion`, `decide_payment`, and `decide_dispute` now reject with `AUTONOMY_FULL_FLAG_OFF` when `KAEL_AUTONOMY_FULL_ENABLED=false`, including `source:"policy"`.
- `supabase/functions/mobile-api/_shared/services.ts`
  - Added shared `runPolicyAutonomyGate`.
  - Wired current policy decision sites through the facade gate.
  - Added pre-mutation cancellation gates for customer and worker cancellation. Duplicate cancellation requests return the existing row before audit/RPC; new requests audit the autonomy decision before calling `request_customer_cancellation_atomic` or `request_worker_cancellation_atomic`.
- `apps/api/src/__tests__/unit/mobile-api-kael-autonomy-gate.test.ts`
  - Added OFF/ON proof for C2 policy autonomy.
- `apps/api/src/__tests__/unit/mobile-api-edge-runtime.test.ts`
  - Updated fixtures for real `scope_changes` lookup and `kael_autonomy_decision_audit` insert order.
- `apps/api/src/__tests__/unit/mobile-api-kael-orchestrator-facade.test.ts`
  - Static proof now asserts all current service policy labels.

## Verification

- API targeted runtime/gate: passed, 3 files / 123 tests.
- API targeted schema/facade: passed, 4 files / 166 tests.
- API type-check: passed.
- Full API Vitest on this clean branch: passed, 89 files / 1456 tests, 3 files / 59 tests skipped.
- Production DB lint: passed, no schema errors.
- Secret scan for the provided Perplexity key: no real key match in repo; only dummy adversarial fixtures matched.
- `git diff --check`: exit 0 with CRLF warnings only.

## Remaining Risk

- Local gate/wiring code was not deployed in this follow-up because the main worktree also contains unrelated active Section 32 edits. Production code remains the clean committed v28 redeploy plus the production flag set to `false`.
- `decide_payment` and `decide_dispute` are guarded in the autonomy gate/RPC contract, but no live service route was added in this follow-up.
- Customer cancellation after `completed_by_worker` opens the dispute path and does not emit `process_cancellation` or change job status; that record insert remains outside the cancellation autonomy transition gate by design.
- Production live closure remains at zero durable rows; do not claim 100% live autonomy/learning closure until a staging or production transaction intentionally produces the required rows.
