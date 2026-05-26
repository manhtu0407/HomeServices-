# F26 Production Rollout

Date: 2026-05-26
Production ref: `iwevizmsedyqozxlawwl`
Production URL: `https://iwevizmsedyqozxlawwl.supabase.co`
Result: passed with one existing Supabase Auth warning

## Scope

Plan 26 F2 promoted the staging-only Q1-Q5 and Section 25 R1/R2 production-safe infrastructure:

- apply the Q1/Q3/Q4 migration catch-up set
- deploy the current `mobile-api` Edge function to production
- run 5 authenticated production smoke jobs with rollout flags off
- verify cleanup, provider logging, and security/advisor evidence

No command was run to enable Q2/Q3/Q4/Q5/R2 rollout flags.

## Supabase CLI Setup

Supabase CLI was executed through the local Node/pnpm runtime because the `supabase` binary was not already on PATH.

```text
supabase_cli=2.101.0
login=completed
init=not forced because supabase/config.toml already exists
production_link=completed for iwevizmsedyqozxlawwl
local_link_after_rollout=restored to xyylanuyflrjzbjzhqfl
secret_storage=no token/password values written to repo files
```

## Migration Promotion

Pre-apply dry-run showed exactly the expected Plan 26 F2 migration set:

```text
20260526090000_kael_cost_optimization_q1.sql
20260526131000_kael_market_cache_q3.sql
20260526142000_kael_q4_background_optimization.sql
```

The migrations applied successfully. Post-apply verification:

```text
db push --dry-run --linked: Remote database is up to date.
migration history includes 20260526090000: yes
migration history includes 20260526131000: yes
migration history includes 20260526142000: yes
```

## Edge Deploy

Production `mobile-api` was deployed after the database catch-up.

```text
function=mobile-api
status=ACTIVE
version=12
unauth_GET_/services=401 AUTH_MISSING
```

## Production Smoke

Harness: `apps/api/scripts/kael-f26-production-smoke.mjs`

Run id: `f26-prod-20260526122954`

Results:

```text
services_route=electrical, plumbing, cleaning
jobs_created=5
jobs_awaiting_customer_confirm=5
provider_log_rows=10
provider_log_success=10
provider_log_failure=0
purposes=intent_classification, market_lookup
providers=deepseek, perplexity
max_request_ms=5185
avg_request_ms=4071
```

Cleanup:

```text
kael_optimization_metrics=0
jobs=0
job_events=0
job_broadcasts=0
api_logs=0
notifications=0
profiles=0
cleanup_ok=true
```

No unsafe token/password/CCCD/bank marker was found in the smoke `api_logs.safe_metadata` rows.

## Advisors

Post-rollout Supabase gates:

```text
db lint --linked --fail-on error: No schema errors found
db advisors --linked --type performance --fail-on error: No issues found
db advisors --linked --type security --fail-on error: existing WARN auth_leaked_password_protection only
```

The remaining security warning is the pre-existing Supabase Auth dashboard setting and was not introduced by F2.

## Hygiene

- Token/password values were not committed to docs, env examples, test logs, or code.
- `node_modules` was hydrated only inside the isolated worktree and is ignored.
- Local Supabase link was restored to staging after production work completed.
