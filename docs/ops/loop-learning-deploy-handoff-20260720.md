# Loop Learning Deploy Handoff — 2026-07-20

Deploy runbook for the deterministic learning-loop fix (branch `worktree-loop-learning-production-fix`, base `e275530eb` = origin/main). Executor: Tu. Every step that mutates staging/production is Tu's call.

**One thing does run on a schedule once deployed.** Migration `20260721105000` installs a daily `kael-learning-monitor` pg_cron job (02:00 UTC / 09:00 ICT) that posts to the `kael-learning-monitor` Edge Function. It stays uninstalled until both Vault secrets exist (`project_url`, `kael_learning_monitor_secret`), so applying the migration alone changes nothing.

**Before provisioning those secrets, set `KAEL_LEARNING_AUTO_ROLLBACK=false`.** That flag defaults to *true*: with it unset, the first scheduled run is allowed to roll back a rule on its own. With it false the run is observe-only and returns `loop_health` (overdue manual reviews, failed queue rows, failed batches). Turn rollback on only after real transaction data has accumulated and the health output has looked sane for a couple of weeks.

To stop it: `select cron.unschedule('kael-learning-monitor');` or remove the Vault secret.

## What ships

Post-A14 reviews now feed `record_learning_observation_atomic` directly from the Edge runtime (`_shared/kael/learning-hook.ts` wired in `completion-review.service.ts`). Evidence counts come from real `jobs`/`reviews` rows, never from model output. The LLM batch path can no longer promote: responses are pinned to their queue row (`LEARNING_CANDIDATE_MISMATCH`). Complexity-rule applications are now logged so auto-rollback can trigger; `satisfaction_delta` is a real drop in rating points vs a ≥3-sample baseline.

No new migration. No new secret value — one new flag name.

## Environment truth (checked live 2026-07-20 via Supabase MCP)

| | Staging `xyylanuyflrjzbjzhqfl` | Production `iwevizmsedyqozxlawwl` |
|---|---|---|
| Migrations | through `20260719035350` — all 5 learning RPCs present | **stops at `20260707051654` — 46 migrations behind; only `rollback_learning_rule` exists** |
| `mobile-api` version | v153 | v30 (deployed ~2026-06-05) |
| Verdict | **DEPLOYED — mobile-api v154, smoke passed** | **NOT deployable for this change** — needs the full migration catch-up first (see the production section below) |

Do not deploy current Edge code to production before that catch-up: v30 → current jumps ~6 weeks of code that assumes the missing schema.

## Staging result (executed 2026-07-20)

`mobile-api` deployed from this branch, **v153 → v154**, function ACTIVE. Flags confirmed unchanged; `KAEL_LEARNING_AUTOPROMOTE_ENABLED` deliberately not set, so the hook is observe-only.

Observation engine smoke-tested directly against the deployed schema using the one real reviewed job on staging (`plumbing / pipe_leak / q7`, rating 5):

| Call | Result |
|---|---|
| 1st `record_learning_observation_atomic` (`price_prior_update`) | `ok=true`, `is_new=true`, `evidence_count=1`, `confidence=0.95` |
| 2nd identical call | `ok=true`, `is_new=false`, **`idempotent=true`, `evidence_count` stayed 1** |
| same job as `analysis_rule` | `ok=false`, `error_code=NO_SIGNAL_YET` (correct: rating 5, no scope change → no signal) |

That is the F2 fix demonstrated on real infrastructure: evidence came from the `jobs`/`reviews` rows, replay did not inflate the count, and a no-signal case was refused rather than invented. Test rows (1 receipt, 1 candidate) were deleted afterwards; staging returned to 1 pre-existing candidate / 1 pre-existing rule, 0 receipts.

Not yet exercised on staging: promotion (needs ≥5 reviewed jobs in one scope — staging has 1), and the hook firing through a real HTTP review call.

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

## Production catch-up — analysed, NOT applied

Production needs 46 migrations (`20260710082120` → `20260719035350`) before any of this can ship there. I analysed the chain read-only and stopped at the apply gate. Reasons are concrete, not caution-theatre:

**1. Production holds real data now.** 4 auth users, 4 profiles, 25 jobs (16 plumbing / 5 electrical / 4 cleaning), 9 storage objects. `ops/production-migration-checklist.md` lists "production has real app data and no backup/export exists" as an explicit **stop condition**, and its apply preconditions require a Tu-approved backup first. The historical evidence in that checklist was written when production had 0 rows — it no longer applies.

**2. The chain requires per-migration transaction boundaries.** `20260711030833_six_service_casework_foundation.sql` runs `alter type public.service_type add value 'hvac'` (also `upholstery`, `handyman`), and `20260711060000_six_service_taxonomy_verified_prices.sql` then **uses** `'hvac'::public.service_type` in INSERTs. Postgres forbids using an enum value in the transaction that added it. Applying these two in one transaction fails with `unsafe use of new value "hvac"`. `supabase db push` gets this right per-file; a bulk paste does not. **Do not batch.**

**3. Apply requires the production DB password**, which I must not handle. This is Tu's step by construction.

Verified low-risk findings (so the apply is less scary than it looks):
- Production enum is still `{electrical, plumbing, cleaning}` — the chain is genuinely needed and `add value` is additive, so the 25 existing jobs stay valid.
- The chain's only destructive data statement, the duplicate-dedup `delete from public.device_push_tokens` in `20260714084815`, is a **no-op**: production has 0 push tokens.
- No `drop table` / `truncate` / new `set not null` against `jobs`, `profiles`, or `reviews` anywhere in the 46.
- Security advisor on production is currently clean except the long-standing `auth_leaked_password_protection` WARN.

### Procedure (Tu executes)

```powershell
# repo-local CLI 2.98.2 (already installed, already authenticated)
$cli = "<repo>\node_modules\.pnpm\supabase@2.98.2*\node_modules\supabase\bin\supabase.exe"
$env:SUPABASE_DB_PASSWORD = "<production-db-password>"   # process env only, never a file
& $cli link --project-ref iwevizmsedyqozxlawwl
& $cli db push --dry-run --linked
```

Stop unless the dry-run lists **exactly** these 46 and nothing else: `20260710082120`, `20260710082345`, `20260710123000`, `20260711030833`, `20260711033644`, `20260711050000`, `20260711053000`, `20260711060000`, `20260711061000`, `20260711062000`, `20260711063000`, `20260711064000`, `20260711065000`, `20260711066000`, `20260711067000`, `20260712031420`, `20260712042000`, `20260712124241`, `20260713042558`, `20260713051818`, `20260713124007`, `20260713132500`, `20260713143000`, `20260713163851`, `20260714024500`, `20260714074000`, `20260714080000`, `20260714084815`, `20260714092842`, `20260714101000`, `20260714102000`, `20260714103000`, `20260714104000`, `20260714105000`, `20260714106000`, `20260714107000`, `20260714108000`, `20260714109000`, `20260714110000`, `20260714111000`, `20260715011209`, `20260715105143`, `20260715113000`, `20260715114000`, `20260715115000`, `20260716121927`, `20260719013933`, `20260719035350`.

Then, after taking a backup: `& $cli db push --linked`, and immediately `& $cli link --project-ref xyylanuyflrjzbjzhqfl` to restore the staging link.

Post-apply checks: security + performance advisors clean (bar the known Auth warning); `select count(*) from jobs` still 25; the 5 learning RPCs present. Only then decide on the Edge jump v30 → current, which is its own risk review — six weeks of code, not just this change.
