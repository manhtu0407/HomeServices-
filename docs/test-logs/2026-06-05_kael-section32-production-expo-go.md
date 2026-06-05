# Kael Section 32 Production Expo Go Evidence

Date: 2026-06-05
Status: passed for Section 32 production proof with documented native-mode caveats
Target ref: `iwevizmsedyqozxlawwl`
Runtime: Android emulator `section32_api36` + Expo Go, production `mobile-api`
Run id: `section32-expo-prod-1780658927563-bc161fe6`

## Gate Mapping

- G1 real path proof: production backend smoke passed separately in `2026-06-05_kael-section32-production-smoke.md`, with real Supabase rows, provider, model, cost, SSE result, job-scoped idempotency, and cleanup residue 0.
- G2 closure proof: production Expo Go customer and worker surfaces consumed a real production fixture job after production Edge deploy. Customer activity, customer Kael dock, worker queue, worker in-progress job, and worker job-room surfaces rendered the same production job.
- G3 visible done: production Expo Go evidence exists for the customer and worker flows. Light-mode videos and screenshots were captured. Android night-mode and reduced-motion captures were also attempted and documented below.
- G4 honesty/security: visible copy stayed in Vietnamese, services stayed within plumbing/electrical/cleaning, no fake price/rating/queue/earnings was introduced, and no password or secret is stored in this report.
- G5 money-state: the native proof did not expose or execute any price, scope, status, or money mutation from Kael. Backend worker Kael proof persisted only advisory answer/cost metadata.

## Production Fixture

- Job id: `8e250f39-69e1-4767-be43-006d218ce1a2`
- Worker id: `f78156b9-0ef0-438f-9834-0bdbae2d3d21`
- Customer id: `d95b0790-e3fa-40eb-b8b9-d5afd6b9bb29`
- Status during native proof: `worker_matched`
- Service: `plumbing`
- Address surface: `Vinhomes Central Park`, `A-1205`, `binh_thanh`

The production login credentials were stored only in gitignored `apps/mobile/.env.local` keys for the native run. Values are intentionally omitted here.

## Native Evidence

Artifacts live under `tmp/section32-production-expo-go/`.

- `section32-customer-prod-clean.mp4` (4345713 bytes): production customer login/home/activity/Kael-dock run.
- `section32-worker-prod-clean.mp4` (21607011 bytes): production worker login/home/queue/in-progress/job-room run.
- `13-customer-home.png`: production customer home with real apartment profile and supported services.
- `14-customer-request.png`: production customer activity screen showing the accepted plumbing job, honest status, and no fake price.
- `17-customer-kael-dock.png`: production customer Kael dock with disabled empty composer.
- `27-worker-login-result.png`: production worker home after login with approved/available worker state during the run.
- `28-worker-jobs-tab.png`: production worker waiting tab with honest empty state.
- `29-worker-inprogress-tab.png`: production worker in-progress tab with the fixture plumbing job.
- `30-worker-job-room.png`: production worker job room and Kael surface with consent/learning control and disabled empty composer.
- `window-customer-activity.xml`, `window-customer-kael-dock.xml`, `window-worker-login-result.xml`, and `window-worker-job-room.xml`: UIAutomator dumps for the key customer/worker states.

## Native Modes

- Light mode: covered by both production videos and screenshots listed above.
- Android night mode: `34-production-dark-relaunch2.png` and `window-production-dark-relaunch2.xml` were captured after Android night-mode relaunch. The app remained visually in its light glass palette, but the rendered production worker surface stayed readable.
- Reduced motion: `32-worker-job-room-reduced-motion.png` was captured after Android animation scales were set to 0. The emulator animation scales were restored to 1 after the capture.
- Reduce transparency: Android Expo Go did not expose a reliable OS-level Reduce Transparency switch in this run. Existing app logic/tests cover the fallback, but this report does not claim independent Android OS proof for that setting.

## Production Cleanup

The fixture job was removed after the Expo Go run while keeping the real reusable auth accounts intact.

Post-cleanup read-only production check:

```json
{
  "checked_at": "2026-06-05T12:17:56.572Z",
  "status": "passed",
  "job_id": "8e250f39-69e1-4767-be43-006d218ce1a2",
  "counts": [
    { "table": "jobs", "count": 0 },
    { "table": "jobs_by_run_id", "count": 0 },
    { "table": "kael_worker_chat_sessions", "count": 0 },
    { "table": "kael_worker_chat_turns", "count": 0 },
    { "table": "kael_chat_sessions", "count": 0 },
    { "table": "job_events", "count": 0 },
    { "table": "notifications", "count": 0 },
    { "table": "api_logs", "count": 0 }
  ],
  "residue_total_checked": 0
}
```

## Verification Commands

Production deploy/DB gates, from clean worktree `codex/section32-prod-proof-clean`:

- `pnpm install --frozen-lockfile`: passed.
- `pnpm --filter @home-services/api exec vitest run src/__tests__/unit/mobile-api-worker-kael-chat.test.ts --exclude "**/.claude/**" --no-cache --reporter=dot`: passed, 12 tests.
- `pnpm --filter @home-services/api type-check`: passed.
- `supabase db push --dry-run --yes --include-all`: showed only `20260605005000_scope_worker_kael_chat_idempotency_by_job.sql` pending for production.
- `supabase db push --yes --include-all`: applied production migration `20260605005000`.
- `supabase functions deploy mobile-api --project-ref iwevizmsedyqozxlawwl`: passed after the worker chat recovery fix.

Production proof gates:

- Production backend smoke: passed; see `2026-06-05_kael-section32-production-smoke.md`.
- Expo/Metro production bundle on port 8097: passed; Android bundle completed in 102924ms.
- Expo Go customer recording/screenshots: passed.
- Expo Go worker recording/screenshots: passed.
- Post-cleanup production residue check: passed, `residue_total_checked=0`.

## Limitations

- TestFlight was not used on this Windows host; Expo Go production evidence is the native proof for this gate.
- The native Expo Go proof opened Kael surfaces but did not send a real-account Kael message. Provider/model/cost/SSE proof comes from the production backend smoke with temporary users, then cleanup residue 0.
- Android night mode did not switch the app into a dark palette during the production relaunch capture. The captured surface stayed readable, but this is not claimed as a full native dark-theme proof.
- Android Expo Go did not provide an independent OS Reduce Transparency proof in this run.
