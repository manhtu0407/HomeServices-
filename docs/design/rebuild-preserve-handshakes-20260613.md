# Rebuild Must-Preserve Contract — Critical Handshakes (2026-06-13)

> Purpose: the NestScout UI rebuild (Codex, UI-only, preserve logic/nav) must NOT
> drop three transaction-critical surfaces that already exist in code/backend but
> are absent from the design board. These are **regression risks**, not new
> features. Source: MAP PLAN Phase 4 (Notes.md) + cross-side handshake audit.
> `design.md` is locked; this doc is the rebuild guide, not a design-system edit.

Scope rule for all three: render from server truth, never fabricate, never infer
a money/privacy transition on the client.

---

## X-1 (HIGH) — Last-50m apartment access handshake

A privacy/safety handshake that is built end-to-end and live, but lives in
`job.address_access.release_stage` (NOT in the workflow phase-context), so a
naive screen-by-screen rebuild deletes it.

- **State source:** `job.address_access.release_stage` ∈
  `area_only → building_released → unit_released`. Render off this, do NOT infer
  from `status`.
- **Worker side** (`worker-surfaces.tsx`): lobby check-in (geofence, manual
  photo) → "căn hộ mở sau khi khách bấm Cho thợ lên" waiting state → building
  released display. Backend: `buildCheckInAccessState` (services.ts ~9060) →
  `building_released`.
- **Customer side** (`customer-surfaces.tsx`): CTA **"Cho thợ lên"**, shown when
  `worker_checked_in && !exact_unit_released` → `authorizeApartmentAccess()`
  (services.ts ~8957, hardened current-worker-only / active-only) →
  `unit_released`; notify worker "Khách đã cho phép lên".
- **Why it matters:** dropping this leaks the unit address without consent, or
  leaves the worker waiting in the lobby with no signal. Highest-stakes small
  detail in the flow.
- **X-2 (partial — built 2026-06-15):** the customer is now nudged the *moment*
  the worker checks in — `notifyCustomerWorkerCheckedIn` (services.ts ~7456) fires
  an in-app notification + push ('Bấm "Cho thợ lên"…') gated on the check-in
  release stage `checked_in_awaiting_customer_authorization` (services.ts ~3811),
  distinct from the generic "worker arrived" push. **Still UNBUILT:** a *timeout /
  escalation* if the customer never taps even after the nudge — under "Kael runs
  everything", Kael should re-nudge + escalate (no scheduler/cron path yet). The
  rebuild must keep firing this nudge from server truth, never infer it client-side.

## L-1 (HIGH) — Customer second-half lifecycle

The customer flow board stops at "2.12 Job in Progress". The backend HAS the
endpoints; the board is missing the screens. Job status machine requires
`confirmed_by_customer → payment_pending → paid → reviewed`.

Render these customer phases (they already have backend):
- **scope-change decision** (hard-stop): `POST /scope-changes/:id/decide`. Must be
  a real hard-stop — wait for `kael_decided_scope_change`, never bypass.
  (Reinforced by K-1: scope is ALWAYS customer-confirmed now.)
- **completion review / nghiệm thu**: `POST /jobs/:id/confirm-completion`.
- **payment**: `payment_pending → paid` is still a placeholder (no rails). UI must
  NOT claim "đã thanh toán"; show honest pending state.
- **review / đánh giá**: `POST /jobs/:id/review`.

Build these as variants of the phase-context case-surface
(`buildWorkflowPhaseContext().sections`), not 8 standalone static screens (U-2).

## H8 (HIGH) — Dispute screens

There is no job status `disputed`; dispute is a side-record. So the UI must read
the disputes table, not a job status, to show dispute state.

- Open/track dispute, both sides; counter-statement; admin-decided outcome.
- Backend: `open_dispute_atomic` / `submit_counter_statement_atomic` /
  `admin_decide_dispute_atomic`; evidence snapshot is immutable. Kael only writes
  a neutral summary — never decides. UI must reflect "admin decides", not Kael.
- `disputes` + `evidence_snapshots` are in the realtime publication, so dispute
  state can be live.

## U-3 (MEDIUM) — Bottom-nav must be decided per-role BEFORE the rebuild touches it

Three sources disagree on the tab bar: the design token `theme.ts`
(Trang chủ / Lịch sử / Tin nhắn / Hồ sơ + orb) ≠ the live app routes
(customer: home/booking/kael/history/profile; worker:
home/jobs/chat/earnings/profile) ≠ STRUCTURES A1/B2.

- **Why it matters:** the rebuild brief is UI-only and explicitly **must preserve
  navigation**. A single 4-tab bar cannot serve both the customer and worker
  roles, so a naive "build the design's nav" silently changes navigation — out of
  scope and a regression.
- **Rule:** lock the per-role tab set with Tu first; then reconcile the `theme.ts`
  token to the agreed routes. Do NOT collapse the two role navs into one, and do
  NOT add/remove tabs to match the board without sign-off.

---

## Data-honesty reminders for the rebuild (already enforced in code)

- **U-1 gamification:** worker level is derived from real `completedJobs`
  (`buildWorkerProfileLevelModel`), not fabricated; customer "Tín hiệu tin cậy"
  is empty-state. Do NOT re-introduce fake radar / "Bảo vệ đồng tiền NN/100" /
  30-day-income numbers with no backend source.
- **A-2 estimate card:** render `needs_inspection` ("Cần kiểm tra tại hiện
  trường") when Kael flags low-confidence (now surfaced on the estimate; see
  `customer-kael-chat-needs-inspection`).
- **U-2 phase-context:** the case-surface renders `phaseContext.sections` +
  `mode`; do not invent per-screen component order.
- **U-5 Agentic Center surfaces — backend EXISTS, rendering is a scope choice:**
  the three endpoints are built and tested (`GET /me/pending-decisions`,
  `GET /me/threads`, `PATCH /me/kael-memory` — router.ts:1406/1409/1430,
  services.ts:6399/6461/6514; mobile client services.ts:110-122). So these tiles
  would render REAL data, not fakes. The open question is whether to *surface* them
  in round 1, not whether to build backend: under "Kael runs everything", the
  approval queue is scope-change-only and already shown in-job (don't duplicate a
  separate feed), and the cross-job inbox is secondary to per-job chat. If shown,
  render from these endpoints; otherwise descope the tiles — never hand-fabricate
  their contents.
