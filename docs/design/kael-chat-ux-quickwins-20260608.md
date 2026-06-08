# Kael Chat UX Quick-Wins — Execution Plan (for Codex)

Date: 2026-06-08
Status: APPROVED scope, locked by Tu 2026-06-08. Build owner: Codex. Verify owner: Claude. NOT started.
Surface: Expo React Native customer Kael chat (worker chat mirrors after).
Priority: **2** (after `docs/design/kael-worker-onsite-vision-20260608.md`).
Scope: the two highest-impact / lowest-cost interaction gaps vs. modern AI chat — **(1) optimistic user bubble (instant ack)** and **(2) auto-scroll to newest + jump-to-latest**. Finishes §2A beats that `Plan.md §32` planned but did not complete. NOT turning Kael into a generic chatbot.

English technical artifact; Vietnamese only for copy strings.

> **CODEX ROLE DIRECTIVE.** Senior AI-UX engineer. These are small, high-leverage polish items — keep diffs surgical, honesty intact (the optimistic bubble shows the user's OWN text, never fake Kael content), and respect Reduce Motion. Visible-in-app evidence before "done".

## 0. Metadata
- **Trigger:** UI/UX gap audit (2026-06-08): the thread uses a plain `ScrollView` + `turns.map` with no auto-scroll ([thread.tsx:164,168](../../apps/mobile/components/customer/kael-chat/thread.tsx)) and the user's sent message does not appear as a bubble until the server responds (no optimistic turn in [state.ts](../../apps/mobile/components/customer/kael-chat/state.ts)).
- **Authority refs:** `RULES.md` #8 (no fake content — the optimistic bubble is the user's real text only). `design.md` (LOCKED) motion + `kael-motion` (Reduce Motion). `code-ownership-map.md` (chat owners).
- **Owner files:** `apps/mobile/components/customer/kael-chat/{thread.tsx,state.ts,kael-chat-surface.tsx}`; tests in `__tests__/`. Worker mirror: `apps/mobile/components/worker/worker-surfaces.tsx` (fast-follow).
- **Skills mapping:** `kael-frontend-test` (RNTL + recording), `kael-motion` (Reduce Motion scroll), `karpathy-guidelines`.
- **Decision log:**
  - 2026-06-08 — Tu: build after the worker-vision plan (sequential).
  - 2026-06-08 — Claude **(D1)** keep the existing `ScrollView`; achieve auto-scroll via a ref + `scrollToEnd` on content-size change + a scrolled-up detector for "jump to latest". **Thread virtualization (FlatList) is a flagged fast-follow** (C#3 in the audit), not in this plan — it pairs with this work but is a bigger refactor.
  - 2026-06-08 — Claude **(D2)** optimistic bubble is reconciled by `client_request_id` so the real turn from the server replaces it with no duplicate.
- **Change log:** 2026-06-08 v0.1 — initial (Claude).

## 1. Execution plan

### Phase 0 — read
- Read chat owners + `kael-motion`. Restate the two gaps + the no-duplicate reconcile rule. Confirm `client_request_id` is available at send time to key the optimistic turn (it is — `stableClientRequestId` in `kael-chat-surface.tsx`).

### Phase 1 — Optimistic user bubble (instant ack)
- **1.1** **File:** `state.ts`. **Action:** add `optimisticTurn` (or a small `pendingUserTurns` list) set on `sendStarted` from the draft + `client_request_id`; clear/reconcile on `sendSucceeded` (drop any optimistic turn whose id matches a real turn) and on `sendFailed` (keep with a retry affordance or remove + restore draft). **Acceptance:** no duplicate when the server turn arrives; failure restores the user's text. **Evidence:** reducer unit test. **Verify:** Claude.
- **1.2** **File:** `thread.tsx`. **Action:** render the optimistic user bubble immediately above the live-activity indicator, styled exactly like a real customer turn. **Acceptance:** the user's message appears instantly on send (before any network result); composer clears. **Evidence:** RNTL + recording. **Verify:** Claude.

### Phase 2 — Auto-scroll + jump-to-latest
- **2.1** **File:** `thread.tsx`. **Action:** add a `ScrollView` ref; on new turns / streaming-text growth / send, `scrollToEnd({ animated: !reduceMotion })`; use `onContentSizeChange` to keep the edge in view. **Acceptance:** new content and streaming keep the latest in view. **Evidence:** RNTL (mock layout) + recording. **Verify:** Claude.
- **2.2** **File:** `thread.tsx`. **Action:** track scroll offset; when the user scrolls up past a threshold, pause auto-scroll and show a "↓ mới nhất" / "↓ Latest" affordance that scrolls to bottom on tap. **Acceptance:** auto-scroll pauses when the user is reading history; the button returns to latest. **Evidence:** RNTL + recording. **Verify:** Claude.
- **2.3 (a11y/Reduce Motion)** **Action:** `animated:false` under Reduce Motion; the jump button is a real labeled button. **Verify:** Claude.

### Phase 3 — Close
- VISIBLE DONE: recording of (a) instant user bubble on send, (b) auto-scroll following new/stream content, (c) scroll-up → jump-to-latest. Light/dark/Reduce Motion. `/log`. Flag the FlatList virtualization fast-follow + the worker-chat mirror. **Verify:** Claude.

## 2. Honesty & safety
- The optimistic bubble renders only the user's own typed text (RULES #8 safe). No optimistic Kael content. Reconcile by `client_request_id` to avoid duplicates. Failure never loses the user's draft.

## 3. Risks
- Double-turn on reconcile → key by `client_request_id`; test explicitly.
- Scroll jank under streaming → throttle `scrollToEnd`; `animated:false` on Reduce Motion.
- ScrollView (not virtualized) still grows with long threads → FlatList virtualization flagged as the paired fast-follow.
