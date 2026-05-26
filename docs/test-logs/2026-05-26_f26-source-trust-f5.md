# 2026-05-26 F26 Source Trust F5 Evidence

Plan ref: `Plan.md` §26.8, backed by §25 R3-R6.

## Local Verification

```text
vitest targeted:
- src/__tests__/unit/mobile-api-kael-q2-q3.test.ts
- src/__tests__/unit/mobile-api-kael-ls1-aggregation.test.ts
- src/__tests__/schema/source-trust-research.test.ts

result: 3 files, 20 tests passed

backward compat:
- src/__tests__/unit/mobile-api-kael-p7.test.ts
- src/__tests__/unit/mobile-api-kael-q4.test.ts
- src/__tests__/unit/mobile-api-edge-runtime.test.ts
- src/__tests__/schema/kael-q1-cost-optimization.test.ts

result: 4 files, 104 tests passed

node --check:
- apps/api/scripts/kael-f26-source-trust-smoke.mjs passed
```

## Staging Migration And Deploy

```text
project: HomeServices Staging
ref: xyylanuyflrjzbjzhqfl
migration: 20260526195300_source_trust_registry_f26.sql
dry-run before apply: exactly 1 pending migration
apply: succeeded
dry-run after apply: Remote database is up to date
edge deploy: mobile-api deployed
```

Registry query:

```text
source_trust_registry total: 20
active Tier 1: 20
policy: Admin write source trust, cmd ALL, role authenticated
```

Advisors:

```text
db lint --linked --fail-on error: No schema errors found
performance advisor: No issues found
security advisor: existing auth_leaked_password_protection warning only
```

## Citation Smoke

Script: `apps/api/scripts/kael-f26-source-trust-smoke.mjs`

Staging flag:

```text
KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=true
```

Passing run:

```text
run_id: f26-src-20260526132805
artifact_since: 2026-05-26T13:25:09.687Z
jobs in final batch: 5/5 awaiting_customer_confirm
market logs in final batch: 2 success, 3 fail-closed insufficient_trusted_data
accepted citation artifacts in audit window: 6
accepted domains sample: tuoitre.vn, btaskee.com
cleanup: jobs/api_logs/job_events/job_broadcasts/notifications/profiles all 0
```

Important interpretation:

- Source trust is intentionally fail-closed. Several live Perplexity calls returned `insufficient_trusted_data`, and the product completed through baseline fallback.
- The accepted citation artifacts prove R3 persistence and R4 quorum validation on real staging Edge traffic.
- The failed calls are not treated as product failures because they avoided trusting under-sourced market prices.

## Acceptance Mapping

```text
R5 seeded + lookup working: passed
R4 validator quorum working: passed
R3 citations persisted: passed, 6 accepted artifacts in staging audit window
R6 outlier + weighted median working: passed, pure-function tests
R7 admin: deferred per Plan optional/admin UI not approved
tests: 20 F5 tests + 104 backward-compat tests passed
```
