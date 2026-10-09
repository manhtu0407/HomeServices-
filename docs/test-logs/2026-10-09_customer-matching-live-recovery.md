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

## Publication and CI follow-up

Tu authorized scoped commit/push, a draft PR and CI, with the prior no-merge boundary retained. Commit `542fd039` contains the recovery package. Merge commit `326223ba` integrates current main `fe1326a3` without conflicts. PR #344 was created as a draft, attached to this task, confirmed non-conflicting, then marked ready once. The committed-tree `ship:check` reports all ten gates passed.

CI run `37898511980` passed repository controls, empty-state migration replay, all 131 SQL files (including recovery), database type generation and the collected integration test. The database job failed on generated-type drift and one schema-lint warning: `private.validate_legacy_kael_offer` assigned an unread UUID variable. The actual generated artifact was imported through `split-database-types.mjs`; only the new recovery RPC was added. The lint repair retains the UUID cast through `perform`. Shared type-check and exact generated-type comparison passed locally after this repair; the SQL/lint rerun remains pending.

Read-only hosted reconciliation found 248 statically resolved Edge RPC names, zero unscannable call sites and exactly one absent function, the undeployed recovery RPC. This is a pending release dependency, not deployed Edge/DB drift. The HVAC job still has zero broadcasts and no worker assignment. The inspected real worker has no active job, but its approved profile stores four plumbing specializations, no HVAC diagnosis capability and no current reachability proof. The other available profile belongs to a synthetic cohort and cannot match this real job. There is only one approved non-synthetic profile.

The active `water_leak` price-knowledge row has the original 225,000–375,000 aggregate and a two-source quorum marker, but its stored evidence has one URL to a removal/relocation price page (`https://1fix.vn/di-doi-may-lanh-tai-nha`) and one source without a URL. Direct inspection confirms the linked page concerns removal/relocation. That row is not sufficient proof to publish a verified repair baseline. No price publication, capability grant, new invitation, merge or Production deployment was performed in this follow-up.

## Approved release and live Preview checkpoint

After Tu approved the next merge/release step, PR #344 merged at `a52bc925ae71bd40f00fd2f4fffdfc7f991ed6aa`. Final PR CI `37900557552` passed. Production verification release `37902575213` completed successfully: quality/security/integration/SQL gates, configuration checks, three consecutive synthetic smokes, immutable source proof and atomic promotion. Hosted `mobile-api` is version 286 and `kael-matching-maintainer` is version 75. These synthetic results do not establish a real match for #MOH-260157.

The authenticated Customer Preview was restarted from the merged source; its rendered marker identifies `a52bc925ae71`. Following promotion, Codex reloaded the original Case and clicked **Tìm lại thợ**. Production trace recorded POST to the existing session's `recover-confirmation` at `2026-10-09T08:47:43.390Z`, HTTP **426**, version **286**, request ID `01a11fd8-c715-76ad-be8b-c9d32485dc30`. The UI displayed the update-required message with diagnostic `NSL-297EC590`. The compatibility guard accepts released iOS/Android clients and rejects this web Preview before recovery or matching executes; it was not bypassed or weakened.

The real job remains `broadcasting`, `worker_id = null`, with zero broadcasts and zero candidates. Real Matching remains **BLOCKED**, not verified successful. Continuing requires a valid native client and resolution of the previously recorded price/capability/reachability prerequisites. No capability, price, invitation or acceptance was fabricated. Native evidence and a true worker assignment remain unavailable; session-memory writing still awaits the required reviewed draft.

## Six-service registration and exact account investigation

Reviewed uncommitted changes against `a52bc925ae71bd40f00fd2f4fffdfc7f991ed6aa` on `codex/customer-matching-recovery`. The user clarified this is their account used to test the product, so physical trade qualifications are not inferred from account approval or service preferences.

The live Worker row is approved and available. It has six selected services, three original registration services and four plumbing capability keys. The HVAC job snapshot requires five HVAC capability keys. There is no proven push generation or unexpired foreground lease at the time of the query. The legacy job still has `quote_mode = null`; its legacy candidate path relaxes capability/reachability requirements, so these findings alone do **not** explain the current request failing before broadcast.

A controlled call to `recover_legacy_kael_confirmation_atomic` inside a transaction that was fully rolled back returned `KAEL_PRICE_EVIDENCE_REQUIRED`. No Production recovery result, price evidence, capability, invitation or acceptance was persisted by this probe. This is the first gate preventing this job from reaching governed Matching. Publishing replacement price evidence or changing the confirmed offer has not been performed.

Initial registration previously accepted arbitrary free-text skills and capped the array at 20, while the six service performance profiles contain 25 distinct capability keys. Mobile now offers explicit localized capability selections using the same canonical keys as Matching. Selecting services does not automatically declare skills. Shared and Edge DTOs and a new additive SQL migration accept up to 25 keys; 26 remains rejected. The existing registration command, ownership checks, review locks, idempotency and service-role-only RPC grants are preserved. Service preference UI now labels selection honestly instead of presenting every selected service as currently receiving jobs. Approved-profile capability amendment is still missing; this patch does not retroactively update the user's approved profile.

Evidence and actual commands:

- API regression was red before the limit fix; the expanded regression passes 10/10 with catalog-to-Matching key parity.
- `pnpm test:api`: exit 0, 139 suites passed and one skipped; 1,820 tests passed and one skipped. Node contracts: 111 passed and one skipped.
- `pnpm test:mobile -- --silent`: initial full run exit 0, 264 suites and 2,454 tests passed. After the service preference copy change, the affected Worker surface suite passed 141/141; the final full rerun exited 0 with 264 suites and 2,456 tests passed (244.391 seconds).
- `pnpm type-check:mobile`, `pnpm type-check:shared`, `pnpm type-check:api`: exit 0. API type-check initially caught an invalid test diagnostic argument and passed after correction.
- `pnpm db:local:test --filter worker_six_service_capabilities_verification.sql`: exit 0, executed 1, passed 1. This real Postgres regression covers all 25 keys, saved services, idempotent replay without write, rejection of 26, owner denial and RPC grants.
- The broad registration SQL file is **not green** on this local backup: after the initial 25-key rejection was fixed, it reaches an unrelated missing `worker_identity_numbers` table. Full local migration replay is blocked by unknown backup history `20260822150502`. No history repair/reset was performed.
- `pnpm lint:comments --working`, `pnpm harness:pillars:check`, `pnpm harness:migrations:check`: exit 0; 328 unique pillars and 435 migration files validated.
- `pnpm doctor:react:changed`: exit 0, scanned 23 files, zero issues, score unavailable.
- `node scripts/check-edge-db-contract.mjs --emit-sql`, actual Production query, then `--functions .scratch/edge-rpc-present.json`: exit 0, all 248 resolvable RPC names exist, zero unresolved call sites. This checks names, not all signatures.
- Production health snapshot reports registered release `harness-a52bc925ae71-c38fb36ecae5`, source `a52bc925ae71bd40f00fd2f4fffdfc7f991ed6aa`, and 427 applied migration versions. Full deployment-drift comparison has not been claimed green; the new registration migration is local only.

EAS inventory shows finished iOS build 54 from `b02dc15400193cc65edc38630a4b0b3901fcc69c`, before the recovery change merged in PR #344. This is the newest inspected inventory item, not proof of the user's installed build. The device support trace `36E82ADA` is a successful GET returning a null Matching operation; separate web recovery writes receive 426. These are different failure paths.

Review: the initial-registration slice addresses canonical capability declaration and its 25-key limit. It does not yet satisfy the requested real-account matching outcome. No new commit, push, PR, deployment, Production data write or native-device success is claimed for this uncommitted patch. Native visual evidence, approved-profile amendment, valid client write access, valid current price evidence and authenticated Worker acceptance remain required. This remains an ongoing implementation record; session-memory closeout is deferred until the task can actually close and the draft is approved.

## Continued investigation: price citation persistence

Live read-only checks reconfirmed zero active or quorum-verified baselines for this exact HVAC problem, district and complexity, and zero confirmation operations, broadcasts and candidates. Worker registration draft/command and service-area RPCs are service-role-only; the actual route capability registry marks these routes privileged, so HTTP dispatch correctly supplies the privileged client. No permission bug was established for these routes.

Found and reproduced a separate source-link bug in `live-price-knowledge.ts`: citation matching allowed a `www` hostname, but `publicSourceLink` rejected it against the root trusted domain. An unsafe first citation could also hide a later valid citation. The stored price knowledge for this job contains a null URL for its second source; its market-artifact join yields no row. The code reproduction does not prove which original citation produced that historic null value.

Regression was red before the change (1 failed, 12 passed, exit 1). The fix selects citations through the same safe-link validator used for persistence and cache reuse; root and exact `www` hosts are accepted, arbitrary subdomains, deceptive domains, HTTP and credentials remain rejected. No price amount, trust tier, quorum rule, confirmed offer, baseline row or old cache data was changed.

`pnpm test:api` after this fix: exit 0, 139 suites passed and one skipped, 1,825 tests passed and one skipped; Node contracts 111 passed and one skipped. `pnpm type-check:api`, `pnpm lint:comments --working` and `git diff --check` exited 0. Three focused price suites passed 26/26 before the additional unsafe-first-citation case was incorporated into the full passing run. No mobile code changed in this continued slice; the earlier mobile proof remains 264 suites / 2,456 tests. The Edge RPC-name scan still finds 248 calls and zero unresolved sites, and a fresh Production query confirms all 248 exist. This is name parity, not a full deployment-drift or Edge runtime verdict.

Review against HEAD `a52bc925ae71bd40f00fd2f4fffdfc7f991ed6aa`: this slice fixes link preservation and adds positive/negative regressions. It leaves server price authority and all matching gates unchanged; there is no client provider call or Production mutation. Native and authenticated Worker matching remain unverified. Both visible Preview tabs still show Customer context, including the tab at `127.0.0.1:8085/profile`; it is not Worker evidence. Session closeout remains pending while the matching task is incomplete.

`pnpm edge:check --only mobile-api` also exited 0 using the already-cached pinned Deno container: discovered 6, selected 1, checked 1, failed 0. This is an actual Edge type-check for the touched function, not a native or live matching result.

## General case-capability matching repair

The user clarified that this must fix the worker-matching model for future accounts, not patch the current test account. The active policy floor was being treated as a requirement: every issue in a service inherited every capability in that service profile, while Matching uses all required keys as an eligibility gate. For the HVAC water-leak case, that made unrelated HVAC cleaning, electrical, refrigerant, and height skills mandatory. The user-owned Worker profile has six selected service categories but only four plumbing capability keys; selecting a service category does not declare an HVAC skill.

The uncommitted change is scoped across all six services. A new migration maps every active service problem to the capabilities needed for that case, validates exact taxonomy coverage and service-level allow-lists, retires the 49 broad active policy versions, and publishes immutable case-specific versions while preserving price, evidence, intake, and safety gates. New Kael artifacts no longer copy the full service profile into `worker_requirements`. When a legacy job snapshot exactly matches the old full service capability set, Matching resolves its active case policy during retry; a lookup failure keeps the restrictive old requirements. Shared and Edge registration contracts now accept only canonical skills within selected services, and registration plus approved-worker service settings provide the same localized capability selector. The Worker record has not been changed.

Verification on the current source:

- `pnpm test:api`: exit 0; 139 test files passed, 2 skipped; 1,834 tests passed, 2 skipped. Node contracts: 111 passed, 1 skipped.
- `pnpm test:mobile`: exit 0; 265 suites and 2,457 tests passed before the final Shared/Edge relation validation. After that validation, the focused registration-draft and approved-worker skill-edit suites passed 19/19.
- Focused capability regressions: case-specific Matching 8/8; six-service registration contract 12/12.
- `pnpm type-check:api`, `pnpm type-check:mobile`, `pnpm type-check:shared`: exit 0.
- `pnpm edge:check`: exit 0; all 6 functions checked.
- Local SQL verification: service-intake governance 1/1 and Matching SQL 7/7 passed after applying the migration to the local database.
- `pnpm lint:comments --working`, `pnpm harness:pillars:check` (329 unique pillars), `pnpm harness:migrations:check` (436 migrations), and `git diff --check`: exit 0.
- `pnpm doctor:react:changed`: exit 0; 24 files scanned, 0 issues, score unavailable.
- `pnpm db:local:down`: exit 0; local Supabase containers stopped and local volume preserved.

Live acceptance is still open. The two current Codex Preview tabs are Customer sessions; the case still shows no matched worker. The Preview API is Production `mobile-api` v286, and the previous web recovery request was rejected with HTTP 426 before recovery or Matching ran. This local migration and Edge source have not been released, no Production rows or policies were changed, and no invitation or assignment was created. After release, the test account must declare `hvac_fault_diagnosis` through the Worker UI if that is a real skill; six selected service categories alone do not supply it. A genuine invitation/assignment in the authenticated Preview remains the completion criterion.

Review of the uncommitted diff against `a52bc925ae71bd40f00fd2f4fffdfc7f991ed6aa`: the fix narrows case requirements while keeping unknown capability keys rejected, preserves compatibility for old snapshots without weakening eligibility, and does not alter the Worker record or fabricate evidence. No commit, push, PR, merge, Production migration, or Edge deployment was performed. Production release approval and a Worker-authenticated Preview session remain the live blockers.
