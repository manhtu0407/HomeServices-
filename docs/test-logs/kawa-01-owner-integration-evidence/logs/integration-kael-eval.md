# Kael Deterministic Fixture Evaluation

Document type: regression evaluation report
Evidence tier: T0
Measurement scope: fixture_agreement
Model accuracy: not measured
Provider invocation: not_attempted
Sample size: 99 (minimum 75)
Mode: deterministic
Started at: 2026-10-21T14:46:41.746Z
Status: passed
Cases: 99 total, 84 supported, 15 decline
Execution errors: 0

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

## B6 Deterministic Knowledge Fixture Rule A/B

Scope: deterministic knowledge-fixture rule agreement; retrieval and model accuracy are not measured.

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

- WARNING: fixture agreement is not model accuracy. Deterministic mode compares local rules with labels; 100% means fixture agreement, not live Kael correctness.
- Deterministic mode uses local rules and does not call AI providers.
- Live mode requires KAEL_EVAL_RUN_LIVE=yes, a local-only KAEL_EVAL_MOBILE_API_URL, and KAEL_EVAL_BEARER_TOKEN; Production evaluation must use the scoped Plan 55 canary.
- Runner exits non-zero when a threshold, B6 rule comparison, or endpoint evaluation fails.

## Limitations

- Deterministic mode proves regression harness wiring and fixture coverage; it is not a substitute for a scheduled live provider run.
- The 100-case evaluation blueprint (apps/api/fixtures/kael-eval/evaluation-blueprint-100.json) is a plan with 0 authored cases; this suite is not that blueprint and has not been mapped to its groups.
