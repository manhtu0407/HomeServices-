# 2026-05-26 F26 Final Sign-off

Plan ref: `Plan.md` §26.12.

## Final E2E

Staging P15 rerun:

```text
project_ref: xyylanuyflrjzbjzhqfl
run_id: p15-1779805818040-5cbca2
report: docs/test-logs/2026-05-26_f26-p15-staging-rerun.md
status: passed
case_matrix: 5/5 passed
intake_p95_ms: 6578
worst_transaction_cost_usd: 0.000552
cleanup: ok=true, all tracked counts 0
```

Production smoke:

```text
project_ref: iwevizmsedyqozxlawwl
run_id: f26-prod-20260526140603
status: passed
jobs: 5/5 awaiting_customer_confirm
services: electrical, plumbing, cleaning
api_logs: 10 successes, 0 failures
providers: deepseek, perplexity
cleanup: ok=true, all tracked counts 0
```

Production deployed final `mobile-api` code after applying F5/F7 migrations.

## Gap Closure

| Gap | Result |
|---|---|
| 1. Production deploy stuck | Closed: production migrations and `mobile-api` deployed; smoke passed. |
| 2. Q1 11-purpose coverage reality | Closed: 11/11 purpose coverage measured in F3 baseline. |
| 3. Q3 provider failure | Closed: vision image fetch/base64 fix; F4 100-job success 0.9548. |
| 4. §25 R3-R8 incomplete | Closed for R3-R6/R5 registry/R4 validator; R7 admin UI remains optional per plan. |
| 5. Perplexity A/B not run | Closed: 100 cases persisted; decision `reject_perplexity`; Anthropic primary for `price_synthesis`. |
| 6. Tier 1 domains hardcoded | Closed: DB-backed `source_trust_registry` with admin RLS and cache. |
| 7. DB performance advisor INFO | Closed: 15 FK indexes added, 37 zero-scan secondary indexes dropped, advisors <10. |
| 8. Plan immutability/version | Closed: §23/§24/§25 metadata/changelog bumped to v2.0 only. |
| 9. STRUCTURES provider roles stale | Closed: §9 provider role text updated for Anthropic `price_synthesis` primary and Perplexity market lookup. |
| 10. RULES scope wording narrow | Closed: §6 allows directly tied education/safety/legal-awareness for supported services. |

## Residuals

- Supabase security advisor still reports the existing `auth_leaked_password_protection` dashboard warning.
- React Doctor completed after fixing the only red issue found in this pass:
  - API: 28 warnings, 0 errors.
  - Mobile: 6 warnings, 0 errors.
  - Score unavailable because the run used offline mode.
- Tu manual review/sign-off is the remaining human gate; this document is prepared for that sign-off.
