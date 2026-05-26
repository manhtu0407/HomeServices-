# Kael Cost Baseline - 2026-05

Status: passed
Staging ref: `xyylanuyflrjzbjzhqfl`
Run id: `q1-1779791748798-a4da4c`
Baseline row: q1-1779791748798-a4da4c-staging-50

## Scope

Plan.md section 24 live baseline/comparison measurement for Kael cost optimization.

## Evidence

- Sample jobs requested: 50
- Jobs created through Edge: 50
- Provider log rows measured: 100
- Schema validation rate: 1
- Provider success rate: 1
- Vietnamese tone heuristic: 1
- Advisory/estimate accuracy proxy: 1
- Provider breakdown: {"intent_classification:deepseek":{"calls":50,"successes":50,"failures":0,"cost_usd":0.0038,"avg_latency_ms":874,"p95_latency_ms":1050},"market_lookup:perplexity":{"calls":50,"successes":50,"failures":0,"cost_usd":0,"avg_latency_ms":59,"p95_latency_ms":86}}
- Purpose breakdown: {"intent_classification":{"calls":50,"successes":50,"failures":0,"cost_usd":0.0038,"avg_latency_ms":874,"p95_latency_ms":1050},"market_lookup":{"calls":50,"successes":50,"failures":0,"cost_usd":0,"avg_latency_ms":59,"p95_latency_ms":86}}
- Purpose coverage: {"intent_classification":{"provider_logged":true,"calls":50,"successes":50,"failures":0,"providers":["deepseek"],"local_contract_observed":false},"vision_analysis":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"clarification":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"problem_synthesis":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":true},"market_lookup":{"provider_logged":true,"calls":50,"successes":50,"failures":0,"providers":["perplexity"],"local_contract_observed":false},"price_synthesis":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":true},"advisory_generation":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"worker_brief":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"scope_change":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"post_job_learning":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false},"educational_response":{"provider_logged":false,"calls":0,"successes":0,"failures":0,"providers":[],"local_contract_observed":false}}
- Provider failure pattern: {"failure_count":0,"failure_rate":0,"by_error_code":{},"by_purpose_provider":{}}
- Cost summary: {"total_cost_usd":0.0038,"cost_per_job_usd":0.000076,"projected_1000_jobs_usd":0.08,"intake_p95_ms":1930}
- Cleanup counts: {"jobs":0,"job_events":0,"job_broadcasts":0,"api_logs":0,"notifications":0,"profiles":0}

## Notes

- This harness does not toggle remote Edge feature flags; verify Supabase secrets and cache metrics separately.
- No fixture job, api log, event, profile, or auth user is intentionally retained.
- Persisted aggregate baseline row remains in `kael_quality_baseline`.
- Safe per-call metric rows remain in `kael_optimization_metrics` with fixture job ids nulled by cleanup.

## Limitations

- None observed in this run.
