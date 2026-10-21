# KAWA_01 owner-approved integration — local verification checkpoint

This is the pre-publication checkpoint for PR #403 into main. It records observed local results; final commit identity and GitHub CI results are delivered separately after publication. No merge or deployment is authorized by this report.

## Identity and preservation

Working branch: codex/kawa-foundation-safety-20261020. Starting local HEAD: 910bad7dbd41f1937d326c3a0ab83552ed4c2465; remote PR head before publication: 062db16094a5eb8168e9bdec9823c221aea729ae. Latest main, fetched again before publication: 111988b0ad6ec276082f6a4706866401fc887e4b. The isolated integration simulation retained all non-conflicting latest-main content. Only the two protected memory files conflicted. The owner approved both exact proposals in this conversation; memory-owner-approval-applied.json binds all four local writes to the approved byte hashes. Git stores normalized LF text; owner-approved working bytes are preserved in proposed-memory/.

The unrelated primary checkout is untouched. Earlier implementation, tests, dirty SSE repair and historical evidence are preserved. The prior packet manifest verified all 181 entries before this work. Historical reports remain historical, including their then-current blocked states.

## Scoped changes

Exactly 167 standalone source comment lines in 19 files were removed to meet latest-main policy. source-explanations.md preserves all removed explanations verbatim. comment-alignment.json records before/after hashes, identical parser-owned lexical leaves and identical comment-free printed AST, with zero parse diagnostics. Raw classifier hashes change with comments; semantics are unchanged. No gate, checker, assertion, threshold, collection rule or source logic was changed for this alignment.

The four-file SSE/recovery repair from the previous approved closure is preserved: explicit failures remain failures, callbacks cannot erase delivered emergency guidance, successful result callbacks wait for clean completion, and recovery cannot fabricate successful chat output after a validated emergency failure. Previous observed red/green traces remain in the immutable prior packet. All current Safety/Approval pillars ran again against the integration candidate.

Gate or protected-surface changes: no checker, workflow, test configuration or baseline was authored in this alignment. Integration imports latest-main governance, workflow and checker changes without weakening them. The two memory files are the exact owner-approved resolutions. Two report-only expected-literal changes in the full KAWA diff bind the electrical playbook version to v3 and keep its appendix/provenance assertions; no assertion was removed.

## Fresh verification

| Check | Observed result |
| --- | --- |
| Docker version gate | exit 0; Engine 29.9.2, Compose 5.6.0 |
| Seven-function Edge compilation | exit 0; discovered=7 selected=7 checked=7 failed=0; compatibility tests 4/4 |
| API full command | exit 0; Vitest 3,437 passed, 7 skipped, 0 failed; Node 115 passed, 1 skipped |
| Mobile full command | exit 0; 285 suites, 2,660 passed, zero snapshots |
| Shared | exit 0; 189 passed |
| API / Mobile / Shared / Sandbox types | exit 0 each |
| API production build in valid checkout | exit 0 |
| P416 / P417 / P418 | 17 / 15 / 29 passed; actual request/transport/hooks/reducer paths with controlled dependencies |
| P413 / P414 | 76 / 165 passed; includes 14 x 10 fixed sentinel cells and copy checks |
| Deterministic evaluation | exit 0; 99 fixture cases, provider invocation not attempted; not model accuracy |
| Multi-turn evaluation with pinned pnpm | exit 0; 19 passed |
| Monitor deployment / worker / Sandbox tests | exit 0; 205 / 19 / collected Sandbox tests respectively |
| Latest-main pending source oracle | zero comment violations; test integrity 0 blocking, 2 report-only; source hygiene empty |
| Governance / inventories | source structure/residue, skills, routes, runner parity, Docker/design/workflow contracts, pillars, collection, copy, playbooks, access, privileged, capabilities, migrations pass |
| ship:check machine half | all 10 gates passed; whole command exit 1 solely for pending Git state, to be repeated on actual committed branch |
| Source RPC scan | exit 0; 265 names, no unscannable sites; emitted SQL not executed against a DB |
| Authority and mobile lint | exit 1; same documented baseline missing Plan 3.4 citation and 75 errors / 87 warnings; no broad cleanup authorized |
| React Doctor | exit 0 with reported diagnostics; no device/performance proof |

Raw command records, exits and runner reports are in logs/. Initial pnpm-11/symlink and Turbopack junction failures are retained as failed environment attempts. Corrected runs use repository-pinned corepack pnpm 10.16.1. The multi-turn wrapper hardcodes the global shim, so its exact underlying Vitest command was run through pinned pnpm without modifying the wrapper. Work-plan reconciliation was corrected as task metadata, not by editing its checker.

API skips are in api-skipped-tests.json: local PostgreSQL opt-in, hosted Stage 1 and staging catalog were not activated. T0 handlers with injected state do not prove DB grants/RLS, locking, atomicity or concurrency. tested-integration-source-digests.json binds the source/config/governance inputs read by these runs. Final actual integration must match these hashes before using these results.

## Release containment

Repository NESTSCOUT_BACKEND_RELEASE_ENABLED changed from true to false, read back through GitHub API. Production has no override of that variable. The exact Backend workflow expressions were evaluated with false for main push and valid release confirmation, including successful dependency assumptions: both production jobs stay false. Positive controls with true permit the expected release paths. The safe GitHub probe run 39618458807 completed with all three jobs skipped. It used an intentionally invalid confirmation: that probe alone does not establish variable causality; the source truth table plus API readback establish the variable gate. No valid production-release dispatch occurred.

This blocks Backend main-push deployment, including its mobile-api deployment path, while retaining PR quality. It does not globally disable all workflows: latest-main release-production uses the owner-controlled local runner for actual Stage 1 release; Plan 55 still requires explicit dispatch/source validation. No Plan 55, paid-provider, EAS, local release runner or deployment was invoked. No secret was changed.

Production protection_rules are currently empty. production-approval-barrier.proposed.json prepares an owner-only reviewer/branch barrier, not an applied protection. It uses owner account ID 255643814, main-only branch policy and no admin bypass. Preventing self-review needs an independent actor/reviewer arrangement; no Dev Kouuu GitHub identity was guessed. Owner must apply and read back the proposed environment protection before a later release. Keep the Backend variable false. Do not re-enable it as part of integration or rollback.

## Acceptance boundaries

| Item | Status and meaning |
| --- | --- |
| W00 | PASS T0 scope, source/evidence provenance and preservation |
| W01 | PASS tested deterministic Safety/delivery mechanics; BLOCKED classifier/release acceptance |
| W02 | PASS T0 evaluator/provenance mechanics; independent blind/model validation NOT RUN |
| W03 | PASS T0 customer approval and role/ownership negative controls; T1 concurrency unproved |
| G0 | PASS scoped preflight/identity, no scope expansion |
| G1 | PASS current static/type/RNTL checks; real native/device and T1/T2 evidence NOT RUN |
| G2 | PASS scoped AST/lexical behavior preservation and actual API/Mobile/Shared regressions |
| G3 | Local machine gates pass; final committed ship gate and actual integrated PR CI pending |
| G6 | Exact protected-memory approval applied; current logs/hashes/rollback recorded; final acceptance awaits actual commit/CI |

H5 remains 11/29 exact routes (37.9%), 18 false negatives and 1/30 false positives, labelled REPRODUCTION, not independent validation. Frozen H5 data is not relabelled or tuned. The classifier limitation is not closed by deterministic fixture agreement or the offline emergency UI. Do not claim Production safety. Historical 599/600 failed identity remains unresolved.

T1 real PostgreSQL RLS/grants/locks/atomicity/concurrency; T2 multi-actor/device/deployed parity; real native layout/accessibility/performance; paid model and Production evidence remain unverified. No hosted changes, migrations/RPCs, KAWA_02 or six-service remediation were made.

## Rollback and publication rules

Before publication record both branch/main parents and final source hashes. Push normally, never force. Verify remote HEAD and all actual PR checks. No auto merge. On the branch, rollback a merge through a new reviewed revert commit (git revert -m 1 <integration-merge-sha>), then revert scoped KAWA commits only if the owner requests complete removal; do not reset shared history. After a main merge, use a reviewed revert PR against the exact main merge SHA. A code revert does not roll back any previously deployed backend or DB state. No deploy/DB changes occurred in this work. Keep containment false during rollback.

Claims -> evidence: current results map to raw logs, runner JSON, exact source digests and the release truth table. Not run: hosted/paid/native/T1/T2/Production and final CI at this checkpoint. Pre-existing (baseline): prior immutable packet includes pristine 910bad7d authority/mobile-lint reproductions. Comments/watermark: exact pending-main oracles clear; final committed CLI still required. Stop-rule triggers: no two unsuccessful source-repair attempts in this alignment; no checker edits. Final recommendation at this checkpoint: NEEDS OWNER APPROVAL for final merge only after committed gates and CI pass; Production release remains BLOCKED.

Evidence transport: docs/test-logs/.gitattributes sets only -text for these two evidence directories so Git does not rewrite CRLF bytes and invalidate recorded digests. No diff/whitespace/checker suppression is configured. Source diff --check passes. Whole-evidence diff --check reports raw captured whitespace and patch context, retained verbatim; this is not a source defect or a CI gate.
