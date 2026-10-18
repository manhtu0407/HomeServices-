# Isolated local QA runtime — guarded startup and HTTP evidence

The initial attempts below were blocked. The continuation checkpoint at the end
records a successful guarded startup and limited HTTP-to-database evidence.

## Target and scope

Worktree: <repo>/.claude/worktrees/kael56-admin-partial-loading-20261016
Branch: codex/kael56-admin-partial-loading-20261016
Baseline: e8b95d2122a8ce802c5504630a778f6e51daa72f plus uncommitted diff.
Question/class: run isolated Auth/REST/Edge with actual PostgreSQL without
resetting the shared stacks — behavior, Lane A. No hosted deployment.

Optional --instance and --port-base select a named CLI project and canonical
empty-reset snapshot. Default stack and hosted migration planning keep their
own identities. Dedicated target: nestscout-qa-journey56-20261016, base 58320.
Actual source snapshot: 453 canonical migrations and 557 tracked function/Shared
source files, checksummed. Tracked environment files are rejected; untracked
files are not copied. New untracked Edge files are outside this snapshot proof.

Docker: 29.8.2; Compose 5.6.0. Official stable updater route returned
updated-or-current, one update attempt; .scratch/qa-docker-version.log. No Docker
Desktop launch/restart, RAM recovery, shared stop/reset, prune or host repair.
Each diagnosed attempt had one doctor and one CLI start; RAM was informational.

## Actual attempts

1. Internal QA bridge: PostgreSQL host initialization could not connect. A tiny
   owned HTTP control proved internal response but no published host port. Named
   resources only; no inference or Production data.
2. CLI 2.98.2 on a bridge with the documented loopback option: canonical replay
   and seed succeeded, but actual DB/Kong bindings were 0.0.0.0 and ::. Named
   stop exited 0, preserved backup. Bootstrap was not acceptance.
3. Official pinned CLI 2.121.0: startup refused missing configured function
   entry points in the temporary migration workdir; CLI stopped owned containers.
4. Checksummed tracked functions added: startup then identified the missing
   packages/shared/src/worker-capability-data.ts imported by the Edge worker
   contract. That sole external source dependency was added to the snapshot.
5. Final start restored the owned QA backup and completed CLI startup. Actual
   binding verification again rejected non-loopback DB/API ports; the automatic
   exact named stop exited 0 and the up runner exited 1 at
   2026-10-15T19:18:51.748Z. No owned QA containers remained running afterward.

Safe logs/results remain under .scratch/qa-stack-up*. No credential output is
in this packet. Provider secret prefixes are removed from the startup child;
the bridge is not an egress firewall and future function fixtures must deny
real inference independently. No business handler was exercised by these starts.

## Source and test evidence

- corepack pnpm install --frozen-lockfile: exit 0 using repo-pinned pnpm 10.16.1.
  The first noninteractive invocation refused module replacement; the retry used
  CI=true in its own shell. Only this isolated worktree dependencies changed.
- Official supabase package pinned exactly to 2.121.0; wrapper version read 2.121.0.
  Global pnpm 11 rewrote unrelated lock layout initially; its lock was preserved
  under scratch, and the final lock was generated from HEAD using pinned pnpm 10.
- Tracked-source-copy regression: failed ENOENT before copy, passed after; the
  external Shared dependency assertion separately failed then passed. Reuse,
  stale/copy tampering, refresh preservation and tracked .env refusal are tested.
- Combined infrastructure suites: 49 tests, 48 PASS / 1 SKIP / 0 FAIL, exit 0.
  Skip is an existing Windows native-Docker fixture host-policy limitation.
  The earlier run with 48/48 predates the extra source-copy test and is historical.
- Docker contracts: 22 files checked, exit 0.
- All Node script/harness tests before the final source-copy addition: 634 tests,
  633 PASS / 1 SKIP / 0 FAIL. Final full rerun is recorded separately below.

## Review

Fixed point: e8 plus uncommitted diff; git diff HEAD, no additional commits.
Spec: isolates target/ports and preserves other resources; source snapshot now
contains the configured entry points. Runtime acceptance remains blocked.
Rules: no hosted mutation, provider secret, pricing/learning/receipt deletion,
second deployment runtime, global process repair or weakened binding gate.
Maintainability: existing CLI and workdir materializer reused; optional selection
and actual-binding guard are tested. New dependency and copied-source inventory
are explicit. Linux execution has fixture/static evidence only on this Windows
host; hosted inference/financial/network outage are not tested by startup.

Result: PARTIAL. Task status: BLOCKED.
Stop reason: actual loopback publication differs from bridge option under the
current Docker/CLI combination. No identical retry is scheduled.
Unanswered: full local Edge-to-PostgreSQL HTTP journeys with guarded fixtures.
SQL behavior is separately proved by 138/138 files on the earlier private DB;
that result is not upgraded to HTTP end-to-end acceptance.

## Final source verification

Full Node script/harness rerun after the source-copy changes: 635 tests,
634 PASS / 1 SKIP / 0 FAIL, exit 0 (qa-all-node-final.log). All eight static
gates in final-static-results.json exited 0. Harness assurance verification
exited 0. Build initially failed because nested Turbo selected global pnpm 11
against the pnpm 10 dependency graph. A Corepack shim created only under ignored
scratch selected 10.16.1 for nested invocations; the same root build then passed
(1 API build task, exit 0; campaign-build-pinned-final.log). No native binary
was built. No global pnpm or host configuration was changed.

ship:check executed after final changes: all 10 source/harness/script gates
pass, but overall exit 1 / NOT READY because the campaign fixes are deliberately
uncommitted. This campaign prohibits publication; no commit was created to
satisfy that gate. This is a Git readiness limitation, not a passed ship gate.

Runner note: after ship verifier reported its exit-1 Git-state failure, the outer
PowerShell remained alive with no verifier child. Only that exact task-owned
shell was stopped; tool session exit was -1 from this cleanup. The source
verifier result and outer-shell termination are distinct evidence.

## Continuation — explicit binding and real HTTP intake

Continuation baseline: published branch commit `bc5ed76807ab7223631fec44e8440a1674f05f72`
plus the uncommitted QA adapter. Production and the frozen Build 56 Previews
were not modified. No additional commit, push, merge or deployment was performed.

A disposable Alpine control reproduced the binding discrepancy: publishing
`58329:8080` on the owned bridge produced `0.0.0.0` and `::`; explicitly publishing
`127.0.0.1:58329:8080` produced loopback only. The first control used an absent
`httpd` executable; the corrected sleeping control exercised publication without
serving data. Every control container was stopped and removed by its recorded ID.

A Node-only adapter passed its control but did not affect Supabase's compiled
binary. The resulting startup was rejected by the unchanged binding guard and
the exact named QA stop retained its backup. Inspection established that the npm
entry point launches a Bun executable. The adapter now uses the runtime's
documented [standalone preload support](https://bun.com/docs/bundler/executables),
scoped to this CLI child. It validates the QA name, project label, network and
port range, refuses foreign publication and publish-all, and preserves unrelated
commands. A real Bun/Docker control passed before another diagnosed start.

Guarded startup then exited 0. Actual DB and Kong bindings were respectively
`127.0.0.1:58322` and `127.0.0.1:58321`. Auth health returned 200. The first Edge
request exposed the CLI's internal `http://kong:8000` URL being treated as a
remote target by the App environment guard. The dedicated QA adapter now routes
that Edge container through `http://host.docker.internal:58321` and forces the
existing AI kill switch on. No product environment guard or handler was changed.
After an exact named stop/restart, startup and the binding guard again exited 0.
Auth and Edge health returned 200. Edge correctly reports local, unregistered and
degraded; this is not a fabricated Production release identity.

Three diagnosed Supabase starts occurred in this continuation: the Node-only
attempt failed the binding gate; native preload passed binding but exposed the
Edge environment issue; the local-gateway configuration passed startup and HTTP.
Each used one doctor and one CLI start, with a successful version check. There
was no identical blind retry, shared reset, host repair or paid service setup.

### HTTP and PostgreSQL evidence

The local-only script `.scratch/qa-http-deferred.mjs` uses actual Auth sign-in,
Edge handlers and PostgreSQL. It created two Customer fixtures for the final
run and exercised all six supported services with `defer_analysis=true`:
create 201, owner read 200, request-ID replay 201 with the same session ID, and
foreign-owner access denied. It uses the documented web-preview identity and
allowed localhost origin; no iOS identity was fabricated.

An initial missing-header request returned 426 as designed. A first six-service
run reached the five-per-minute creation limit and returned 429 on the sixth;
the final run uses the second fixture actor for that independent scenario.
Neither compatibility nor rate-limit enforcement was weakened. Earlier local
fixture accounts and the five earlier sessions are retained, not hard-deleted.

Independent `psql` readback for the final two actors found exactly six sessions,
six turns, zero linked jobs, total recorded AI cost zero and zero provider-log
rows since the run began. The Edge container had no inference provider keys and
its kill switch was verified true. This is evidence for deferred persistence,
read/replay and ownership only. Pricing, model responses, matching, scope change,
completion and settlement remain outside this checkpoint's HTTP proof.

Safe private results: `.scratch/qa-http-deferred-result.json`, the two retained
426/429 result files, `.scratch/qa-gateway-up-result.json`, and
`.scratch/qa-native-loopback-tests.log`. Do not publish runtime keys or fixture
credentials. The script's ephemeral execution is not a registered integration
pillar and must not be represented as full campaign runner acceptance.

Current targeted tooling suite: 42/42 before the final gateway test; the final
network suite is 12/12. Docker contracts checked 22 files; Node syntax and comment
discipline passed. Structure, baseline, test collection and pillar registry each
exited 0. Full tooling rerun and final lifecycle cleanup are recorded next.

Final full Node tooling runner (`node --test scripts/*.test.mjs
scripts/harness/*.test.mjs`): 641 executed, 641 passed, zero failures or skips,
exit 0. Comment discipline, diff whitespace, and workplan each exited 0; the
workplan contains seven closed slices and nine declared changed files. The
exact named QA stop exited 0 and preserved its backup. The temporary control
containers were removed. No shared instance was stopped.

Review fixed point is `git diff bc5ed76807ab7223631fec44e8440a1674f05f72`
plus the two new preload/launcher files. Spec: the formerly blocked loopback
startup and initial HTTP persistence now have real runtime evidence. Rules:
no global Docker change, guard bypass, provider credential or hosted mutation.
Maintainability: the existing QA network helper and startup/down ownership are
reused; the explicit CLI version check refuses an unsupported launcher rather
than silently accepting a changed upstream runtime. Other CLI versions and
non-Windows runtime behavior remain unverified. These local adapter changes
have not been committed or pushed.

Final `node scripts/harness/verify.mjs` exited 0. Its static transaction catalog
still prints historical release-gap strings; they are not fresh hosted facts
and were not used as current Production acceptance evidence. The final workplan
also records the approved memory checkpoint: eight closed slices, eleven changed
files. No new test/build claim is inferred from the memory write.

The campaign remains IN_PROGRESS. Next: promote the limited HTTP runner into
registered integration coverage, then verify quote/matching/scope/completion/
payment/recovery with provider fixtures. Live model spend enforcement and real
payment settlement are still separate open items. Native device QA belongs to Tu.

## Registered HTTP intake and scope-decision checkpoint

Baseline for this checkpoint: `33b97afc55413897afbe8d76228917089db45967`,
branch `codex/kael56-admin-partial-loading-20261016`, plus the uncommitted test
diff. The preceding QA adapter was committed and pushed at Tu's request; no
merge occurred. This continuation has no further commit/push or hosted changes.

Delegation: local, no subagents. Question: behavior through actual local Auth,
Edge and PostgreSQL. Lane A, exact instance `journey56-20261016`, base `58320`.
Version check: Docker 29.8.2, Compose 5.6.0; official stable update returned
updated-or-current, exit 0. One `up` owned the sole doctor and CLI start, exit 0.
Available RAM was 2.18 GB, informational. Actual loopback binding guard passed.

### Registered behavior and mutation evidence

`P391-kael-local-http-intake` now runs through Vitest rather than an ephemeral
script. Its first execution passed 8/8 with actual Auth sign-in, all six deferred
service intakes, same-request replay, owner readback, foreign-owner denial, and
persisted six-session/six-turn/no-linked-job/no-recorded-spend assertions.

Its mutation changed only the handyman replay to use a new request ID. Six tests
passed and two failed: the replay identity changed and the DB contained seven
sessions rather than six. Exact source restoration returned 8/8 pass.

`P392-kael-local-http-scope-decision` adds actual public Edge decisions and DB
readback. Fixtures start at stored quotes and a prior approved financial receipt.
They do not prove the upstream quote-generation or proposal path. No handler,
RPC, migration, pricing policy or permission was changed to make them pass.

Initial fixture failures were correctly enforced boundaries: committing a final
price without bilateral evidence returned SQLSTATE 23514; direct incident REST
insertion returned 42501. Fixture setup now uses one local PostgreSQL transaction
with the prior receipt. Its COMMIT executes the deferred final-price constraint;
no trigger or constraint is disabled. Public workflow decisions still use real
Customer/Worker JWTs, not service-role HTTP calls.

Final runtime suite: 15/15 passed, zero skips, exit 0:

- The eight intake cases remain green after extracting their shared local harness.
- Worker and foreign Customer cannot decide; the pending job remains unchanged.
- Customer rejection resumes `arrived`, preserves the original price and Worker;
  repeated or opposite decisions return the existing explicit 409 refusal.
- Concurrent approvals produce one 200 and one 409, one committed outcome,
  one Customer-decision audit event and one persisted Worker notification.
- Pre-arrival approval resumes `worker_matched` or `worker_on_way`; on-site
  approval resumes `repairing` and persists the stored quote total.
- A pending scope with unconfirmed quote evidence is refused by PostgreSQL;
  the failed setup transaction leaves no partial job.
- Approval racing rejection commits exactly one outcome with corresponding price,
  status and one persisted decision notification.

The ownership mutation substituted the owning Customer token in the foreign
attempt. In the then-11-case suite it caused exactly that denial assertion to
fail (10 pass, 1 fail); restoration returned 11/11. The later four cases expanded
timing, quote validation and conflicting-decision coverage; final suite 15/15.
This mutation proves the tested input/ownership assertion is live; it is not a
claim that a deployed authorization guard was removed or Production mutated.

Independent `psql` readback for the final execution found six fixture jobs:
one pending, one `arrived`, two `repairing`, one `worker_matched`, and one
`worker_on_way`, with prices matching the winning outcomes. Zero provider-log
rows were created during the run. Local Edge had its verified AI kill switch
and no inference credentials. These are limited runtime observations, not a
substitute for every remaining provider-fixture network-guard scenario.

### Runner provenance and cleanup

All commands below use this worktree as cwd and the baseline/diff above:

| Command | Observed result |
|---|---|
| `node scripts/run.mjs docker/scripts/ensure-version` | exit 0 |
| `node scripts/run.mjs docker/scripts/up --profile lean --instance journey56-20261016 --port-base 58320` | exit 0, actual loopback pass |
| `node scripts/harness/run-local-qa-http.mjs --instance journey56-20261016 --port-base 58320` | final 15 pass / 0 fail / 0 skip, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| `node apps/api/scripts/test-runner.mjs --reporter=json --outputFile=<absolute ignored report>` | Vitest 2174 pass / 0 fail / 17 skip; Node 114 pass / 0 fail / 1 skip; exit 0 |
| `node scripts/harness/verify.mjs` | exit 0; static historical release-gap prose is not fresh hosted evidence |
| `node scripts/harness/pillar-registry.mjs --write` | 386 unique pillars, manifest copies identical; exit 0 |
| `node scripts/check-test-collection.mjs` | 14/14 CI filters resolve; exit 0 |
| `node scripts/lint-structure.mjs` | exit 0 |
| `node scripts/check-comment-discipline.mjs` | exit 0 |
| `node scripts/run.mjs docker/scripts/down --instance journey56-20261016` | exit 0, backup retained |

The default API runner does not receive the named QA target. Fifteen of its
seventeen Vitest skips are the explicit-target HTTP cases executed separately
above; neither skip nor the registry count is treated as runtime PASS. Full
Mobile, Shared, build, Edge type and complete SQL-matrix gates were not rerun for
this test-only diff and remain outside this checkpoint's verification claim.

Final private runner artifacts and SHA256:

| Artifact under `.scratch/` | SHA256 |
|---|---|
| `qa-http-registered-green.json` | `C31B74EF048C5ED4326F6E3DFC5AE3A3F0E9EDEBF28168637EE748532A99CA6D` |
| `qa-http-registered-mutation.json` | `36F36131F0974817447E3580C81D3AD2DDAA31330961FE7422427117830B8E36` |
| `qa-http-registered-restored.json` | `A6549F87AE4C698D62B3A4A46B14AD102FDF6678EA22ACCE9BC3DB8C2094DB13` |
| `qa-http-scope-mutation.json` | `9B0D580A35B4572AC9D198D99929C65798D7816FB960FCD20C2B2ACF2D47449D` |
| `qa-http-scope-restored.json` | `71E10CE026B408FF7441BDBDB977B9E48BC0A21ADFD2375B56C89B01B9E4C1B5` |
| `qa-http-scope-expanded-final.json` | `7136ED5E398CF70E61533C660CCE183308B3A63EF8A5979CA750D8BBD5CE4305` |
| `qa-http-scope-psql-readback.log` | `192BAE9CAD0DE12C18871785C1188D97ADEC9BF802F8141BB05591073F1D49C3` |

Post-cleanup inspection found zero running containers for the exact QA project.
Fixture records and backups are retained. Preview listeners remain the original
PIDs 24036/1460 on ports 8085/8086. The Customer browser still renders the frozen
`e8b95d2122a8` marker and retains its unsent draft.

Campaign status remains IN_PROGRESS. Fresh quote/proposal, complete matching,
completion/payment/recovery journeys, remaining direct Preview scenarios and
live AI budget enforcement remain open. A 409 already-decided response is the
current observed contract; it is not proof of receipt-return recovery in the
frontend after a lost response. No whole-journey, native or hosted PASS follows
from this checkpoint.

Review fixed point: uncommitted `git diff 33b97afc55413897afbe8d76228917089db45967`
plus the new scope pillar and local test harness. Spec compliance: registered
intake and scope decisions now have the previously missing real HTTP/DB seam;
remaining full-journey requirements are explicitly open. Rules compliance:
guarded local targets, retained evidence, no inference keys, no hosted or binary
change, no new Git publication. Maintainability: the two pillars share one
bounded local HTTP/Auth/fixture helper; fixture SQL has a table/column allowlist,
checks actual owned bindings, and commits with all constraints enabled.

Final comments, structure baseline and diff checks exited 0. Workplan validates
11 closed slices and eight declared changed files. Scratch measured 33.4 MiB;
nothing was deleted. This is a checkpoint in the active campaign, not a release
or a complete-plan acceptance claim.

## Provider-fixture transport boundary

The next full-journey seam needs scripted provider replies while retaining actual
Auth and PostgreSQL. `scripts/harness/local-provider-fixture.mjs` is test tooling
only. It permits selected paths on an explicitly configured local Supabase
origin, refuses redirects in the captured native transport, answers only the
exact Anthropic messages endpoint in memory, and refuses every other destination.
No actual provider network request is forwarded. Counters contain only totals.

Observed TDD: initial implementation refused all use and all four initial tests
failed. The implemented boundary passed the initial four and two added cases:
oversize request refusal/counter isolation, and a real loopback HTTP POST plus
actual redirect refusal. Final targeted Node suite is 6/6, exit 0.

Mutation: allowing unknown destinations to reach the injected transport made
the foreign-target denial case fail, exit 1. Its transport was a test stub,
so the mutation did not send any external request. Source restoration returned
6/6, exit 0. Private logs: `.scratch/provider-fixture-{red,green,mutation,restored}.log`.

This proves the transport boundary under Node. A dedicated Deno QA function,
its runtime installation, real quote preview/proposal and complete matching
remain unverified at this point. This checkpoint does not count those as passed.

## Dedicated Deno scope fixture installation

The guarded installer writes an ignored, named QA function beside the copied
canonical functions. It verifies the exact local migration plan, port base,
canonical entry/config bytes, running project, actual loopback bindings, AI kill
switch and absence of inference credentials before writing. The original
`mobile-api` entry remains unchanged. The function uses the actual authenticator,
handler, services and database; only provider transport and its fixture-only
configuration differ. No product workflow response is intercepted.

Installer TDD began with three failing cases, then passed 3/3. A generated-entry
syntax check caught an escaped-regex error and passed after correction. Combined
network, installer and QA CLI refusal tests passed 21/21, exit 0.

Actual runtime observations changed the next action twice. Adding a directory
after startup returned 404 because the CLI snapshots the function list. The
installer now registers only its named QA function and an explicitly empty env
file. The scoped CLI adapter permits only the exact official local `functions
serve` invocation with that registration, and retains all existing startup guards.
No general arbitrary CLI command, env-file override or hosted target is allowed.

The first served bootstrap then returned WORKER_ERROR: Supabase user isolates
reject `Deno.env.set` with NotSupported. The corrected fixture uses an isolate-only
environment reader after installing the fail-closed network boundary. It never
sets host/container variables or changes the canonical function's kill switch.
Only the observed task-owned serve process tree was stopped to reload that
diagnosed bootstrap correction; the first serve handle ended -1 from that stop.

The corrected official serve process returned actual Deno fixture metadata 200,
fixture health 200 with local identity and scripted AI enabled, and canonical
`mobile-api` health 200 with AI still disabled. Metadata initially reports zero
local/provider/denied requests. This proves installation/isolation/readiness,
not quote generation. Safe artifact: `.scratch/qa-scope-fixture-health.json`.

This runtime attempt used one version update, one doctor/up and one start;
available RAM was 1.16 GB (informational), and actual loopback acceptance passed.
The separate official function server reload was limited to this same QA project.
No shared Preview process or Production release, pricing data or training data was changed.

## Finding and local fix — saved quote expiry serialization

Status: FIXED_LOCAL. No commit/push, merge or hosted deployment of this fix.
The original source rejected a fresh valid quote immediately after preview with
409 `QUOTE_CHANGED`. Actual local PostgreSQL evidence showed the quote JSON
expiry as an ISO string ending in `Z`, while the RPC timestamp represented the
same instant with `+00:00`. `incident-mutations.ts` compared the two strings.
The existing sequence-client tests kept the same string spelling and missed it.

The owner remains `domains/job/incident-mutations.ts`; the fix parses both
timestamps, requires a finite expiry and compares instants. A different or
invalid expiry remains refused, and the confirmation deadline, actor, job,
quote, revision, price and commission checks are retained. No RPC, schema,
contract twin, generated database type or pricing/learning policy changed.
Blast radius includes the Edge scope domain and its `apps/api` public-handler
tests; Mobile/Shared consumers retain the same response contract.

Regression loop:

- Before the fix: P87 suite 19 pass / 2 fail. The two failures are the same expiry
  serialized as `+00:00` and `+07:00`; the different/invalid expiry denials pass.
- After the fix: P87 suite 21/21, exit 0.
- Actual Deno quote preview, fresh proposal, replay and Customer rejection then
  passed inside a 16/16 HTTP suite. PostgreSQL readback showed one proposal,
  rejected status and the prior `inspecting` job state.
- On October 18 the guarded snapshot refresh archived the old QA workdir and
  copied the current source. The expanded runner passed 17/17: both fresh
  approve and reject journeys, plus the previous intake/decision cases.
  Approval locks the server quote total and resumes `repairing`; rejection
  preserves the prior price state and resumes `inspecting`.

The quote-ID mutation used a new UUID for the purported saved quote. The real
public handler refused it before persistence: 15 pass / 1 fail, exit 1.
Restoration returned 16/16, exit 0. Wrong-quote denial also runs as an explicit
step before each valid proposal. No inference was sent to an external provider.

Provider observations are now attached to the same QA workflow response. Reading
an isolate-global counter through another request proved unreliable when Deno
rotated workers; those earlier counter assertions are superseded. Each successful
preview reports one in-memory provider fixture response; proposal, replay and
decision each report zero. All four report zero denied/unplanned destinations.
The canonical `mobile-api` health is checked after each journey and retains its
AI kill switch. Business response status/body are not replaced by the fixture.

Test data and configuration limitations:

- Initial approved Worker fixture setup lacked identity fields and was refused
  by SQLSTATE 23514; the corrected fixture supplies synthetic identity data.
- The isolated function explicitly uses the quorum threshold from P87's existing
  test configuration. Missing threshold correctly causes provenance refusal.
- Market evidence is synthetic, using `.example` domains, and is never claimed
  to be a live market verification. Only new QA-owned catalog rows were added.
  The invalid first fixture version and original catalog remain retained; no
  pricing, training, financial or receipt records were deleted.
- An earlier hypothesis attributed the initial refusal to `integrity_flag`.
  This was not established: this citation loader does not select that field.
  The established fixture issues were missing quorum configuration and a ledger
  reference that did not satisfy the evidence contract. No conclusion about
  Production market-source validity follows from those fixture failures.
- A source hot reload briefly produced 503 before readiness recovered. The
  failed result was retained; DB/Kong/runtime were inspected and the same live
  server was re-polled. The successful test was rerun only after health was 200.

### Evidence inventory

Baseline: `33b97afc55413897afbe8d76228917089db45967` plus the uncommitted
scope timestamp fix, test tooling and test diff. Frozen Build 56/Production source
was not replaced. The first QA source override was recorded privately; the later
guarded snapshot refresh replaced it with a normal current-source copy.

| Evidence / command | Actual result |
|---|---|
| Public P87 regression runner | 19 pass / 2 fail before, 21 pass / 0 fail after |
| Guarded named QA HTTP runner | 17 pass / 0 fail / 0 skip on October 18 |
| Quote-ID mutation / restoration | 15 pass / 1 fail, then 16 pass / 0 fail in the prior one-decision suite |
| `check-edge-db-contract.mjs --emit-sql`, real local catalog query, `--functions` | 265 resolved RPC names exist; 227 literal + 38 local-const, 0 unresolved residue |
| `docker/scripts/edge-check --only mobile-api` | discovered 7 / selected 1 / checked 1 / failed 0; compatibility tests 4/4, exit 0 |
| API type-check | exit 0 after correcting the test-only TaskMeta typing |
| Full Node tooling | 654 pass / 0 fail / 0 skip, exit 0 |

The RPC scan proves names exist in the named local target, not all signatures,
all behaviors or Production parity. This QA runtime is local/unregistered.
No migration changed in this fix. Unchanged contract twins and generated types
were inspected as the blast-radius boundary, not regenerated or represented as
new behavior evidence.

Private JSON reports retain safe fixture IDs and per-request counters in
`meta.qaJourney`, without account credentials. Durable report hashes:

| Artifact under `.scratch/` | SHA256 |
|---|---|
| `scope-expiry-regression-red.json` | `F3E6F217EB5477CEE58F4AC3909C6565DD24C21EE0CD1075328B64AE667CAF43` |
| `scope-expiry-regression-green.json` | `00709D9AFE622269E9E9D810982A03334D2DA5AF56ABBF170972C81A8E5C085E` |
| `qa-scope-proposal-final-mutation.json` | `4FC1234A56A2D7D9CD772DE7ACB9BDAF08CCD6267669A9D5B163E24A2B44E415` |
| `qa-scope-proposal-final-restored.json` | `4183BB45641609D210EB3D3A53B843D9D5FDC12EE9C26B0F3173010EBBBA1A8E` |
| `qa-quote-two-decisions-results.json` | `F7D5E1396C1FDBBD8994F998F2A97C103CA0510D4FBC49E57C36AA1BD5E090BC` |
| `quote-expiry-rpc-functions.json` | `6F14F825D274130688315F0D7BB3CC3E2FD6B2136211A94164F44D48BF69FCAF` |

Campaign status remains IN_PROGRESS. This closes a local quote/proposal defect
and extends scope journey evidence; it does not prove the entire K01–K42 plan,
matching, completion/payment, native QA, live model quality or Production release.


## October 18 checkpoint — public matching and restored Build 56 Preview

**Status: IN_PROGRESS; matching evidence is local, not a Production journey verdict.**

Baseline for this continuation is pushed commit `d0da20294369121f4b0ad33339d73ec9de0e996d` on `codex/kael56-admin-partial-loading-20261016`. The later P394/helper/runner/registry/evidence changes remain uncommitted. No merge, deployment or native build was performed.

### Matching evidence

P394 starts from a newly created, cohort-isolated broadcast fixture. Real Auth accounts, PostgreSQL constraints, gateway, Deno public handler and RPCs remain in the path. Only the initial broadcast/setup is a fixture; it does not prove intake analysis or the first offer-confirmation request.

- Both `inspection_only` and `rfq` execute Worker opportunity read, public Worker proposal, exact replay, Customer candidate read, foreign-Customer denial, Worker-role denial, concurrent owning-Customer confirmations and reopened decision/job views. The App service uses the same public paths.
- Before Customer confirmation, the job has no assigned Worker/final price and Worker job access returns404. The opportunity projection contains neither synthetic apartment marker. Customer confirmation assigns only the exact stored candidate.
- Two concurrent confirmations produce200/200 with one fresh and one already-applied result. Exactly one Customer audit and two participant notices persist; both operation states become `official_match` and no held/offered capacity reservation remains. Inspection/RFQ assignment does not itself lock a final price.
- The final guarded run passes19/19 across intake, scope and matching, with zero skips. The exact named target is `nestscout-qa-journey56-20261016`, loopback API58321. Canonical AI remains disabled; no live inference was called.
- Ownership mutation swaps the foreign Customer token for the owner token. Both denial assertions become red:17 pass/2 fail, exit1. Restoring the test gives19/19, exit0. This mutates only local test input, not the product permission check.
- Initial setup errors were fixture corrections: cohort binding intentionally requires reserved `@example.test` identities; activation expiry must equal sent time plus exactly five minutes. The guard was preserved. Test assumptions were corrected against the existing public contract: masked access404, candidate path `/candidate`, and Worker summary `worker.id`. These were not product defects.

### Executed gates

| Command / evidence | Actual result |
|---|---|
| Guarded named QA HTTP runner | 19 pass/0 fail/0 skip in final run |
| Canonical `test:api` runner | Vitest2179 pass/20 explicit skips; Node114 pass/1 skip; exit0 |
| Canonical `type-check:api` runner | exit0 on final test source |
| Focused jest-expo App candidate service | 3/3, exit0; mocked transport verifies typed public paths, not full UI interaction |
| Network/CLI/installer fixture suites | 21/21, exit0 |
| Pillar registry | 388 unique; copies identical |
| Test collection | 14/14 CI filters resolve |
| RPC scan plus real local catalog query | 265 names exist:227 literal +38 local-const;0 unresolved call sites |
| Comments / structure / whitespace | clean; no product source changed in this continuation |
| Canonical Turbo build via process-local pinned pnpm10.16.1 | exit0; Next build1/1 |

The default API skips are not passes; explicit-target intake/scope/matching cases were executed separately above. RPC names alone do not prove every signature, permission or behavior, or Production schema parity. Full Mobile suite/native validation was not rerun in this continuation; native QA belongs to Tu.

### Runtime interruption and recovery

The original QA function-server handle ended with `unexpected EOF`; the Edge container disappeared while the named DB remained healthy. Other QA containers showed newer start times. The cause of their restart is unverified; no Docker Desktop/WSL restart was issued in this continuation. A narrow official `functions serve` restored only the owned Edge runtime.

Afterwards all host-loopback gateway paths closed their sockets, while Auth through Kong inside the container returned200. One ownership-checked restart of only the named QA Kong container restored host Auth200. The first cold Edge health request timed out; a later request returned200/local/AI disabled on the same server. Final19/19 was run after that readiness proof. The interrupted result is retained privately as `matching-http-runtime-interrupted.json`; it is not counted as a pass. No DB reset, volume deletion, shared-stack or hosted mutation occurred.

### Preview and hosted identity

Live Production health returned200 for project `iwevizmsedyqozxlawwl`, release `harness-e8b95d2122a8-53817ce22f48`, SHA `e8b95d2122a8ce802c5504630a778f6e51daa72f`, epoch3, minimum iOS build56/runtime0.3.2. This is read-only identity evidence.

The existing8085 process belongs to a different worktree (PID29628) and was preserved. Port8086 was free. The frozen checkout stayed clean at the Build56 SHA; its existing public-only env file was used through the validated launcher. Default app/root env files were absent; those failed launches did not start a server.

Starting without a cache clear rendered the expected SHA with another Preview's stale branch/timestamp. Direct Expo configuration evaluation returned HEAD/current time. Clearing the newly owned8086 Metro cache corrected the visible marker to SHAe8b95d2122a8 / BranchHEAD / Built2026-10-18T02:12:30.144Z. The process command points to the frozen checkout. CUA opened Kael, selected Work and observed the preserved unsent draft. Nothing was sent to Kael.

![Build56 Work Preview, unsent draft preserved](../assets/test-evidence/2026-10-18_build56-work-preview.png)

This is web Preview evidence, not an iOS binary/device result. A source inspection also shows Production epoch2 Preview selects previous runtime behavior while epoch3 native selects governed release behavior. Full governed local HTTP evidence must not be relabeled as a completed Production Preview journey; verify the relevant release lane for each later scenario.

### Artifact checksums

Private raw artifacts remain under `.scratch/`; no credential values or full bank/customer information are published.

| Artifact | SHA256 |
|---|---|
| `matching-http-complete.json` | `819df8faf4119e98b259ba6389f5904622feb4df0d5495c899a3146ad248e779` |
| `matching-http-mutation.json` | `86f1390afe980d923619c6115d1f968085d1c2b8dee006c76b246e2e1e0c9488` |
| `matching-http-restored.json` | `6249a137499b658121e9f1026482ad10652957f362d989b7b4b85ba609a6096a` |
| `matching-full-api.log` | `29b9eb2d3d1e82decc60b14302183fc11a39ba93f53cab2d9489917587d21b43` |
| `matching-api-types-final.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `matching-tooling.log` | `e55ca420980c21fb26accd158d91bbd31c7bc668097af1c81577442e4812ef10` |
| `matching-mobile-boundary.log` | `9d04f02093efaa3cc526fc3503164fde5a823286cadd8bdf202d68eb01171d62` |
| `continuation-d0da-build.log` | `6568ddff4dbe59ba3fa190b247cd9460cf1057fa958c4f4b14ddcfbd2698583e` |
| `matching-rpc-functions.json` | `1d2b2bd4a650b2f1ba129c2a825688df249190ae2fa86c677a6092d87649fc23` |

Remaining work includes first public offer confirmation into delivery, rejection/expiry paths, execution/completion/payment/recovery, remaining Preview roles and full K01–K42 coverage. Live AI remains blocked until a reliable campaign-wide1USD cap exists; actual bank transfer remains Tu's action. These limitations do not erase the local evidence or close the full campaign.


## October 18 continuation — initial confirmation and ownership error classification

**FIXED_LOCAL; full campaign remains IN_PROGRESS.** No additional commit/push, merge, hosted mutation or native build.

P395 now runs the initial public `POST /kael/chat/:id/confirm` against real Auth/Deno/PostgreSQL. The saved RFQ diagnosis is a fixture; existing active plumbing policy is read without modifying policy, prices or learning data. Before consent there is no job. Two concurrent owning-Customer commands return202 and the same job/operation; a lost-response replay and GET operation recover the same receipt. One matching-requested outbox row is queued, with no assigned Worker/final price. Foreign Customer and Worker attempts are denied, with no partial operation. This proves enqueueing, not completed dispatcher delivery or the full UI/model journey.

### Reproduced defect and minimal fix

- Actual public foreign-Customer confirmation returned500. SQL correctly rejects with `42501 / CONFIRMATION_NOT_OWNED`; Edge treated the exception as a technical failure.
- Public-handler P107 regression:8 pass/1 fail before;9/9 after mapping only that exact SQL error to privacy-preserving404. Other42501 permission failures, similarly prefixed messages and connection errors remain500 with safe bodies. No SQL/RLS/authorization guard was relaxed.
- A real local event query then showed a404 still emitted `KAEL_CONFIRM_RPC_FAILED`. A second regression was observed8 pass/1 fail. Moving the exact ownership check before technical-error reporting returns9/9 and records normal request denial without that false RPC event.
- The runtime fix is three lines in `confirm.service.ts`. Actual P395 correlates the response run ID with a count query to prove no false technical event. Service-role SELECT on append-only harness events is intentionally forbidden; the test reads only a count via an ownership-checked local PostgreSQL connection. No grant changed.
- The named QA source copy was updated explicitly, with before/after hashes retained. The official live function server watches the copy and replaces its Edge container. A guard refusal during that replacement was retained, then the same server's new container and health200 were verified. Neither Production nor frozen Build56 Preview was replaced.

### Final executed results

| Evidence | Result |
|---|---|
| Named QA public HTTP suite | 20/20, zero skipped, serial-file run57.26s |
| Ownership/error-classification P107 | red8/1, then green9/9 for each regression cycle |
| Full canonical API runner on final runtime fix | Vitest2182 pass/22 explicit skips; Node114 pass/1 skip; exit0 |
| API type-check | exit0 |
| Canonical Turbo build with pinned pnpm10.16.1 |1/1, exit0 |
| Pinned Deno Edge check | discovered7/selected1/checked1/failed0; runtime compatibility4/4 |
| Actual local RPC scan/query |265 names,0 residue; no migration delta |
| App relaunch/reconciliation suites |38/38; exit0, mocked transport/AsyncStorage boundaries |
| Network/CLI/installer fixtures |21/21 |
| Pillar registry / collection |389 unique, identical copies;14/14 filters resolve |

A previous parallel-file run had a10-second timeout in the scope approve case. Its JSON is retained privately as `confirmation-http-transient-timeout.json`. The dedicated QA runner now serializes test files while preserving explicit concurrent commands inside the cases, and retains the10-second request timeout. The later full20/20 is real evidence; one serial run does not prove all timing flakiness eliminated. No request deadline or business requirement was relaxed.

`--detectOpenHandles` repeats the App suites38/38 but identifies two intervals originating from SDK Sentry's AsyncExpiringMap import through `sentry-runtime.ts`. This is an open test-process finding, not a proven native timer leak or permission to enable Sentry. No SDK setup/integration was added.

### Review and remaining work

Spec: exact ownership/privacy and normal-denial semantics restored. Rules: fail-closed SQL and distinct technical errors preserved; no secrets/PII or raw upstream data added. Maintainability: reuse the existing confirmation boundary and three-line guard; test-only SQL reads are exact-target, UUID-validated and count-only. No contract twins, generated types or migration changed. Runtime ownership stays in Edge; apps/api only owns verification.

Next proof is actual outbox dispatcher delivery into the Worker opportunity and onward assignment in one local journey. The canonical maintainer uses its existing database-owned local Vault credential; inspect/configure only that named QA boundary and do not invent hosted attestation. Its push branch rejects unregistered local release identity, so any later partial/degraded status must stay explicit. Completion/payment, recovery, remaining K01–K42/Preview work, reliable1USD live-AI cap and Tu's transfer remain open.

Private artifact checksums:

| Artifact under root scratch | SHA256 |
|---|---|
| `confirmation-http-initial.json` | `37253d00a31bcb25c703f9d052694a1d0ef1804c3e1604e7a16d1351e19ca823` |
| `confirmation-http-serial.json` | `e31e478fd3cc4d784d7f501966e9578446066cc5748e37907b67826f429a346b` |
| `confirmation-ownership-red.json` | `15af3e19c68a942261a0c4e0f96aa9121896beca31ee8c811f3209399162d625` |
| `confirmation-ownership-green.json` | `7fc88db1626d8f1064ddcf61e2b95c9f143a6becd049084200717cf3f137f7fd` |
| `confirmation-denial-event-red.json` | `a58b73161856e2125f5a94ddf7eb6479995317beb98cfcfd489d23f02917a2be` |
| `confirmation-final-green.json` | `908de9ec3a217d6d96c1eadebe0aba05884075aa8f878d97cea3d01654b37f32` |
| `confirmation-final-api.log` | `db8704dd7011661fc7d6e4d46614f79c3751e5f491ffb24e94a06a1bf6a9f0fd` |
| `confirmation-final-build.log` | `4967826fd7eaf86949fac6d848bbcac67c783fff5596137aaf501d661866c6a4` |
| `confirmation-final-types-checked.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `confirmation-edge-final.log` | `a8c07d0a4b7ddf53e8e9a44f4956883f87cad3c766b326b52f068ce944a727f2` |
| `confirmation-mobile-recovery.log` | `bb547bc49316fbcc8ad441e4b6e498bab494815f37ace9df93cc1939e979a788` |
| `confirmation-mobile-handles.log` | `7ef8d292a5b182ec7ab4fe07b05870b1ce1290e6b4f46c9f0fa75677288122c0` |
| `confirmation-final-rpc-functions.json` | `1d2b2bd4a650b2f1ba129c2a825688df249190ae2fa86c677a6092d87649fc23` |
| `confirmation-ownership-final-source-override.json` | `471415076e747bc2812ea15cd3fc015a2c016245ded7fc3e33496f5e2839961c` |


## October 18 dispatcher chain checkpoint before branch publication

The latest guarded named-QA run completed all five HTTP files:20/20 passed, zero failed/skipped,59.53s. P395 now continues the same confirmed job through the actual protected matching maintainer, Worker opportunity/proposal and owning-Customer assignment. Missing maintainer credential returns401; the helper refuses a credential at any other destination before fetch. A repeated maintainer run preserves the same broadcast and one Customer-confirmation event; the job-scoped inference log remains empty. No hosted service was mutated.

The maintainer may return500 because local release/push validation is unavailable. Matching persistence is proven independently; this is not a maintainer-health PASS. The original saved RFQ diagnosis remains a fixture; execution/completion/payment, remaining Preview scenarios and the full K01-K42 campaign remain open.

Retained private runner artifact: `dispatcher-chain-auth-replay.json`, SHA256 `47e8e1f97c442f9c5efa2491d8d108988ac6dae9717b3fec791ad8fd505b4f76`. Existing API type-check evidence: `dispatcher-types.log`, SHA256 `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643`. Branch publication is authorized separately by Tu; no merge, deploy or build submission is authorized by this checkpoint.


## October 18 continuation — actual noncohort fulfillment and apartment authorization

**FIXED_LOCAL / campaign IN_PROGRESS.** Baseline branch commit:92fdef1fc02d04a016bfabbc656a83080905b05b. New implementation and evidence remain uncommitted. No further push, merge, hosted deploy or native build.

### Workflow and reproduced defect

P396 starts with an explicitly saved RFQ intake fixture and newly generated local Auth actors. Three approved/reachable controlled Workers satisfy public capacity without synthetic membership. The same public confirmation creates a job, the real protected maintainer dispatches it, a Worker proposes and the owning Customer assigns. Subsequent requests run on the real local Edge/PostgreSQL/Storage stack: Worker on-way, actual PNG upload/reservation/attachment, lobby check-in, Customer unit authorization, inspection, immutable RFQ quote, Customer price approval, repairing, verified completion photo and worker completion. There are no SQL job-state jumps in this chain.

Real HTTP exposed authorization500 for a foreign Customer. The existing apartment authorization owner selected only id/customer_id while requireJobAccess validates status before ownership. The owning path was affected too. The prior owner bytes match the frozen Build56 source (SHA256 3f96a966c58e556174c86848068c41f9dbffd718eb8e673c362380835f145d56). A one-line select adds status, preserving the ownership and atomic RPC gates.

P128 now returns only columns the service actually selects, instead of an overcomplete mock row. Before the fix:8 pass/14 fail; after:22/22, including owning success, foreign404/no authorization RPC, stale intent, malformed receipt, unknown outcome and replay. The reviewed one-line delta was copied only into the named QA snapshot with prior/new hashes; the official CLI watcher rotated Edge and health returned200. The canonical source fix is not deployed.

### Financial and inference honesty

- Worker attempts to repair before Customer price consent return409. Removing the real approval call makes the later repairing assertion fail:20 pass/1 fail. Restoring the original test returns21/21.
- Forged same-job completion refs are refused before completion; real Storage bytes are reserved, uploaded and attached. A fresh Customer read and SQL/REST readback retain the agreed350000VND and verified completion ref. This amount is a local worker-quote fixture, not a change to price baselines or Production.
- The noncohort job remains completed_by_worker when confirm-completion returns409/PAYMENT_NOT_ENABLED. Job detail advertises payment_rail_available=false/provider=null; the unavailable call leaves job/payment fields unchanged. This is PASS for honest unavailability, **not** proof of configured payment, receipt, settlement, callback or commission behavior.
- Canonical local Edge remains AI-killed and provider credentials absent; the job-scoped inference log is empty. No live AI or transfer was performed. This does not lift the campaign1USD live-AI-cap prerequisite.
- Local maintainer still returns500 because release/push validation is unavailable. Matching effects are checked independently; maintainer health is not PASS.

### Fixture corrections and preserved evidence

An initial409 was a fixture error: q9 normalizes to thu_duc, while the seeded Worker profile used q9 literally. The canonical district fixture fixes that mismatch without weakening eligibility. Another early fixture expected root-level address_access instead of job.address_access and assumed null payment status instead of not_started; these were test corrections, not product defects.

Repeated failed cases left their own Workers online and eligible for later jobs. Exactly nine actor IDs recovered from these private runner reports were verified against the fixture legal-name/email marker on the owned local database, then taken offline through set_worker_availability_atomic. No row/job/history was deleted or forced to another lifecycle state. The test now takes only its own actors offline through each authenticated availability API in onTestFinished; cleanup is asserted.

One of seven full HTTP runs in this continuation hit the unchanged10-second timeout in the scope approval/rejection race; the other six scope runs passed. Its original red JSON is retained. Root cause remains UNVERIFIED; neither file serialization nor later green runs proves the timing issue fixed. No timeout was increased.

### Executed gates on this source

All commands ran from the current dedicated worktree at HEAD92fdef1f plus the uncommitted one-line runtime fix/tests.

| Command or runtime | Actual result | Scope |
|---|---|---|
| node scripts/harness/run-local-qa-http.mjs --instance journey56-20261016 --port-base 58320 | final21/21,6 files,0 skipped,74.67s | actual local Auth/Edge/PostgreSQL/Storage |
| focused Vitest apartment-access-authorization pillar | red8/14 then green22/22 | public handler with projection-aware DB boundary |
| same HTTP runner with approval-call mutation, then restoration |20pass/1fail, then21/21 | actual SQL consent gate |
| node scripts/run.mjs run-package-script @nestscout/api test |2183pass/23 explicit skips; Node114pass/1skip; exit0 | default suite; named local21 run separately |
| node scripts/run.mjs run-package-script @nestscout/api type-check | exit0 | API/types |
| node scripts/run.mjs run-turbo build, pinned pnpm10.16.1 via ignored local shim |1/1, exit0,14.954s | canonical Next support build, not native |
| node scripts/run.mjs docker/scripts/edge-check --only mobile-api | discovered7/selected1/checked1/failed0, compatibility4/4; exit0 | pinned Deno2.9.4 toolbox, current source |
| emitted RPC scan, actual owned PostgreSQL catalog query, --functions verdict |265names (227literal/38const),0residue | names only; not complete signature/behavior or hosted parity |
| comment discipline / structure / baseline / capability / access / privileged gates | each exit0 | no baseline or permission weakening |
| pillar registry / test collection |390unique, twins identical; exit0 | runner collection |

### Preview, review and remaining work

Codex In-app Browser still visibly shows Work, unsent draft and SHAe8b95d2122a8/HEAD on localhost8086. No UI state was submitted; the frozen source and unrelated8085 process were preserved. Production Preview epoch2 selects previous behavior, while local QA uses governed behavior. Neither local HTTP nor this read-only Preview observation proves the complete Production UI or native journey. Native QA remains Tu's scope.

Review: existing domains/worker/apartment-access owns the fix; apps/api owns tests. No contract twin, generated type, RPC signature, schema, pricing, learning policy, access decision or migration changed. The exact select projection is the sole runtime delta. Security retains Customer ownership and check-in binding. Tests use synthetic local actors/media, no real private or bank data.

Next: test configured manual-bank completion/payment/claim/reconciliation at an isolated local external boundary, then remaining recovery/cancellation/dispute/UI scenarios. A configured fixture must stay separate from live transfers and must not enable a Production rail or synthesize hosted attestation. Remaining K01-K42, reliable live-AI campaign cap, scope timing investigation, full Admin/Preview proof and prior SDK test-interval finding remain open.

Private artifact hashes (root scratch, not published raw):

| Artifact | SHA256 |
|---|---|
| `authorization-projection-red.json` | `f9398ecc77bd8fc093cb7dee8f50e0381876d267313f2b32fb22a26834feb726` |
| `authorization-projection-green.json` | `c6f2aa14840ba9e3ce501697028dbee78814e848138df7ef68276c1c24042469` |
| `fulfillment-http-initial.json` | `7c1d20a91f9e03b4809bacc08ac3aedca4b3f0b7a8b31514317f2e0a8e264b94` |
| `fulfillment-http-final.json` | `05d28c5ee7ecd0aa0b75e1b89694193054c37e75a57d3f0416da458650c6af79` |
| `fulfillment-consent-mutation.json` | `c91c7f15c2abafa26ccd1ca16ec776775df2a96560c66c762cea2d033f4e4c75` |
| `authorization-projection-source-override.json` | `266289a923f5e8ba0bdd71f652a3ce4876ac149c12c5d7e1c1db12d0d7706f11` |
| `fulfillment-final-api.log` | `237e7c1310057595c3c488a406066e9f4a2a162f74cf708c8057d4b947dde9d9` |
| `fulfillment-final-types.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `fulfillment-final-edge.log` | `79cbe8ce7ff5d6ca9fdb154b06cf0f4d82420f4c563015ad921d14068905f4ee` |
| `fulfillment-final-build.log` | `c6e828a250b5149745ee6e3a6d3d14b46844e8c6ee840ee225a00bf57967878c` |
| `fulfillment-rpc-functions.json` | `057341ee11d92b3ec6183c24febd23e65c4f60e06970bcb29ffe3b8c5d342043` |


## October 18 configured payment and publication checkpoint

**FIXED_LOCAL / campaign IN_PROGRESS.** Reviewed against HEAD92fdef1fc02d04a016bfabbc656a83080905b05b plus the owned working diff. Tu requests commit and branch push only; no merge, deploy, native build or Production mutation. This section supersedes the earlier uncommitted status once its containing commit is published.

### Same-job payment evidence and defect

P397 reuses the actual noncohort P396 fulfillment chain through Auth, Edge, PostgreSQL and private Storage. A dedicated local-only payment function enables the existing manual-bank services with explicit dummy QA/QAONLY receiver metadata. Neither QR image nor bank endpoint is fetched. The canonical local function retains its disabled rail; no hosted configuration changes. Existing provider-fixture transport permits only the named local Supabase boundary; payment responses assert zero provider and denied requests. AI kill remains enabled and provider credentials absent.

Customer completion concurrency produces one payment/operation, repeated payment-order and transfer claims preserve identity, and a claim remains unverified. Public actor guards and versioned Admin claim/decision gates precede settlement. Fresh Customer and Worker reads agree on paid, one receipt/event, frozen350000 gross,52500 fee and297500 net; review replay retains one review. These are local fixtures, not bank-transfer or Production payment proof.

The initial configured journey reproduced a real409: amount mismatch reverses provisional credit to reversed/admin_rejected, but the existing reconciliation function accepted only pending ledger credit. Forward migration20261018110000 restores only that mismatched order's unchanged ledger: job/order state, Worker, gross/fee/net and frozen commission must agree. Existing Admin, version, bank reference,24-hour hold and access restrictions remain. Function signature is unchanged. Historical named worker_cash_commission_ledger_job_id_key conflict hardening is retained; no previous migration is edited.

P398 rollback-only real PostgreSQL verification covers mismatch, Customer denial, stale version, unrelated reversed-state denial, corrected reconciliation, exact receipt/event replay, frozen amounts/hold and execute privileges. Replacing the function with its pending-only guard makes the test red; transaction rollback restores the reviewed function and the test returns green.

### Executed evidence

| Command / artifact | Actual result | Limit |
|---|---|---|
| node scripts/harness/run-local-qa-http.mjs --instance journey56-20261016 --port-base 58320 | initial21pass/2fail, corrected23/23 across7 files,0 skipped; final98.09s | local fixture boundaries, not UI or hosted proof |
| same HTTP runner with Customer substituted for Admin claim |21pass/2fail; restored23/23 | role mutation observed |
| guarded psql migration delta and P398 SQL | original red WORKER_LEDGER_INVALID; migration applied; green; guard mutation red; restored green/ROLLBACK | named QA only |
| node --test scripts/harness/local-payment-fixture.test.mjs scripts/harness/local-provider-fixture.test.mjs |9/9; binding-guard mutation separately red2pass/1fail | installer and network boundary |
| node scripts/run.mjs run-package-script @nestscout/api test |2183 Vitest pass/25 explicit skips;114 Node pass/1 skip; exit0 | named local23 executed separately |
| node scripts/run.mjs run-package-script @nestscout/api type-check | exit0 | API |
| node scripts/run.mjs run-turbo build with pinned local pnpm shim |1/1, exit0,18.397s | Next support build, not iOS |
| node scripts/run.mjs docker/scripts/edge-check --only mobile-api | selected1/checked1/failed0; compatibility4/4 | pinned local Deno |
| actual PostgreSQL catalog + emitted RPC scan |265 names,0 residue, all present | names, not all behavior or Production parity |
| node scripts/harness/verify.mjs | exit0 after metadata update;470 fixture tests pass | retains declared release gaps; no hosted promotion |
| access matrix / migration inventory / pillar registry |210 tables/380 functions;464 physical/454 canonical migrations;392 unique pillars | static source metadata |

Access matrix's only changed section is source: migration count463 to464 and its source digest. All actors, tables, views, functions, buckets and realtime permission data are identical. The initial harness failure was metadata drift, not a reason to widen grants. Publication runs ship:check again on the committed clean tree before push; it does not replace the runtime evidence above.

### Known gaps and provenance

Named QA ledger still contains453 canonical entries through20261015120000. The new migration is an explicitly applied local verification delta, not an invented ledger entry or proof of full empty-database replay. Current file SHA256:74f0b0c4c62bbe5b463a41f681d97e36d195942be1b7e546db16abc27f643f28. Full isolated replay and Production migration/identity proof remain UNVERIFIED.

One initial payment-era run also hit the unchanged10-second HTTP test deadline during inspection matching. The earlier scope-race timeout remains recorded. Later green runs do not establish either root cause or fix; both timing findings remain UNVERIFIED. No timeout, permission, pricing, financial policy or release gate was relaxed.

Review: apartment authorization owns the SELECT fix; the existing financial RPC owns mismatch recovery; apps/api and guarded scripts own fixtures. Tests share the same fulfillment helper to keep configured/unavailable rail checks consistent. No contract signature, client transport, frozen Build56 Preview or new integration changed. Full K01-K42, remaining recovery/cancellation/dispute/UI evidence, reliable campaign1USD live-inference cap, real payment with Tu transfer and native QA by Tu remain open. No inference or transfer was performed in this continuation.

Private artifact hashes (raw reports remain ignored; no credentials or real bank data published):

| Artifact | SHA256 |
|---|---|
| `payment-http-initial.json` | `fc3d7a61adc9282d268f2d7f681dc603873d9104bfe4ae956db0d54d7f3ce1ee` |
| `payment-http-final.json` | `a31becc8c15bd15cda70a164a9adf2992ff8587182528fc6c467ed4f5fe1aa47` |
| `payment-admin-role-mutation.json` | `fcc10e5f67a80c9da003bf3466c17655b1481d426370872c89e3fad2fda9ecb7` |
| `payment-mismatch-sql-red.log` | `b30eba8b4f08b1969a0df052d3b81ac19dd463eaa6362ca3285846dcf7a71848` |
| `payment-mismatch-sql-green.log` | `c89d01c471802471c5c2cfa76ee319700345555322b93a109ae9cc827695fbd9` |
| `payment-mismatch-sql-mutation.log` | `159d27968eceb70eb3c4407d32a86811183d7a50bb201c657e8c27b2f443b4a3` |
| `payment-mismatch-sql-restored.log` | `c89d01c471802471c5c2cfa76ee319700345555322b93a109ae9cc827695fbd9` |
| `payment-mismatch-local-delta.json` | `775315ba92caaef1508c14af2f9a25e01317b4a5e2f7eb8217a60e50cc63ccb4` |
| `payment-network-tooling.log` | `80aa172643c0f804779b8a0dc39af482940e2c083407d0be796794a3a2866185` |
| `payment-final-api.log` | `d74de35285c4c7e642ca7750eab31912dae504ab872b944dfea8a3adcef2e388` |
| `payment-final-types.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `payment-final-edge.log` | `44dacea733df7eb97a24679cdcbfdd53944d7e5bfd5c259b0576059ae40836dc` |
| `payment-final-build.log` | `1854b4505cb9d2beeb18bcd045a96fd85aa2e183799870bbf0ba29f2e990b895` |
| `publication-harness.log` | `29b8d5326c6207d2a38a00c41b013a4e7e71a1ddca11f71ac5565b5dc6d7f776` |


## October 18 fresh migration replay and complete SQL matrix

**PASS at local database layer / full campaign IN_PROGRESS.** Exact source5dff503b0751d37c2c1359af597dc73d07542c95, branch already pushed; no new commit/push/merge/deploy in this continuation. This closes the previously missing fresh replay evidence for that source, without converting it into hosted or native evidence.

- Created only the fresh named local instance replay56-20261018. Initial portbase58420 was refused before startup because Windows reserves58387-58486. Read-only excluded-port inventory and bind checks identified free59420; no reservation/host/process configuration was changed. Second up preflight passed: daemon29.8.2,2.56GB informational RAM,84.49GB free disk; API59421/DB59422/inspector59428 free. Existing version-policy evidence already records Docker29.8.2/Compose5.6.0 stable update/current; no Desktop launch or restart.
- Official pinned CLI empty-start snapshot applied all454 canonical migrations and seed. Real supabase_migrations.schema_migrations ledger matches apply-plan pendingVersions exactly, including latest20261018110000. No migration ledger was manually rewritten. This is stronger than the prior explicit delta on journey56.
- Actual published bindings are loopback; Edge local target/AI-kill true and zero live provider/integration credentials were checked without printing values. No inference, hosted mutation or banking occurred. CLI credential lines were redacted from the ignored startup log.
- Command: node scripts/run.mjs docker/scripts/run-sql-tests --container supabase_db_nestscout-qa-replay56-20261018. Actual summary: discovered139/executed139/passed139/failed0/stopped_early=false. This includes P398 mismatch recovery, RLS/actor checks, scope-change, completion/payment, monitor and dblink concurrency files collected by the real runner. It proves those SQL assertions; it is not139 UI journeys.
- Post-matrix catalog still contains454 migration rows. Reconciliation eight-argument signature unchanged; execute denied to anon/authenticated, allowed to service_role. Fresh actual RPC catalog scan:265 names,227 literal/38 resolved,0 residue, all present. Behavior claims remain limited to the executed SQL/HTTP tests.
- Command: node scripts/run.mjs docker/scripts/down --instance replay56-20261018, exit0 with backup=true. Authoritative Docker inventory verifies no running replay instance containers, existing journey56 QA still running. Volumes/evidence retained; shared stacks and frozen Preview untouched.

Review: no product code, migration, grant, contract, fixture or timeout was changed to obtain these results. This continuation adds evidence only. Remaining campaign work includes the explicit K01-K42 connection matrix, remaining Preview interactions/rehydration and orchestration/negative HTTP cases, reliable pre-call1USD live-AI bound, and real payment awaiting Tu where appropriate. Native QA remains Tu's scope.

Private retained artifacts:

| Artifact | SHA256 |
|---|---|
| `replay56-up.log` | `afba8d3d0c1f50e32a644af179852bd9111eed6c75754e4e96d02b5b4db009c1` |
| `replay56-up-free-port.log` | `638c5f52a3cc36be71134b060d074f6834250a6184768c5ee6f250778d464876` |
| `replay56-ledger-proof.json` | `8d2d8b67475082eb3f47aacfbdb316f8c6e8654a3e7b013ade2ce92b408fe25a` |
| `replay56-runtime-guard.json` | `c70c25018a885627578ab7d27210c8bad51b3a72c9c96cc74b6e67e27259eb46` |
| `replay56-sql-matrix.log` | `ae7b192fac3f13a247b2a5bc682368cdd57fc17e14566c8b95f60eef0b40eee1` |
| `replay56-matrix-proof.json` | `74f70eb003032640608261f20fc624d1748577aefe4924c4b1341ea4292192cf` |
| `replay56-rpc-verdict.log` | `4e44a75812264305b88c52d12644296f0466b81129a35d8708aff8cbf00a6576` |
| `replay56-down.log` | `6181f00de5e24548af3be23f9c22c41e3fcfb7af146e42e3d36fe4ba6976540b` |
| `replay56-cleanup-proof.json` | `b744393b5eb1fe5ac7c379fa1735a90502caff11f066b1b8b57d213c72a3d305` |


## October 18 frozen Preview navigation and campaign matrix

**PASS for the observed Preview interactions / overall IN_PROGRESS.** Public Production health was rechecked200/registered on projectiwevizmsedyqozxlawwl, sourcee8b95d2122a8ce802c5504630a778f6e51daa72f/releaseharness-e8b95d2122a8-53817ce22f48, epoch3/iOS56/runtime0.3.2. Codex IAB tab2 still renders frozen sourcee8b95d2122a8/HEAD/built2026-10-18T02:12:30.144Z at localhost8086. No source, binding, role or hosted state was changed.

Direct actions: opened selected existing unsent test-session list; Work→Chat→Work; Back→Home→Kael→Work; explicit browser reload and observed loading then same Work route/draft/source marker. The original synthetic unsent draft is unchanged. No Send/upload/confirmation/payment control was submitted; no archived session restored. Screenshot [draft after reload](../assets/test-evidence/build56-preview-draft-rehydration-20261018.png) is safe synthetic content; the Home view containing private details was not retained as an image. Tab marked for handoff and8085 preserved.

Source review found intentional English empty-hero/Home greeting comments and assertions that conflict with the general language rule. This remains a decision item, not an unauthorized localization edit. No visual/material/motion implementation changed.

Executed current-source RN gates: node scripts/run.mjs run-package-script @nestscout/mobile type-check exit0; corresponding test command exit0,280suites/2610tests passed,272.439s. No native visual proof is claimed; native QA belongs to Tu. Current test source5dff503b includes unreleased Admin fixes and is not equated with the frozen baseline UI.

[Full K01-K42 matrix](2026-10-18_kael56-journey-matrix.md) retains every scenario and its missing layer. Next public HTTP tracer is cancellation/replacement; live AI remains blocked by the campaign pre-call1USD bound. Read-only Preview navigation does not prove complete Production intake→payment or resolve the prior timing findings.

| Artifact | SHA256 |
|---|---|
| `preview56-current-mobile-types.log` | `704288413d0b8f641fce0fe2c676eab956c160d01a8da6e0b8d6dc488cfadd2e` |
| `preview56-current-mobile-tests.log` | `1bbaf9749467a745a6c28f6ae6960f281fcdaa5a896f941faf105659cc3087cc` |
| `docs/assets/test-evidence/build56-preview-draft-rehydration-20261018.png` | `0a54181536e1975355344a54ad9006869c60d3723fbbc4ffc18fc7a59353469c` |


## October 18 public cancellation/replacement tracer — runtime findings

**FIXED_LOCAL for Worker duplicate receipt recovery; final full-run evidence pending below.** Same branch HEAD5dff503b plus uncommitted two-line Worker cancellation owner fix, P83 regressions and local test tooling. No Production mutation, further publication or native build.

The helper now exposes the existing actual initial confirmation→dispatcher→Customer assignment prefix, reusing its Auth/Storage/database setup. P399 continues that same job through Customer or Worker cancellation. The canonical local environment deliberately keeps full-autonomy flag off: actual requests returned409/AUTONOMY_FULL_FLAG_OFF with rejected audits. That is a valid configuration gate, not a product bug.

A dedicated loopback-only cancellation fixture simulates exactly the full-autonomy configuration read while retaining AI kill=true, no live provider keys, original handler/RPC/ownership/state logic, and the existing egress allowlist/counters. Supabase rejects Deno.env.set with NotSupported, so this fixture overrides only KAEL_AUTONOMY_FULL_ENABLED at the env-read boundary; it does not mutate the canonical environment or inject approval decisions. Actual tests still assert the canonical off-profile refusal and unchanged job before the on-profile action. Local payment and cancellation fixtures share installer guards but remain separate named functions; no manual bank is enabled in the cancellation profile.

### Reproduced race and correction

Configured actual HTTP reproduced concurrent Worker201/409 after both autonomy audits allowed. One cancellation had committed approved and detached Worker; the losing RPC returnedINVALID_STATUS and the Edge owner only recovered ALREADY_REQUESTED. Two-line fix reads the existing same-job/same-Worker receipt for INVALID_STATUS and returns it only when approved. Without that receipt, or with a merely reviewing receipt, the original409 remains. SQL gates and permissions are unchanged.

P83 regression observed19pass/1fail before the owner fix;21/21 after adding absent/reviewing/approved cases. Removing the approved-only restriction produced20pass/1fail; byte restoration returned21/21. The exact reviewed owner delta was copied only into the already owned QA snapshot; official CLI hot reload replaced its Edge container automatically. One immediate runner invocation refused before Vitest during that rotation; its accidentally copied prior JSON was renamed NOT-EXECUTED and explicitly marked invalid. No manual process restart or gate bypass occurred. Canonical and fixture readiness subsequently returned200/local with AI disabled, and actual HTTP recovered201/201 with one cancellation ID.

### Fixture findings and minimization

- Initial full attempt:13pass/4fail/8skipped due setup health timeout; the skipped scenarios are not PASS. Cleanup502 stopped an old sequential cleanup loop after its first actor, leaving two owned Workers online and contaminating a later recipient assertion. Cleanup now attempts every owned Worker even when one fails, reports failures, and retires only unfinished unassigned matching through the owning Customer cancel command. Exactly3 proven fixture actors were taken offline by existingRPC;7 proven fixture jobs were checked and only eligible unassigned matching retired. No data/history/price/training/receipt was deleted.
- Broadcast has sent_at, not created_at; corrected the test query after catalog inspection. Existing replacement policy excludes Workers already offered this job. A fresh controlled eligible Worker is therefore added only after the original assignment, before cancellation/dispatch. No eligibility policy or quota changed.
- Focused guarded runner --only cancellation preserves every identity/loopback/AI/credential guard and writes a distinct cancellation-results JSON; default still runs all8 files/25 cases. Unknown/ambiguous selections refuse before runtime access, exercised by real child-process tests.
- Focused two-case journey finally passed2/2: Customer concurrent cancellation retires matching to stopped without payment; Worker cancellation queues one outbox, actual maintainer creates the new controlled offer, Worker proposal remains unassigned until Customer confirmation, and old Worker receipt replay preserves the new assignment. Foreign-actor mutation produced0pass/2fail/0skip; original test bytes restored before the full default run.

Known local maintainer500 remains explicit: its matching effects are independently checked, and replacement outboxes show completed/attempt1/no error. No claim that the maintainer itself is healthy is inferred from those effects. Intermittent10s local health/detail timeouts and gateway502 remain unverified causes; no deadline was increased.


### Cancellation tracer final checkpoint

**PASS for the named local pre-work RFQ cancellation/replacement journey; FIXED_LOCAL/unreleased owner patch.** Final default guarded run with current generated payment fixture4d393541ab77 and cancellation fixturef6dc97de720a:8 files,25/25 pass,0 skipped,195.73s. Both payment cases and both cancellation cases execute. The complete original initial-confirmation/intake/scope/matching/fulfillment scenarios remain collected. API setup health and fixture endpoints were200 before this run; concurrent cold readiness took8.15–8.55s locally, with global AI disabled. This is a development-runtime observation, not a Production latency measurement.

Post-run catalog proves all16 owned noncohort test Workers are offline. All557 tracked Edge/dependency source files compare equal to the reviewed working source after newline normalization; the sole product diff against HEAD is the two-line Worker receipt fix. No SQL function, schema, price, financial policy, learning policy or client runtime was changed in this tracer. Fresh454-migration/139-SQL proof remains the unchanged database-layer evidence.

| Executed command / seam | Actual verdict | Scope |
|---|---|---|
| guarded HTTP runner, default8 files |25/25,0skip; exit0 | actual local Auth/Edge/PostgreSQL/Storage; no real banking |
| guarded --only cancellation |2/2; separate report; then foreign-actor mutation0pass/2fail and restored bytes | focused public actors/receipts/new assignment |
| P83 focused regression |19pass/1fail before fix;21/21 after and restored; approved-guard mutation20pass/1fail | absent/unapproved receipt remains409 |
| node scripts/run.mjs run-package-script @nestscout/api test |2186pass/27 explicit skipped; Node114pass/1skip; exit0 | default suite; named runtime cases executed separately |
| corresponding API type-check | exit0 | final helper/owner/test types |
| node scripts/run.mjs run-turbo build, pinned local pnpm shim |1/1, exit0,18.315s | Next support build only |
| node scripts/run.mjs docker/scripts/edge-check --only mobile-api | discovered7/selected1/checked1/failed0; compatibility4/4; exit0 | current pinned Deno |
| node scripts/harness/verify.mjs |472 script fixtures pass and assurance exit0 | keeps declared release gaps |
| installer/network/selection Node tests |11/11; unknown/ambiguous --only rejected before runtime | no arbitrary test paths or guard bypass |
| actual RPC catalog query + current scan |265 names,0residue, all present | no new signature or object |
| registry/comment/structure/collection/diff |393 unique; clean/static gates0 | no baseline or grant weakened |

The earlier 24/25 run remains red evidence: payment fixture attribution was missing and its cleanup exceeded the framework's10-second hook timeout. Each request deadline remains10 seconds. Cleanup can perform a persisted read, an optional cancellation, then parallel availability writes, so its total orchestration budget deserves a separate explicit check; no timeout was raised in this checkpoint. Old gateway502/health/detail timeouts and isolate wall-clock warnings are retained with root causeUNVERIFIED. Installing the current default payment fixture was required to verify the shared installer implementation; a subsequent green run does not establish that it fixed those timing issues.

Next: bounded QA attribution/cleanup-budget diagnosis, then public dispute/postcompletion exceptions and remaining Preview/account-state cases. Native QA is Tu's scope. Reliable1USD pre-call live-AI enforcement remains absent, so no live AI or bank transfer was attempted. FullK01-K42 campaign remainsIN_PROGRESS. No new commit/push/merge/deploy.

| Retained private artifact | SHA256 |
|---|---|
| `cancellation-http-initial.json` | `f74e728116ffaa5bd240a8b0a858783887fe7253ebfc33870c2a2b1bf820adad` |
| `cancellation-http-configured.json` | `e81d7d4588b541db31c4da8de4815d1b7e244ab66fe316845786c3e2629767f4` |
| `cancellation-http-race-fixed-retry.json` | `20f8bc62d063cbd8667172e016c74c2ad6847e6be2ac19eff658c00f0b7708c0` |
| `cancellation-http-query-fixed.json` | `ddb3da7c3b81d935a7611e7fd7c1284539b58f333d10bca7a001e87372216922` |
| `cancellation-focused-fresh-worker.json` | `db071354988e451ece820faf7506f2d8ed0726edf995d5fe33dec6124c3ebe9f` |
| `cancellation-role-mutation.json` | `c6eeed1772bed68888d24ca5bb34838717f977a8ef5f1318324b45c15c9f2326` |
| `cancellation-http-final.json` | `ab5327e5c03637119f3ce7f1ada01b205d933cbc307bf8fd20418fcc99d86392` |
| `cancellation-current-profiles-full.json` | `5c118e4bf4cb259539f687c0740967033faf8472ae030bb0eb0c9f676a571259` |
| `cancellation-race-unit-red.json` | `a65319bff189ae4c38873352633dab50957122d20a4a0dbd45e5e3fb44080694` |
| `cancellation-race-unit-restored.json` | `1d8f86ab21a09b5e04898797e7dab91078c372a130c04740aa36aa69d115b0c1` |
| `cancellation-approved-guard-mutation.json` | `0cd2b69dd93178842c14b3dc7b4544f09082ac54b994bcdade3a5dbc234bf709` |
| `cancellation-race-source-override.json` | `d765c6cb53497bf4b2ac793a694a3e4f860635028bc1cdfe9322190b1983c6d4` |
| `cancellation-current-api.log` | `ea394460cf0a417f6af943064206603a4853141bb16636e2da663052e019a4c3` |
| `cancellation-final-types.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `cancellation-final-build.log` | `ea46fd23ea11c10c7dd6382cb1c4f10befadae33c5942606d298e98eea53155e` |
| `cancellation-current-edge.log` | `19a546bb236510f603b50ca8833c50e3badb4f19696408bba6c4b657021a2b9f` |
| `cancellation-final-harness.log` | `e415673ad5725da3e021028cb0d6ac57124cfd12bdda34580d1cbff22c303fee` |
| `cancellation-tooling-final.log` | `aa3ce1f08b1729bcc8be64d3bb147ab06c65e4bfcd38f01fdb7307132d192361` |
| `cancellation-rpc-verdict.log` | `4e44a75812264305b88c52d12644296f0466b81129a35d8708aff8cbf00a6576` |
| `cancellation-final-proof.json` | `92641948c4bb89e873ac5fcfac1bea00fdd8e3a73d56b507a3f8ace7e32dad8f` |


## October 18 bounded QA cleanup and safe failure attribution

**FIXED_LOCAL for the test cleanup budget; old gateway/Edge timing cause remains UNVERIFIED.** Source HEAD b7e76cc279b71ce96c73131020e55af88fff1c7e plus test-only delta. That HEAD was committed/pushed by Tu's explicit request, without merge. These new changes are uncommitted; no Production/Preview/native mutation.

The pinned Vitest4.1.6 onTestFinished API accepts a per-hook budget. Actual old hook could read persisted job, optionally cancel owned unfinished matching, then attempt parallel Worker availability writes: three serial HTTP windows against its default single10s window. P400 invokes the real fixture callback with mocked transport boundaries; three9s stages produced two hook_timeout failures before the fix. The registered hook now budgets3×10s=30s. Every individual fetch and Storage upload remains10s; unknown fixture counters remain null and fail the zero-inference/egress assertion. No global timeout, state/permission/pricing policy or product code changed.

Safe diagnostics now include only HTTP status, run ID and elapsed milliseconds in fixture-attribution failures. A simulated503 with a private sentinel response proves those fields are useful while payload stays out of the message: attribution regression red1fail/2pass, then3/3green. Restoring the default10s hook mutation gave1pass/2fail with hook_timeout; exact bytes restored and3/3green. The first mutation wrapper mistakenly inspected stdout only; the combined log and real JSON confirm the two expected failures, and a separate verdict checks them plus byte-exact restoration.

Owned local runtime was inspected through the existing loopback/binding/AI guard, not restarted manually. Container running, OOMKilled=false, RestartCount0. Three endpoints first observed at200 in4656/3939/3518ms, then200 in15/13/14ms. Recent bounded log window had no wall-clock/early-termination/CPU-limit markers; this observation cannot explain earlier failed containers or establish a general failure rate. Source config still policy=per_worker. Cold-start/resource/lifetime causes remain hypotheses, not fixed defects.

Executed commands and results:

- Guarded default HTTP runner:8files,25/25,0skip,180.86s,exit0. Fresh JSON start time checked against this run log before accepting evidence. Canonical and both fixture journeys remain included.
- Read-only own-actor SQL:16/16 controlled Workers found,0available,0nonfixture. No cleanup deletes or forced business transitions.
- P400 focused via actual API Vitest config:3/3 after restoration. Registry394unique with manifest twins identical; real runner collection14/14.
- API package test:176passed/10skipped files,2189passed/27explicit skipped cases; Node114passed/1skip of115; exit0. Named HTTP cases executed separately, not converted from skips into pass.
- API type-check exit0. Next support build1/1 exit0,15.656s; not native build.
- Comment discipline, structure (1442 source files, baseline unchanged), diff checks pass.

Review fixed point: uncommitted test-only diff against b7e76cc2; approved journey plan requires bounded requests, controlled actors, zero inference and honest evidence. Spec compliance: separates cleanup orchestration budget from request SLA and preserves all failure assertions. Rules compliance: no live integrations, financial/learning/history edits or hosted mutation. Maintainability: one shared10s constant, one local derived hook budget, no global runner config change. Remaining product/runtime timing limitation is explicitly retained.

Next tracer: public dispute/postcompletion HTTP chain. FullK01-K42/Preview role/live-AI scope is stillIN_PROGRESS; live inference remains blocked by the reliable1USD pre-call cap. Native QA and actual bank transfer belong to Tu.

| Retained private artifact | SHA256 |
|---|---|
| `cleanup-budget-red.json` | `7c1a6ec130755d48969c697b9ea9989cbe3f98733648bf330bf251d64c208208` |
| `cleanup-attribution-red.json` | `582f5aec9c92e6fd8fb81f4e887e66b6e9870f48f25f90ab46060e6ce79d5776` |
| `cleanup-restored.json` | `5e382d867fe27cc30b5f4d611b92519c2b49c4c049671f653234c3376189dc44` |
| `cleanup-hook-mutation.json` | `8fc3a38a241ae280257df3136421cfd82dc5dc6466faf248a5f691ca3361628f` |
| `cleanup-hook-mutation-verdict.json` | `806d46ae9e7d91f2ddd9218f461b05849f701a585163d7b069f78c9ac970e516` |
| `qa-attribution-runtime-observation.json` | `96b6b7a66131b02a67ea08c61acebe5eab7f0c6c80459efd9156e3916d5da7b5` |
| `cleanup-budget-http.json` | `960c47b4988fbf04921cc27d32565cc0ff0e71865198dcd0c90e8a0a1963facd` |
| `cleanup-budget-final-proof.json` | `ba31958c794f7159a3d70b4a24513a5d448da86081f441b767942ea39e431f3f` |
| `cleanup-api-types.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `cleanup-final-api.log` | `258de7a64130aef7a8adfebdd712fdf0a17c1437327b6213d8d4402606531d44` |
| `cleanup-final-build.log` | `05c94e2e37c8f8bdb1c839279abcbdc4b4dd39bcde43e38048e669d29b8fc6bb` |


## October 18 actual postcompletion dispute chain and App wiring gaps

**PASS at the named local HTTP/PostgreSQL layer, not complete Preview/native proof.** Sourceb7e76cc2 plus uncommitted test-only cleanup/coverage delta. P401 starts with the same actual RFQ confirmation, matching, Customer assignment, Storage/check-in, price consent and completion prefix. Only the initial saved RFQ diagnosis is a declared fixture; no lifecycle SQL jump after it, live inference or banking. Both Customer and Worker dispute initiators execute against real Auth/Edge/PostgreSQL.

- Initial focused2/2 passed; extended focused3/3 includes matched-phase refusal for both participants without assignment changes, and concurrent Admin decisions.
- Concurrent openings return201/409 ALREADY_OPEN by the existing contract, one durable dispute, evidence snapshot, review queue item and opening event. Counter-party statements return200/409; only the counterpart is allowed. Duplicate Admin decisions return200/409; later replay preserves the stored decision and returns ALREADY_DECIDED. These are conflict semantics, not recovered success receipts. Lost-response UX is not proven by them.
- Foreign account cannot open or respond. Real authenticated participant SELECT succeeds; foreign SELECT returns empty under RLS. Non-Admin cannot decide. Unpaid-service dispute remains explicit DEFERRED_PHASE0; attempting refund on unpaid work returns REFUND_PAYMENT_UNVERIFIED. Nonmonetary Admin resolution leaves completed_by_worker, agreed350000, no payment order or synthetic paid status. No AI job logs.
- Mutation replaces the positive Admin decision actor with the initiating participant: actual runner1pass/2fail/0skip, exit1. Exact source bytes restored. Default guarded9-file runner then28/28/0skip,222.16s,exit0 with fresh start-time-validated JSON.
- Own-actor catalog check:25controlled fixture Workers,0available,0nonfixture. History/receipts/training/prices retained; no manual host/server restart or Production change.

Verification: API test176passed/11skipped files;2189passed/30explicit skips, plus Node114passed/1skip/115,exit0. The named HTTP tests are run separately; default runtime skips are not pass. API type-check0; Next support build1/1,15.258s,exit0. Tooling17/17; collection14/14, comment/diff/structure gates pass. Registry395unique; manifest twins identical. No mobile code, schema, Edge source or generated database type changed; native QA remains Tu's scope. Whole-campaign final gates remain required after later fixes.

### Source-proven App gaps (rendered behavior still pending)

The inspected services.ts, customer history surface and Admin section copy match frozen Build56 sourcee8b95d21 after newline normalization, with hashes retained.

1. Customer history support calls jobService.openDispute through the existing confirmation Alert. Every unsuccessful result uses the generic not-opened/try-later notice. Actual Backend ALREADY_OPEN is409. This is a suspected misleading recovery/error mapping; reproduce with RNTL before any fix. It does not establish a rendered Preview failure yet.
2. submitDisputeCounterStatement and decideDispute exist in the service adapter but have no application caller in current mobile source. Worker opening also has no UI caller. Admin copy explicitly says review/preparation only, no adjudication, consistent with STRUCTURES partial status. Record API-not-connected/missing UI coverage; do not silently add new dispute workflow, decision powers or operator permissions.
3. No direct Preview dispute action, device render, lost-response UI rehydration, paid refund or external banking was verified by these local tests. No claim of App/Backend100percent match.

Review fixed point: uncommitted tests/runner plus already reviewed cleanup delta againstb7e76cc2. Spec: existing workflow through public handlers with actors, concurrency, persistence and no invented payment. Rules: existing conflict/state/permission rules preserved. Maintainability: reuses actual fulfillment prefix; runner accepts only enumerated cancellation/dispute selections, default includes both, distinct report paths. Required future work: existing Customer conflict feedback regression, other42-scenario gaps and current final gates. No product fix was needed for the tested dispute Backend chain.

| Retained private artifact | SHA256 |
|---|---|
| `dispute-first-http.log` | `808f7dd7c9d2242f884be78afa5d99d7225d912570e9985e2280c4e3f99de124` |
| `dispute-complete-http.json` | `febe866565312312f976b81aa9932c4ff82ce6b9a6e1c4caad9a57ca268128b5` |
| `dispute-role-mutation.json` | `851ace721d536a0950c61a83281070ac9541f93ad4244db19f7ac4a7faff7177` |
| `dispute-role-mutation.log` | `1f1815a9a1d1e366d8bdc3dbc3ba661c8874f39cd847c45993e384b9a92f66e0` |
| `dispute-full-http.json` | `e0e91945dfe42e96d80ddbee554fbb0e9b0989339eedb22b8ac5ad9d42eb1d71` |
| `dispute-final-proof.json` | `46ce24f2e1a9244dcb63538948d5653c5baa9a1a64415fd58f4ed22f0ed97085` |
| `dispute-mobile-wiring-source-proof.json` | `79bf1cb943575e21df3f2af267043882a9f35eee7b6f08e34722efdfab47ea33` |
| `dispute-final-api.log` | `45d3fffebf8d4e4f28c40df2cc309cb6e43b645086c7e2f9e72077b9121103cd` |
| `dispute-final-types.log` | `52b89cc35c6cc5a1d53fcd0af045577e893f5a9fe7db562a37234f75f10c0643` |
| `dispute-final-build.log` | `3987a4232030202fefba9599b5020690297470000db5e09dc6662e31ffc4cec2` |
| `dispute-tooling.log` | `7827f93d10d6417b32bde99a22270de47911b19f2149016e33d09774760e731b` |
| `dispute-registry.log` | `8ba4f1ccd1d9a26e2a10458d06578db20f273e2139ea55d95b2630af99837bfe` |


## October 18 Customer support feedback

Native RNTL conflict feedback FIXED_LOCAL: observed red→matrix14/14, status-only mutation12pass2fail→restored full Mobile280suites/2621tests,types/changedDoctor0issues. Next support build cached1/1. Direct frozen Preview Support control failed to open confirmation, consistent with empty web Alert implementation; no submission, Profile restored. This web limitation remains unresolved, separately from the native notice fix. [Detailed evidence](2026-10-18_customer-support-conflict-feedback.md). No new publication/deploy.
