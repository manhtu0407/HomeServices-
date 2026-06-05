# Kael Section 32 G1/G3 Continuation Evidence

Date: 2026-06-05
Scope: Plan.md section 32 from `origin/main:Plan.md` (PR #60 / Plan.md section 32). Current local `Plan.md` does not contain section 32, so `origin/main:Plan.md` is the canonical plan source for this continuation.
Status: G1 staging proof is closed for the follow-up worker chat risk. G3 Android/Expo Go evidence is stronger but still not a full Section 32 visible-done sign-off. Production/TestFlight is not claimed.

## Plan Gates Checked

- G1 real path proof: real staging DB/Edge row/cost/log proof, no mock.
- G2 closure proof: downstream consumption is covered by API/mobile tests for progress, SSE/parser, worker chat state, job-scoped idempotency, and visible surfaces.
- G3 visible done: real native app evidence required for frontend phases, including light/dark and accessibility-mode coverage.
- G4 honesty/security: no fake stage/provider copy/PII leakage in evidence paths.
- G5 money-state: worker Kael remains advisory-only; no price/scope/status mutation path from LLM/UI.

## G1 Staging Proof

Staging ref: `xyylanuyflrjzbjzhqfl`
Production ref observed locally: `iwevizmsedyqozxlawwl`

Durable report:

- `docs/test-logs/2026-06-05_kael-section32-staging-smoke.md`

Result:

- Status: `passed`
- Run id: `section32-1780646006616-ad2c78`
- Date: `2026-06-05T07:53:43.708Z`
- Checks passed:
  - `worker_chat_job_scoped_idempotency`
  - `worker_chat_turn_job_id`
  - `worker_chat_ai_model_column`
  - `worker_chat_sse_result`
  - `worker_chat_job_scoped_session_rows`
- Worker stream duration: `1305ms`
- SSE event types: `stage, stage, result`
- Answer turn safe metadata:
  - provider: `deepseek`
  - model: `deepseek-v4-flash`
  - cost: `0.000135`
  - fallback: `false`
  - provider attempts: `primary:deepseek:success:ok:timeout=5000:latency=217`
- Cleanup: `ok=true`, `residue_total=0`

G1 conclusion: closed for the specific reopened follow-up risks: job-scoped worker chat idempotency, worker turn `job_id`, `ai_model` persistence, SSE result, and cleanup.

## G3 Android / Expo Go Evidence

Device/runtime evidence was captured on Android emulator + Expo Go against staging config, not TestFlight.

Existing native recording artifacts:

- `tmp/section32-native-recordings/section32-native-20260605-153914/section32-native-20260605-153914.mp4` (exists)
- `tmp/section32-native-recordings/section32-native-20260605-153914/section32-native-20260605-153914-final.png` (exists)
- `tmp/section32-native-recordings/section32-native-20260605-155010/section32-native-20260605-155010.mp4` (exists)
- `tmp/section32-native-recordings/section32-native-20260605-155010/section32-native-20260605-155010-final.png` (exists)
- `tmp/section32-native-recordings/section32-native-20260605-155507/section32-native-report.md` exists, but the report's listed video/final screenshot files do not exist in the directory. Do not count that report as video proof.
- `tmp/section32-native-recordings/section32-worker-proof-20260605-162000/section32-worker-proof-20260605-162000.mp4` (exists, 23825298 bytes)
- `tmp/section32-native-recordings/section32-worker-proof-20260605-162000/section32-worker-proof-20260605-162000-final.png` (exists)

Screenshot/UI dump evidence inspected:

- `tmp/section32-g3-customer-sent-26s.png`
  - Authenticated customer Kael chat visible.
  - User bubble present.
  - Kael follow-up card visible: asks for HCMC district and names missing slot `address_district`.
  - Ticket summary is honest: price/platform fee only appear when real estimate exists.
- `tmp/section32-worker-home.png`
  - Authenticated worker home visible.
  - Worker service skills visible.
  - Staging fixture area `Section32 Gmail Native Tower, Binh ...` visible.
- `tmp/section32-worker-kael-sent-26s.png`
  - Authenticated worker accepted-job Kael surface visible.
  - Accepted mode visible.
  - Job summary visible for plumbing job.
  - App-only access guidance visible: access after lobby check-in/identity confirmation.
  - No worker price/scope/status mutation composer control is visible.
- `tmp/section32-native-recordings/section32-worker-proof-20260605-162000/section32-worker-proof-20260605-162000-final.png`
  - Same worker accepted-job state remains visible at recording end.

Additional accessibility-mode screenshots:

- `tmp/section32-worker-light.png`
- `tmp/section32-worker-dark.png`
- `tmp/section32-worker-reduced-motion.png`

G3 coverage achieved:

- Android + Expo Go native proof exists for authenticated customer and worker surfaces.
- Customer Kael follow-up/ticket summary rendered with honest copy.
- Worker accepted job/Kael summary/app-only access state rendered.
- Worker recording exists as MP4 and final screenshot.
- Light/dark/reduced-motion screenshot attempts exist for worker surface.

G3 limitations:

- iOS/TestFlight was not tested on this Windows host.
- Android dark-mode screenshot did not visibly switch the app frame during review.
- Reduce Transparency was not toggled at device level; Android emulator did not expose a reliable OS switch in this run. Code/test coverage exists via `GlassPressable` fallback, but that is not device proof.
- Worker free-form advisory send did not produce a clearly visible final answer bubble in the captured frame; staging Edge SSE proof covers the backend result.
- Customer native evidence is screenshot-based plus earlier harness recordings, but no reviewed customer video proves the full stage/token sequence end to end.
- Scope-change progress, anti-disintermediation live solicitation guard, and apartment check-in progression were not fully exercised as native user flows in this continuation.

## Verification Commands

Passed:

- `apps/api`: bundled Node Vitest targeted Section 32 worker/staging harness tests:
  - Command: `node vitest.mjs run src/__tests__/unit/mobile-api-worker-kael-chat.test.ts src/__tests__/schema/kael-section32-staging-harness.test.ts --exclude "**/.claude/**" --no-cache --reporter=dot`
  - Result: `2 passed`, `21 passed`.
- Root: `node --check apps/api/scripts/kael-section32-staging-smoke.mjs`
  - Result: exit `0`.
- Root: PowerShell parser check for `scripts/section32-android-native-recording.ps1`
  - Result: `psparser-ok`.
- Mobile type-check:
  - Command: `pnpm --filter @home-services/mobile type-check`
  - Result: `tsc --noEmit`, exit `0`.
- Mobile full Jest:
  - Command: `pnpm exec jest --runInBand --forceExit --testTimeout=30000` from `apps/mobile`
  - Result: `14 passed`, `138 passed`, no console warning in the final rerun.
- Targeted mobile worker suite:
  - Command: `pnpm exec jest components/worker/__tests__/worker-home-surface-test.tsx --runInBand --forceExit --testTimeout=30000 --verbose`
  - Result: `43 passed`.
- Targeted customer Kael suite:
  - Command: `pnpm exec jest components/customer/kael-chat/__tests__/agentic-parts-test.tsx --runInBand --forceExit --testTimeout=30000`
  - Result: `26 passed`.

Fixes made during this continuation:

- Removed fake-timer contamination from worker greeting tests by using `Date.now()` spying instead of Jest fake timers.
- Converted the customer progressive reveal test to async `act(...)` to keep interval-driven updates inside React Testing Library's act boundary.

## Production / TestFlight Status

Not complete.

Current local env and Supabase link point at production ref `iwevizmsedyqozxlawwl`, while staging proof used `xyylanuyflrjzbjzhqfl`. The current worktree also contains unrelated active-session diffs outside this continuation. Deploying `mobile-api` or publishing a production/TestFlight build from this dirty worktree would risk shipping unrelated changes.

Therefore this report does not claim:

- production deployment,
- production DB apply,
- TestFlight evidence,
- full production-native authenticated journey,
- full Section 32 G3 visible-done closure.

Next safe production path:

1. Create a clean deploy worktree from the intended base.
2. Apply only reviewed Section 32 changes.
3. Run the same API/mobile gates there.
4. Deploy/promote only from that clean tree.
5. Capture Expo Go or TestFlight evidence against the intended production backend without pulling unrelated active-session diffs.
