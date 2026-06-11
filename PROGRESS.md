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
- Verification for this checkpoint:
  - `pnpm --filter @home-services/mobile type-check` passed.
  - Mobile Jest from `apps/mobile` passed: 15 suites, 141 tests.
  - `pnpm doctor:react:changed` reported 0 mobile issues; score API was unreachable.
  - `git diff --check` passed.

## Current Status

Phase 1 foundation and Agentic Center wiring are implemented. Focused type-check and Agentic Center test passed. Full mobile test gate is next.

## Next

1. Create the first verified checkpoint commit without staging pre-existing prototype work.
2. Continue into Group A auth/welcome rebuild using the same token foundation.

## Open Risks

- Pre-existing dirty worktree includes auth/prototype/asset changes. Do not overwrite them.
- Official mascot state assets are missing; use existing Kael model assets unless the zip or repo provides better final exports.
- No local native recording was found in the repo during Phase 0.
- Maestro/Detox visual regression is not set up, so native UI validation must be manual/device-based plus RNTL/static gates.
