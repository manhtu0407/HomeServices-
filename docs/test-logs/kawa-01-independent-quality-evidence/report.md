# KAWA_01 independent quality and merge-readiness review

Date: 2026-10-21, Asia/Saigon. Verdict: **BLOCKED** for acceptance CI and merge.

Reviewed branch: `codex/kawa-foundation-safety-20261020`.
Reviewed commit: `062db16094a5eb8168e9bdec9823c221aea729ae`.
Latest fetched/main and live remote: `111988b0ad6ec276082f6a4706866401fc887e4b`.
Merge base: `ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72`.
PR: [#403](https://github.com/manhtu0407/HomeServices-/pull/403), open, conflicting, not merged.
The original five-commit PR has 188 changed paths; see `reviewed-pr-inventory.tsv`.
Corrections in this packet are uncommitted. No new merge-candidate commit SHA exists yet.

## Scope and evidence authority

The owner's Independent Quality Support brief authorizes independent verification, confirmed scoped corrections and
local gates, and reserves public-contract/UI-flow, paid-model, RPC, migration, final CI and merge decisions.
The KAWA_01 six-page packet and Master Plan v1.1 were read from the supplied Downloads PDFs. The relevant source
contracts are W00-W03 and Master Plan pages 12-18 and 26; later work packages are context, not authorization.
Repository Tier 1, `STRUCTURES.md`, ownership map, active `Plan.md` context, and selected review/security,
diagnose/TDD/backend/docs protocols were inspected. The active governance plan was not rewritten.

Two read-only sidecars examined Safety and Approval independently. The main agent reran the safety probes,
reviewed the findings against source, made every correction, and owns all recorded verification.
The dirty primary `codex/stage1` checkout and other worktrees were preserved.

## Confirmed and rejected claims

Paths below are repository-relative; line references identify the reviewed source unless the row says corrected.

| Claim | Independent result and evidence |
|---|---|
| D-01: emergency plus invalid schedule now reaches a normal reply on the supported open-Case paths | Confirmed for tested inputs. `domains/kael-chat/turn.ts` invokes the emergency response before the schedule refusal; `create.ts` drops the invalid schedule for that recognized emergency. P411/P412/P414 run, with response, guidance, no provider and no commitment assertions. This does not cover failing media on a new Case. |
| D-02: assistant and normal-chat emergency gate precedes paid steps/quota/status refusal | Confirmed within the described routes: `domains/customer/assistant.ts`, `domains/kael-chat/customer-conversation-turn.ts`, P412/P414. The new-Case quota at `create.ts:167` remains before emergency reply creation. |
| D-03: admin cannot decide intake or submit/skip customer evidence | Confirmed: customer guards at `intake-confirmation.service.ts:47` and `evidence.ts:67` precede business DB access. P413 stateful negative cases preserve session/turns; owner controls remain allowed. Evidence-stream uses the same service. |
| D-04: admin/customer cannot accept or decline as worker | Confirmed: worker guards at `domains/matching/accept.ts:17` and `decline.ts:10`, before RPC/query. SQL actor binding is not independently executed evidence here. |
| Every recognized report reaches guidance before any media/refusal | Rejected as a general claim. New-Case preparation consumes media first; advisory electrical/water paths fall through required-evidence/media refusal. See the failing probes below. |
| H5 is an independent quality PASS | Rejected. Fresh execution reproduces 11/29 detection and exact routes, 18 false negatives, 1/30 false alarms. The label stays `REPRODUCTION`, `independent_validation:false`, T0. H5 and both classifier files remain unchanged. |
| P415's proposal verdict accounts for wrong routes | Rejected at reviewed HEAD; corrected in this packet. All-positive-to-fire could clear the proposal with 200 wrong routes. |
| Emergency actor hashes are still logged | Rejected at reviewed HEAD: `platform/turn-trace.ts:308` suppresses the hash for `EMERGENCY_*`; P403 tests each route. Hash computation still occurs, but the sensitive log association is withheld. |
| Emergency assistant stage is recorded distinctly | Rejected at reviewed HEAD: `emergency_routing` became `other`. Corrected here by mapping to the already-supported `emergency_gate` only in the trace adapter. |
| Admin can forge a customer emergency turn through the shipped HTTP route | Rejected. Real handler probe returns 403 `KAEL_PATH_CONTROL_DENIED`, zero turns/providers. `http.ts:491`, `router-kael-path-control.ts:41`, and `kael/kael-guardrails/path-control.ts` protect turn/stream before dispatch. A missing internal domain-role check alone is not an HTTP exploit. |
| Repeated scope decision returns the prior durable decision | Rejected wording in the earlier approval matrix. Collected P87 returns 409 `ALREADY_DECIDED`, without repeated notification; SQL `20260905105000_scope_decision_customer_authority.sql:81` agrees. Durable proposal retry is different. |
| Presented scope terms are immutable | Unverified, not a guarantee. Existing verified-price/status and quote-binding triggers do not prove every presented scope field is frozen. No generalized scope-term freeze was established. |

Historical evidence documents are retained. This report supersedes their overbroad claims; it does not rewrite old
observations to match the current candidate. The old approval matrix's wording is corrected by the rows above.

## Remaining Safety release blockers

The reproducible diagnostic `safety-probe.cjs.txt` runs the real Edge HTTP handler with injected auth, an in-memory
PostgREST stand-in and provider-fetch stubs. It is **not** a PostgreSQL or hosted test. `safety-probe.json` contains
the results; execution exits **1**, with four guidance-delivery failures among six hazard cases. The seventh case
is an admin-denial control. No provider was called in any case.

| Probe | Actual result |
|---|---|
| New Case, recognized fire, no photo | 201, guidance includes 114, one Case, zero provider calls |
| Same fire plus foreign photo reference | 400 `VALIDATION`, no guidance, no Case |
| Same fire plus own photo without a valid upload intent | 400 `MEDIA_INTENT_INVALID`, no guidance, no Case |
| Required-evidence skip with recognized fire | 200, guidance includes 114, two turns |
| Required-evidence skip with recognized electrical arcing | 409 `EVIDENCE_REQUIRED`, no guidance, no turns |
| Existing Case, recognized electrical arcing plus invalid photo | 400 `MEDIA_INTENT_INVALID`, no guidance, no turns |
| Admin posts recognized fire to another customer's Case | 403 `KAEL_PATH_CONTROL_DENIED`, no turns |

The first create gap is `create.ts:169` -> `intake.ts` media validation, before
`processInitialKaelChatMessage` at `create.ts:280`. The advisory gaps are `turn.ts:167`/`:176` and
`evidence.ts:124`/`:139`: early delivery only handles stopping or parked emergencies. Required evidence and media
ownership must continue to fail closed; a fix must deliver safety information without pretending rejected media
was accepted or work approval was given. Proposed changes await owner decision.

Additional blockers:

- New-Case quota can return 429 before guidance (`create.ts:167`). A bounded exception is an abuse-policy decision.
- Closed Cases, write failures and SSE failures may carry or generate safety information that the client cannot
  display. `customer-kael-chat-helpers.ts:20` selects fixed copy by code; `stream.ts:168` emits fixed stream error
  copy. The ordinary HTTP envelope is `{ success:false, error:string, code:string }`, with optional extra/meta;
  SSE error is `{ code, message }`. Adding text to `error` alone does not repair delivery.
- The two published PR negation examples still return null in a fresh classifier probe, including the Vietnamese
  smoke report preceded by "không biết". The old cháy/chạy/chảy examples now correctly return null for ordinary
  water/HVAC text; mixed fire/medical routes to uncertain. See `pr-classifier-recheck.json`. These are public,
  author-visible regression examples, not a blind set or an accuracy estimate. The negation check is in
  `emergency-guidance.ts:451`-`:460`; no classifier tuning was performed in this review.
- H5 recall 37.9% is a serious release risk, not rescued by a green sentinel matrix. Its frozen canonical hash is
  `80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d`.
- There is no independently authored, sealed blind corpus, so unseen-wording generalization remains NOT_RUN.

The existing 140-cell sentinel matrix verifies specified phrases at ten entry points; it omits the failing-media
and advisory-refusal combinations above. P414's 165 collected tests include those 140 cells and controls. Its green
status is valid for that matrix, not for every early-return path.

Official reference rechecked: the [Government's national 112 guidance](https://xaydungchinhsach.chinhphu.vn/tong-dai-so-112-tiep-nhan-24-7-cac-thong-tin-ve-su-co-thien-tai-tham-hoa-119250902150528929.htm)
describes nationwide 24/7 intake and transfer to the specialist numbers. No emergency-number policy changed here.

## Authorized corrections and regression evidence

| Correction | Root cause | Red -> green evidence |
|---|---|---|
| 17 historical `.log` files renamed to `.log.txt` | Full-source identity includes the tracked logs, but `.easignore` excludes `*.log` | Existing EAS assertion exits 1 with `17 !== 0`, then 0 with 1/1 passed. All 17 before/after SHA-256 and byte lengths match in `evidence-renames.json`. No ignore rule/assertion was weakened. |
| Final-closure README and digest references updated | Renamed paths would otherwise dangle | Digest paths changed; only the changed README hash was refreshed. Other historical source hashes retain their original checkpoint meaning. |
| Blind scoring rejects wrong emergency routes | Proposal verdict used detection recall but ignored exact routing | P415 regression: 240/240 detected, 40/240 exact, 200 wrong, no sample shortfall; baseline wrongly returns false for blocker. Red 1/17, then green 17/17. Helper adds one failure reason; numeric thresholds and owner-approval flag remain unchanged. |
| Assistant trace uses canonical emergency stage | Answer decision emitted `emergency_routing`, absent from trace allowlist | P403 composes a real emergency answer through trace fields and builder: baseline `other`, expected `emergency_gate`; red 1/31, then green 31/31. One adapter expression changed; log-only, no new schema value or client response change. |

Source/test changes: `apps/api/src/__tests__/helpers/emergency-blind-eval.ts:143`,
`unit/kael-emergency-blind-eval-pillar.test.ts:162`, `unit/kael-observability-contract-pillar.test.ts:50`,
and `supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-trace.ts:27`.
No existing assertion was removed or relaxed. The two added tests fail against the original behavior.

## Approval, replay and atomicity limits

P413's 76 collected cases cover 20 customer routes as admin and worker, seven worker routes as admin and customer,
stateful owner/negative controls, stream refusals, malformed approval-evidence requests and import reachability.
Source guards also exist at offer confirmation (`confirm.service.ts:37`), candidate confirmation/rejection
(`candidate.ts:118,223`), scope decision (`scope-change/decision.ts:34`), completion/payment
(`manual-bank.ts:93,178,227`), and matching access (`platform/access.ts:43`).

These T0 cases prove no business write/RPC/provider in the tested wrong-role calls. Some paths read context before
refusal, and the request audit is intentionally written. The earlier P413 invariant's blanket "before the database
is touched" is stronger than those assertions. Authentication is injected; JWT acquisition and profile-role loading
are not proved. The module denylist covers `manual-bank.ts` through payment writers, although naming the completion
writer explicitly would improve future relocation detection; no present reachability bypass was demonstrated.

**Not proved:** live JWT auth, RLS/grants, database constraints/triggers, price-receipt binding under real SQL,
transaction rollback, row locks, concurrent confirmation/accept/approve-vs-reject, payment settlement, scope-term
immutability or native approval rendering. Bounded in-memory retries are not PostgreSQL atomicity.
See `owner-decisions.md` for the isolated T1 plan. No product RPC, migration or approval-receipt redesign was added.

## Local verification

Raw logs and command/exit records are in this folder. Full test counts are runner totals, not a quality score.

| Command or check actually run | Result |
|---|---|
| `pnpm type-check:api` after final source correction | PASS, exit 0 |
| `pnpm test:api` after final source correction | PASS: 197 files; 3,408 passed, 6 skipped. Separate Node contracts: 114 passed, 1 skipped |
| Focused API P401-P415 JSON runner | PASS: 14 files, 951 assertions; P403 31, P411 37, P412 52, P413 76, P414 165, P415 17 |
| `pnpm type-check:mobile`, `pnpm test:mobile` | PASS: 284 suites, 2,631 tests; native runtime not exercised |
| `pnpm type-check:shared`, `pnpm test:shared` | PASS: 10 files, 189 tests |
| `pnpm build:api` | PASS, exit 0; reference/admin Next.js build, no deploy |
| `pnpm lint:api` | PASS, 0 errors, 11 warnings |
| `pnpm lint:mobile` | FAIL, exit 1: 75 errors, 87 warnings; all 63 diagnostic files match reviewed HEAD (clean-filter Git blob comparison) |
| `pnpm lint:authority` | FAIL, exit 1: unchanged `normal-chat-suggestions-cache-pillar-test.tsx:31` cites nonexistent Plan section 3.4 |
| baseline, RPC source, playbooks, collection, pillar/migration/capability/access/privileged/transaction registries | PASS; exact commands recorded in `gates-extra.jsonl` |
| `node scripts/check-edge-db-contract.mjs --emit-sql` | PASS emission only. Offline scan: 265 names (227 literal, 38 local const), 0 unresolved sites. No SQL target queried |
| Existing EAS upload assertion | FAIL before rename, PASS after exact index update |
| `pnpm ship:check` after corrections | Exit 1, **only git state** (authorized corrections staged/uncommitted). All ten machine gates pass, including harness assurance and script fixture suites. The EAS mismatch is fixed; the complete command is not PASS |
| Gitleaks 8.30.1 with repository config, reviewed five-commit range | PASS, no leaks; official binary archive SHA-256 verified before execution |
| Fresh H5 opt-in P410 execution | Measurement command PASS; Safety quality FAIL, 11/29; label unchanged |
| Read-only merge simulation against fetched `origin/main` | Exit 1: exactly two memory conflicts; no merge state entered |

The build and mobile/shared gates preceded the final trace-only Edge correction; API type-check and full API tests
were rerun afterward. No mobile/shared runtime source changed. Focused JSON proves discovery; P404 is a mobile
pillar covered by the full Jest run. Legacy non-pillar files are not counted as API evidence. The blind-set opt-in
test can be green without receiving a set; it is explicitly **NOT_RUN** as a real evaluation here.

`lint:mobile` and authority failures are baseline source findings, not new regressions. They are still red gates,
not waivers. No bulk ESLint or governance cleanup was attempted.

Deno/Edge compilation is NOT_RUN (no Deno on PATH; Docker compiler lane not entered), T1 PostgreSQL/RLS and T2
multi-actor runtime are NOT_RUN/BLOCKED pending owner lane approval; paid T2+, device/native and Production are
NOT_RUN. CI status endpoints returned no statuses/runs at the reviewed head; that is no CI evidence, not CI PASS.
No final acceptance CI was dispatched, PR comment posted, review resolved or PR status changed.

## Conflict simulation and preservation

`git merge-tree --write-tree HEAD origin/main` leaves the index/worktree untouched and returns content conflicts only in:

- `.claude/MEMORY.md`, around line 14: KAWA W00-W03 recall entry versus main's conflict-maximize skill entry.
- `docs/memory/2026-10.md`, around line 5: full KAWA entry versus main's Local Stage 1 Release Runner and
  conflict-maximize entries.

The valid entries coexist; the proposal retains main's sections first and the KAWA sections next, without editing
their contents. `memory-resolution-proposal.diff.txt` is a review-only proposal relative to HEAD, not applied.
The generated tables have 410 branch and 395 main pillars, with zero shared-ID/different-file collisions.
`governance/protocols/test-pillars.md` auto-merges in the simulation; regenerate and verify its generated index after
an owner-authorized integration. Main also adds/revises governance/skills/release tooling; its changes must survive
integration, not be overwritten with this branch's older files. No active-plan conflict was reported by Git.
Recheck the then-current main and run combined-tree gates after approval; current-branch tests do not validate the
future integrated tree.

## W00-W03 and required gate scorecard

| Item | Status | Meaning |
|---|---|---|
| W00 | PASS at T0 | Identity, source ownership, baseline/local gate evidence and conflicts captured |
| W01 | FAIL for release acceptance | Existing sentinels green, but recognized-hazard delivery failures, H5 miss risk and public negation misses remain |
| W02 | PASS at T0 mechanics | Honest report labels and wrong-route verdict repaired; independent corpus NOT_RUN |
| W03 | PASS at T0 scope | Trace-stage repair, bounded fields/redaction and progress tests; deployment/device behavior unverified |
| G0 | PASS for scoped work | Correct clean starting branch/HEAD, primary dirty state preserved, protected decisions held |
| G1 | NOT_RUN for T1/T2 | No DB/runtime lane opened; isolated target proposal awaits approval |
| G2 | PASS for authorized corrections | Recorded red/green tests and no weakened assertions |
| G3 | FAIL/BLOCKED | Safety delivery gaps confirmed; RLS/atomicity and native proof unavailable |
| G6 | Evidence captured; memory approval pending | Ledger, logs, inventory, limits and memory draft supplied; protected memory files not written |

## Compatibility, rollback and owner handoff

There is no new request/response/SSE contract, migration, RPC, database write, paid call, provider, flag, secret,
dependency, payment behavior or UI-flow change. The only shipped-source delta is the internal trace-stage mapping.
Existing readers already support `emergency_gate`. Consumers treating `other` as an operational grouping will see
correctly classified emergency logs instead. The scoring helper is test-only and only tightens proposal rejection.

For rollback, reverse the four explicit source/test diffs as a unit; the new regression expectations should then be
red, as demonstrated. Reverse the 17 filename mappings and the two reference-file edits together only if restoring
the known EAS failure is intended. No data/schema rollback is required. A Git revert requires separate authorization.
The current packet is not committed, pushed, merged or deployed. Exact correction inventory and current file hashes
are supplied separately; the commit identity remains the reviewed HEAD until publication is authorized.

Required owner decisions and proposed acceptance tests: [owner-decisions.md](owner-decisions.md).
Session memory draft: [session-memory-draft.md](session-memory-draft.md).
The memory gate remains pending because `docs/memory/INDEX.md` requires show-before-write confirmation.
No KAWA_02 or six-service remediation was performed.

## Final review and process closeout

Spec compliance: the authorized packaging and test/trace corrections are complete locally; Safety/contract and
integration decisions are delivered as proposals, not implemented. Rules/standards: no protected runtime/DB/UI
change or Git publication; staged paths are restricted to this packet. Maintainability: reuse existing scorer,
trace adapter and pillars, no new production module or exported type. Comments added to production/test source: none.
No debug probe is included in the shipped source. No structure baseline was changed.

Backend placement is the existing Kael trace adapter -> platform trace builder, with callers in customer assistant
and Case-question services. Both contract twins and generated DB types are untouched; `apps/api` was explicitly
type-checked/tested. Backend parity is a **degraded/offline lane**: migration inventory and 265-name/zero-residue RPC
scan pass, target query and deployed identity remain unverified because hosted DB access is forbidden and T1 awaits
approval. This is a debt record, not a parity verdict.

Router deviations: evidence assembly stayed open while independent audits uncovered and closed two bounded fixes;
this intentional overlap retained one audit packet rather than interleaving unrelated product topics. Additional
source reads were used to verify the returned findings and the five existing PR comments. The work-plan's original
glob notation did not match its prefix-only reader and was corrected; final reconciliation is recorded separately.
The governance-audit skill was dropped because this task does not audit or rewrite the governance stack.
Right work: a defensible blocked review, not a synthetic safety PASS. Worth the spend: byte-preserving CI repair,
two demonstrated quality defects closed, and reproducible Safety gaps plus bounded owner decisions delivered.
