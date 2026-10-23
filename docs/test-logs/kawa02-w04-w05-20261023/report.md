# KAWA_02 Implementation and Acceptance Report - approved W04/W05

Updated 2026-10-23T01:26:25.665634+00:00 UTC / 2026-10-23 Asia/Ho_Chi_Minh. **W04 VERIFIED at T0; W05 VERIFIED at T0; W06 BLOCKED; W07/W08 NOT_RUN.** The full W04-W08 module is not complete. This report supersedes the approval-pending output report; the original audit/entry evidence directory and ledger checkpoints remain historical.

## Authorization, baseline and candidate

The human explicitly approved: "Chấp thuận phạm vi W04/W05 và các path đã đề xuất" in response to the limited-entry/path question. This accepts only isolated W04 schema/registry and W05 offline shadow development. It retains the Plan01 H5/independent/T1 gaps and does not authorize W06, live route integration, a hosted release, paid models or Git publication. The later message that Docker was reopened permitted another runtime verification attempt; it did not expand that scope.

Baseline/current Git HEAD and fetched origin/main: `4ee3a732d5ddd724d5055465664f8d5c1b0af0ce`. Branch `codex/kawa02-audit-execution-20261023`; worktree `C:\ns-fix\kawa02`. **No candidate commit SHA exists** because commit/push are prohibited. Exact candidate file hashes are in `source-digests.json`; OCR source snapshot is `7a10e16b044d81f57d702019a95bf08be4180737`. No earlier PR branch or unrelated dirty checkout was edited.

## Sequential package results

| Work package | Status | Implementation and evidence | Open dependency |
| --- | --- | --- | --- |
| W04 | VERIFIED, T0 | strict schema twins, immutable local registry, 31 tests and 3 killed mutants; checkpoint before W05 | durable registration and deployment not claimed |
| W05 | VERIFIED, T0 | bounded deterministic proposals, exact v1 control preservation, 31 tests and 3 killed mutants | route integration intentionally absent under approved scope |
| W06 | BLOCKED / NEEDS_OPERATOR | no durable store, migration, CAS, retry persistence or restart implementation | separate server-owner and migration-safety approval; then verified isolated PostgreSQL G1 |
| W07 | NOT_RUN, dependency-blocked | existing v4/v6 authority audited/preserved; no receipt/commit adapter | verified W06 plus existing-RPC receipt design/review |
| W08 | NOT_RUN, dependency-blocked | no outbox or app hydration integration; no real notifications | verified W06/W07; separate scoped event/notification-owner work |

Only W04 and then W05 were implemented. The W04 checkpoint records the initial green suite and mutation results before W05 source was created. Later combined verification binds the final source hashes. No five-package PR or any other PR was created.

## W04 contract and ownership

New approved paths: the two `contracts/workflow-definition.ts` twins, Edge `kael/pipeline/workflow-registry.ts`, and collected `unit/workflow-definition-registry-pillar.test.ts` (P432). The twins are byte-identical, with no new duplicate exported type group or structure-baseline edit.

- Schema version `workflow-definition/v1`, immutable positive definition version, fixed owner, four explicit role names and exactly the six existing services.
- Strict trigger/input contract; identifier, boolean, bounded integer and bounded choice fields. Unknown object keys are rejected at top-level and nested levels. No SQL, JavaScript, URL, arbitrary RPC or tool-execution field.
- Nine allowlisted node kinds; typed success/failure/approved/event/retry edges; unknown, duplicate, dangling, unreachable and unsupported transitions refused. Every node has a path to a declared terminal.
- Deliberately narrow v1 graph vocabulary: DAGs plus explicit self-retries for pure classify/retrieve/reason/validate nodes, at most two retries/three visits. General cycles are rejected, including cycles without provable bounds. Execute/event/finish nodes cannot retry as side effects.
- At most32 nodes,96 edges,16 input fields,64 steps,16 declared calls,1,000,000 declared cost microusd,300,000ms duration/deadline,10,000ms node timeout. Worst-case declared visits/time must fit the total budget; malformed/oversized definitions fail before registration.
- Exact owner and service-policy ID/version snapshot pins; capability version1.0.0 plus generated registry source SHA-256; unknown or role-forbidden capabilities rejected. Customer confirmation is narrowed to customer even though general route metadata also lists admin; existing actual domain authority is not relaxed.
- Mutating capability declarations require approval metadata and an approval node on every path to that declaration. The registry validates structure only; it does not authenticate an actor, execute a capability, issue consent, create a Job or replace the domain RPC owner.
- Registration clones/validates/freezes definitions, rejects any overwrite, and requires explicit version lookup. New versions coexist with old pins. `disableRegistration()` blocks additions while preserving existing versions and lookups. This rollback behavior was exercised locally.

## W05 shadow behavior

New approved paths: Edge `kael/pipeline/workflow-shadow-planner.ts` and collected P433. `runWorkflowShadow(control, registry, request)` returns the **same control reference** and a separate immutable proposal. A test passes actual output from the existing `runKaelPurposeStage` and verifies its stage executes once, output bytes/reference are preserved, and the shadow never invokes it again.

The planner reads only registered pinned definitions. It validates role/service, typed facts, bounded deadline and an optional strict JSON proposal (at most8192 characters/64 nodes). It rejects stale versions, wrong entry, unknown nodes, invalid edges, excess retries/steps, partial graphs and executable payloads. The monotonic elapsed-time bound is tested. It stops at `request_approval` or `wait_event`; supplied proposal paths cannot claim approval or resume an unreceived event. Emit/execute node output is explicitly **proposal_only**, with no dispatcher. Raw fact values are not retained in its result.

There is no provider, database, HTTP, RPC, callback-tool or domain-service dependency in the planner. Dynamic spies cover fetch, Supabase from/rpc and provider callAI, including a valid execute-capability proposal, with zero invocations. All actual call/cost/effect counters are zero. Positive declared budgets do not authorize spend. No runtime provider or OpenAI dependency was introduced.

No production route imports either module; the only Edge reference between them is a type import. Therefore v1 route selection and all existing traffic wiring remain unchanged. There is no live traffic measurement or deployed shadow comparison claim. This is the approved local shadow slice, not a live adapter or durable executor.

## Commands, exit codes and sample sizes

Raw argv/cwd/time/exits are in `commands.jsonl`, runner stdout/stderr and tool-derived runtime receipts. Earlier failed attempts are retained, not relabelled pass.

| Check | Exit | Actual result |
| --- | --- | --- |
| W04 tracer before new modules | 1 | missing module,0tests; availability red, not a behavioral mutation |
| W04 strict-field regression before fix | 1 | new top-level executable field wrongly accepted; focused red observed |
| final W04/W05 focused Vitest | 0 | **62 passed,0failed,0skipped**: P43231 and P43331 |
| W04 mutants: overwrite, approval path, role check | 1 each | killed;1,1,2 failures respectively, then source restored and suite green |
| W05 mutants: v1 control, approval stop, actor scope | 1 each | killed;17,1,2 failures respectively, then source restored and62 green |
| generated graph property loop | 0 within P432 |31 graph sizes (2-32 nodes), each accepted at its bound and rejected below it; six-service twin parity also tested |
| full `node scripts/run.mjs run-package-script @nestscout/api test` | 0 | Vitest5755 pass/7skip; Node115 pass/1skip |
| follow-up full Vitest JSON to resolve skip variance | 0 | **5756 pass/6skip**, both new pillars31/31; catalog reachability difference explained below |
| API and shared type-check via existing dispatcher | 0 each | no diagnostics on final source |
| shared full tests via existing dispatcher | 0 | **189 pass**,10files |
| Docker version gate, initial attempt | 1 | updater failed, no retry until owner reopened Docker |
| Docker version gate after owner reopened | 0 | Engine29.9.2,Compose5.6.1; updated-or-current |
| `db:local:doctor --profile lean` | 0 | daemon reachable,disk/ports pass,RAM informational; no local DB start/reset |
| `edge:check --only mobile-api` | 0 | selected1/checked1/failed0; compatibility4/4 |
| pinned Deno direct check of new schema/registry/planner | 0 | all three explicitly checked; the new modules are not reachable from the live entrypoint |
| structure/baseline/comments/added hygiene/test integrity/collection | 0 each | no baseline/gate/oracle relaxation; integrity0blocking/0report-only |
| pillar registry | 0 | P432/P433 uniquely registered; only generated documentation index updated |
| fresh Production RPC-name query + source comparison | 0 |381catalog rows;265called names all present,0unscannable; no SQL write |
| OCR plan,10batch diffs,source mark/check | 0 |19reviewable files reviewed,60excluded handled manually; no source findings |

The existing API runner's full command skipped P400's five opt-in isolated-DB cases, P59 hosted flow and the catalog when unavailable. After Docker reopened, a direct Vitest run also executed the existing **read-only implicit loopback service catalog** case, accounting for5756/6 rather than5755/7. Its source is unchanged. No stack was started/reset by this task and no test write resulted from that catalog query. That auto-discovered local target is **not** claimed as isolated W06 T1 acceptance. No hosted integration or mutation opt-in was enabled. `final-api-skipped.json` identifies the remaining six rows; the Node skip is Linux-specific process inspection.

Build/mobile-device/full mobile suite were not run: no existing mobile/source consumer or public barrel was changed; the selected checks cover the new isolated contracts/Edge modules and existing API/shared regressions. Deno compilation is runtime type evidence, not native UX or database transaction proof.

## Corrections and test integrity

The structure ratchet initially rejected an exported type duplicated in the contract twins. It was made internal with a registry-local inferred type; no grandfather/baseline entry was added. One test fixture's inferred union caused a type error; a separately constructed node array corrected the test's TypeScript shape. Strict parsing was corrected after a real failing top-level payload test. Unknown-proposal-node diagnostics were ordered before edge diagnostics. A privacy test initially reused the policy UUID as its case UUID; the synthetic case ID was made distinct, with the non-leak assertion retained. Fractional facts now pass only primitive-envelope parsing and are rejected by the declared integer-field validator; accepted input semantics were not loosened. Each failure's raw JSON/log is preserved. No assertion was deleted or weakened, no skip added and no protected checker altered.

## Gates, rollback and limitations

G0: limited owner entry/path approval received and recorded. G2: final T0 regressions/type checks/Deno pass. G3: role/capability/approval-negative T0 checks pass, not token authentication or RLS proof. G4: immutable old/new definition pins and explicit lookups pass. G6: per-package checkpoints, raw commands and source digests recorded in the existing ledger. G1 for a durable database remains **NOT_RUN**; no schema change was authorized.

W04 rollback closes registration and retains pinned versions. W05 rollback omits the optional shadow call; the tested control remains identical. Old definitions still plan after registration closes. No runtime import/flag, database object, outbox or deployed artifact needs reversal. Restarts/replay, SQL RLS/transactions/CAS/concurrency, human receipt expiry/hash binding and idempotent outbox effects are unverified pending W06-W08, not simulated as completed.

Historical H5 remains the existing11/29 REPRODUCTION record; not rerun, tuned or relabelled. Current lexical regression passes are not independent model recall. Independent evaluation, native/device/UAT and operator acceptance remain deferred to the Project Owner/Dev Kouuu. No real push/payment/customer action or paid model call occurred.

## Review and operator handoff

Source review covered spec, repository rules and maintainability. Contract twins match; files are below800lines; no added production comments; existing v1 files and confirmation/payment owners unchanged. The OCR snapshot's apparent `.env.example` deletion is a filtered snapshot artifact: the real file exists and matches HEAD, independently verified. JSON evidence was schema/integrity checked and engineering scripts reviewed; excluded Markdown/logs were manually checked. Review is by the implementation author, not independent acceptance.

Gate or protected-surface changes: **no checker,workflow,test collection,structure baseline,capability/access inventory,RLS/payment/security policy or secret change**. Only the canonical generated `governance/protocols/test-pillars.md` index gains P432/P433. No live execution plan was overwritten. Protected repository memory remains unchanged; its show-before-write approval was not granted. Memory draft remains review-only.

Next eligible package is **W06**, but the owner explicitly limited approval to W04/W05. Before W06: obtain server-owner/schema-migration safety approval, preserve exact definition/instance version semantics, then verify a separately owned isolated PostgreSQL target and implement/test the additive persistence slice. No W06 file or migration proposal is silently authorized by opening Docker. W07 and W08 follow only after their dependencies pass. Do not start Plan03.

The Backend audit remains **DRIFT_DETECTED**, with the two payment migrations absent at its timestamp and managed Edge deployment IDs unattested. These local W04/W05 changes have not been released. No commit,push,PR,merge,hosted migration,Edge deployment,release dispatch,Production flag/secret/control update or Production data write occurred. Stop at this operator handoff.
