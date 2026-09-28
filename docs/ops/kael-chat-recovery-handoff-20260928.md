# Kael Chat Recovery Handoff — 2026-09-28

**Status:** CODE COMPLETE (PR #293) — end-to-end Kael reply on Production still unverified; see "Claude Code continuation" below.
**Goal:** 01a0df81-2cf4-74b1-a7bd-69df536e5585
**Branch:** codex/kael-chat-previews-20260927
**Checkout:** C:/Users/Phan Manh Tu/.codex/worktrees/kael-chat-previews/home-services
**Fixed point:** 5bb9df2a1bcc0f5cac4360197539b29a184162a3
**Purpose:** Resume the same Customer and Worker Kael recovery effort without rediscovering its implementation, evidence, or safety boundaries. This handoff is an operational note and should move to docs/archive when the active goal ships.

## Goal and acceptance

Restore ordinary Customer Kael Chat and Worker Kael Chat/Work communication, resolve the reported session-menu and rename defects, and make the separate Codex Previews reliable for visual review.

The goal is met only after:

- Customer normal chat and Worker chat can each complete the intended request/response path.
- Customer image analysis in normal chat remains distinct from Worker job-intake handling.
- Session creation, pinning, renaming, and archiving work for their respective roles.
- The separate Customer and Worker Preview tabs run code from this branch and show no blocking UI/runtime errors.
- Relevant production errors have an evidence-based disposition. Background health is not treated as proof that either chat can respond.
- Required code review and applicable verification gates are reported truthfully.

## Guardrails and preserved state

- Use Supabase Production only for backend inspection. The approved implementation scope does not authorize sending messages, uploading images, creating test sessions, or writing test records to Production.
- Do not use Staging, do not close Claude, and do not commit, push, open a PR, or deploy from this broadly dirty checkout.
- Keep Customer and Worker Previews in separate Codex In-app Browser tabs:
  - Customer tab 2: http://localhost:8087/kael-chat?mode=normal&ns_audit_role=customer
  - Worker tab 3: http://localhost:8084/chat?ns_worker_screen=3.1-kael-chat-normal&ns_audit_role=worker
- Both Preview servers resolve Expo from this checkout. The UI marker reports HEAD and branch; it does not fingerprint the uncommitted working-tree diff.
- The Customer composer contains the user's unsent draft “Hi”. Do not send, replace, or clear it.
- Worker Preview is currently in its empty-chat state; temporary local audit sessions were archived after the session-menu checks.
- The query parameter ns_audit_role is local audit routing, not proof of a Production-authenticated user.

## Work completed in the current working tree

All implementation changes below remain uncommitted. Preserve them; the checkout currently has a broad change set of about 90 paths.

- Customer composer and chat surfaces received the requested visual adjustments, image draft preview, and normal-chat image path. Work-intake and normal chat remain separate modes.
- Customer conversation flow changes cover session startup, idempotent sends, media references, streaming, cancellation, and user-visible failure handling.
- Worker chat surfaces received the matching visual direction, Worker-specific language behavior, send/stop handling, session-menu layout, and media-reference flow.
- Shared stream and failure utilities, Customer contracts, Edge conversation handling, vision/media validation, provider cancellation, and the image-reference migration/test artifact are part of the working tree.
- Customer and Worker audit routes now keep session-menu verification local rather than making Production session writes. Production-backed paths remain in place outside local audit mode.
- A Worker session-menu test now reads the active session after React has rendered, then checks the session list. This fixed the timing error in that regression test; it does not certify live chat.

Useful code owners include:
- Customer: apps/mobile/components/customer/kael-chat/use-customer-kael-conversations.ts, use-customer-kael-message-actions.ts, customer-kael-normal-turn-send.ts, kael-chat-composer.tsx, media-draft-preview-tray.tsx, and customer-kael-session-menu.tsx.
- Worker: apps/mobile/components/worker/chat/use-kael-orb-chat.ts, kael-orb-send-action.ts, session-menu.tsx, and worker-kael-session-list.tsx.
- Stream/backend: apps/mobile/lib/kael-stream.ts, apps/mobile/lib/kael-conversation-failure.ts, packages/shared/src/contracts/kael-chat.ts, supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-turn.ts, and supabase/functions/mobile-api/_shared/kael/kael-providers/provider-cancellation.ts.

## Verification already recorded

The following results were recorded on this branch before this documentation-only edit:

- Focused Customer/Worker regression run: 2 suites, 82 tests passed.
- pnpm type-check:mobile: passed.
- pnpm test:mobile: 209 suites, 2,062 tests passed. Unrelated React act() console warnings appeared; the run had no failing tests.
- pnpm doctor:react:changed: passed, 26 files scanned, 0 findings.
- pnpm lint:comments --working: passed, clean. Git emitted line-ending conversion warnings.
- pnpm type-check:api, pnpm test:api, and pnpm build: passed in the previous verification pass.
- Full pnpm lint:mobile was previously red from existing broad lint debt; scoped ESLint on changed mobile files reported 0 errors and 3 warnings.
- ship:check was not ready: the checkout had about 90 changed paths and local Deno/Supabase CLI gates had not run.
- No native device/simulator capture was produced. Browser Preview does not verify native Liquid Glass, Reduce Motion, or native accessibility behavior.

## Preview evidence

- Both retained tabs rendered the expected Customer and Worker routes.
- Customer showed marker: SHA 5bb9df2a1bcc, branch codex/kael-chat-previews-20260927, and retained the unsent draft.
- Worker showed its ordinary chat screen, the English mascot line “You've got this!”, and Vietnamese surrounding UI. Its send control was disabled while no conversation existed.
- In Worker local audit mode, session create, pin, rename, and archive were exercised. The rename dialog fit in the Preview. The temporary audit sessions were archived afterward, leaving the empty state.
- No Customer or Worker message was sent during the Production-backed Preview session. End-to-end response remains unverified.

## Production read-only evidence

- Supabase project iwevizmsedyqozxlawwl (HomeServices) reported ACTIVE_HEALTHY. Deployed mobile-api was v275 and kael-matching-maintainer was v65.
- The deployed Customer conversation handler already accepted and serialized media_refs. Migration 20260927182024_customer_kael_conversation_image_refs was reported applied.
- A bounded read-only audit found two historical kael-matching-maintainer v65 errors:
  - 2026-09-28 00:38:10.739Z (07:38:10.739 Vietnam): function error reconcile_failed; a nearby 502 occurred on claim_confirmation_matching_outbox_batch.
  - 2026-09-28 00:39:06.177Z (07:39:06.177 Vietnam): function error reconcile_failed; a nearby 504 occurred on reconcile_expired_matching_leases. The request timing aligns closely.
  - A 504 on job_matching_preferences also occurred in the same interval; deployed code catches that fallback-read failure, so it is less likely to explain the returned 500 by itself. The outer function catch does not identify the failing operation for the first incident, so exact attribution there remains uncertain.
- From 00:39:07Z through 03:32:45Z, the audit found no function_logs level=error entries. The three implicated PostgREST endpoints returned status 200 173 times each, and the matching-maintainer continued completing. This supports a recovered transient background incident during that window.
- Successful maintenance summaries reported zero queued work. They do not prove that Customer or Worker messages reached Kael or received a response.
- The audit was read-only; no Production table records, chat sessions, messages, media, or deployments were changed.

## Remaining work and order

1. Continue from the matching-maintainer result: treat the historical background incident as recovered in the checked window, but keep Customer/Worker chat response explicitly UNVERIFIED.
2. Trace the exact Customer normal-chat and Worker Chat/Work send paths against current code, tests, and read-only Production telemetry. Identify the original user-visible failure signal before changing implementation.
3. Add or adjust the narrowest regression test for each reproduced failure, then apply a small fix and rerun that exact Preview interaction in local audit or another safe local harness.
4. Re-check Customer and Worker independently on their retained tabs. Preserve the Customer “Hi” draft. Do not click Send or upload files on a Preview that may route writes to Production.
5. Recheck session actions and image paths without creating Production test data. Be explicit about which steps are local audit, mocks, static gates, or live Production read-only observations.
6. Run kael-review against the exact uncommitted diff, then rerun the applicable gates. Do not call the branch ready while ship:check, required backend gates, or code review remain open.
7. If the only missing proof is a real authenticated Production chat send, record the precise limitation and do not manufacture records under this approved scope.

## Delegation and next protocols

- Completed this continuation: a bounded read-only Production log/source audit. No code was edited by the auditor. Its evidence is recorded above; the root agent owns integration and the next implementation/review loop.
- Next: kael-diagnose and kael-tdd for any reproduced send failure; kael-frontend-test for direct Preview UI checks; kael-backend-structure, kael-backend-parity, kael-supabase, and kael-security-sweep for any further backend/auth/migration changes; kael-review before completion.
- Handoff workflow: preserve branch/worktree identity, inspect diff before editing, reproduce one failure at a time, keep roles in independent Preview tabs, protect Production from test writes, and update this note with only observed results.

## Claude Code continuation — observed results

- **Root cause:** every Preview write to Production returned 426 from `enforceStage1ClientCompatibility` (web has no released client identity). The gate stays. Preview audit mode cannot show a Kael reply.
- **Fixed with tests (red → green → mutation):** P248 web presence writes, P249/P250 web chat guard, P251 Worker mode pill, P205 composer height, Customer delete confirm width, plus Codex's three red gates (structure ratchet, pillar index, P76 copy).
- **Backend proof:** P252 (Customer and Worker chat turn over the real handler, 426 for web) and P253 (session create/pin/rename/archive, foreign sessions refused).
- **Verification on the merged head:** mobile 215 suites / 2114 tests, api 1518 (+2 skipped), shared 129, type-check ×3, `deno check` 6/6, structure/comments/pillars/access/migrations/manifest, `ship:check` 10/10.

### Monitoring log (Production, read-only)

| Time (UTC) | Result |
|---|---|
| 2026-09-28 04:40 (T1) | Clean since the fix window: no 5xx, no runtime errors, `mobile-api` v275 |
| 2026-09-28 08:35 | Clean. Noise only: `GET /me/jobs/history` 401 from web audit Preview (History screen has no audit guard), `admin/discipline/*` 404 for routes absent from the repo. `kael-matching-maintainer` 316/316 OK since 00:40 |

### Still open
- Real Kael reply on Production needs a released iOS/Android build.
- `mobile-api` is still v275 (hand deploy, release id `harness-645c907…`); redeploy through the release pipeline.
- P246/P221 unproven on Production until real traffic; SQL P247 not run here.
- 10 uncollected Case Work tests are red on `main` as well; separate task.
