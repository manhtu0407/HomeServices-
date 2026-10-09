# Customer Matching recovery — 2026-10-09

## Runtime and scope

Production `mobile-api` v284 reports registered source `b802af8ec8edcfe7f7226c61e8118ad189cce22e`. The implementation worktree starts at that exact commit. Comparing the old `d4275158a56c` checkout with 442 deployed source files found 26 missing files; it must not be deployed as a replacement. The recovery worktree has no missing deployed files. Existing Worker UI changes remain in the original checkout.

This package repairs Customer job hydration, Matching retry/cancellation ownership, duplicate Matching summary text, and a customer-only legacy confirmation recovery route. It does not grant worker skills, publish price evidence, send fabricated invitations, or change payment/completion state.

## Preflight and design handoff

- Delegation: local; source alignment, recovery wiring, and review are tightly coupled.
- Design task / surface: visual bug and error-state repair in Customer Kael Case.
- Workflow step: accepted offer → job hydration → exhausted Matching → retry/stop.
- Design Read: the existing receipt owns the Matching explanation; adjacent summary text must not repeat or clip it. Loading failures need a distinct retry action.
- Source mode: none; the supplied incident screenshots and existing product surface are sufficient. External visual patterns and UUPM evidence are not needed for this bug.
- Taste direction / adaptation: preserve the existing Vietnamese chat, glass controls, tokens, and layout; no redesign, material change, or added motion.
- Ignored rules: none. Design Wheel class: visual-bug.
- Skills/protocols: design-preflight, diagnose, visual-qa degraded lane, frontend-test, TDD, core hygiene, Supabase, backend structure/parity, ship.
- States/gates: concurrent successful reads, real API failure/retry, job/account/role/token change, exhausted Matching, known/unknown retry results, cancellation during detail refresh; type-check, RNTL and authenticated Preview.
- Acceptance: real API/UI correspondence and real invitation evidence are required for live Matching success. Browser evidence does not establish native layout, glass, or motion quality.

## Commands and observed results

All commands below ran in this recovery worktree unless explicitly stated otherwise.

| Command / signal | Result |
| --- | --- |
| Recovery route regression before implementation | FAIL exit 1: customer recovery route was absent |
| Recovery Edge regression after implementation | PASS exit 0: 12 cases |
| `pnpm test:api` | PASS exit 0: Vitest 1,809 passed, 2 skipped; script suite 111 passed, 1 skipped |
| `pnpm type-check:api` | Initially FAIL exit 2: router service mock lacked the new method; PASS exit 0 after adding it |
| `pnpm type-check:shared` | PASS exit 0 |
| Mobile provider/retry regression before port | FAIL exit 1: 4 behavioral failures; recovery service import absent |
| `pnpm type-check:mobile` after port | PASS exit 0 |
| Focused real-provider API-failure → shared-retry test | PASS exit 0: 1 passed, 24 intentionally not selected |
| `pnpm test:mobile` | First run FAIL exit 1: 2,450 passed, 1 timeout during concurrent type-check/React Doctor. Unchanged serial rerun PASS exit 0: 264 suites, 2,451 tests; existing `act(...)` warnings remain. |
| `pnpm test:shared` | PASS exit 0: 140 tests |
| `pnpm doctor:react:changed` | Exit 0, diagnostics remain: API 90 issues; mobile 662 issues; score unavailable. This is not a clean audit. |
| `pnpm lint:structure` | PASS exit 0 |
| `pnpm lint:comments --working` | PASS exit 0 after mobile port |
| `pnpm harness:pillars:check` | PASS exit 0: 327 unique pillars |
| Capability / access / migration inventory checks | PASS exit 0: 267 routes, 195 tables / 356 functions, 434 migrations |
| `git diff --check` | PASS exit 0 |
| `pnpm ship:check` | Reports NOT READY / exit 1 for 44 uncommitted paths. All 10 machine gates passed, including harness assurance and script fixture suites. No Git publication was authorized. |
| `pnpm docker:version:ensure` in original checkout | FAIL exit 1: Docker Desktop not running; no current SQL runtime / generated-type / Edge proof claimed |

Raw logs remain in ignored `.scratch/`; this report preserves material results. Earlier successful SQL and Edge checks on the old source are not current-baseline proof.

## Live blockers

The HVAC job remains unassigned. The hosted `/recover-confirmation` route previously returned 404 because v284 does not contain this recovery feature. Deployment alone will not establish a successful match: the current active verified HVAC baseline is missing; the inspected worker profile stores plumbing capabilities rather than the required HVAC capabilities; its foreground reachability lease was expired and push reachability had not been proven. These checks must be resolved with real evidence, without bypassing price, capability, or delivery gates.

The old cleaning job was deleted under explicit user authorization in the earlier operation. Immutable harness audit rows remain under the existing append-only policy. No additional Production mutation occurred while preparing this package.

## Authenticated Preview after port

The original port 8085 now serves this recovery worktree. Ignored environment metadata was corrected and Metro rebuilt; the visible marker is `b802af8ec8ed`, branch label `detached+customer-recovery-uncommitted`. The existing real Customer authentication survived in the new Codex Preview tab.

The duplicate adjacent summary is absent. Both retry and stop controls are visible after scrolling; retry disables both controls while waiting, then restores them after a known failure. The retry produced device diagnostic `NSL-05BCF759`. Hosted request trace at `2026-10-09T06:52:24.192Z` proves POST `/kael/chat/39e0918e-805b-47e9-a2e0-936f1dadafef/recover-confirmation` returned HTTP 404 from v284. A subsequent read-only DB check found zero matching operations, zero broadcasts, and the HVAC job still `broadcasting`, with no worker and no quote mode. The live job was not cancelled to test the stop control.

Preview screenshot: `C:/Users/Phan Manh Tu/.codex/visualizations/2026/10/09/01a11e68-4ceb-70a0-8002-a9fff5c8c2f6/customer-matching-production-base-retry.jpg`. This is web interaction evidence only; native iOS/Android capture is absent.

Hosted read-only structure checks also verified all NOT NULL columns used by the recovery inserts: required values are present in the command, or the current schema supplies defaults. This does not prove triggers, concurrency, RLS actor behavior, or migration replay. No hosted verification fixture was executed.

## Review of uncommitted package

- Fixed point: `b802af8ec8edcfe7f7226c61e8118ad189cce22e`; review surface `git diff HEAD` plus the explicit untracked recovery files. No new commit exists.
- Spec source: the user-approved Customer Kael → job → Matching plan, recovery extension, and UI incident screenshots.
- Spec compliance: scoped client and Backend recovery paths are wired; live Matching is incomplete until DB/runtime and real worker delivery are proven.
- Rules/standards: customer ownership, role restriction, strict DTO, service-role-only atomic RPC, current policy/price checks, idempotent receipt binding, and unknown-outcome reconciliation are preserved. No direct client DB workflow write or provider call is introduced.
- Maintainability: recovery is a dedicated domain/service contract; existing public hydration signature is unchanged. Generated registries come from the current source instead of copying old output.
- Scope creep: no Worker redesign port, no price publication, no capability grant, no Git publication, and no deployment from the obsolete checkout.
- Required fixes/proof: replay SQL against current baseline and check generated types/Edge; deploy through the governed release lane, then verify retry/stop and a genuine invitation on authenticated Preview; retain native evidence as unverified until captured. Full mobile and shared gates are now green.

This is an ongoing implementation record, not a session-complete or Production-ready claim. Session-memory drafting remains pending user review under the repository memory contract.
