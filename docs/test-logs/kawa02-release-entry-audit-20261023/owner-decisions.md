# KAWA_02 owner decisions - reviewable scope

Baseline: `4ee3a732d5ddd724d5055465664f8d5c1b0af0ce`.
Isolated worktree: `C:\ns-fix\kawa02`.

## Decision 1 - limited entry acceptance

The existing KAWA ledger and owner-integration report do not contain formal Master Plan 01 completion. They explicitly retain H5 11/29 reproduction, independent model validation not run, and unproved T1 approval concurrency/RLS. PR merges do not discharge those acceptance conditions.

Proposed acceptance: permit W04 schema/registry and W05 offline read-only shadow development and verification only, preserving those unresolved safety and database gates. This does not accept Plan 01 as complete, authorize v2 traffic, W06 persistence, hosted operations, paid calls, or native/Production acceptance.

## Decision 2 - path and ownership approval

Proposed W04 files under existing shared-contract owners:

- `packages/shared/src/contracts/workflow-definition.ts`
- `supabase/functions/_shared/contracts/workflow-definition.ts` (hand-maintained twin)
- `supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry.ts`
- `apps/api/src/__tests__/unit/workflow-definition-registry-pillar.test.ts` (unique registry-verified pillar ID).

Proposed W05 file under existing Edge pipeline owner:

- `supabase/functions/mobile-api/_shared/kael/pipeline/workflow-shadow-planner.ts`
- `apps/api/src/__tests__/unit/workflow-shadow-planner-pillar.test.ts` (immutable bounded proposals and zero effects).

No production route imports or live registration; no change to v1 orchestrator behavior, role policy, RPC grants, payment rail, provider configuration or RLS. W04 and W05 receive separate checkpoints. An import or adapter into live request routing requires its own reviewed scope.

Existing evidence owner: append to `docs/test-logs/kawa-execution-ledger.md`, not the PDF's proposed `docs/ops` ledger. Preserve `governance/Plan.md` and protected repository memory.

## Decisions deferred

W06 requires W04/W05 verification plus named server-owner and migration-safety approval. W07/W08 remain dependency-blocked. No authorization to commit, push, create PRs, deploy, write Production data, run hosted migrations, call paid APIs or send real notifications is requested here.

Until approval, preparation consists of source/contract mapping, read-only audit, existing regression runs, and a reviewable local-only candidate outside production roots. Such a candidate is not an accepted W04 implementation.
