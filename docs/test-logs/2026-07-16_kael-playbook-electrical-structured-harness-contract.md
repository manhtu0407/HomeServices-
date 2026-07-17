# Kael Playbook Eval - electrical (structured-harness-contract)

## Hypothesis

- The electrical playbook may improve supported-service routing and safety handling without increasing false declines or unnecessary clarification.

## Changed

- Local fixture replay exercised the evaluator contract only; no deployed runtime was exercised or changed.

## Baseline

- Not captured in this report. Historical results are not treated as a matched baseline.

## After

- **NOT RUN.** Deterministic fixture replay is not deployed-runtime After evidence.

## Delta

- Routing macro-F1: N/A
- Suggested-service accuracy: N/A
- Immediate-critical misses: N/A
- Clarification turns: N/A
- Latency p95: N/A
- Cost per case: N/A

## Run manifest

```json
{
  "git_sha": "09a1f95f02451fc5b3671bb03a8aaa03bbd04232",
  "git_sha_scope": "local_base_commit",
  "deployment_version": "local-mock",
  "deployment_version_source": "local_mock_constant",
  "deployment_attestation": "not_performed",
  "model_id": "mock-contract",
  "model_ids": [
    "mock-contract"
  ],
  "provider": "unobserved",
  "sampling_config": null,
  "prompt_version": "2026-07-16.v2",
  "playbook_version": "electrical-playbook-2026-07-16.v2",
  "observed_playbook_state": "on",
  "playbook_hash": "sha256:274681372326482ff6a6811a1e213a0264515e2301999a51d4df70d9d4540bf3",
  "playbook_hash_scope": "full_local_source_file",
  "playbook_source_path": "supabase/functions/mobile-api/_shared/kael/playbooks/electrical.ts",
  "source_tree_hash": "sha256:32f57196fa1e08ba2b5399b31292abcf9e57e1f7695b2353ac5ef4d2fbb41207",
  "source_scope": "local_curated_source_set",
  "source_files": [
    "apps/api/scripts/kael-playbook-eval.mjs",
    "apps/api/scripts/lib/kael-playbook-eval-core.mjs",
    "supabase/functions/mobile-api/_shared/kael/boundary-guard.ts",
    "supabase/functions/mobile-api/_shared/kael/electrical-intake-policy.ts",
    "supabase/functions/mobile-api/_shared/kael/index.ts",
    "supabase/functions/mobile-api/_shared/kael/intake-runtime.ts",
    "supabase/functions/mobile-api/_shared/kael/intent.ts",
    "supabase/functions/mobile-api/_shared/kael/pipeline.ts",
    "supabase/functions/mobile-api/_shared/kael/performance-profiles.ts",
    "supabase/functions/mobile-api/_shared/kael/prompts.ts",
    "supabase/functions/mobile-api/_shared/kael/trace.ts",
    "supabase/functions/mobile-api/_shared/kael/types.ts",
    "supabase/functions/mobile-api/_shared/kael/utils.ts",
    "supabase/functions/mobile-api/_shared/services/_shared.ts",
    "supabase/functions/mobile-api/_shared/services/job-create.service.ts",
    "supabase/functions/mobile-api/_shared/services/kael-chat-boundary.ts",
    "supabase/functions/mobile-api/_shared/services/kael-chat-core.ts",
    "supabase/functions/mobile-api/_shared/services/kael-chat-intake-safety.ts",
    "supabase/functions/mobile-api/_shared/services/kael-chat.service.ts",
    "supabase/functions/mobile-api/_shared/services/serializers.ts"
  ],
  "source_hash_algorithm": "sha256_path_and_file_sha256_v1",
  "source_state": "base_sha_with_uncommitted_sources",
  "fixture_hash": "sha256:2f35e5515832b2601e4653aec6d2397e901de018a4ec5d7ff129f28a35122daf",
  "selected_case_hash": "sha256:2b181c20a6ccef5bba476b171c35d03dd73517773a1197ebbfbdf4d2ff2a7d8a",
  "corpus_path": "docs/playbooks/eval/electrical-cases.json",
  "feature_flags": {
    "electrical_playbook": true
  },
  "corpus_version": "sha256:751810b88622f9a7a61a16de9632eaef0a3eb523c827ddbc2e34df609921e636",
  "run_mode": "mock",
  "started_at": "2026-07-17T01:27:47.845Z",
  "repetitions": 3,
  "repetition_strategy": "deterministic_fixture_replay",
  "run_config": {
    "offset": 0,
    "limit": null,
    "max_turns": 3,
    "retry_wait_seconds": 0,
    "timeout_seconds": 45,
    "district": "q7",
    "allow_failures": true
  }
}
```

## Local diagnostic metrics (not After)

- Overall: 87.5% (63/72)
- Routing accuracy: 100% (72/72 classified runs)
- Routing macro-F1: 1
- False-decline rate: 0% (0/54)
- Suggested-service accuracy: 100%
- Clarification accuracy: 91.7%
- Observed clarification rate: 33.3%
- Problem-slug accuracy: 94.4%
- Required-safety recall: 90% (27/30); misses: 3
- Immediate-critical recall: 75% (9/12); misses: 3
- Capability-signal recall: 100% (18/18); misses: 0
- Safety false-positive rate: 0% (0/3)
- Average turns: n/a
- Latency p50 / p95: n/a / n/a ms
- Repeated-run fully-consistent rate (error-aware): n/a
- Outcome-mode agreement (diagnostic; errored outcomes can agree): n/a
- Errored case groups / runs: 0 / 0
- Release gate: diagnostic override enabled

## Routing confusion matrix

Run-level counts: 24 unique cases x 3 repetition(s).

| expected \ observed | in_scope | out_of_scope | service_mismatch |
|---|---:|---:|---:|
| in_scope | 54 | 0 | 0 |
| out_of_scope | 0 | 9 | 0 |
| service_mismatch | 0 | 0 | 9 |

## Runs

| Case | Rep | Result | Expected | Observed | Suggested | Clarify | Slug | Safety misses |
|---|---:|---|---|---|---|---|---|---|
| el_01 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_02 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_03 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_04 | 1 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_05 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_06 | 1 | FAIL | in_scope | in_scope | - | FAIL (false) | FAIL (outlet_or_switch_broken) | - |
| el_07 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_08 | 1 | FAIL | in_scope | in_scope | - | FAIL (true) | PASS | - |
| el_09 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_10 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_11 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_12 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_13 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_14 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_15 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_16 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_17 | 1 | PASS | service_mismatch | service_mismatch | hvac | PASS | - | - |
| el_18 | 1 | PASS | service_mismatch | service_mismatch | plumbing | PASS | - | - |
| el_19 | 1 | PASS | service_mismatch | service_mismatch | handyman | PASS | - | - |
| el_20 | 1 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_21 | 1 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_22 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_23 | 1 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_24 | 1 | FAIL | in_scope | in_scope | - | PASS | PASS | water_near_power |
| el_01 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_02 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_03 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_04 | 2 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_05 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_06 | 2 | FAIL | in_scope | in_scope | - | FAIL (false) | FAIL (outlet_or_switch_broken) | - |
| el_07 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_08 | 2 | FAIL | in_scope | in_scope | - | FAIL (true) | PASS | - |
| el_09 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_10 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_11 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_12 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_13 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_14 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_15 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_16 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_17 | 2 | PASS | service_mismatch | service_mismatch | hvac | PASS | - | - |
| el_18 | 2 | PASS | service_mismatch | service_mismatch | plumbing | PASS | - | - |
| el_19 | 2 | PASS | service_mismatch | service_mismatch | handyman | PASS | - | - |
| el_20 | 2 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_21 | 2 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_22 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_23 | 2 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_24 | 2 | FAIL | in_scope | in_scope | - | PASS | PASS | water_near_power |
| el_01 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_02 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_03 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_04 | 3 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_05 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_06 | 3 | FAIL | in_scope | in_scope | - | FAIL (false) | FAIL (outlet_or_switch_broken) | - |
| el_07 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_08 | 3 | FAIL | in_scope | in_scope | - | FAIL (true) | PASS | - |
| el_09 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_10 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_11 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_12 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_13 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_14 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_15 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_16 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_17 | 3 | PASS | service_mismatch | service_mismatch | hvac | PASS | - | - |
| el_18 | 3 | PASS | service_mismatch | service_mismatch | plumbing | PASS | - | - |
| el_19 | 3 | PASS | service_mismatch | service_mismatch | handyman | PASS | - | - |
| el_20 | 3 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_21 | 3 | PASS | out_of_scope | out_of_scope | - | PASS | - | - |
| el_22 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_23 | 3 | PASS | in_scope | in_scope | - | PASS | PASS | - |
| el_24 | 3 | FAIL | in_scope | in_scope | - | PASS | PASS | water_near_power |

## Verification actually run

- Runner completed 72 scored record(s); release gate: diagnostic override enabled.
- Structured observations, scoring, sanitized sidecar generation, and manifest validation completed before report writing.

## Human/domain review still required

- Tu/domain approval of the electrical textbook, safety wording, and product-policy calls remains pending; this harness cannot provide that approval.

## Risks/Limitations

- Corpus: docs/playbooks/eval/electrical-cases.json
- Routing is read only from the sanitized `intake_observation` contract; customer-facing copy is never used as a label.
- Raw sidecar contains whitelisted observations and error codes only; it excludes response text, session IDs, credentials, and customer data.
- Feature flags are requested configuration; `observed_playbook_state` is the structured runtime observation.
- Git SHA, playbook hash, and source-tree hash describe bounded local sources only; deployment attestation was not performed.
- Provider identity and sampling configuration are unobserved.
- Mock runs validate harness behavior only. Live improvement requires an approved staging deployment and an independent holdout.
- Safety-order, repeated-question, generic-fallback, complexity/slot completeness, token/cost, escalation, and repair metrics are not exposed by this structured contract and remain n/a.

## Decision

- **NEEDS_HOLDOUT**

## Next Step

- Complete owner/domain review, attest the staged deployment/source boundary, then run approved matched live baseline and After arms plus an independent holdout.
