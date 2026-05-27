Document type:
Section 24 Q2-Q5 and Section 25 R1 continuation report
Audience:
Tu, future AI agent, reviewer.

Facts captured:
- Status: Q2/Q3 implemented and staging-verified; Q4 live submit/result/fallback are now staging-verified; Q5 staging 50-job comparison was started; Section 25 R1 live domain verification is complete.
- Branch: `codex/kael-gap-continuation`.
- Staging project: `xyylanuyflrjzbjzhqfl`.
- Production rollout: not promoted for Q2/Q3/Q4/Q5/R1 in this batch.

Build summary:
- Q1.5 baseline harness now separates job schema validity from provider success and has a small retry loop for transient DNS/fetch failures.
- Q2 quick wins:
  - `KAEL_OPT_PROMPT_CACHE_ENABLED` adds Anthropic `cache_control`.
  - `KAEL_OPT_CAP_OUTPUT_ENABLED` caps output tokens per purpose.
  - Anthropic cache creation/read token usage and cache cost are captured.
  - Perplexity domain/recency filters now send top-level `search_domain_filter` / `search_recency_filter` after live R1 proved nested `web_search_options.search_domain_filter` did not enforce the allowlist.
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
  - admin-only `force_poll` input added for manual smoke/emergency polling; default hourly behavior remains unchanged;
  - Q4 flags `KAEL_OPT_BATCH_LEARNING_ENABLED` and `KAEL_OPT_BATCH_API_ENABLED` are default-off after smoke.
- Section 25 R1:
  - final research doc at `docs/foundation/source-trust-research.md`;
  - live-call script at `scripts/source-trust-research/run-perplexity-r1.mjs`;
  - final R1 sample output at `docs/foundation/source-trust-samples/source-trust-r1-1779781564809.json`;
  - R2 was later implemented and staging-smoked in the Q5/R2 continuation; production rollout remains separately gated.

Staging evidence:
- `mobile-api` deployed to staging v44 after resetting Q4 flags off and deploying the Perplexity top-level-filter/mojibake fixes.
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
- Q4 live batch/result smoke:
  - temporarily set Q4 flags true and deployed `mobile-api`;
  - inserted one sanitized queue row and called admin process route with a disposable admin user;
  - submit route returned `selected=1`, `submitted=1`, `realtime_fallback=0`, provider id `msgbatch_*`, queue state `batched`;
  - admin `force_poll` first saw `checked=1`, `ended=0`, batch `in_progress`;
  - later admin `force_poll` saw `checked=1`, `ended=1`, `processed_items=1`, `failed_items=0`;
  - final queue state `processed`, batch status `results_processed`, lifecycle rows for the queue = 1.
- Q4 live fallback smoke:
  - inserted one sanitized queue row and called process route with `{ force_realtime: true }`;
  - route returned `selected=1`, `submitted=0`, `realtime_fallback=1`;
  - queue state `realtime_fallback`, lifecycle rows for the queue = 1.
- Q4 cleanup proof:
  - `kael_learning_queue=0`;
  - `kael_ai_batches=0`;
  - `kael_ai_batch_items=0`;
  - disposable `codex-q4-*` auth users = 0;
  - Q4 flags reset false and staging redeployed.
- Q5 staging comparison attempt:
  - first 50-job run hit transient DNS `ENOTFOUND` after fixture creation; manual cleanup removed 17 jobs, events, api logs, notifications, profile, and auth user with post-cleanup counts all 0.
  - rerun with harness retry passed: report `.tmp/q5-staging-50-20260526.md`, baseline key `q1-1779782521778-f86f98-staging-50`;
  - jobs through Edge: 50;
  - provider log rows: 100;
  - schema validation: 1.0;
  - advisory/estimate proxy: 1.0;
  - provider success rate: 0.56 because DeepSeek timed out 44/50 intent calls;
  - market lookup: 50/50 success, p95 100ms, cost `$0`;
  - cost/job: `0.000009`;
  - projected 1000 jobs: `$0.01`;
  - intake p95: 2129ms;
  - cleanup counts all 0.
- Section 25 R1 live verification:
  - final run id `source-trust-r1-1779781564809`;
  - 20 domains tested;
  - 5 queries per domain;
  - 100 calls returned HTTP 200;
  - 368 total citations/search results;
  - outside-domain citation violations: 0;
  - zero-citation domains: 0.

Verification:
- API targeted Vitest after Q4/Q2-R1 changes: `3 files`, `40 passed`.
- Q4 previous targeted gates: `2 files`, `35 passed`.
- API Q4 unit Vitest: covered submit, result processing, and `forcePoll`.
- API `tsc --noEmit`: run in final verification batch.
- `git diff --check`: run in final verification batch.

Known limitations / blockers:
- `supabase db push --dry-run --linked` and `supabase db lint --linked` can still fail with direct Postgres `cli_login_postgres` password auth unless `SUPABASE_DB_PASSWORD` is available. Management API operations, migrations, advisors, and deployed smoke worked.
- Q5 production rollout was not run. Plan.md requires gradual production rollout and Tu manual approval. Do not mark Section 24 fully done until canary/rollout/rollback monitoring gates are satisfied.
- Q5 provider health is not clean: DeepSeek timed out 44/50 intent calls in the latest 50-job run even though user-facing schema/advisory/cost gates passed through fallback/caching. Treat this as a provider-health blocker before production rollout.
- Section 25 R2 must not start before Tu approves the final 20-domain R1 list.

Follow-up update:
- Q5 DeepSeek health blocker was rerun after the intent timeout budget fix. Report `docs/test-logs/2026-05-26_q5-deepseek-health-rerun.md`, baseline key `q1-1779791748798-a4da4c-staging-50`, showed 50/50 DeepSeek intent success, 0 provider failures, p95 intent 1050ms, provider success rate 1, and cleanup all 0.
- Section 25 R2 was implemented and live-smoked on staging behind `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED`. The provider log proved `perplexity` `sonar-pro`, 20-domain allowlist metadata, month recency, web/medium search options, and 6000ms source-trust budget. The strict R2 query failed closed as `insufficient_trusted_data`, so normal product estimate still used baseline fallback.
- Staging source-trust flag was restored rollback-off after smoke; market cache is on. Production was not changed.

Gate status:
- Section 24 Q2: implemented, tested, staging-enabled for Q2/Q3/Q5 evidence.
- Section 24 Q3: implemented and staging-verified with clean 100-job cache evidence.
- Section 24 Q4: live submit, live result processing, live realtime fallback, env flag toggle, and cleanup verified on staging.
- Section 24 Q5: staging 50-job rerun passed schema/cost/provider-health cleanup gates; production rollout still requires Tu manual approval plus canary/rollback/monitoring.
- Section 25 R1: live verification complete.
- Section 25 R2: code-complete and staging-smoked behind rollback flag; production rollout deferred until later source-trust quality and rollout gates.
