# P18 Production Promotion And Live-Quality Fix

Date: 2026-05-26
Staging ref: `xyylanuyflrjzbjzhqfl`
Production ref: `iwevizmsedyqozxlawwl`
Result: passed with one existing Supabase Auth warning

## Scope

This report closes the post-PR audit gap after P17:

- promote the verified P3-P17 migration chain to production
- deploy the current `mobile-api` Edge function to production
- fix production `GOOGLE_MAP_KEY` / `GOOGLE_MAPS_API_KEY` secret alias drift
- audit staging provider quality and fix the no-photo `vision_analysis` timeout path
- keep the local Supabase link restored to staging after production work

## Production Promotion

Production had 42 migrations and `mobile-api` version 8 before this pass. The production dry-run required `--include-all` because production was also missing prerequisite post-2026-05-19 migrations, not only the P3-P17 Codex chain.

Before applying migrations, the Docker-based `supabase db dump` path was unavailable because Docker Desktop was not running. A scoped JSON export was created under `.tmp/production-backups/` instead, covering migration history plus the existing production rows needed for rollback inspection. The export is intentionally not committed.

Production migrations applied successfully. Post-apply audit:

```text
migration_count=71
customer_kael_memory_exists=true
worker_kael_memory_exists=true
ai_provider_routing_exists=true
disputes_exists=true
kael_advisory_audit_exists=true
jobs_kael_progress_exists=true
api_logs_count=67
api_logs_with_purpose=67
api_logs_missing_purpose=0
```

Final production database gates:

```text
db push --dry-run --linked --include-all --yes: Remote database is up to date
db lint --linked --fail-on error: No schema errors found
performance advisor --fail-on error: No issues found
security advisor --fail-on error: existing WARN auth_leaked_password_protection only
```

## Edge Deploy

The production project used the legacy secret name `GOOGLE_MAP_KEY`, while the Edge runtime read `GOOGLE_MAPS_API_KEY`. The runtime now accepts both names, preferring `GOOGLE_MAPS_API_KEY` and falling back to `GOOGLE_MAP_KEY`.

Deploy evidence:

```text
staging mobile-api version=29 status=ACTIVE sha=3758b958b9e850f918df9b25b3d144a970ea5b205a95b7dcac67edeb758e6b3a
production mobile-api version=10 status=ACTIVE sha=3758b958b9e850f918df9b25b3d144a970ea5b205a95b7dcac67edeb758e6b3a
staging unauth /services smoke: 401 AUTH_MISSING
production unauth /services smoke: 401 AUTH_MISSING
```

## Staging Provider Quality Audit

Current staging provider rows for the first new-pipeline sample showed DeepSeek and Perplexity healthy, with the anomaly isolated to Anthropic vision:

```text
intent_classification / deepseek: 4 calls, 4 success, 0 failure, avg 848ms, p95 921ms
market_lookup / perplexity: 4 calls, 4 success, 0 failure, avg 2839ms, p95 3135ms
vision_analysis / anthropic: 4 calls, 2 success, 2 failure, avg 5172ms, p95 5877ms
vision failures: AI call failed: TIMEOUT
```

Root cause:

- the P15 staging harness created jobs with `photo_urls: []`
- `runKaelPipeline()` still called `analyzeDescription()` for `vision_analysis`
- `analyzeDescription()` sent text-only prompts to Anthropic under the vision purpose
- those no-photo calls created provider rows and could time out at the 4500ms route budget

Fix:

- no-photo flows now skip the Anthropic provider call
- no-photo flows do not write a fake `vision_analysis` provider log
- `jobs.kael_progress.vision_analysis` is marked completed, not failed, when vision is skipped because no sanitized photo URLs exist
- real photo flows still call Anthropic vision with image blocks
- real photo vision output cap was reduced from 500 to 320 tokens to trim latency pressure while preserving the same JSON schema

## Verification

Local gates after the live-quality fix:

```text
mobile-api-edge-runtime.test.ts: 75 passed
mobile-api-edge-runtime + mobile-api-kael-p3 + mobile-api-edge-schema: 3 files, 148 passed
full API Vitest: 55 files passed, 3 skipped; 1116 passed, 59 skipped
shared district Vitest: 53 passed
apps/api tsc --noEmit: passed
git diff --check: passed with CRLF warnings only
exact Supabase token sweep: no repo matches
```

Key runtime assertions:

- no-photo pipeline does not call `anthropic.com`
- no-photo pipeline has no `stageLogs` entry for `stage='vision'`
- Kael chat no-photo provider logs include intent and market purposes, not fake vision provider rows
- photo pipeline still sends the customer photo URL to Anthropic as an image block
- production secret alias `GOOGLE_MAP_KEY` is accepted

## Residual Risk

- Historical staging `vision_analysis` rows still show the earlier timeout failures; the fix is deployed, but no new authenticated live no-photo transaction was created during this pass.
- Production authenticated transaction smoke was not run in this pass; unauth smoke proves the function is reachable and auth-gated.
- Supabase Auth leaked password protection remains disabled in project settings and is still the only security advisor warning.
