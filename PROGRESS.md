# NestScout / Kael Rebuild Progress

## Done

- Read `CODEX_REBUILD_PROMPT.md` first from the zip.
- Read required repo governance docs and selected protocols.
- Ran preflight and classified the task as Phase 0 UI/docs audit.
- Extracted the zip into `%TEMP%\nestscout-codex-handoff` for read-only image inspection.
- Inspected the 3 flow boards and the official system PNG pages.
- Inventoried current routes, owner surfaces, navigation behavior, assets, and core state/API boundaries.
- Created Phase 0 checkpoint artifacts:
  - `REBUILD_PLAN.md`
  - `design/ASSET_MAP.md`
  - `ASSETS_NEEDED.md`
  - `SCOREBOARD.md`
  - `PROGRESS.md`
- Recorded Tu's 2026-06-11 decisions:
  - Visible brand becomes NestScout.
  - Kael Orb opens Agentic Center.
  - All UI connects to real existing backend/system data and components.
  - No mock stats/prices/workers/queue/profile metrics.
  - Commit-per-screen checkpoints are approved after verification.
- Added runtime handoff tokens under `apps/mobile/design`.
- Repointed shared mobile color/theme seams toward the NestScout primary token `#0DAE9A`.
- Changed visible app config name and permission copy to NestScout while keeping identifiers unchanged.
- Wired the customer Kael Orb route to a real-data Agentic Center surface and kept full chat on `/(customer)/kael-chat`.
- Added focused RNTL coverage for Agentic Center empty, active-case, preference, notification, and chat-route behavior.
- Added the Phase 1 hidden `/(design-gallery)` route with action buttons, chips, inputs, media/voice controls, cards, aura, bottom navigation sample, and Kael Orb sample.
- Added reusable NestScout/Kael UI primitives in `apps/mobile/components/ui/kael-primitives.tsx`.
- Added `KaelMascot` typed state shell with all 20 official state names plus 10 emotion variant names; current rendering uses logged fallback assets until official exports exist.
- Switched auth role card images away from untracked `common-image-icons` to tracked client/worker icon assets.
- Started Group A:
  - Added the NestScout/Kael welcome screen before role selection.
  - Kept role-first auth behavior and real password/Google actions intact.
  - Kept phone/register unavailable states honest because the auth provider does not expose phone OTP or Supabase sign-up.
  - Added focused RNTL coverage for welcome, role-gate transition, and customer email fallback.
- Started Group B:
  - Added the required media/voice note slot to the booking describe step.
  - Kept photo picking wired to the existing image picker.
  - Kept voice honest: the booking form shows a voice capsule, but pressing it explains that voice is handled in Kael chat when supported instead of recording fake audio.
  - Added focused RNTL coverage that the booking handoff includes the voice capsule.
- Continued Group C:
  - Added a real-data customer case command overview to Activity.
  - Kept worker address privacy gated by workflow state.
  - Kept ETA honest by waiting for live travel signal instead of deriving fake arrival copy from timers.
  - Added focused RNTL coverage for private address, released address, and no placeholder markers.
- Continued Group D:
  - Added worker safety/checklist gates to active jobs.
  - Kept scope and completion actions tied to existing workflow/evidence state.
  - Kept worker pricing input out of the checklist path.
  - Added focused RNTL coverage for address gate, scope gate, completion evidence, and no fake placeholder values.
  - Added Worker Earnings reconciliation strip from `EarningsResponse` paid jobs, pending payout, and platform fee fields.
  - Added submitted job summary/report card from real completion notes, completion media, status, and Kael price gate.
  - Added Worker Kael on-site advisory rail inside accepted JobRoom details for status, address release, scope/price gate, and evidence gate.
- Continued Group E:
  - Added Agentic Center real summary cells for active case, approvals, and memory.
  - Summary values come from live workflow/preference state, with text empty states instead of fake zeroes.
  - Added focused RNTL coverage for empty and active summary values.
- Continued Group F:
  - Fixed worker locked milestone copy so it no longer renders placeholder question marks.
  - Added customer usage ranking and money protection insight panels from real metadata only.
  - Kept missing profile metrics as honest waiting states.
  - Added focused RNTL coverage for worker locked milestones and customer profile metrics.
- Continued Group B:
  - Completed the Customer Home shortcut grid with all four real actions.
  - Added active request status and Kael estimate cells to the Customer Home active-card path.
  - Kept Home free of fake counters, unsupported service categories, and mock queue/rating data.
- Verification for this checkpoint:
  - `pnpm --filter @home-services/mobile type-check` passed.
  - `tsc --noEmit` from `apps/mobile` passed when portable `pnpm.CMD` was unavailable.
  - `jest --runInBand components/auth/__tests__/auth-surfaces-test.tsx` passed: 3 tests.
  - `jest --runInBand components/customer/__tests__/booking-wizard-test.tsx components/ui/__tests__/kael-primitives-test.tsx` passed: 9 tests.
  - `jest --runInBand components/ui/__tests__/kael-primitives-test.tsx` passed: 4 tests.
  - `jest --runInBand components/customer/__tests__/customer-home-surface-test.tsx` passed: 5 tests.
  - `jest --runInBand components/customer/__tests__/customer-profile-surface-test.tsx` passed: 17 tests.
  - `jest --runInBand components/customer/__tests__/customer-history-surface-test.tsx` passed: 16 tests.
  - `jest --runInBand components/worker/__tests__/worker-home-surface-test.tsx` passed: 47 tests.
  - `jest --runInBand components/customer/__tests__/agentic-center-surface-test.tsx` passed: 3 tests.
  - Mobile Jest from `apps/mobile` passed: 17 suites, 148 tests. Existing `act(...)` warning remains in `components/customer/kael-chat/thread.tsx`.
  - `pnpm doctor:react:changed` reported 1 maintainability warning for the large auth surface and no blocking bug issues; score API was unreachable.
  - `git diff --check` passed.

## Current Status

Phase 1 foundation, design gallery, Kael mascot shell, Agentic Center wiring/summary, Group A welcome, Group B Customer Home plus booking media/voice, Group C activity case overview, Group D worker safety/earnings/summary-report/on-site advisory, and Group F profile honesty checkpoints are implemented. Focused type-check, auth tests, booking tests, primitive tests, customer home/profile/history tests, worker tests, Agentic Center tests, React Doctor, and the latest full mobile Jest gate pass.

## Next

1. Re-run broad mobile Jest/type-check after the latest Customer Home and Worker batches.
2. Continue Customer Kael live chat and Booking search/filter audit if broad gates stay green.
3. Keep committing only verified checkpoint files, leaving prototype trash unstaged.

## Open Risks

- Pre-existing dirty worktree includes auth/prototype/asset changes. Do not overwrite them.
- Portable `pnpm.CMD` disappeared from the temp Node folder during this session; use direct `apps/mobile/node_modules/.bin` commands until it is restored.
- Official mascot state assets are missing; use existing Kael model assets unless the zip or repo provides better final exports.
- No local native recording was found in the repo during Phase 0.
- Maestro/Detox visual regression is not set up, so native UI validation must be manual/device-based plus RNTL/static gates.
