# Customer support conflict feedback and Preview confirmation limitation

## Scope and identity

**FIXED_LOCAL for native support error interpretation; Preview web confirmation remains FAIL/BLOCKED.** Worktree kael56-admin-partial-loading-20261016, branch codex/kael56-admin-partial-loading-20261016, HEADb7e76cc279b71ce96c73131020e55af88fff1c7e plus uncommitted local changes. No new commit/push/merge/deploy/build of a native binary. Preserve the original Build56 Preview and Production.

Approval/spec: approved Kael K01-K42 audit and existing-function bug fixes. Runtime owner: customer history support control→jobService.openDispute→mobile-api dispute handler→open_dispute_atomic. Previous actual local HTTP P401 established that an active duplicate returns409 ALREADY_OPEN, without another dispute/snapshot/queue/event. This UI tracer mocks only that transport response in RNTL; it does not equate a component test with a Production UI journey.

## Reproduction and minimal fix

RNTL mounts the real CustomerHistorySurface, presses Support, verifies no API call before explicit confirmation, invokes that real confirmation action, and returns the same409/code pair. Baseline produced “Chưa mở được yêu cầu / Vui lòng thử lại sau.” instead of the existing-request state:3pass/1fail,exit1.

The nine-line owner fix recognizes **both** status409 and codeALREADY_OPEN, then tells the Customer that support is already open and does not need resubmission. It does not claim a new request, human review, resolved dispute, payment/refund or cached permanent status. All other errors retain the existing failure branch. Native confirmation, reporting action, pending lock and service/API signatures remain unchanged. No generic Alert/platform replacement or new business UI was added.

## Observed tests and gates

| Command / seam | Cwd | Actual result | Limits |
|---|---|---|---|
| focused installed Jest, --runInBand --runTestsByPath components/customer/__tests__/customer-history-states-pillar-test.tsx --json | apps/mobile | old3pass1fail→4/4; extended14/14 | Native RN test runtime, mocked transport only |
| broaden exact conflict guard to every409 | same |12pass/2fail,exit1; exact original bytes restored | unrelated409 must remain a failure |
| node scripts/run.mjs run-package-script @nestscout/mobile test | worktree root |280/280suites,2621/2621tests,exit0,725.363s | full restored source; not native device proof |
| corresponding Mobile type-check | root |exit0 | no missing interface hidden by casts |
| node scripts/run.mjs run-react-doctor changed -Base HEAD | root |v0.5.8,2files,0issues,exit0 | changed scan, no aesthetic or native score |
| node scripts/run.mjs run-turbo build, pinned local pnpm shim | root |1/1,exit0,1cached,289ms | cached Next support build; does not compile native binary |
| registry, collection, structure, comment/diff checks | root |395unique,twins identical;14/14filters;structure1442,baseline unchanged;clean | same existing gates |

All focused cases use public rendered controls and Alert calls: VI/EN, exact known conflict, INVALID_STATUS409, forged ALREADY_OPEN403,500, network error, no raw error details, explicit confirmation and disabled single in-flight request. Empty/error/audit-isolation cases remain collected. Raw logs retain existing act warnings and the selected-run open-handle advisory; no warning/test or timeout was suppressed. The complete Mobile process was observed terminal exit0.

## Direct IAB observation on frozen Build56

Read-only public health at2026-10-18T06:45:33.396Z returned200. Authoritative fields environment.project_ref=iwevizmsedyqozxlawwl,release.release_id=harness-e8b95d2122a8-53817ce22f48,release.git_sha=e8b95d2122a8ce802c5504630a778f6e51daa72f still match; runtime0.3.2 appears in the registered client compatibility. No binding was changed.

The existing IAB tab2 was on Profile. Its visible runtime marker is SHAe8b95d2122a8/HEAD/built2026-10-18T02:12:30.144Z. Selected Activity, observed real history, pressed one existing Support control. No confirmation appeared. Inspected pinned react-native-web0.21.2 Alert implementation: its static alert method is empty. That corroborates the observed web no-op; it does not establish an iOS defect.

No confirmation/submission action was invoked; no support request, transfer or AI prompt was submitted. No total-network-request claim is made: this is not a captured network trace. Returned tab to its original Profile route and marked handoff. No financial-history screenshot was retained. [Preserved Profile](../assets/test-evidence/build56-preview-profile-preserved-20261018.png) shows the restored page, not the fixed native notice or binary behavior. The full native Alert and physical device matrix remains Tu's scope.

## Review and remaining work

Fixed point: uncommitted UI diff againstb7e76cc2. Spec: existing request is not presented as failed first submission; exact-code guard prevents fake success. Standards: same confirmation/ownership/server boundaries, no raw errors, VI/EN and existing native presentation. Maintainability: localized change in its owner, no global network/Alert patch or duplicate workflow. Frozen Preview remains separate.

Next: inspect/reuse the existing cross-platform confirmation/notice surface for this same Support control, with all current choices retained, before any implementation. Do not silently add adjudication/counter-party/Worker business UI. Existing missing callers and the reliable1USD live-AI cap remain explicit gaps in the full42-scenario campaign. No campaign completion or Production-ready claim.

## Private artifact provenance

| Artifact | SHA256 |
|---|---|
| `support-conflict-red.json` | `14c350fbf9c966da8e57f3708880bbb333f3c7633b356e4667aeada02b2f46b3` |
| `support-conflict-green.json` | `ec20089df01e305f7f7581f9a5941bf74a00e62ce769771d23c5321873c9d594` |
| `support-conflict-matrix.json` | `679f703c63371851d77c9705bbfa18f1f97dc38c4994e64f5a483b0dd2d00a4e` |
| `support-conflict-mutation.json` | `9da952e10d8702c996a70aa9ab215deb0f32cf1636f24c63aa407f57e8ec2c69` |
| `support-full-mobile.log` | `cd1e94b2cb4fce05d4f07d3df0aa5ece8b0306aee4e96688983c3575d3eb2fe5` |
| `support-mobile-types.log` | `704288413d0b8f641fce0fe2c676eab956c160d01a8da6e0b8d6dc488cfadd2e` |
| `support-react-doctor.log` | `c0210476d1de78bb7e7b92b35e86277a4bb6c708724055fd4697c8ef32e581c6` |
| `support-final-build.log` | `c352704850fb7acba65ce79360dd12f358fe05cd0feaddac349acdc4fffa6692` |
| `support-preview-health-identity.json` | `015b8ec6d61314bf43944385a7e1233eaf416df40ba3b75c09fdd6e0557a58cf` |
| Profile screenshot | `79cd0b742282e1e6b3bf0027d87b9578944bcdc48ec8c7a2a0edadd37e0aa1f0` |
| installed web Alert source | `d6a941824ee6a4260dd612d3ffed6d6640183999e01bf3c086a69f64ccad6bc1` |

## Branch publication checkpoint

Tu requested commit and push of the current branch without merge. This checkpoint also includes the subsequent web confirmation work: a history-owned Modal presenter preserves cancellation, support submission and worker reporting, retains Native Alert, and discards obsolete account/unmount callbacks. The focused installed Jest report `support-web-matrix.json` records21/21 and `support-web-types-fixed.log` records a successful Mobile type-check. These artifacts were inspected at publication; they were not rerun for this Git-only request.

The earlier full Mobile2621 and React Doctor results above predate the new presenter and must not be attributed to the final checkpoint. Full Mobile, React Doctor including the new files, additional concurrency/mutation cases and direct local QA Preview interaction remain UNVERIFIED for this newer UI delta. No QA Preview was launched for this checkpoint. The K01–K42 campaign remains open; this is a source checkpoint, not release approval. No merge, deploy, native build or Production mutation is included.
