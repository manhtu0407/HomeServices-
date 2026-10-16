# Admin independent health and incident loading

## Scope and provenance

Baseline `e8b95d2122a8ce802c5504630a778f6e51daa72f`, branch
`codex/kael56-admin-partial-loading-20261016`, uncommitted local fix.
The frozen Build 56 Preview and Production remain unchanged. No deployment,
credentials, business mutations, new UI control or inference call is involved.

Asked task: execute the full Kael/Backend/Admin verification plan and fix
reproduced existing bugs. Real goal for this slice: a delayed/failed evidence
source must not hide the completed source or manufacture an empty incident list.
Class: ui/C, local execution without delegation.

## Reproduction

The original component dispatches both health and incidents only after a shared
`Promise.allSettled` completes. A fulfilled or failed source remains invisible
while its peer is pending. A health response also marks the shared `loaded` bit,
which can make an unqueried incident source look empty after independent reads.

Four new RNTL delayed/failed peer cases give 20 PASS / 4 FAIL against unchanged
product code. After separate settlement handlers, they give 24 PASS / 0 FAIL.
A further unavailable-projection case catches false empty-success copy. A
polling test checks 60-second reads, background pause, immediate foreground read,
and timer/subscription cleanup; Operator never invokes the collector.

One intermediate test run had a test-only AppState spy-restoration error causing
later tests to fail. Restoring the exact prior listener function corrected that
isolation mistake. Those extra failures are not product findings.

## Change

- Apply each API result/error as soon as that source settles.
- Keep the existing request lock and sequence/focus fences for bounded polling.
- Only the incident result marks incident data as loaded.
- Withhold incident count and empty-success text before an available result.
- Preserve existing known data, filter controls, Owner automatic check and lack
  of manual Reload/Retry/pull-to-refresh.

Reuse: existing reducer actions, service methods, focus fences and polling owner;
Promise settlement is sufficient. No new module, hook, dependency or backend
contract was introduced.

## Design preflight

Surface: Admin Sections / System Health; workflow K40–K42 evidence inspection.
Design Read: preserve the existing sheet hierarchy and data honesty.
Source mode: none; external pattern research does not help this async bug.
Wheel class: component, through diagnose/TDD/frontend-test and UI protocol.
Material/motion/tokens: unchanged; construction/animation spokes not applicable.
No upstream stylistic rule was imported. States: pending, fulfilled, failed,
unavailable, background, foreground and unmount. Acceptance: completed evidence
renders while its peer remains pending; unavailable is not an empty success.
Native QA remains Tu's responsibility and is not claimed from these tests.

## Actual verification

All commands ran in this worktree, baseline SHA above plus the uncommitted diff.

| Command | Result | Evidence |
|---|---|---|
| Targeted `pnpm test:mobile --runInBand --runTestsByPath components/admin/__tests__/admin-team-system-workspaces-pillar-test.tsx` | 26/26 PASS, exit 0 | `.scratch/admin-final-targeted.json` |
| `pnpm test:mobile --runInBand --json --outputFile=../../.scratch/admin-mobile-full.json` | 280 suites, 2605/2605 PASS, exit 0 | Actual Jest JSON and `.scratch/admin-mobile-full.log` |
| `pnpm type-check:mobile` | Exit 0 | `.scratch/admin-type-check.log` |
| `pnpm doctor:react:changed` | Exit 0; 2 changed files, 0 issues, score unavailable | `.scratch/admin-react-doctor.log` |
| `pnpm lint:comments --working` | Exit 0 | `.scratch/admin-comments.log` |
| `pnpm harness:pillars:check` | Exit 0, unchanged P54 registry | `.scratch/admin-pillars.log` |
| `pnpm lint:structure` | Exit 0; 1442 source files | `.scratch/admin-structure.log` |

A proposed P54 description refinement initially made its generated index stale;
the unnecessary metadata edit was removed. The original pillar definition and
registry remain intact; new cases are collected by the existing runner.

## Review and limits

Fixed point: e8; review uses `git diff HEAD` and no later commits.
Spec compliance: independent source visibility and honest incident empty states
are restored; original Owner/Operator and polling tests remain passing.
Rules/standards: same service boundary, role guards, language and no new secrets,
AI request, financial authority or Production mutation.
Maintainability: existing state/actions and lock remain; no parallel request
framework or speculative abstractions added.

The read lock still waits for both bounded requests before the next batch. This
fix makes each completed result visible; it does not introduce a new request
scheduler. Device rendering/performance and a separate fixed-source Preview are
not claimed. Build 56 Production has not received this local fix.

Status: FIXED_LOCAL for reproduced cases; final mutation/workplan evidence is
recorded below when complete.

## Final local evidence

Compile-only original-source mutation: 21 PASS / 5 FAIL. Restored fixed source:
26/26 PASS with the same transformer/config. No source file was overwritten by
the mutation. Strict coverage with actual baseline API JSON plus current Mobile
JSON remains 65/65 MAPPED and 445/445 bound assertions, exit 0; historical release
gap strings in that catalog are not current Production observations.

Collection and baseline ratchets pass. Workplan and diff review close this local
slice; no native, hosted deployment or full campaign completion is claimed.

## Additional reproduced status-priority defect

A fresh red/yellow Backend check was hidden by a required App source with no
recent evidence. A missing required check also hid a fresh failure; an unknown
optional source could turn a complete required green scope gray. Expanded RNTL
cases reproduce 26 PASS / 5 FAIL on the preceding partial-loading fix.

The summary now expires the whole snapshot first, projects each required check
to gray when its own evidence is stale, then reuses Shared evaluateSystemHealth.
The established red → yellow → gray → green priority applies to current required
evidence. Missing required evidence still prevents green. Individual optional
checks retain their own labels; no coverage is fabricated.

Actual commands in this worktree (e8 plus uncommitted changes):

- corepack pnpm --filter @nestscout/mobile exec jest --runInBand --watch=false
  --runTestsByPath components/admin/__tests__/admin-team-system-workspaces-pillar-test.tsx
  --json --outputFile=../../.scratch/admin-priority-green-final.json: 31/31, exit 0.
- Compile-only frozen e8 source: 21 PASS / 10 FAIL; restored same transform/config:
  31/31, exit 0. Artifacts: admin-priority-original-source/restored.json.
- corepack pnpm test:mobile --runInBand --watch=false --json
  --outputFile=../../.scratch/admin-priority-mobile-full.json: 280 suites,
  2610/2610 PASS, exit 0.
- corepack pnpm type-check:mobile: exit 0, admin-priority-types.log.
- corepack pnpm doctor:react:changed: exit 0, one iteration-chain warning at
  summary aggregation; score unavailable. The canonical rule was fetched with
  cache disabled and requires hot-path profiling before optimization. The
  collection is contract-bounded to 32 checks and ordinarily updates each minute;
  no target trace/performance regression is established. Classification: Needs
  evidence, not false positive or performance PASS. No rule was suppressed.
  [Canonical rule](https://www.react.doctor/docs/rules/react-doctor/js-combine-iterations).

Review: smallest UI owner, reused Shared behavior, existing expiry tests remain
green, no new copy/motion/material/API or financial authority. No device or
fixed-source Preview validation is claimed. Status: FIXED_LOCAL.
