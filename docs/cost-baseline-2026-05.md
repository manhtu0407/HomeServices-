# Kael Cost Baseline - 2026-05

Status: passed
Staging ref: `xyylanuyflrjzbjzhqfl`
Run id: `q1-1779800028486-8fc954`
Baseline row: q1-1779800028486-8fc954-staging-100

## Scope

Plan.md section 24 live baseline/comparison measurement for Kael cost optimization.

## Evidence

- Sample jobs requested: 100
- Jobs created through Edge: 100
- Provider log rows measured: 221
- Schema validation rate: 1
- Provider success rate: 0.9548
- Vietnamese tone heuristic: 1
- Advisory/estimate accuracy proxy: 1
- Provider breakdown: {"intent_classification:deepseek":{"calls":101,"successes":101,"failures":0,"cost_usd":0.007622,"avg_latency_ms":869,"p95_latency_ms":1071},"vision_analysis:anthropic":{"calls":11,"successes":1,"failures":10,"cost_usd":0.002154,"avg_latency_ms":4427,"p95_latency_ms":4503},"market_lookup:perplexity":{"calls":101,"successes":101,"failures":0,"cost_usd":0.000168,"avg_latency_ms":87,"p95_latency_ms":89},"clarification:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000021,"avg_latency_ms":1111,"p95_latency_ms":1111},"problem_synthesis:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000025,"avg_latency_ms":1030,"p95_latency_ms":1030},"price_synthesis:perplexity":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000206,"avg_latency_ms":2734,"p95_latency_ms":2734},"advisory_generation:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000022,"avg_latency_ms":962,"p95_latency_ms":962},"worker_brief:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000031,"avg_latency_ms":1231,"p95_latency_ms":1231},"scope_change:anthropic":{"calls":1,"successes":1,"failures":0,"cost_usd":0.002139,"avg_latency_ms":3474,"p95_latency_ms":3474},"post_job_learning:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000028,"avg_latency_ms":1122,"p95_latency_ms":1122},"educational_response:deepseek":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000044,"avg_latency_ms":1726,"p95_latency_ms":1726}}
- Purpose breakdown: {"intent_classification":{"calls":101,"successes":101,"failures":0,"cost_usd":0.007622,"avg_latency_ms":869,"p95_latency_ms":1071},"vision_analysis":{"calls":11,"successes":1,"failures":10,"cost_usd":0.002154,"avg_latency_ms":4427,"p95_latency_ms":4503},"market_lookup":{"calls":101,"successes":101,"failures":0,"cost_usd":0.000168,"avg_latency_ms":87,"p95_latency_ms":89},"clarification":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000021,"avg_latency_ms":1111,"p95_latency_ms":1111},"problem_synthesis":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000025,"avg_latency_ms":1030,"p95_latency_ms":1030},"price_synthesis":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000206,"avg_latency_ms":2734,"p95_latency_ms":2734},"advisory_generation":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000022,"avg_latency_ms":962,"p95_latency_ms":962},"worker_brief":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000031,"avg_latency_ms":1231,"p95_latency_ms":1231},"scope_change":{"calls":1,"successes":1,"failures":0,"cost_usd":0.002139,"avg_latency_ms":3474,"p95_latency_ms":3474},"post_job_learning":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000028,"avg_latency_ms":1122,"p95_latency_ms":1122},"educational_response":{"calls":1,"successes":1,"failures":0,"cost_usd":0.000044,"avg_latency_ms":1726,"p95_latency_ms":1726}}
- Purpose coverage: {"intent_classification":{"provider_logged":true,"calls":101,"successes":101,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"vision_analysis":{"provider_logged":true,"calls":11,"successes":1,"failures":10,"providers":["anthropic"],"local_contract_observed":false},"clarification":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"problem_synthesis":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":true},"market_lookup":{"provider_logged":true,"calls":101,"successes":101,"failures":0,"providers":["perplexity"],"local_contract_observed":false},"price_synthesis":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["perplexity"],"local_contract_observed":true},"advisory_generation":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"worker_brief":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"scope_change":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["anthropic"],"local_contract_observed":false},"post_job_learning":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"educational_response":{"provider_logged":true,"calls":1,"successes":1,"failures":0,"providers":["deepseek"],"local_contract_observed":false}}
- Purpose probe rows: 11
- Provider failure pattern: {"failure_count":10,"failure_rate":0.0452,"by_error_code":{"TIMEOUT":10},"by_purpose_provider":{"vision_analysis:anthropic":10}}
- Cost summary: {"total_cost_usd":0.01246,"cost_per_job_usd":0.000125,"projected_1000_jobs_usd":0.12,"intake_p95_ms":6202}
- Cleanup counts: {"jobs":0,"job_events":0,"job_broadcasts":0,"kael_optimization_metrics":0,"api_logs":0,"notifications":0,"profiles":0}

## Notes

- This harness does not toggle remote Edge feature flags; verify Supabase secrets and cache metrics separately.
- Q1.5 purpose probes are direct server-side provider calls tagged with `q1_5_direct_provider_probe`; they measure real provider availability for purposes not exposed by the current mobile workflow route.
- No fixture job, api log, event, profile, or auth user is intentionally retained.
- Persisted aggregate baseline row remains in `kael_quality_baseline`.
- Safe per-call metric rows remain in `kael_optimization_metrics` with fixture job ids nulled by cleanup.

## Limitations

- None observed in this run.
