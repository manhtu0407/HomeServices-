# Loop Learning Deploy Handoff — 2026-07-20

Deploy runbook for the deterministic learning-loop fix (branch `worktree-loop-learning-production-fix`, base `e275530eb` = origin/main). Executor: Tu. Every step that mutates staging/production is Tu's call; nothing here auto-runs.

## What ships

Post-A14 reviews now feed `record_learning_observation_atomic` directly from the Edge runtime (`_shared/kael/learning-hook.ts` wired in `completion-review.service.ts`). Evidence counts come from real `jobs`/`reviews` rows, never from model output. The LLM batch path can no longer promote: responses are pinned to their queue row (`LEARNING_CANDIDATE_MISMATCH`). Complexity-rule applications are now logged so auto-rollback can trigger; `satisfaction_delta` is a real drop in rating points vs a ≥3-sample baseline.

No new migration. No new secret value — one new flag name.

## Environment truth (checked live 2026-07-20 via Supabase MCP)

| | Staging `xyylanuyflrjzbjzhqfl` | Production `iwevizmsedyqozxlawwl` |
|---|---|---|
| Migrations | through `20260719035350` — all 5 learning RPCs present | **stops at `20260707051654` — 46 migrations behind; only `rollback_learning_rule` exists** |
| `mobile-api` version | v153 | v30 (deployed ~2026-06-05) |
| Verdict | **ready for this deploy** | **NOT deployable for this change** — needs the full migration catch-up first, which is a separate, larger operation (`ops/production-migration-checklist.md`) |

Do not deploy current Edge code to production before that catch-up: v30 → current jumps ~6 weeks of code that assumes the missing schema.

## Staging deploy (the actual runbook)

1. **Confirm flag state** in Dashboard → Edge Functions → Secrets:
   `KAEL_LEARNING_READ_ENABLED`, `KAEL_LEARNING_WRITE_ENABLED`, `KAEL_LEARNING_KILL_SWITCH`, `KAEL_LEARNING_AB_PERCENTAGE`, `KAEL_OPT_BATCH_LEARNING_ENABLED`, `KAEL_OPT_BATCH_API_ENABLED`. Keep `KAEL_OPT_BATCH_*` **false**.
2. **Do NOT set** `KAEL_LEARNING_AUTOPROMOTE_ENABLED` yet. Unset = observe-only: the hook records observations/candidates (when WRITE flags are on) but never promotes.
3. **Deploy**: `supabase functions deploy mobile-api --project-ref xyylanuyflrjzbjzhqfl` from this branch's checkout.
4. **Smoke (observe mode)**: run one job through completion → review on staging, then:
   ```sql
   select count(*) from learning_observation_receipts where reviewed_at > now() - interval '1 hour';
   select id, candidate_type, evidence_count, confidence, status
     from learning_candidates order by updated_at desc limit 5;
   ```
   Expect: receipts row(s) appear; candidate `evidence_count` grows by at most 1 per reviewed job; review API response unchanged; no `mobile-api learning hook failed` in Edge logs.
5. **Enable promotion** (staging only, when a scope has ≥5 reviewed jobs): set `KAEL_LEARNING_AUTOPROMOTE_ENABLED=true`, redeploy nothing (env change suffices), review again in that scope, then:
   ```sql
   select id, rule_type, status, active_version from learning_rules order by created_at desc limit 5;
   select next_state, transition_reason from kael_rule_lifecycle_log order by created_at desc limit 5;
   ```
6. **Rollback path**: unset `KAEL_LEARNING_AUTOPROMOTE_ENABLED` (stops promotion), or `KAEL_LEARNING_KILL_SWITCH=true` (stops the whole loop), or `rollback_learning_rule` RPC per rule. Redeploy previous Edge version only if the hook itself misbehaves.

## Verification evidence for this branch

- Clean worktree (base `e275530eb` + only this change): full `apps/api` vitest **2968/2969 pass**; the 1 fail is `privileged-admin-script-safety` tripping its own realpath guard on a node_modules junction used for the test run — passes with a physical `node_modules` (verified in main checkout). Run `pnpm install` in this worktree before re-verifying locally.
- `deno check index.ts` (full Edge graph): clean. `lint:comments` / `lint:structure`: clean.
- Known-failing-at-HEAD, unrelated: none besides the junction artifact above.

## Out of scope

Production migration catch-up (46 migrations, `20260708`→`20260719`) and the production Edge jump v30→current. Schedule as its own operation with `ops/production-migration-checklist.md`.
