Document type:
Section 24 Q2-Q4 and Section 25 R1 continuation report
Audience:
Tu, future AI agent, reviewer.

Facts captured:
- Status: Q2/Q3 implemented and staging-verified; Q4 infrastructure implemented and staging smoke submitted one live Anthropic batch; Q5 not started.
- Branch: `codex/kael-gap-continuation`.
- Staging project: `xyylanuyflrjzbjzhqfl`.
- Production rollout: not promoted for Q2/Q3/Q4 in this batch.

Build summary:
- Q1.5 baseline harness now separates job schema validity from provider success:
  - `schema_validation_rate` = valid Edge job estimate rows / jobs.
  - `provider_success_rate` remains safe metadata.
  - all 11 Kael purposes are listed in purpose coverage metadata.
  - provider failure pattern is captured by error code and purpose/provider.
  - report text no longer claims remote feature flags were disabled; the harness does not toggle Edge secrets.
- Q2 quick wins:
  - `KAEL_OPT_PROMPT_CACHE_ENABLED` adds Anthropic `cache_control`.
  - `KAEL_OPT_CAP_OUTPUT_ENABLED` caps output tokens per purpose.
  - Anthropic cache creation/read token usage and cache cost are captured.
  - Perplexity Sonar search controls are passed under `web_search_options`.
  - `api_logs.safe_metadata.cache_status` flows into `kael_optimization_metrics`; hotfix keeps `safe_metadata` `{}` instead of `undefined`.
- Q3 market cache:
  - migration `20260526131000_kael_market_cache_q3.sql`;
  - table `kael_market_cache`;
  - RPC `increment_kael_market_cache_hit`;
  - daily cron cleanup;
  - Edge market cache read/write behind `KAEL_OPT_MARKET_CACHE_ENABLED`;
  - admin-only invalidation route `POST /admin/market-cache/invalidate`.
- Q4 background optimization:
  - migration `20260526142000_kael_q4_background_optimization.sql`;
  - tables `kael_learning_queue`, `kael_ai_batches`, `kael_ai_batch_items`;
  - stale-fallback cron jobs `kael-learning-queue-stale-fallback` and `kael-ai-batch-stale-fallback`;
  - Anthropic Message Batches wrapper `provider-batch.ts`;
  - queue and result processors under `kael/cron/`;
  - admin-only routes `POST /admin/kael-learning/process-queue` and `POST /admin/kael-learning/process-batch-results`;
  - Q4 flags `KAEL_OPT_BATCH_LEARNING_ENABLED` and `KAEL_OPT_BATCH_API_ENABLED` are default-off after smoke.
- Section 25 R1:
  - research doc created at `docs/foundation/source-trust-research.md`;
  - live-call script created at `scripts/source-trust-research/run-perplexity-r1.mjs`;
  - R2 remains blocked until Perplexity live R1 output exists and Tu approves the final 20-domain list.

Staging evidence:
- `mobile-api` deployed to staging v38 after resetting Q4 flags off.
- Migration list includes:
  - `20260526090000` Q1 telemetry,
  - `20260526131000` Q3 market cache,
  - `20260526142000` Q4 background optimization.
- Q3 100-job clean rerun:
  - report: `.tmp/q2-q3-staging-100-rerun.md`;
  - baseline key: `q1-1779776811299-d55779-staging-100`;
  - jobs through Edge: 100;
  - provider log rows: 200;
  - schema validation: 1.0000;
  - provider success rate: 0.85;
  - cost/job: `0.000053`;
  - projected 1000 jobs: `$0.05`;
  - intake p95: 1972ms;
  - cleanup counts all 0.
- Q3 cache proof:
  - before 100-job rerun: `kael_market_cache.hit_count` total 112;
  - after rerun: total 212;
  - 100 additional cache hits from the 100-job run;
  - cache table rows: 8.
- Q4 remote schema proof:
  - `to_regclass` returns all 3 Q4 tables;
  - both Q4 stale-fallback cron jobs active;
  - unauth admin processor route returns `401 AUTH_MISSING`.
- Q4 live batch smoke:
  - temporarily set Q4 flags true, redeployed, inserted one sanitized test queue row, called admin process route with a disposable admin user.
  - route returned `selected=1`, `submitted=1`, `realtime_fallback=0`, and provider batch id `msgbatch_*`.
  - queue state moved to `batched`.
  - polling returned `checked=0` because the processor intentionally waits until `next_poll_at` one hour later.
  - test user/profile/queue/local batch/lifecycle rows were cleaned up.
  - post-cleanup Q4 table counts: `kael_learning_queue=0`, `kael_ai_batches=0`, `kael_ai_batch_items=0`.
  - Q4 flags were reset to false and `mobile-api` redeployed to v38.

Verification:
- API targeted Vitest: `4 files`, `115 passed`.
- API Q4 unit Vitest: `1 file`, `3 passed`.
- API `tsc --noEmit`: passed.
- `git diff --check`: passed with CRLF warnings only.
- Supabase performance advisor: `No issues found`.
- Supabase security advisor: existing `auth_leaked_password_protection` warning only.

Known limitations / blockers:
- `supabase db push --dry-run --linked` and `supabase db lint --linked` can still fail with direct Postgres `cli_login_postgres` password auth unless `SUPABASE_DB_PASSWORD` is available. Management API operations, migrations, advisors, and deployed smoke worked.
- Q4 result-processing was not proven against a completed live batch because `process-batch-results` follows hourly `next_poll_at` by design. Batch submit path is live-proven; result path is unit-tested.
- Q4 is not Q5-ready: no 50-job A/B, no 65% total cost comparison, no production rollout, no Tu manual production approval.
- Section 25 R1 direct script still cannot read `PERPLEXITY_API_KEY` back out of Supabase secrets. Edge runtime has the key, but Supabase only exposes secret digests to CLI. R1 live needs either a shell Perplexity key or a Tu-approved server-side R1 harness.

Gate status:
- Section 24 Q2: implemented, tested, staging-enabled for Q2/Q3 evidence.
- Section 24 Q3: implemented and staging-verified with clean 100-job cache evidence.
- Section 24 Q4: infrastructure and live batch submit path implemented; hourly result processing not live-complete yet.
- Section 24 Q5: not started.
- Section 25 R1: started, not complete; R2 must not start before Tu approval.
