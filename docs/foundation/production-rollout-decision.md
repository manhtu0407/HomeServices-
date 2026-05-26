# Production Rollout Decision - Plan 26 F2

Status: executed and passed.

Date: 2026-05-26

Scope: promote the staging-only Q1-Q5 and Section 25 R1/R2 artifacts from PR #39/#40 to production `iwevizmsedyqozxlawwl`, with all risky feature flags rollback-off by default.

## Current State

- Production was at `mobile-api` v10 with 71 migrations after P18.
- Staging has the later Q1/Q3/Q4 migrations and `mobile-api` v67 evidence from Q2-Q5/R2.
- Production now has the Q1/Q3/Q4 migration catch-up set and `mobile-api` v12 deployed.
- Production rollout behavior flags remain off by default; no flag-enabling command was run during F2.
- Existing production security advisor residual is `auth_leaked_password_protection`; this is an Auth dashboard setting and not introduced by this rollout.
- Production target URL is `https://iwevizmsedyqozxlawwl.supabase.co`.
- Supabase CLI login and production link were completed without writing token/password values to repo files.
- Pre-apply dry-run showed exactly the three expected migrations; post-apply dry-run reports `Remote database is up to date`.
- Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl` after production work.

## Rollout Payload

Expected production migration catch-up:

1. `20260526090000_kael_cost_optimization_q1.sql`
2. `20260526131000_kael_market_cache_q3.sql`
3. `20260526142000_kael_q4_background_optimization.sql`

Expected Edge deployment:

- Deploy `supabase/functions/mobile-api` code matching staging v67.
- Keep behavior-compatible flags off in production unless explicitly approved after smoke:
  - `KAEL_OPT_PROMPT_CACHE_ENABLED`
  - `KAEL_OPT_CAP_OUTPUT_ENABLED`
  - `KAEL_OPT_MARKET_CACHE_ENABLED`
  - `KAEL_OPT_BATCH_LEARNING_ENABLED`
  - `KAEL_OPT_BATCH_API_ENABLED`
  - `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED`

## Evidence Already Available

- P18 production promotion passed: production 71 migrations, `mobile-api` v10, unauth `/services` returns `401 AUTH_MISSING`, production lint clean, performance advisor clean.
- Q3 staging 100-job rerun passed: schema validation `1.0000`, provider success `0.85`, cache hits increased by 100, cleanup `0`.
- Q4 staging live submit/result/fallback paths passed with cleanup `0`.
- Q5 DeepSeek rerun passed after timeout fix: 50/50 jobs, provider success `1`, DeepSeek 50/50 success, p95 intent `1050ms`, cleanup `0`.
- R2 source-trust staging smoke proved `sonar-pro`, top-level domain allowlist, month recency, and fail-closed baseline fallback.

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Migration history divergence | High | Run production `db push --dry-run` / migration list first; apply only the three expected migrations; stop on any extra pending migration. |
| Edge deploy changes behavior before smoke | Medium | Deploy with flags off; unauth smoke first; run 5 authenticated smoke jobs before enabling any rollout flag. |
| Source-trust R2 strict path returns insufficient data | Medium | Keep `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=false`; R2 remains staging-proven only, not production-enabled. |
| Q4 batch tables/cron affect learning | Medium | Keep Q4 flags false; verify table counts and admin processor routes without enabling background batch behavior. |
| Provider cost/latency spike | Medium | Smoke records `api_logs.purpose`, latency, provider/model, and safe metadata; rollback Edge deploy if provider failures appear. |
| Data cleanup misses fixture rows | Medium | Use the existing staging harness cleanup pattern; production smoke must use traceable run ids and verify cleanup counts. |
| Existing Auth advisor warning mistaken as rollout regression | Low | Document `auth_leaked_password_protection` as pre-existing dashboard setting. |

## Required Preflight Before Apply

1. Confirm local checkout is on the approved rollout branch and clean except intended docs/code.
2. Confirm production ref is `iwevizmsedyqozxlawwl`.
3. Confirm staging evidence remains fresh enough for Tu.
4. Run migration dry-run/list and verify only expected migration IDs are pending.
5. Confirm no production feature flag is enabled for Q2/Q3/Q4/Q5/R2 before deploy.
6. Prepare rollback notes and smoke run id.

Current F2 preflight evidence:

- CLI version used: Supabase CLI `2.101.0`.
- `supabase init` was not forced because `supabase/config.toml` already exists.
- `supabase link --project-ref iwevizmsedyqozxlawwl` completed.
- `supabase/.temp` is ignored by `supabase/.gitignore`; local link metadata is not intended for commit.
- Production dry-run passed after password reset propagation.
- Applied migrations: `20260526090000`, `20260526131000`, `20260526142000`.
- Edge deploy: `mobile-api` production version `12`, status `ACTIVE`.
- Production unauth smoke: `GET /services` returned `401 AUTH_MISSING`.
- Production authenticated smoke: 5/5 jobs reached `awaiting_customer_confirm`, 10/10 provider logs succeeded with populated `purpose`, cleanup counts returned to `0`.
- Post-apply gates: schema lint clean, performance advisor clean, security advisor has only existing `auth_leaked_password_protection`.

## Rollback Plan

- If migration dry-run shows unexpected migrations: stop before apply.
- If migration apply fails: do not deploy Edge; inspect migration history before repair.
- If Edge deploy succeeds but smoke fails: redeploy previous production function bundle if available, or redeploy the P18 known-good commit, then keep all rollout flags off.
- If smoke creates fixture data but fails midway: run scoped cleanup by run id and verify row counts.
- If provider failures spike: keep all optimization/source-trust flags off and revert Edge code if fallback behavior differs from P18.

## Smoke Plan

After Tu approves F2 Step 2.2:

1. Apply the expected migration set to production.
2. Deploy `mobile-api` to production.
3. Run unauth `/services` smoke and expect `401 AUTH_MISSING`.
4. Run 5 authenticated production smoke jobs with flags off.
5. Verify:
   - 5/5 jobs reach `awaiting_customer_confirm` or documented safe fallback.
   - `api_logs.purpose` is populated for new provider calls.
   - No full address, phone, CCCD, bank, token, or provider secret appears in logs.
   - Cleanup counts return to `0`.
   - Performance advisor remains clean.
   - Security advisor has no new warnings beyond `auth_leaked_password_protection`.

## Decision Request

F2 Step 2.2 is a hard gate.

Tu approval required before any command that mutates production:

```text
I approve Plan 26 F2 production migration + mobile-api deploy for production `iwevizmsedyqozxlawwl`, with all Q2/Q3/Q4/Q5/R2 rollout flags off and the smoke/rollback plan above.
```

Without that approval, stop at this document and continue only with non-production phases that do not violate the F2 dependency gate.

## Source Notes

- Supabase docs require remote deployments to link/authenticate the target project, deploy Edge Functions, then verify the live function.
- Supabase migration docs emphasize coordinated remote `db push`, migration-history sync, and checking pending migrations before applying.
- Project evidence sources: `MEMORY.md`, `docs/test-logs/2026-05-26_p18-production-promotion-live-quality.md`, `docs/test-logs/2026-05-26_p20-q2-q3-source-trust-start.md`, `docs/test-logs/2026-05-26_q5-r2-gap-continuation.md`, and `docs/foundation/source-trust-research.md`.
