# Test Log Index

Newest test reports first.

| Date | Report | Result | Bugs | Notes |
|------|--------|--------|------|-------|
| 2026-06-05 | [Kael Plan 31 Production Rollout](2026-06-05_kael-plan31-production-rollout.md) | passed | 2 production advisor/lint fixes | Production migrations to `20260605004000`, Edge `mobile-api` v25, Plan31 flags set, RAG/autonomy smoke passed, final advisors clean except existing Auth warning |
| 2026-06-05 | [Kael Plan 31 Staging Apply And K-FINAL Evidence](2026-06-05_kael-plan31-staging-apply.md) | staging migrations, Edge deploy, SQL smokes, and P15 E2E passed | 2 audit bugs fixed | Fixed apartment-access trigger function, rollback RPC ambiguity, P15 harness cleanup/autonomy drift; no production deploy claim |
| 2026-06-05 | [Kael Plan 31 P15 Staging E2E](2026-06-05_kael-plan31-p15-staging-e2e.md) | passed | 0 product bugs in final run | 33-case staging matrix, realtime verified, p95/cost under limits, cleanup 0 |
| 2026-06-04 | [Kael Plan 31 Requirement Matrix](2026-06-04_kael-plan31-requirement-matrix.md) | local + staging evidence mapped | 2 audit bugs fixed in continuation | K0/A1-A6/B1-B6/C1-C6/D1-D6/K-FINAL mapped to evidence and remaining proof |
| 2026-06-04 | [Kael Core Plan 31 Final Gates](2026-06-04_kael-core-final-gates.md) | local gates passed; staging continuation passed on 2026-06-05 | 2 audit bugs fixed in continuation | API 1453 tests, mobile 134 tests, shared 586 tests passed; staging apply/E2E continuation linked |
| 2026-06-04 | [Kael A5/B6 Eval](2026-06-04_kael-eval.md) | passed deterministic | 0 product bugs | 75/75 A5 pass; B6 knowledge ON 100% safety/legal/citation vs OFF 0%; cost delta 0 |
| 2026-06-04 | [Kael B3 Knowledge Corpus Gate](2026-06-04_kael-b3-corpus-gate.md) | approved; live source-audited; seed migration generated | 0 product bugs | 24 safety + 8 legal rows plus service problem hints; latest B3 source audit `failed_sources=0` |
| 2026-05-26 | [F26 Final Sign-off](2026-05-26_f26-final-signoff.md) | technical gates passed; Tu sign-off pending | 0 product bugs; existing Auth advisor warning | P15 rerun pass, production smoke pass, all 10 gaps closed |
| 2026-05-26 | [F26 DB Performance Cleanup](2026-05-26_f26-db-performance-cleanup.md) | staging + production verified | 0 product bugs; residual advisor INFO only | 15 FK indexes added, 37 zero-scan indexes dropped, advisor counts under 10 |
| 2026-05-26 | [F26 A/B Price Synthesis Decision](2026-05-26_f26-ab-pricesynth-decision.md) | passed; Perplexity rejected for price_synthesis | 0 product bugs; 2 A/B threshold metrics failed | 100 cases persisted, 50/50 split, Anthropic promoted to primary for purpose #6 |
| 2026-05-26 | [F26 Source Trust F5](2026-05-26_f26-source-trust-f5.md) | staging verified | 0 product bugs; live Perplexity fail-closed when under-sourced | Registry RLS, citation quorum, artifact metadata, 6 accepted-citation artifacts |
| 2026-05-26 | [Q5 DeepSeek + R2 Gap Continuation](2026-05-26_q5-r2-gap-continuation.md) | staging verified; production rollout blocked | 0 product bugs; R2 strict source trust returns insufficient trusted data | DeepSeek 50/50 success after timeout fix, R2 sonar-pro allowlist smoke, cleanup 0 |
| 2026-05-26 | [P20 Q2-Q5 + Source Trust R1](2026-05-26_p20-q2-q3-source-trust-start.md) | staging verified; production rollout blocked | 1 telemetry hotfix; 1 Perplexity filter fix; original DeepSeek risk fixed in follow-up | Q2 prompt cache/caps, Q3 cache proof, Q4 live result/fallback, Q5 50-job staging run, Section 25 R1 live output |
| 2026-05-26 | [P19 Staging Gap E2E](2026-05-26_p19-staging-gap-e2e.md) | passed | 0 product bugs; live old broadcasts are historical/no active sent broadcast | Re-ran 5-case Edge E2E after P18, worker accept/complete/review proven, cleanup 0 |
| 2026-05-26 | [P18 Production Promotion/Live Quality](2026-05-26_p18-production-promotion-live-quality.md) | passed | 1 production gap fixed; 1 no-photo vision timeout path fixed | Production migrations/Edge deploy, provider audit, auth-gated smoke |
| 2026-05-26 | [P17 Staging Monitoring/A-B](2026-05-26_p17-staging-monitoring-ab.md) | passed | 0 product bugs; collection honestly starts at 0/100 | Staging deploy, dashboard views, A/B #6 running, production plan |
| 2026-05-26 | [P16 Pre-Launch Verification](2026-05-26_p16-prelaunch-verification.md) | passed | 0 product bugs; 1 existing Supabase Auth warning | Security/review/manual audit, full gates, advisors |
| 2026-05-26 | [P15 Staging E2E](2026-05-26_p15-staging-e2e.md) | passed | 0 product bugs; harness sequencing fixed before final run | 5-case staging matrix, realtime, p95/cost, cleanup |
| 2026-05-11 | [PR#3 Schema Tests](2026-05-11_pr3-schema-tests.md) | 177/177 passed | 1 fixed (database.types.ts artifact) | 4 tiers: types, business rules, relationships, SQL migration |
