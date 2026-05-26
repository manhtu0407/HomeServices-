Document type:
Section 24 Q2-Q3 and Section 25 R1 continuation report
Audience:
Tu, future AI agent, reviewer.

Facts captured:
- Status: code verified locally; remote staging deploy not completed in this batch.
- Branch: `codex/kael-gap-continuation`.
- Scope: close remaining audit gaps by starting Section 24 cost optimization Q2/Q3 and Section 25 source trust only as far as Plan gates allow.

Build summary:
- Q1.5 baseline harness now separates job schema validity from provider success:
  - `schema_validation_rate` = valid Edge job estimate rows / jobs.
  - `provider_success_rate` remains safe metadata.
  - all 11 Kael purposes are listed in purpose coverage metadata.
  - provider failure pattern is captured by error code and purpose/provider.
- Q2 quick wins:
  - `KAEL_OPT_PROMPT_CACHE_ENABLED` adds Anthropic `cache_control`.
  - `KAEL_OPT_CAP_OUTPUT_ENABLED` caps output tokens per purpose.
  - Anthropic cache creation/read token usage and cache cost are captured.
  - Perplexity Sonar search controls are passed under `web_search_options`.
  - `api_logs.safe_metadata.cache_status` flows into `kael_optimization_metrics`.
- Q3 market cache:
  - migration `20260526131000_kael_market_cache_q3.sql`;
  - table `kael_market_cache`;
  - RPC `increment_kael_market_cache_hit`;
  - daily cron cleanup;
  - Edge market cache read/write behind `KAEL_OPT_MARKET_CACHE_ENABLED`;
  - admin-only invalidation route `POST /admin/market-cache/invalidate`.
- Section 25 R1:
  - research doc created at `docs/foundation/source-trust-research.md`;
  - live-call script created at `scripts/source-trust-research/run-perplexity-r1.mjs`;
  - R2 remains blocked until Perplexity live R1 output exists and Tu approves the final 20-domain list.

Verification:
- API targeted Vitest: `6 files`, `200 passed`.
- API `tsc --noEmit`: passed.
- `git diff --check`: passed with CRLF warnings only.
- Source trust script guard: exits unless `SOURCE_TRUST_RUN_LIVE=1`.

Remote verification blockers:
- `supabase db lint --local` failed because local Postgres was not running at `127.0.0.1:54322`.
- Linked staging is `xyylanuyflrjzbjzhqfl`, but `supabase migration list --linked` and `supabase db push --dry-run --linked` returned `401 Unauthorized` while initializing the DB login role. Needs restored Supabase CLI auth or `SUPABASE_DB_PASSWORD` before staging migration/deploy.
- `PERPLEXITY_API_KEY` is not present in this Codex shell, so Section 25 R1 live domain verification was not run.

Gate status:
- Section 24 Q2: locally implemented and tested, default-off.
- Section 24 Q3: locally implemented and tested, default-off; staging migration pending auth.
- Section 24 Q4/Q5: not started.
- Section 25 R1: started, not complete; R2 must not start before Tu approval.
