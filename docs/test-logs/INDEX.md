# Test Log Index

Newest test reports first.

| Date | Report | Result | Bugs | Notes |
|------|--------|--------|------|-------|
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
