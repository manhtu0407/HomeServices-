# Kael A5 Offline Evaluation

Document type: regression evaluation report
Mode: deterministic
Started at: 2026-06-26T16:18:38.196Z
Status: passed
Cases: 75 total, 60 supported, 15 decline

## Metrics

| Metric | Value | Threshold |
| --- | ---: | ---: |
| serviceAccuracy | 100% | 85% |
| complexityAccuracy | 100% | 75% |
| priceBandHitRate | 100% | 75% |
| declinePrecision | 100% | 90% |
| declineRecall | 100% | 90% |
| latencyP95Ms | 0 | n/a |
| costPerCaseUsd | 0 | n/a |

## B6 Knowledge Retrieval A/B

| Metric | Knowledge OFF | Knowledge ON | Delta |
| --- | ---: | ---: | ---: |
| safetyMentionRate | 0% | 100% | 100% |
| legalBoundaryRate | 0% | 100% | 100% |
| citationRate | 0% | 100% | 100% |
| costPerCaseUsd | 0 | 0 | 0 |

B6 status: passed

## Failures

No failing cases.

## Verification

- Deterministic mode uses local fixture scoring and does not call AI providers.
- Live mode requires KAEL_EVAL_MOBILE_API_URL and KAEL_EVAL_BEARER_TOKEN; KAEL_EVAL_ANON_KEY is optional for Edge deployments that require apikey.
- Runner exits non-zero when any threshold is below target.

## Limitations

- Deterministic mode proves regression harness wiring and fixture coverage; it is not a substitute for a scheduled live provider run.
