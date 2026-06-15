# Test Log — Security Hardening §38 (S1–S5)

- **Date:** 2026-06-14
- **Branch:** `claude/gallant-sinoussi-b0c0c3`
- **Plan:** Plan.md §38; dossier `docs/audit/security-audit-20260614.md`
- **Toolchain:** portable Node 20.18 + pnpm 10.16.1; runner = **vitest 4.1.6** (not jest)
- **Reporting:** honest per RULES #8 / `feedback_honest_reporting` — counts are real `vitest run` output.

## Commits (per-phase checkpoints, D9)

| Commit | Phase | Findings |
|---|---|---|
| `7dbaca59` | S1 | F3 (config handoff) + §38/audit baseline |
| `362fee72` | S2 | F2 ✓, F6 ✓, F5 (migration; apply→Tu) |
| `d70e0c68` | S3 | authz-coverage + IDOR negatives (0 prod diff) |
| `2913de16` | S4 | F1 ✓ core; F4 PARTIAL |
| `bc656cad` | S5 | F6 ongoing (CI gitleaks + PII-log lint) |

## Verification evidence

| Check | Command | Result |
|---|---|---|
| S2 router/prompt authz | `vitest run mobile-api-s2-*` | 16/16 pass; bite proof: revert roles → 4 fail |
| S3 authz-coverage + IDOR | `vitest run mobile-api-s3-*` | 12/12 pass; bite proof: inject fake route → fail |
| S4 durability acceptance | `vitest run mobile-api-s4-spend-gate` | 11/11 pass (cap, cold-isolate, read-before-call, no-network-on-block) |
| S5 PII-log + injection | `vitest run pii-log-lint mobile-api-s5-injection-phrasings` | 12/12 pass; bite proof: temp `{phone}` → fail |
| CI security-tests set | `vitest run foundation route-security mobile-api-s2..s4 kael-redteam` | 81/81 pass (9 files) |
| Full apps/api suite | `vitest run` | **1561 pass, 1 fail (pre-existing), 59 skip** |
| Full packages/shared | `vitest run` | **586 pass, 1 fail (pre-existing)** |
| Type-check | `tsc --noEmit` (api + shared) | both exit 0 |
| Secret grep (gitleaks proxy) | `git grep sk-ant/sbp_/AKIA/PEM` | 0 hits |
| Mobile bundle secrets | `git grep ANTHROPIC/SERVICE_ROLE … apps/mobile` | 0 hits |
| Advisors (G6 baseline) | `get_advisors(security)` staging+prod | 1 WARN (F3) + 2 INFO (F5) — unchanged (migrations not applied) |

### Pre-existing failures (stash-proven NOT caused by §38)
1. `mobile-api-edge-router … apartment access check-in` (apps/api) — fails on clean S3 baseline.
2. `mobile-wiring … Worker production visual contract` (packages/shared) — fails on clean baseline.
These are the "2 stale tests" from PR #66; out of §38 scope.

### S4 regressions I introduced and FIXED honestly (not goalpost)
- 8× `mobile-api-edge-runtime`: gate's rpc consumed the test's `.from()` sequence → fixed `makeSequenceClient.rpc` to treat spend-gate RPCs as orthogonal; + gate now fails OPEN on unrecognized rpc shape (never wrongly block).
- 2× `tier1-type-completeness`: added `kael_ai_spend_log` + `check/record_kael_ai_spend` to generated `database.types.ts`.
- (1× secret-hygiene was an order-dependent flake — passes in isolation; not S4.)

## Honest residuals / handoffs (see audit §10)
- **HG#2 deploy (Tu):** leaked-password dashboard (S1) + set `KAEL_AI_KILL_SWITCH` + apply migrations `20260614120000` & `20260614120500` + re-run advisors.
- **HG#5 (Tu):** S4(d) signup throttle policy (false-positive tradeoff) — not chosen silently.
- **F4 PARTIAL:** circuit-breaker durability deferred (LOW); spend-cost durability done.
- **Spend-cap coverage:** vision + market (expensive); intent/worker/admin = kill-switch-only.
- **gitleaks:** runs in CI only (not installed locally).

## ≥10× review loop (§38.4)
10 distinct lenses run with re-run evidence; L2 caught the F4 overclaim, L10 caught S4(d) gap + coverage scope → corrected in audit §10 (honesty, no gate lowered). Exit on 2 consecutive clean rounds after corrections.

## Dashboard deploy session — 2026-06-15 (Tu operated dashboard; Claude navigated + verified read-only)

- **Migrations applied via SQL Editor (Tu ran the SQL) on BOTH envs** — `20260614120000` + `20260614120500` combined block; final `cron.schedule(...)` returned a job id, no errors.
  - staging `xyylanuyflrjzbjzhqfl`: OK
  - production `iwevizmsedyqozxlawwl`: OK
- **Verified read-only (`get_advisors` + `pg_catalog`), identical on both envs:**
  - **F5 CLOSED:** `rls_enabled_no_policy` INFO ×2 → **gone**; only `auth_leaked_password_protection` WARN remains.
  - Schema: `kael_ai_spend_log` table=1, deny-all policy=1; `kael_chat_rate_limit_log` policy=1; `kael_worker_chat_rate_limit_log` policy=1; `check_kael_ai_spend` + `record_kael_ai_spend` = 2 functions.
- **NOT yet done — human-only / by safety design (Claude must not perform):**
  - **Edge `mobile-api` redeploy** from this branch → F1 only *fully active* after this (DB ready; running Edge code still old). `supabase functions deploy mobile-api` / CI, needs Tu's access token.
  - **Leaked-password (F3):** requires **Pro plan** (paid) — deferred by Tu.
  - **Custom SMTP:** built-in capped at **2 emails/h** → blocks real signup; needs Tu's email-provider API key + verified domain (entering credentials is prohibited for the agent).
  - **Rate Limits (HG#5):** kept defaults (adequate for real users; F1 cap is the primary cost brake).
  - Migrations were applied via SQL Editor, so **not recorded in `schema_migrations`**; next `supabase db push` re-applies idempotently.
