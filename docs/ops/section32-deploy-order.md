# Section 32 — Deploy Order (must-apply migrations before the Edge deploy)

> **STATUS UPDATE 2026-06-10 (Claude, verified live via Supabase MCP):** STAGING (`xyylanuyflrjzbjzhqfl`) has ALL migrations #1–#7 + the same-batch three applied, plus the new `20260610075217_apartment_access_checkin_media_stage` (applied + CHECK/policy verified — it also fixes the pre-existing `scope_change_evidence` CHECK gap). **Staging `mobile-api` is still v100 (updated 2026-06-05)** — it predates the PR #64 authorize handshake and the 2026-06-10 changes, so the Edge redeploy + smoke (steps below) remain open. **PRODUCTION (`iwevizmsedyqozxlawwl`) was deliberately not touched** — this full checklist (now 8 migrations: #1–#7 + `20260610075217`) still applies verbatim before any production Edge deploy.

Date: 2026-06-07
Author: Claude (verification of the merged PR #63 build), repo state `origin/main` @ `08d887e8`.
Status: operational checklist. NOT executed against any DB in this session — see "Honesty" below.

## Why this exists

Plan.md §32 (perceived-perf + worker Kael chat + anti-disintermediation + apartment access) was implemented across several migrations and merged. The merged Edge function `supabase/functions/mobile-api` **hard-depends** on those migrations. **Deploying the merged Edge code to a DB that is missing any of them breaks live endpoints** — some loudly (PostgREST 400 on a `SELECT` listing a missing column), some silently (a fire-and-forget `INSERT` that violates a `CHECK`). README.md records that the last §32 migration was still pending staging apply, so this risk is **live, not historical**.

This file is the single consolidated must-apply-before-deploy list. The companion docs (`docs/design/kael-perceived-performance-streaming-20260604.md`, `docs/architecture/kael-worker-functional-audit-20260604.md`) list migrations per phase but never consolidate the deploy order.

## Apply these migrations BEFORE deploying the merged `mobile-api` Edge function

In filename (timestamp) order. Each row: migration → objects it adds → the Edge code that depends on it → failure mode if skipped. Code references are from the 2026-06-07 verification read of `supabase/functions/mobile-api/_shared/services.ts` (line numbers approximate; verify against the file if it has moved).

| # | Migration | Adds | Edge code dependency | Failure if skipped |
|---|---|---|---|---|
| 1 | `20260604223000_kael_chat_session_progress.sql` | `kael_chat_sessions.kael_progress` (jsonb) | customer chat `SELECT` of `kael_progress` (~services.ts:1630) + `updateKaelProgress` write target (~:2158) | **Loud** — customer Kael chat read/write 400s (missing column) |
| 2 | `20260604224500_kael_worker_chat_sessions.sql` | tables `kael_worker_chat_sessions`, `kael_worker_chat_turns`, `kael_worker_chat_rate_limit_log` + RPC `check_kael_worker_chat_rate` | worker chat create/send/list/get handlers (~:4165/4232/…) + `rpc('check_kael_worker_chat_rate')` (~:4401) | **Loud** — all worker Kael chat endpoints fail (missing tables/RPC) |
| 3 | `20260604225500_worker_kael_feedback_consent.sql` | tables `worker_kael_feedback`, `worker_kael_training_consent` | WBF.7 worker feedback/consent handlers (~:4622/4650/4671) | **Loud** — worker feedback + training-consent endpoints fail |
| 4 | `20260604230500_scope_change_kael_progress.sql` | `scope_change_requests.kael_progress` (jsonb) | scope-change progress write (~:3947) + `SELECT`s of `kael_progress` (~:7613/7639) | **Loud** — worker scope-change progress + reads 400 |
| 5 | `20260604231500_disintermediation_admin_queue.sql` | extends `kael_admin_queue.queue_type` CHECK to allow `'disintermediation_risk'` | contact-guard admin-queue insert (~:5427-5431) | **Silent** — the insert violates the CHECK and fails; it is fire-and-forget (no `apiFailure`), so the leakage signal is lost with no error surfaced |
| 6 | `20260604232500_apartment_access_release.sql` | `jobs.apartment_access_profile`, `jobs.apartment_access_state` + table `kael_chat_pre_intake_memory` | job-detail / intake `SELECT` lists include these columns (~:3441/3572/6449); writes (~:816/8642); memory reuse (~:8620/8658) | **Loud + broad** — every job-detail/intake handler whose `SELECT` lists `apartment_access_*` 400s (not just §32.7) |
| 7 | `20260605005000_scope_worker_kael_chat_idempotency_by_job.sql` | `kael_worker_chat_turns.job_id` (backfilled then **NOT NULL**) + by-job idempotency index | worker turn insert provides `job_id` (~:4275/4467) | **Loud** — worker chat turn insert fails (missing column / NOT NULL violation) |

**Same deploy batch (parity with the merged tree — not §32-specific but landed together):**
- `20260605003000_fix_plan31_post_advisor_warnings.sql`, `20260605004000_fix_plan31_rpc_lint_warnings.sql` — `CREATE OR REPLACE FUNCTION` lint fixes (idempotent, safe).
- `20260605006000_drop_worker_profiles_districts_backup_x3.sql` — drops a backup table.

## Pre-deploy verification (run before any Edge deploy)

1. `supabase migration list --linked` (or `supabase db push --dry-run`) against the **target** project and confirm **exactly** migrations #1–#7 above (plus the same-batch three) are pending, and **nothing unexpected** is.
2. Apply migrations, THEN deploy `mobile-api`. Never deploy the Edge function ahead of the migrations.
3. `packages/shared/src/types/database.types.ts` already reflects the FULL post-migration schema (including `kael_worker_chat_turns.job_id NOT NULL`). An unmigrated DB therefore diverges **silently** from the generated types — types passing is NOT evidence the DB is migrated.

## Post-apply smoke (closes the §32 G1 gate)

Run the staging smoke harness once migrations are applied + Edge deployed:
- `apps/api/scripts/kael-section32-staging-smoke.mjs` with `SECTION32_RUN_LIVE=1` and staging creds (it refuses production refs). It targets the reopened G1 risk: same `client_request_id` across two worker jobs must create distinct sessions, worker turns carry `job_id`, the answer turn writes `ai_model`, worker SSE returns the active-job result.

## Honesty

This checklist was produced by **reading the merged code + migration files only**. No `supabase migration list` / dry-run / apply was run in this environment (no Supabase access token / Docker present). The migration filenames and the objects they add are verified to exist in `supabase/migrations/`; the code-dependency line numbers come from the 2026-06-07 verification read and may shift — re-grep before relying on an exact line. Do not treat this as proof the target DB is or is not migrated; run step 1 to find out.
