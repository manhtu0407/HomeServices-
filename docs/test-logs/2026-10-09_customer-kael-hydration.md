# Customer Kael hydration and matching evidence

Historical, privacy-redacted record for the October 2026 investigation. Exact account and case identifiers, project refs, locations, transaction amounts, timestamps, and host/process details are omitted. This document is not a current Production status report.

## Findings

- Two concurrent reads for the same job invalidated each other's selection generation. Both HTTP reads succeeded, but one caller received `false` and the Case surface displayed a load error. The approved source fix shares a read only while the job and account/session identity remain current, fences stale responses, and clears failed reads so explicit retry can recover.
- The Case hook could read before the provider activated its session. Deferring that read until provider activation and fencing cleanup fixed the mount-order race.
- The real matching run ended with `no_worker_found`. The only otherwise eligible test worker was excluded by an older job in `arrived`; six enabled services did not override active-work eligibility. The old test record was later removed with user authorization. This does not prove a new invitation or real-worker acceptance.
- The HVAC request had no durable matching or confirmation operation. A retry could not safely create a parent operation or invent an identifier. Recovery must validate the original customer-owned offer and current policy, preserve the same job, and leave invitations to the existing explicit retry/outbox path.
- A separate older electrical session lacked price evidence and remained before offer confirmation. It is an independent pricing gate and must not create a job or bypass customer confirmation.

## Regression coverage

- Provider and Case-hook tests cover same-job request coalescing, both response orders, account/role/token/job changes, mount order, failed-read retry, and stale response fencing.
- Edge matching tests exclude a worker with an `arrived` job and select an otherwise eligible free worker; the availability query must include `arrived`.
- The confirmation price-gate pillar asserts that missing price proof is refused by the atomic confirmation RPC before any job or broadcast write.
- Worker Jobs UI tests preserve the approved Booking Workart treatment and responsive card sizing.

## Verification recorded for this release work

| Check | Result |
|---|---|
| Docker contract fixture tests | 29/29 passed |
| Affected API pillars | 20/20 passed across 3 files |
| API TypeScript check | Passed |
| Worker Jobs targeted Jest suite | 24/24 passed; existing React `act(...)` warning remains |
| Mobile TypeScript check | Passed |
| Comment discipline, skill contracts, skill sync, work-plan and pillar registry | Passed |

The earlier full API suite on this worktree passed 1,860 tests with 2 skipped; the earlier full mobile suite passed 1,937 tests. The full suites were not rerun after the final documentation and Docker-contract-fixture edits.

`transaction-critical-coverage.mjs` currently reports 65 entries as `PARTIAL`. Its standalone run had no official API/mobile result JSON supplied, so it reported 0/315 bound assertions; this is not a test-runner result. Hosted SQL/Edge, Production behavior and native-device evidence remain separate gates.

## Preview and data boundary

The authenticated Customer Preview previously reloaded the affected case after the hydration fix and rendered its completed intake history and exhausted matching receipt without the false load-error banner. Preview evidence was Expo Web, not native iOS/Android. No live retry, stop command, new invitation or worker acceptance was claimed.

The user later authorized removal of the separate stale test record. Product-facing rows and dependent records were removed through a guarded Production transaction; append-only audit history was retained. No identifiers or transaction details are stored in this log. The cleanup did not deploy the recovery endpoint or establish successful matching for the separate HVAC request.

## Limitations

The local runtime did not provide a clean raw migration replay, default SQL denial-path proof, and generated database types together. A disposable normalized migration replay and isolated rollback run do not replace those missing checks. Production deployment, current Preview replay, live invitation, native UI and real-worker matching remain unverified until the release lane produces exact evidence.
