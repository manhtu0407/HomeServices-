# W06 — Durable Workflow State & Checkpoints

Baseline: `e1e0cabbc7432240fc3d8a81f83bb08b8b5c7138` (W04/W05, PR #407).
Branch: `codex/kawa02-durable-checkpoints-20261023`. Candidate identity is the publication commit containing this checkpoint; exact head/PR are recorded in the final operator report.

## Implementation and scope

One additive migration creates three private tables for immutable definitions, instances and append-only checkpoint/event receipts, plus one service-only RPC. No existing table, RPC, RLS policy or grant is changed. Public generated types add only the RPC signature. Canonical inventory/access manifests and pillar index are generated outputs; gate implementations remain untouched.

The domain adapter uses the accepted W04 registry, binds actor ID/role to the authenticated server principal, validates requests/responses, bounds transport waiting and restores pinned historical definitions without requiring a mutable current registry entry. No live route imports it. The RPC writes workflow metadata only; approval, capability execution and emission nodes are hard stop boundaries. There is no W07 receipt authority, W08 bridge/outbox, provider call or business mutation.

Scope checks lock the existing actor/resource rows during each transaction. UUID references intentionally impose no FK on existing profiles/jobs/Cases: a red-first deletion test proved that such an FK would obstruct existing deletion. Both Customer and Worker Case deletion and the existing account-deletion suite now pass. The new private schema stores bounded definition/state metadata and IDs, never raw prompt/input values. Strict database JSON-schema validation complements W04 registry graph validation. Retention/cleanup policy and live integration remain separate reviewed release work.

## Executed evidence

- Fresh canonical replay: 456 migrations, including W06, exit 0 on the uniquely owned `nestscout-kawa06-20261023` local project (API 61321, DB 61322). No hosted link or hosted migration.
- P434: 36 unit/security-negative cases; W04/P432 + W05/P433 + W06/P434: 98/98, exit 0.
- API regression: 5791 Vitest pass/7 skipped; 115 Node pass/1 skipped, dispatcher exit 0. Shared: 189 pass, exit 0. Skips are not acceptance evidence.
- P435 transactional SQL: create/version pins, checkpoint, replay/conflicting idempotency, invalid transitions, event order/instance/kind, deadlines, terminal protection, retry/backoff/exhaustion, forced insert failure rollback, Customer/Worker/Admin/Admin-operator scope, private grants/RLS, immutable history and existing Case deletion pass.
- P436 real two-connection races: one CAS winner and one 40001 loser; concurrent duplicate delivery returns one logical receipt and two history rows (initial + transition). Removing CAS produced two committed versions; the mutation was caught.
- Existing SQL regression: workflow recovery capacity, durable confirmation, six-service confirmation, manual bank reconciliation, bank-reference concurrency, account deletion and per-actor security: seven scripts pass. Total selected SQL scripts: nine.
- Actual database process restart preserves the pinned definition, checkpoint and history. A specifically identified test backend was terminated during an open transaction; state/history rolled back. Discarded post-commit transition output was recovered by replay with the same key. Terminal state remains durable. Discarded create-result recovery was not separately exercised; ordinary create idempotency is covered by P435.
- Actual pinned Deno adapter + Supabase client + isolated local REST/SQL path: create 0 → terminal 1 → identical duplicate receipt → fresh-store restoration with two checkpoints, PASS.
- Three mutation controls caught: strict input validation, SQL CAS, conflicting idempotency. Source and local function restored; final SQL/98 focused tests passed after restoration.
- API/Shared types and direct strict Deno check pass. Edge-to-DB catalog query: all 266 scannable RPCs present, zero unscannable sites. Generated public type regeneration matches the split tree.

Raw commands/results, red-first records, source digests and bounded recovery/concurrency helpers are beside this report. Clean-commit pre-push ship result, final PR/CI/review and secret-scan receipt are publication gates and are recorded by the operator handoff; this document does not turn a pending gate into a pass.

## Compatibility, rollback and remaining acceptance

Existing v1 Production behavior is preserved; no shadow traffic is enabled. Rollback is to stop using/remove the unwired adapter while retaining additive private history and referenced definition versions. There is no hosted schema or business effect to reverse; do not delete history or change existing payment/approval RPCs as rollback.

W06 is verified at local T0/T1 for this bounded persistence foundation. Human independent review and CI remain publication/merge acceptance, not device or Production proof. W04/W05 are published as PR #407 without merge. Its ordinary CI/workspace/database succeeded; the separate release workflow failed `Verify immutable main identity` (run 39887287811), so overall merge readiness is not green. The log does not distinguish which assertion inside that step failed; no workflow change is included here.

Historical Backend release drift and H5 acceptance remain unresolved separate matters. No merge, deployment, hosted migration, release, real actor action, paid model call or KAWA_03 work occurred. W07 and W08 are NOT_RUN. Protected live Plan and repository/personal memory remain untouched; a memory draft is shown separately for owner approval.

Final review tightened the creation deadline to the minimum of definition deadline and pinned duration budget; the dedicated red/green SQL control is preserved. The bounded final replay and all nine SQL scripts, restart/interruption recovery and live local adapter verification passed again on the final schema. Owned test stack stopped with volume preserved; other running container identities matched before/after.

Secret scan: pinned Gitleaks scanned the complete staged W06 source/evidence snapshot (1.23 MB), exit 0, no findings. See gitleaks-clean.log.txt. No scanner configuration or exemption was changed.
