# Kael AI Core Plan 31 Final Gates

Date: 2026-06-04
Scope: Plan.md Section 31 PR #58 implementation audit for Kael AI core tracks A-D.

## Result

Local implementation gates passed for the code paths touched in this run. A 2026-06-05 continuation applied staging migrations, deployed Edge, and passed P15 staging E2E; see `2026-06-05_kael-plan31-staging-apply.md`. A later 2026-06-05 production rollout applied the verified Plan31 chain to production, fixed post-advisor/lint findings, enabled Plan31 flags, redeployed `mobile-api`, and passed production smoke; see `2026-06-05_kael-plan31-production-rollout.md`.

## Track Evidence

| Track | Evidence | Status |
|---|---|---|
| A Feedback/Eval | Learning loop tests are covered in the API suite; A5 deterministic eval report is in `2026-06-04_kael-eval.md`; staging A1/A3 promote/rollback smoke passed after rollback ambiguity fix; production promotion/rollback RPCs are present and post-lint clean. | Local + staging + production schema proof passed; natural production learning rows require live traffic. |
| B Knowledge/RAG | B3 live source audit passed with `failed_sources=0`; corpus migration generated for 24 safety rows, 8 legal rows, and 3 `service_knowledge_boxes.safe_metadata.problem_hints` updates; staging and production counts reached 26 safety, 9 legal, 3 boxes; production B5 match smoke returned 5 citations. | Local + staging + production proof passed. |
| C Agentic Orchestrator | Autonomy gate unit tests, facade tests, schema/apply RPC tests, workflow conformance tests, Edge C3 audit hook, P15 staging E2E, and production fail-closed autonomy negative smoke passed. | Local + staging + production smoke proof passed. |
| D Prompt/Guardrails | Semantic self-check, boundary injection classifier, guardrail audit schema, 40-case red-team corpus, staging D smoke row, and production guardrail audit table deployment passed. | Local + staging + production schema proof passed; production trip analytics need live traffic. |

## Verification Run

Commands actually run with the workspace Node runtime:

| Command | Result |
|---|---|
| `apps/api: tsc --noEmit` | passed |
| `apps/api: vitest run` | 89 files passed, 1453 tests passed, 3 files/59 tests skipped |
| `apps/api focused Plan31 A/B/C/D regression suite after address-access audit` | 17 files passed, 291 tests passed |
| `apps/api focused worker Kael chat + Section32 progress drift fix` | 2 files passed, 9 tests passed |
| `apps/api focused mobile-api-edge schema/runtime` | 2 files passed, 171 tests passed |
| `apps/api focused mobile-api-edge-runtime address-access regression` | 1 file passed, 112 tests passed |
| `apps/api focused mobile-api-edge-router + mobile-api-kael-p7 after final copy fix` | 2 files passed, 61 tests passed |
| `apps/api focused kael-b3-knowledge-corpus after B3.4 audit` | 1 file passed, 6 tests passed |
| `apps/api focused kael-b5-pgvector-rag after problem-hints backfill guard` | 1 file passed, 3 tests passed |
| `node apps/api/scripts/kael-eval.mjs` | deterministic eval passed, 75/75 cases; knowledge ON 100% safety/legal/citation vs OFF 0% |
| `KAEL_B3_SOURCE_AUDIT_LIVE=1 PERPLEXITY_API_KEY=<redacted> node apps/api/scripts/kael-b3-source-audit.mjs` | live audit passed, 8 sources, 7 on-domain, 0 failed; key not persisted |
| `apps/mobile: tsc --noEmit` | passed |
| `apps/mobile: jest --runInBand` | 14 suites passed, 134 tests passed |
| `packages/shared: tsc --noEmit` | passed |
| `packages/shared: vitest run` | 15 files passed, 586 tests passed |
| `packages/shared focused mobile-wiring` | 1 file passed, 231 tests passed |
| `git diff --check` | passed; Windows CRLF warnings only |
| `rg` secret scan after live Perplexity audit | no provided `pplx-...` key persisted in docs, app, package, or Supabase source files |
| `Get-Command deno` | failed/not found; Edge `deno check` not runnable from this shell |
| `npx -y react-doctor@latest . --yes --verbose --diff --offline --fail-on none` | failed/not found; bundled runtime has `node.exe` only, no npm/npx |
| secret/mobile-boundary `rg` sweep | no real secret committed; hits were env names, fake fixtures, regex guards, or approved mobile boundary files |
| `supabase migration list --linked` | read-only metadata succeeded; repo is linked to production `HomeServices`, not staging; Plan31 local migrations are not applied remotely |
| `supabase projects list` | read-only metadata succeeded; staging project exists but is not the linked project |
| `supabase db push --dry-run --linked --workdir tmp/supabase-staging-readonly` | staging dry-run showed 16 Plan31 migrations pending after migration history restore |
| `supabase db push --linked --workdir tmp/supabase-staging-readonly --yes` | staging Plan31 migrations applied; first run exposed missing `private.set_updated_at()`, rerun passed after trigger fix |
| `supabase db push --linked --workdir tmp/supabase-staging-readonly --yes` for `20260605001000` | staging rollback RPC ambiguity fix applied |
| `supabase functions deploy mobile-api --project-ref xyylanuyflrjzbjzhqfl --no-verify-jwt --use-api` | staging Edge deployed; final observed version `91` |
| `curl .../functions/v1/mobile-api/kael/charter` | HTTP 200; charter version `2026-05-25.p8` |
| `apps/api/scripts/kael-p15-staging-e2e.mjs` with staging env | passed 33-case matrix; realtime verified; intake p95 `9381ms`; worst cost `$0.000079`; cleanup ok |
| `supabase db push --dry-run --linked --workdir tmp/supabase-production-plan31-20260605` | production dry-run showed exact 17 Plan31 migrations before apply; final dry-run returned remote up to date |
| `supabase db push --linked --workdir tmp/supabase-production-plan31-20260605 --yes` | production applied 17 Plan31 migrations plus `20260605003000` and `20260605004000` post-advisor/lint fixes |
| `supabase functions deploy mobile-api --project-ref iwevizmsedyqozxlawwl --no-verify-jwt --use-api` | production Edge deployed; final observed version `25` active |
| `supabase secrets set ... --project-ref iwevizmsedyqozxlawwl` | Plan31 production flags set by name only; raw secret values not logged |
| `curl .../functions/v1/mobile-api/kael/charter` | production HTTP 200; charter version `2026-05-25.p8` |
| production `match_kael_knowledge` + negative `apply_kael_autonomy_decision` smoke | 5 RAG citations returned; autonomy negative apply returned `audit_not_found` without mutation |
| production advisors/lint | schema lint clean; performance advisors clean; security advisors only existing Auth leaked-password protection warning |

Previously generated evidence used by this closure:

| Artifact | Result |
|---|---|
| `docs/foundation/source-trust-samples/kael-b3-source-audit-1780593318790.json` | B3 live source audit passed with the redacted transient key, 8 sources, 7 on-domain/primary, 0 failed |
| `docs/foundation/source-trust-samples/kael-b3-source-audit-1780579373188.json` | B3 live source audit passed, 8 sources, 7 on-domain/primary, 0 failed |
| `docs/test-logs/2026-06-04_kael-b3-corpus-gate.md` | 24 safety + 8 legal rows plus 3 service problem-hint metadata updates approved for corpus migration |
| `docs/test-logs/2026-06-04_kael-eval.md` | A5 deterministic 75/75; B6 knowledge ON 100% safety/legal/citation vs OFF 0% |

## Limitations

- Synthetic production K-FINAL E2E was not run because production already has real app data; production smoke intentionally avoided fixture user/job creation.
- Staging and production were accessed through temporary linked workdirs to avoid target confusion.
- Remote/local migration drift was fixed locally by restoring the missing `2026060409xxxx` hardening migrations.
- A5 live-provider eval mode was not run here; only deterministic eval plus B3 live source audit were used.
- Native iOS/Android UI visual validation was not run. The frontend changes were contract/type/helper/admin-test fixes, not a visual redesign.
- `pnpm`, `deno`, `npm`, and `npx` were unavailable on PATH; gates used direct Node script entrypoints from the workspace runtime, so Deno Edge check and React Doctor changed scan were not run from this shell.

## Follow-Up

- Run A5 live-provider eval on the approved provider configuration when Tu wants provider-backed eval evidence beyond deterministic/staging proof.
- Capture native iOS/Android UI evidence separately for frontend surfaces.
