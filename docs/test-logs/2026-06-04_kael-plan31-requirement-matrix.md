# Kael Plan 31 Requirement Matrix

Date: 2026-06-04
Scope: Plan.md Section 31 K0 through K-FINAL audit after Codex implementation pass.

## Summary

This matrix maps every Plan Section 31 phase to concrete evidence and the remaining anti-illusion proof. Local code, type, and test gates are green. A 2026-06-05 continuation applied staging migrations, deployed Edge, ran SQL smokes, and passed the full P15 staging E2E harness. A later 2026-06-05 production rollout promoted the verified Plan31 chain to production `iwevizmsedyqozxlawwl`; see `2026-06-05_kael-plan31-production-rollout.md`.

## Phase Matrix

| Phase | Requirement | Local evidence | Remaining proof |
|---|---|---|---|
| K0 | Authority read, baseline, toolchain, read-only staging snapshot | Authority stack, ownership map, git status, local gates, and test logs reviewed; Node runtime verified; staging baseline refreshed in `2026-06-05_kael-plan31-staging-apply.md`; production baseline captured in `2026-06-05_kael-plan31-production-rollout.md` | Native UI evidence remains separate |
| A1 | Batch result promotes gated candidate to active rule | `process-batch-results.ts`, `promote_learning_candidate` migration, `mobile-api-kael-q4.test.ts`, API full suite; staging promote smoke returned `promote_ok=true` | Real production candidate not promoted |
| A2 | Multi-job evidence aggregation | `evaluateLearningEvidenceGate`, P7/Q4 tests, lifecycle tests | Staging aggregation over real post-job events |
| A3 | Monitoring and auto-rollback | `monitor-learning-rules.ts`, rollback RPC migration, P7 tests; staging rollback smoke returned `rollback_ok=true`, final rule `rolled_back`, lifecycle rows `3` after ambiguity fix | Natural quality-drop rollback after live traffic |
| A4 | Admin manual review surface | `apps/api/src/app/admin/kael-learning/page.tsx`, `apps/mobile/app/(admin)/dashboard.tsx`, mobile/admin tests | Manual review action against staging candidate |
| A5 | Offline eval harness | `node apps/api/scripts/kael-eval.mjs` passed 75/75 | Live-provider eval mode |
| A6 | Loop observability/honesty | Final gates, B3 gate, eval log, index updated | Live dashboard data after staging traffic |
| B1 | Runtime reads knowledge tables | `knowledge.ts`, `pipeline.ts`, `market.ts`, Q2/Q3 tests; P15 staging E2E produced provider/api log rows after knowledge flags were enabled | Prompt-level citation transcript not preserved after cleanup |
| B2 | Legal/safety single source in guardrails | `knowledge.ts`, `permission-gate.ts`, B3/B5 tests | Staging legal redirect sourced from loaded rows |
| B3 | Real Perplexity-sourced corpus with signoff | `kael-knowledge-corpus.md`, generated B3 SQL, live audit artifacts `1780579373188` and `1780593318790` both failed_sources=0; staging and production post-apply counts `26` safety, `9` legal, `3` boxes | Durable usage rows require non-cleaned live job traffic |
| B4 | Knowledge governance/admin review | `20260604210000_kael_b4_knowledge_governance.sql`, B4 schema tests | Staging governance RPC/admin action |
| B5 | pgvector semantic retrieval + citation audit | `20260604213000_kael_b5_pgvector_rag.sql`, embedding backfill, `knowledge.ts`, B5/Q2-Q3 tests; staging `match_kael_knowledge` returned 5 matches with citation IDs | Durable usage rows require non-cleaned live job traffic |
| B6 | Knowledge retrieval eval | `kael-eval.mjs` knowledge ON/OFF passed; report updated | Live-provider retrieval eval |
| C1 | Top-level orchestrator facade + telemetry | `orchestrator-facade.ts`, facade tests, services wiring; P15 staging E2E passed with autonomy v2 behavior; production Edge v25 deployed after flags | Natural production autonomy traffic is still pending |
| C2 | Full autonomy via gated decision objects | `autonomy-gate.ts`, apply RPC migration, >=1000 malicious proposal fuzz test; staging `KAEL_AUTONOMY_FULL_ENABLED` set and P15 passed; production autonomy flag enabled and negative apply smoke failed closed | Positive production apply requires a real audited job event |
| C3 | Decision audit trail + replay | `kael_autonomy_decision_audit`, replay helper/test; Edge C3 audit hook added; staging smoke row `ALLOW_AUTONOMY_DECISION` inserted | Long-lived real job audit rows were cleaned by P15 cleanup; smoke row is no-user-data |
| C4 | Escalation and degradation | `kael_admin_queue` wiring in autonomy gate and services, runtime tests | Staging low-confidence/evidence-broken queue row |
| C5 | Retry/timeout/circuit/cost resilience | Orchestrator tests, routing/cost tests, API full suite | Provider chaos against staging configuration |
| C6 | Agentic scenario harness | `mobile-api-kael-autonomy-gate`, orchestrator facade, workflow tests; P15 staging E2E passed 33 cases across 5 scenario groups | Native device recording is separate UI proof |
| D1 | Charter single-source/versioning | `system-prompt.ts`, charter files, guardrail D tests | Change charter file and verify deployed prompt changes |
| D2 | Every AI egress self-checks | `orchestrator.ts`, `services.ts`, `worker-assist.ts`, D/P8 tests; staging guardrail smoke row inserted | Per-surface live trip analytics need natural traffic |
| D3 | Semantic guardrail layer | `self-check.ts`, D tests, red-team corpus | Live semantic classifier/cost telemetry |
| D4 | Boundary injection classifier | `boundary-guard.ts`, D/X1/red-team tests; D audit table and smoke row verified | Live semantic injection trip row still only smoke-level |
| D5 | Red-team regression corpus | `security/kael-redteam`, 40-case zero-bypass focused/full API tests | CI wiring plus live red-team report if provider-backed |
| D6 | Guardrail observability + feedback feed | `kael_guardrail_trip_audit` migration, services audit wiring, D tests | Live trip analytics and generated follow-up case |
| KF.1 | One cross-track staging transaction | Local integration pieces pass; P15 staging E2E passed 33-case matrix, realtime, cost, cleanup | Production transaction not claimed |
| KF.2 | Full sweep vs K0 baseline | API/shared/mobile/eval/local checks passed; staging baseline/post-apply snapshots captured | Native full visual proof remains separate |
| KF.3 | Honest percent/evidence update | Final gates, this matrix, staging continuation log, and production rollout log record local + staging + production proof with remaining limits | Tu/Claude post-rollout sign-off not captured in repo |
| KF.4 | Logs/test reports/ownership map | Final gates, B3 gate, eval report, index, ownership map updated | README release summary if Tu asks to ship |
| KF.5 | Tu sign-off per track | Tu approved mission and B3 key use in thread | Track sign-off after staging proof |

## Latest Local Gate Snapshot

- API: `tsc --noEmit` passed; final `vitest run` passed 89 files / 1454 tests, 3 files / 59 tests skipped.
- API build: `next build --webpack` passed; root `turbo build` and default Turbopack build were blocked by local Windows/package-manager execution constraints.
- Shared: `tsc --noEmit` passed; `vitest run` passed 15 files / 586 tests.
- Mobile: `tsc --noEmit` passed; Jest passed 14 suites / 134 tests.
- Eval: deterministic A5/B6 passed 75/75; knowledge ON reached 100% safety/legal/citation against OFF 0%.
- B3 live source re-audit: 8 sources, 7 on-domain, 0 failed; transient key was not persisted.
- Diff hygiene: `git diff --check` passed with CRLF warnings only.

## Production Rollout Snapshot

- Production migrations applied: 17 Plan31 core migrations plus two forward-fix migrations, latest `20260605004000`.
- Production Edge: `mobile-api` v25 active after Plan31 flags were set.
- Plan31 production flags present: learning read/write, kill switch false, AB percentage, auto rollback, knowledge retrieval, and full autonomy.
- Production row/RPC proof: safety/legal/service knowledge rows `26/9/3`; Plan31 RPCs present; learning/audit tables exist and remain empty before real traffic.
- Production smoke: `/kael/charter` returned HTTP 200; `match_kael_knowledge` returned 5 citations; autonomy negative apply returned `audit_not_found` without mutation.
- Production remote gates: dry-run up to date; schema lint no errors; performance advisors no issues; security advisor only retains the existing Auth leaked-password protection warning.

## Not Claimed

- No synthetic production auth-gated E2E was run; production already had real app data, so rollout smoke avoided fixture user/job creation.
- No native iOS/Android full visual journey proof from this Plan31 continuation.
- No Deno Edge check because `deno` was unavailable.
- No React Doctor changed scan because `npx`/npm were unavailable.
