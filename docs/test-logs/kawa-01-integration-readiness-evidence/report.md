# KAWA_01 final closure and integration readiness

**Verdict: NEEDS OWNER APPROVAL. Not READY FOR ACCEPTANCE; merge/release NO-GO.** The scoped SSE defects are repaired and the stabilized API/Mobile/Shared T0 tests pass. Protected memory resolution, effective release containment, latest-main hygiene compatibility, and current Edge compilation remain open. This is the implementer's engineering handoff, not independent review of its own implementation.

## 1. Exact candidate and scope

Date: 2026-10-21, Asia/Saigon. Repository: manhtu0407/HomeServices-. Branch: codex/kawa-foundation-safety-20261020. Local HEAD: 910bad7dbd41f1937d326c3a0ab83552ed4c2465. PR #403 remote HEAD remains 062db16094a5eb8168e9bdec9823c221aea729ae. Latest fetched and live main: 111988b0ad6ec276082f6a4706866401fc887e4b. Original merge base: ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72.

The source started clean at local HEAD. Four source/test files are now modified, listed in source-files.md and candidate-metadata.json. Evidence is added under this packet and its index/ledger links. No commit, push, merge, deployment, secret/release-setting modification, hosted DB mutation, migration/RPC addition, paid-provider call or SubAgent spawn occurred. The unrelated primary checkout was preserved. No KAWA_02 or service remediation was started.

The original six-page Mini Master Plan 01 and selected Master Plan v1.1 scope, repository Tier 1/router, ownership map, previous independent quality findings and delivery packet were reviewed. All 73 entries in the previous delivery digest manifest still match. The existing structured contract, mobile fallback, backend role guards, evaluator/EAS/observability corrections and protected source remain in place.

## 2. Auditable artifacts

- candidate-complete.patch.txt: full source/config/governance diff from the original merge base; historical evidence directories excluded to avoid recursive evidence packaging.
- closure-only.patch.txt: the exact four-file incremental diff from local HEAD.
- source-file-digests.json: 89 candidate source/config/governance paths, byte sizes and SHA-256 values.
- candidate-full-inventory.tsv: tracked candidate path statuses, including historical evidence and deletions; newly added packet files are inventoried in file-digests.json.
- candidate-metadata.json: local/remote/main identities, patch/manifest hashes and simulation tree.
- file-digests.json: final packet checksums, excluding itself.
- commands.json, runner JSON, logs/: real commands, exits, failures, skips, red/green traces and export provenance. Raw originals remain in ignored local scratch; exports remove personal path prefixes only, plus two token-like fixture-title fields explicitly listed in report-redactions.json. Test results/counts were not changed.

## 3. Confirmed defects, root causes and bounded repairs

| Defect | Reproduction and cause | Minimal repair | Regression |
|---|---|---|---|
| Received guidance lost when error observer throws | Real SSE transport returned STREAM_NETWORK without emergency instead of the received DB_ERROR envelope | Capture the explicit failure before observer delivery; prefer an error already parsed in the same batch | sse-red-real.log.txt: 1 failed / 15 passed; original tracer green afterward |
| A result callback could run before a later error, or repeat | onResult ran on each result frame before clean stream completion | Validate/store results, emit onResult once after clean EOF; any later error wins | P418 result-then-error and duplicate-result positive control |
| Case/normal recovery erased an explicit emergency failure | The recovery GET found a stored exchange, replaced the failed operation with success, and dropped the guidance | Preserve a validated emergency failure instead of reclassifying it via ambiguous-success recovery; ordinary recovery remains intact | recovery-both-red: 2 failed / 16 passed; recovery-green: 18 passed through the actual normal hook and Case recovery helper |
| A callback interruption in an earlier chunk stopped reading the later emergency frame | Cross-chunk tracer returned STREAM_NETWORK and no guidance | Isolate nonterminal observer exceptions while continuing bounded reads; a failed observer cannot produce a successful completion callback; explicit server error remains authoritative | cross-chunk-red: 1 failed / 28 passed; stabilized P418: 29 passed |

Callback delivery used two bounded implementation attempts; recovery used one. No third attempt or product strategy switch was needed. No assertion was weakened, test skipped, threshold changed, classifier tuned, or gate edited. The preliminary full pass exposed the cross-chunk gap; one complete final verification pass followed stabilization. All source hashes were rechecked unchanged after that final pass.

## 4. JSON/SSE/Mobile compatibility

The existing optional emergency field remains a strict v1 route whitelist. Missing fields remain compatible with old error handling; unknown versions/routes/extra keys are rejected. There is no free-text transcript, identifier or PII in this metadata. JSON status/code and SSE error outcomes remain failures. P416/P417 preserve the original 400/409/429/500 and other business refusals.

P418 now exercises deltas followed by an error, callbacks absent or throwing, later-chunk guidance, a result followed by error, duplicate valid results, EOF without result, response-completed without result, network disconnect, normal stored-partial exchange and Case state. Available validated guidance reaches the separate reducer slot. Failed output does not append successful chat turns or change the existing Case. An operation that already wrote on the server is not claimed to have been rolled back; authoritative DB atomicity and concurrent retries remain T1 concerns.

The unchanged local emergency button/opaque scrollable sheet works independently of API access and classifier detection; VI/EN static guidance interaction passes. The real product wiring remains present. No native layout or safety-domain certification is inferred from RNTL.

## 5. Final local verification

Exact commands/exits are in commands.json. The final stabilized pass, not the earlier preliminary pass, is the source of these counts.

| Check | Exit / observed result |
|---|---|
| pnpm test:api with JSON reporter | 0; Vitest 3,439 passed, 7 skipped, 0 failed across 201 files; Node contracts 114 passed, 1 skipped |
| pnpm test:mobile --runInBand --watch=false with JSON reporter | 0; 285 suites / 2,660 tests passed |
| pnpm test:shared | 0; 189 tests passed |
| API, Mobile, Shared type-check aliases | 0 each |
| pnpm build:api | 0 |
| Safety/Approval collection | P416 17/17, P417 15/15, P418 29/29, P413 76/76, P414 165/165 |
| Comments under current branch rule, source structure/baseline, residue, runner parity, skills, protocol routes, collection, pillars, playbooks, copy, access/privileged/capability/transaction inventory | applicable commands 0; ship machine half also passed all 10 gates |
| pnpm ship:check | 1, NOT READY due to four uncommitted source paths. No commit was made to hide this. After its final child exit-1 summary the wrapper lingered without Node children and was interrupted; raw output and that distinction are retained |
| git diff --check | 0 for final source, then repeated after final documentation |
| pnpm lint:authority | 1; exact same missing Plan section 3.4 citation on the pristine 910bad7d export |
| pnpm lint:mobile | 1; 75 errors / 87 warnings, reproduced as exactly 75/87 by ESLint on the pristine committed export; no findings in the four touched files at baseline |
| pnpm doctor:react:changed | 0, one warning on the unchanged six-item emergency-guide ScrollView; no native performance claim |
| pnpm lint:edge-db / migration inventory | 0; 265 RPC names, 0 unscannable sites. No database was compared; not runtime parity |
| pnpm docker:version:ensure | 1; stable updater timeout underlying 124 after 300s, Engine 29.9.1 / Compose 5.6.0 observed. One attempt, no automatic retry |
| pnpm edge:check, all seven functions | NOT RUN in this attempt because the required Docker gate closed. Historical 7/7 is retained as historical, not current-candidate proof |
| Secret/artifact checks | Gitleaks current source/evidence export clean after declared fixture-title sanitization; release-client/artifact contracts passed in API/Node tests; no native binary/EAS release was built or refreshed |

API skips: five opt-in P400 local DB cases, hosted Stage 1 Agentic flow, and staging catalog integration. Node has one skipped context-dependent case. Full identities are preserved in runner JSON and api-skipped-tests.json. No hosted/staging test was activated.

The transaction checker proves catalog integrity (65 entries, 53 routes, 8 surfaces). Its default run reports 0/445 executed bound assertions and 77 external release-evidence gaps; it is not evidence that 445 DB/business assertions executed. The historical 599/600 failure remains **UNRESOLVED**: its original failed-test identity was not recovered. Larger current green suites do not close it.

## 6. Fixed Safety and Customer Approval acceptance

See safety-approval-matrix.md and safety-approval-results.json. All predefined critical sentinel cells pass, including the fixed 14-report x 10-route matrix, and no known gate bypass remains in those tested supported entry points. P413 wrong-role, foreign-actor, missing-approval and reachability checks pass without unauthorized business writes/provider calls. Emergency handling does not manufacture customer consent, Job/matching, scope, completion or payment approval. Customer/Worker/Admin privacy and ownership controls remain in force at the tested Edge seams.

Previously confirmed admin intake/evidence and worker-action role defects remain guarded by P413. All eight previous emergency rejection delivery classes remain guarded by P416, strict metadata by P417, and real mobile delivery by P418. P402/P403/P415 preserve evaluator provenance, observability and wrong-route scoring corrections. These are T0 assertions against real code with controlled dependencies, not PostgreSQL/deployed proof. Historical scope-decision replay wording and unproved scope-term immutability are corrected in the current matrix.

## 7. H5 limitation and release containment

H5 remains **11/29 exact emergency detections (37.9%)**, 18 false negatives, 1/30 false positives. The sealed canonical SHA-256 remains 80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d; both classifier files are identical to the pristine committed baseline. This is a preserved historical reproduction, not independent blind validation or general real-world reliability. Offline access mitigates availability only; it does not make detection adequate.

Merging can expose this classifier if the enabled Backend release path succeeds. The actual latest-main release-backend-system-health workflow triggers on main pushes and deploys mobile-api, not only the observer. Repository variable NESTSCOUT_BACKEND_RELEASE_ENABLED is true; Production KAEL_AI_KILL_SWITCH is false; Production protection_rules is empty; classic main protection returns 404 and repository rulesets are empty. A paid-AI kill switch would not contain a deterministic emergency gate that intentionally works with AI disabled.

Latest main's release-production workflow now uses a local release runner / main quality lane; Plan 55 production callers require explicit workflow_dispatch source input. These changes do not remove the separate enabled Backend auto-deployment path. Existing red quality gates and release evidence gaps are not accepted as durable containment.

**Containment is NOT enforced. No merge recommendation is given.** Proposed owner action: set the Backend automatic release switch false before integration, verify the resulting workflow skip on the actual merge source, and require an effective owner review barrier for Production. Preserve manual Plan 55/native release approval. These are proposals only; no GitHub/release settings were changed. If automatic classifier exposure is later requested, independent blind validation and an approved mitigation strategy are still required.

## 8. Integration and conflict investigation

A new detached isolated worktree ran git merge-tree --write-tree --messages against the latest main: exit 1, exactly .claude/MEMORY.md and docs/memory/2026-10.md conflicted. No memory working file was written. The four-file final patch applies cleanly to the merged source index. Final simulation tree: 50245345958bab6843297eea9ab9a6335a20442f. It contains unresolved memory blobs and is not a clean merge/commit.

All non-memory main changes were materialized only in the temporary checkout, including its deletions (old file copies preserved in ignored scratch). Final merged-source P418 + latest-main iOS readiness: 33/33 pass; Mobile type-check passed on the merged source before the final callback-isolation addition, and final branch Mobile type-check passed afterward. No integration CI was run. Dependency junctions reused the unchanged lockfile modules. A pnpm 11 safety check refused its task-state path on the junction; this tooling failure is retained. Direct Node/Jest then ran the same real tests/config without pnpm task-state writes.

The proposed memory files concatenate the two non-overlapping concurrent additions and retain surrounding auto-merged history, including main's release-runner and new skill entries. They are review-only, under proposed-memory/. No ours/theirs selection or memory write occurred.

**Additional integration blocker:** latest-main zero-added-comment policy reports **167 comment lines in 19 candidate production files**. Its test-integrity checker reports 0 blockers / 2 report-only historical expected-literal changes; added-hygiene reports 0. These new-main rule findings are not runtime SSE regressions and were not silently waived or swept across unrelated source. The candidate cannot clear latest-main CI as it stands. A scoped standards alignment decision is required before an actual integration candidate is approved; the gate must remain enforced.

## 9. Native and runtime limitations

T1: real Postgres migrations/RLS/grants/constraints/locks, approval atomicity, actor row isolation, scope-term immutability and concurrent confirmation/retry behavior were NOT RUN. No fresh local stack was initialized. T2: real local Edge-to-DB end-to-end/concurrency was NOT RUN. T2+: paid model/blind validation NOT RUN. T3: physical iOS/Android, network loss/relaunch, Production telemetry/canary/deployment NOT RUN.

Required device checks before release: VI/EN in light/dark mode; large text/VoiceOver/TalkBack; emergency access with API offline and while another request fails; long guidance scrolling and safe areas/keyboard; Reduce Motion/Transparency; interrupted SSE without duplicate final bubbles; app relaunch/uncertain outcome reconciliation. RNTL/CI cannot substitute for these frames and interactions.

## 10. W00-W03 and gates

| Work / gate | Assessment |
|---|---|
| W00 | T0 baseline/source identity reproduced; known failures distinguished; current Edge/hosted/native gaps explicit |
| W01 | Fixed development sentinel + delivery T0 PASS; classifier release reliability and containment BLOCKED |
| W02 | T0 taxonomy/provenance/denominator tests PASS; 100-case blueprint remains a blueprint, no real-model claim |
| W03 | T0 telemetry/privacy tests PASS; real hosted telemetry and DB behavior UNVERIFIED |
| G0 | Source authority/identity reviewed; baseline authority citation and latest-main compatibility gate remain red |
| G1 | T0 isolated worktree used; T1 runtime isolation/behavior NOT RUN |
| G2 | Red-capable regressions observed, bounded fixes green; stabilized full pass completed |
| G3 | Predefined safety/approval/privacy T0 PASS; overall release/integration clearance BLOCKED |
| G6 | Auditable packet/manifest prepared; session memory proposals shown for owner approval, not written |

## 11. Rollback and owner boundary

The four-file closure patch can be reversed only on an isolated clean copy after verifying its hash and running git apply --reverse --check. Do not reset the primary checkout or reverse the earlier authorized safety delivery. There is no new DB schema to roll back. The simulation is disposable and does not move the task branch. No Production rollback was executed or claimed; any future release must retain its source-bound rollback artifacts and follow the protected release procedure.

Owner actions still required:

1. Review the exact candidate/patch hashes and the two proposed merged memory files plus current session-memory draft; approve before writing protected memory.
2. Approve and enforce release containment before any main merge; review the 167-line latest-main standards incompatibility and authorize the exact alignment path without weakening gates.
3. Restore a valid Docker preflight and obtain current seven-function Edge compilation; retain T1/native/blind-validation limits until their own approved execution.
4. Only after those blockers close, separately authorize commit/push. Verify the remote approved SHA, run final CI on the actual clean integration candidate, require all mandatory checks, and obtain another explicit owner approval for the exact final SHA and main target. Never merge automatically.

See tooling-attempts.md for failed logger/junction attempts, which are not test passes.

No final SHA has been committed or approved in this session. Independent acceptance remains external to this author's report.

## 12. Author review and process reconciliation

Fixed point: local HEAD 910bad7d; review surface is git diff HEAD for the uncommitted four-file repair and documented evidence additions, plus the source patch from the original merge base. Spec compliance: requested partial/error SSE paths and real state integration are covered without restarting delivery. Rules/standards: no new business authority, PII field, provider, RPC/migration or protected memory write; current branch source gates pass, while latest-main historical comment compatibility remains explicitly red. Maintainability: three small production-owner edits, existing transport/hook/reducer seams reused, no new runtime module or dependency. No unrelated stream infrastructure refactor.

Comments added to production source: none. No AI attribution, debug scaffold, bare TODO, gate relaxation or new test skip. The work-plan reconciler initially rejected metadata schema/classification; only the plan metadata was corrected, then 3/3 slices closed with exit 0. No checker was changed. Review is by the implementation author and is not independent acceptance.

Scratch measured 352183811 bytes without following dependency junctions; no cleanup/deletion performed. The temporary simulation is retained for owner review; protected memory in the source checkout still matches HEAD exactly after line-ending normalization.
