# Kael recurring incident - stateful HVAC regression (KAWA Session 04)

Date: 2026-10-20. Branch `claude/kael-recurring-incident-e2e-4be225`, HEAD `5b2aea94` plus uncommitted work. Nothing was committed, pushed, deployed or migrated.

## Lanes

| Lane | What it is | Status |
|---|---|---|
| T0 deterministic / code-level | Real HTTP handler, services, classifier, permission gate, Case context, serializer. Model providers stubbed at `fetch`; DB is an in-memory PostgREST stand-in with JSON snapshot reads | **Executed** |
| T1 real local DB | Same chain against a real local Postgres + PostgREST + Auth, per-user JWTs, scripted providers | **Executed** against an isolated stack (`project_id nestscout-s04-e2e`, ports 59321-59329, 453 migrations applied, torn down afterwards): P400 5/5 |
| T2 multi-actor local E2E | Owner, second customer and worker against that stack, route and direct data API under RLS | **Executed** in the same run (T2-1..T2-3) |
| T3 production validation | Real model, real deployment | **NOT RUN** |

A scripted provider is not a live model benchmark. These rows prove wiring and invariants, not answer quality.

## What was added

- `apps/api/src/__tests__/kael-edge-runtime/harness/case-world.ts` - synthetic HVAC Case driver (`createCaseWorld`), exported from the harness index.
- `harness/memory-db.ts` - `isolateReads` option (reads return JSON copies, as PostgREST does). Without it the router sees the post-write session in its pre-turn variable.
- `domains/kael-recurring-incident-e2e-pillar.test.ts` - P398, 26 tests (R01-R23 plus two open-defect tests), collected by the existing `include` glob, so `pnpm test:api` and CI run it.
- `fixtures/hvac-recurring-incident/*.json` - the payload the real route sends the client after turn 1 and turn 2 (`KAEL_E2E_FIXTURES_WRITE=1` regenerates).
- `apps/mobile/components/customer/__tests__/quote-blocker-server-parity-pillar-test.tsx` - P399, feeds those payloads to the real quote-blocker view model.

## Scenario rows (P398)

R01 incident exchange (HVAC playbook off and on) - R02-R07 classifier 503 / timeout / connection failure / malformed JSON / wrong shape / low confidence - R08 assistant provider down - R09 eleven earlier turns - R10 Case reopened with an offer under review - R11 genuinely unsupported service - R12 other customer (404) - R13 worker (403) - R14 admin (403) - R15 missing district - R16 price-gap chip - R17 hazard message with HVAC playbook - R18 hazard message without it - R19 RFQ enabled - R20 RFQ disabled - R21 "go ahead" in the gap - R22 "go ahead" under an RFQ review - R23 client payload fixtures.

Every row asserts: service stays `hvac`, no Job linked, only chat/audit tables written, no price text, no `estimate` turn, no `DENY_OUT_OF_SCOPE_SERVICE` (except the real decline in R11).

## Verification (all run in this worktree)

| Command | Result |
|---|---|
| `vitest run` (apps/api, P398 only) | exit 0, 26/26 |
| `vitest run` (apps/api, whole), after the fixes | exit 0, 184 files, 2454 tests, 2453 passed, 1 skipped (`stage1-agentic-flow-pillar`, no local target) |
| P400 vs isolated local stack (`KAEL_INCIDENT_LOCAL_DB=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59321`) | exit 0, 5/5; mutation (skip the blocker restore) turned T1-2 red, restored and green again |
| P400 without those variables | skipped loudly (5 skipped), no connection attempted |
| `jest` P399 | 2/2 (both plain tests after the fix) |
| `edge:check` (deno check, 7 functions, Docker) | exit 0, failed=0 |
| `check-edge-db-contract` | exit 0, but compared nothing (no `--functions` SQL supplied) |
| `tsc --noEmit` apps/api, apps/mobile | exit 0 |
| `node scripts/harness/pillar-registry.mjs --write`, then check | exit 0, 394 pillars |
| `lint:comments`, `lint:structure`, `lint:test-collection`, `lint:reuse-ladder` | exit 0 |

## Controlled regressions (detection proof, then reverted)

| Perturbation | Result |
|---|---|
| `case-question.service.ts`: pass `caseContext: null` to the assistant | P398 **10 failed**, 15 passed (R01 x2, R02-R09) |
| `case-turn-intent.ts`: classifier fallback always `provide_information` | P398 **6 failed** (R02-R07) |
| First attempt: drop only the explicit-WHY branch of the fallback | stayed green - the question-mark rule is a second guard; the stronger edit above was needed |

Both edits were reverted with `git checkout`; `git status` shows no change under `supabase/`, and P398 was 26/26 afterwards.

## Defects found, then fixed in this checkout

First recorded as expected-fail tests (`it.fails` / `it.failing`), then fixed at Tu's request in the same session and flipped to plain tests. Edge files touched (uncommitted): `kael/tools/case-turn-intent.ts`, `domains/kael-chat/turn-intent-router.ts`, `domains/kael-chat/case-work-artifact.ts`, `domains/kael-chat/branches-pre-pipeline.ts`.

- **D1 - an explanation turn wipes the recorded quote blocker.** FIXED: `restoreAnsweredTurnState` in the router now hands the pre-turn `quote_blockers`, `next_action`, `quote_ready` and `case_phase` back when a reply did not re-analyse the Case, and only if the incoming turn had reset them. Mutation (skip the restore) turns D1 and R23 red. `diagnosisScopeForIncomingTurn` (`case-work-artifact.ts`) resets `quote_blockers` to `[]` and `next_action` to `wait` on every plain-text turn. `routeKaelChatTurnIntent` restores the review phase only, so after "Tại sao chưa đủ dữ kiện?" the persisted Case no longer carries `validated_price_evidence`. The card then has nothing to name, which matches the second symptom (generic "Báo giá cần rà soát"). Owners: Sessions 01/03 (server), Session 05 consumes it.
- **D2 - a correction is not applied to the typed fact.** FIXED for the model-read path: the classifier is now given the filled slots (`filledSlots`), a `correction` at confidence >= 0.6 can name the corrected slots in `answered_slots`, and `groundCorrectedSlots` in the pre-pipeline replaces only a slot the Case already holds (never an invented slot, never `customer_goal`/`latest_customer_detail`/`price_readiness`). With the classifier down a correction is still not detected (the deterministic fallback has no correction intent). Mutation (ignore corrected slots) turns D2 red. After "À nhầm, 2 máy 2HP", `unit_type_count_and_capacity` still holds the 1HP answer; only `latest_customer_detail` carries the correction, and that field is excluded from the assistant's Case context. Owner: Session 03.

## Observations (not asserted)

- One out-of-scope question mid-Case sets the session to `unsupported` (`guard.ts`), which ends the whole Case. Rejection is correct; closing the Case is a product decision.
- HVAC hazard guidance depends on `KAEL_PLAYBOOK_HVAC_ENABLED`. With it off, the same message gets a price-gap reply (still no price, no Job). Production flag state unknown.
- The "no baseline" gap path (`emitPipelineNoBaseline`) emits no `service_problem_id`, so the RFQ fallback reports `no_price_gap` there; R19/R20 seed the gap with the real emitter instead.
- Outside a deployed isolate, cost metering throws `UNKNOWN_MODEL_PRICE:perplexity:kael-price-knowledge` for a cached price-gap hit; deployed code uses the safe-high rate. The harness sets `DENO_DEPLOYMENT_ID` to mirror deployment.
- Stage 1 runtime lane (`governed` vs `previous`) depends on release identity in Production; T0 runs `governed`.

## Incident during the T1 run (disclosed)

The first P400 version fell back to the repo's default local URL (`HARNESS_LOCAL_URL`, `127.0.0.1:55321`), which a live stack from another session (`supabase_db_nestscout`) was serving, so two runs created and deleted synthetic users and a Case there. Users and Case were deleted by the test itself (0 leftovers verified); the scripted-provider run also left 6 `api_logs`, 6 `kael_optimization_metrics` and 1 `kael_price_knowledge` rows, which I identified by their exact synthetic timestamps and token counts (40/12) and deleted in one transaction (6/6/1). Nothing else was touched. P400 now refuses the default stack: it runs only with `KAEL_INCIDENT_LOCAL_DB=1` and an explicit `NEXT_PUBLIC_SUPABASE_URL`, and skips loudly otherwise. The route refusals in T2-1/T2-2 are also backed by RLS (a real user client cannot even read the Case), so removing only the route owner check would not turn them red.

## Not proven

The screenshot's actual path (`customer_case` vs `customer_normal`), the deployed commit, Production flags, device rendering, real-model behavior, and the real catalog's HVAC problem/policy (P400 does not seed an RFQ policy; RFQ on/off stays T0 only).
