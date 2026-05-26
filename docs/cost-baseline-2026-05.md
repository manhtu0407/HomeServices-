# Kael Cost Baseline - 2026-05

Status: passed
Staging ref: `xyylanuyflrjzbjzhqfl`
Run id: `q1-1779771672455-a7d275`
Baseline row: q1-1779771672455-a7d275-staging-50

## Scope

Plan.md section 24 Q1 baseline measurement before enabling cost optimizations.

## Evidence

- Sample jobs requested: 50
- Jobs created through Edge: 50
- Provider log rows measured: 100
- Schema/provider success rate: 0.88
- Vietnamese tone heuristic: 1
- Advisory/estimate accuracy proxy: 1
- Provider breakdown: {"intent_classification:deepseek":{"calls":50,"successes":44,"failures":6,"cost_usd":0.003341,"avg_latency_ms":873,"p95_latency_ms":1000},"market_lookup:perplexity":{"calls":50,"successes":44,"failures":6,"cost_usd":0.015614,"avg_latency_ms":3376,"p95_latency_ms":4002}}
- Purpose breakdown: {"intent_classification":{"calls":50,"successes":44,"failures":6,"cost_usd":0.003341,"avg_latency_ms":873,"p95_latency_ms":1000},"market_lookup":{"calls":50,"successes":44,"failures":6,"cost_usd":0.015614,"avg_latency_ms":3376,"p95_latency_ms":4002}}
- Cost summary: {"total_cost_usd":0.018955,"cost_per_job_usd":0.000379,"projected_1000_jobs_usd":0.38,"intake_p95_ms":5755}
- Cleanup counts: {"jobs":0,"job_events":0,"job_broadcasts":0,"api_logs":0,"notifications":0,"profiles":0}

## Notes

- All optimization flags remained disabled.
- No fixture job, api log, event, profile, or auth user is intentionally retained.
- Persisted aggregate baseline row remains in `kael_quality_baseline`.
- Safe per-call metric rows remain in `kael_optimization_metrics` with fixture job ids nulled by cleanup.

## Limitations

- None observed in this run.
