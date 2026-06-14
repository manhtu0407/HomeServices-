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
- **X-2 gap (MEDIUM):** there is no timeout / Kael-nudge if the customer never
  taps "Cho thợ lên". Under the "Kael runs everything" model, Kael should nudge
  the customer + escalate. (Backend orchestration not yet built — flagged.)

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
