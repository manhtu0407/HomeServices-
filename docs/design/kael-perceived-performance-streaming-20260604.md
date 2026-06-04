# Kael Perceived Performance & Stage-Streaming — Execution Plan (for Codex)

Date: 2026-06-04
Status: APPROVED design, decisions locked by Tu 2026-06-04. Build owner: Codex. Verify owner: Claude. NOT started.
Surface: Expo React Native customer app + Supabase Edge `mobile-api`
Scope: Kael perceived-performance across BOTH actors — **Part A** customer price-check chat (A4/A5); **Part B** worker side, which now includes a prerequisite **functional build** (a bounded advisory worker-Kael chatbot, B-FUNC) plus perceived-perf on it and on scope-change (B-PERF). Learning / post-job paths remain out of scope. Worker-Kael functional audit: `docs/architecture/kael-worker-functional-audit-20260604.md`.

This is an engineering artifact (English technical). The only Vietnamese content is user-facing copy strings (product copy, Vietnamese-first with EN switch).

> **CODEX ROLE DIRECTIVE (read first, adopt before any work).**
> Act as a senior Anthropic product engineer specialized in AI UX — someone who has shipped streaming / thinking-state interfaces for LLM products. You are Tu's technical co-founder, not a code generator. Challenge weak assumptions out loud, prefer the smallest safe change, and treat perceived performance as a **frontend, in-app** outcome the customer actually sees — not a backend metric. A phase is not "done" until the improvement is **visible in the running app with captured evidence**. Build server + client together; backend-only is failure for this work.

---

## 0. Metadata

- **Trigger:** Tu asked to close Kael's perceived-performance gap (streaming, thinking-state, TTFT, stable streaming, a11y, graceful errors). Audit done 2026-06-04 (see §1). Tu chose plan-first, then locked decisions for a full Tier-1→Tier-2 build executed by Codex and verified by Claude.
- **Authority refs (cannot be bypassed):** `RULES.md` #2 (AI server-side via `callAI`), #3 (Zod-validated AI output), #6 (service scope), #8 (no fake/off-topic data), #9 (no PII in logs/rows). `STRUCTURES.md` runtime lock (mobile → Auth → Edge `mobile-api` → DB/RPC/AI). `critical.md` §0 lifecycle + verification gates. `CLAUDE.md` runtime boundary (mobile never calls AI directly; workflow-state stays server-validated).
- **Owner files (from `docs/architecture/code-ownership-map.md`):** backend `supabase/functions/mobile-api/_shared/kael/{streaming.ts,pipeline.ts,provider-client.ts,routing.config.ts,scope-change.ts}`, `_shared/{services.ts,router.ts,access.ts}`; mobile customer `apps/mobile/components/customer/kael-chat/{thread.tsx,agentic-parts.tsx,state.ts}`, mobile worker `apps/mobile/components/worker/worker-surfaces.tsx`, `apps/mobile/lib/{api.ts,realtime.ts,services.ts}`; shared `packages/shared/src/validation.ts` + types; worker UX contracts `docs/design/{worker-production-contract.md,worker-map-operation-balanced-20260531.md}`.
- **Skills mapping:** `kael-ai-boundary` (AI honesty + callAI), `kael-motion` (loading motion + Reduce Motion), `kael-frontend-test` (RNTL + visible evidence), `kael-supabase` (migration + RLS + regen types), `kael-security-sweep` (no PII / no provider names), `karpathy-guidelines` (surgical diffs).
- **Decision log:**
  - 2026-06-04 — Tu: plan-first (no direct code).
  - 2026-06-04 — Tu locked: **(D1)** store progress using the existing `kael_progress` payload shape, on `kael_chat_sessions`. **(D2)** Tier-1 live channel = scoped fast-poll (do not reverse Realtime deferral now). **(D3)** go all the way to Tier-2 SSE. **(D4)** token-streaming is enabled per-field **only if that field is produced by a single streamable `callAI` text completion** — discover empirically (Phase 0.4), do not hardcode. **(D5)** Codex builds, Claude verifies. **(D6)** every phase must produce a visible in-app result with evidence, not backend-only.
  - 2026-06-04 — Tu locked **(D7)** thinking-state uses the "Thought for {n}s" pattern: stepper fully collapses into a tappable disclosure showing real measured elapsed, re-expandable to the honest stage trace (see 2M.4). **(D8 — SUPERSEDED 2026-06-04)** originally "no new `Plan.md` numbered section; this doc is canonical". Tu later overrode it: the work is consolidated into **`Plan.md §32`, which is now the canonical source**. This companion doc holds the per-step execution detail that §32 references.
  - 2026-06-04 — Tu locked **(D9)** the work must cover BOTH actors (no customer-only scope). Added Part B worker track (§3B) covering scope-change review B6, worker↔Kael chat, and worker brief, reusing the Part A mechanism + motion. Worker surfaces require their own audit (Phase WB.0) before build — current state located, not yet deep-verified.
  - 2026-06-04 — full worker-Kael functional audit done (`docs/architecture/kael-worker-functional-audit-20260604.md`): only LLM on the worker side is scope-change; dispatch/autonomy/protection are deterministic & built; the "chatbot" is a canned stub. Tu locked **(D10)** build a **bounded advisory** worker-Kael chatbot (upgrade `askKaelForWorker` to a real `callAI` `worker_assist` agent, advisory-only, **zero money/scope authority**, keep 3×/job cap), then layer perceived-perf. Part B restructured into B-FUNC (build, gated on the WBF.3 safety suite) → B-PERF (perceived-perf). Rejected the money-authority conversational negotiator.
  - 2026-06-04 — Tu re-audit directive + **(D11) parity principle**: anything the customer chatbot has, the worker chatbot must have too, adapted to role. Re-audit confirmed: the **workflow/lifecycle layer already has parity** (`workflow-phase-context.ts` role-aware; shared `useServiceWorkflow`), but the **chatbot/Kael-capability layer does not** (worker has no chat session, history, feedback, training-consent, or memory-delete; only a 3×/job Q&A stub). See the parity matrix in `docs/architecture/kael-worker-functional-audit-20260604.md`. B-FUNC is therefore raised from "upgrade the stub" to a **worker Kael chat session at capability-parity, role-adapted** (the bounded advisory agent becomes its response engine). Parity *tiering* for first-transaction survival pending Tu.
  - 2026-06-04 — Tu chose **(D12) option 1 (core felt-parity)** + asked for a deeper reuse audit. Reuse audit done: `kael_chat_sessions` is `customer_id`/`service_type` NOT NULL + customer RLS → cannot role-flag safely; build a **sibling** `kael_worker_chat_sessions`/`turns` (job-scoped, worker RLS) that reuses the customer *design/patterns* (idempotency, rate-limit RPC, turn lifecycle, cost, self-check) + extract shared chat UI. B-FUNC expanded to WBF.0–WBF.7 (schema → routing → engine+handlers → safety gate → mobile primitives+surface → wiring → fast-follow endpoints). Customer chat stays untouched.
- **Change log:**
  - 2026-06-04 v0.1 — initial design draft (Claude).
  - 2026-06-04 v0.2 — Tu locked D1–D6; expanded into Codex execution plan with Phase 0 pre-plan, fine-grained steps, frontend-first deliverables, per-phase verify gates (Claude).
  - 2026-06-04 v0.3 — Tu flagged missing animation craft. Added §2A reference choreography (Claude/ChatGPT turn, 5 beats) + mapping, and motion phases 2M (thinking-state stepper, avatar, collapse-to-answer) and 4M (streaming caret, token-driven reveal, auto-scroll, settle); all bound to design.md + glass-liquid-signature + kael-motion (Claude).
  - 2026-06-04 v0.4 — Tu locked D7 ("Thought for {n}s" collapsible disclosure in 2M.4) and D8 (no Plan.md section). (Claude)
  - 2026-06-04 v0.5 — Tu locked D9 (both actors). Located worker-side Kael surfaces (scope-change B6 via `scope-change.ts` 2× callAI no progress; worker↔Kael chat; worker brief core/guidance) and added Part B (§3B) with worker phases WB.0–WB.close + sequencing note; updated scope/owner files. Worker specifics flagged for the WB.0 audit, not assumed. (Claude)
  - 2026-06-04 v0.6 — Deep worker-Kael functional audit done (separate doc). Tu locked D10 (bounded advisory chatbot). Rewrote §3B Part B into B-FUNC (build advisory `worker_assist` agent: WBF.0 design → WBF.1 routing → WBF.2 backend → WBF.3 safety suite → WBF.4 mobile) + B-PERF (WBP.1 scope-change thinking-state, WBP.2 advisory token streaming, WBP.2M motion, WBP.close); updated scope. (Claude)
  - 2026-06-04 v0.7 — Re-audit (Tu's parity directive). Confirmed workflow/lifecycle parity already exists; chatbot/capability parity does not. Added parity matrix to the functional audit doc; locked D11 (parity principle); raised B-FUNC to capability-parity (role-adapted). Parity tiering for survival pending Tu. (Claude)
  - 2026-06-04 v0.8 — Tu chose D12 (core felt-parity) + deeper reuse audit. Verified `kael_chat_sessions` is customer-bound (no safe role-flag); decided sibling worker tables reusing customer patterns. Added Reuse assessment to the audit doc; rewrote B-FUNC into WBF.0–WBF.7 (sibling chat session system + advisory engine + shared UI extraction + fast-follow capability endpoints). (Claude)

---

## 1. Problem (audit-grounded, evidence cited)

A Kael price-check turn is **fully synchronous request/response**:
- `apps/mobile/lib/api.ts:74` — `await response.text()` buffers the whole body before any UI update.
- `supabase/functions/mobile-api/_shared/services.ts:1763` — `await runKaelPipeline(...)` blocks the POST until the entire pipeline finishes, then returns one JSON envelope.

**Latency budgets** (`supabase/functions/mobile-api/_shared/kael/routing.config.ts:36-41`): `intent 2.5s → parallel(vision 4.5s, market 4s, baseline) → synthesis 3s` ⇒ worst-case ≈ **10s**, typical **4–6s** to first content; mobile timeout 15s. So **TTFT < 800ms for the estimate is unreachable** as built.

Today's "streaming" is cosmetic: `useProgressiveKaelText` (`apps/mobile/components/customer/kael-chat/thread.tsx:395`) reveals glyphs only **after** the full response arrives.

**Scorecard:** #5 accessibility and #6 error handling are already decent (`thread.tsx:305`, `thread.tsx:177-200`) — do not rebuild them. Real holes: **#1 token stream, #2 real thinking-state, #3 TTFT.**

### 1.1 Thinking-state infra is half-built and disconnected in 3 places

Backend computes real per-stage progress (`pipeline.ts` → `updateKaelProgress` → `jobs.kael_progress`, `streaming.ts`) but for chat it is wasted:
1. **Not written for chat** — chat handler passes no `progressJobId` (`services.ts:1763`; legacy `POST /jobs` does at `services.ts:627`); chat turns are `job_id: null` (`services.ts:1791`) so `updateKaelProgress` early-returns (`streaming.ts:25`).
2. **Not read by mobile** — no runtime reader exists; labels are local guesses (`thread.tsx:434`).
3. **No live channel** — Realtime is deferred; chat polls every 8s (`apps/mobile/lib/realtime.ts:1-9`).

The data for "🔍 Đang tra cứu giá thị trường…" is produced and thrown away.

---

## 2. Reframe (locked)

Kael price-check is a **structured multi-stage pipeline returning a JSON estimate**, not a single-LLM long-form chat. So:
- **Primary = stage-streaming** (surface real stage transitions; free telemetry; honest; first paint < 800ms).
- **Secondary = token-streaming**, gated by **D4**: only for a field whose text is one streamable `callAI` completion. The estimate numbers are deterministic synthesis (`pipeline.ts` `synthesizePrice` is a pure function) — never token-streamed. Streamed tokens are **display-only**; the authoritative, Zod-validated object always arrives in the final `result` (RULES #3).
- **TTFT is two numbers:** *TTF-thinking-state* (target < 800ms, achievable) vs *TTF-estimate* (4–10s, pipeline-bound). Measure both; never market an 800ms estimate.

---

## 2A. Reference choreography — how Claude/ChatGPT actually perform a turn (audit)

The plan must reproduce the *feel*, not just the data. A real Claude/ChatGPT turn runs five beats:

1. **Instant ack** — the user bubble appears immediately, composer clears, view scrolls to bottom. Zero perceived wait for the echo.
2. **Fast thinking paint (< 800ms)** — a response container + an animated indicator (breathing dot / shimmer) mounts **before** any network result. This is what kills the empty-screen feeling.
3. **Discrete staged steps that check off** — for tool use / search / reasoning, labeled rows ("Searching…", "Reading…") slide in, shimmer while active, then **tick and dim** when done. One active line is emphasized; finished lines recede. Glanceable, not a wall of text.
4. **Token stream with a caret** — the answer streams token-by-token with a blinking caret at the streaming edge; auto-scroll follows the edge unless the user scrolls up.
5. **Clean settle** — caret off, the thinking block collapses to a quiet summary ("Thought for 4s"), the final content renders settled.

Three perceptual principles: **fast first paint**, **visible discrete progress**, **clean settle**.

**Kael maps 1:1** — its pipeline stages *are* the tool steps:

| Kael stage | Step-row behavior in the chat frame |
|---|---|
| `intent_classification` | first row, enters as soon as the turn starts (drives the <800ms first paint) |
| `vision_analysis` (photo only) | row appears only when a photo exists |
| `market_lookup` | the "🔍 Đang tra cứu giá khu {district}…" row — the headline beat |
| `problem_synthesis` | "đối chiếu khung giá" row |
| `price_synthesis` | last row; on complete, the stepper collapses into the estimate card |

This audit is the acceptance reference for the motion phases (2M, 4M).

---

## 3. Execution plan

Conventions for every step below: **File(s)** → **Action** → **Acceptance** → **Evidence/Test** → **Verify (Claude)**. Keep diffs surgical (`karpathy-guidelines`). Each phase ends with a `/log` entry to `README.md` and must pass `Plan.md §14` cross-cutting gates before merge. **Frontend phases (2, 2M, 4, 4M) are not done without a screen recording / screenshot of the real app showing the change.** Motion phases (2M, 4M) must conform to `design.md` (LOCKED) + the `glass-liquid-signature` and `kael-motion` skills; any motion pattern not already covered there is FLAGGED for Tu, not freelanced.

### Phase 0 — Pre-Plan / Context load (Codex reads; NO code)

- **0.1** Read the governance stack in the repo authority order (per `AGENTS.md` / `Plan.md §32.0.1`), and state back the rules that constrain this work: `critical.md` → `RULES.md` → `STRUCTURES.md` → `design.md` → `AGENTS.md` → `CLAUDE.md` → `docs/architecture/code-ownership-map.md` → `skills.md` → `.agents/skills/karpathy-guidelines/SKILL.md` → `Plan.md §32` → `MEMORY.md` (last). **Acceptance:** a short written restatement of: the runtime lock, RULES #2/#3/#6/#8/#9, and the "no fake data / no provider names in user-facing copy" rule.
- **0.2** Read this plan in full + the audit scorecard (§1) and the relevant `Plan.md` sections: §8.2 (chat endpoint + state machine), §14 (quality gates), §15 (anti-patterns), §31 (Kael AI core context). **Acceptance:** restate the reframe (§2), the 3 breaks (§1.1), and decisions D1–D6.
- **0.3** Read the runtime files to be touched (owner list in §0) and the project skills that gate them (`kael-ai-boundary`, `kael-motion`, `kael-frontend-test`, `kael-supabase`, `kael-security-sweep`). **Acceptance:** confirm where each change lands and which test layer proves it.
- **0.4 (resolves D4)** Inventory every `callAI` invocation in the Kael pipeline and classify each as **structured-output** (JSON/schema → NOT streamable) vs **single streamable text completion** (→ candidate for token-stream). Check whether `provider-client.ts` / `callAI` currently supports a streaming mode at all. **Acceptance:** a table `{stage, callAI purpose, output kind, streamable?}`; the streamable set becomes the Phase 3.3 token-stream field list. Expected candidates: `clarification`, `advisory_generation`; expected non-streamable: `intent_classification`, `vision_analysis`, `price_synthesis` (deterministic). Confirm, do not assume.
- **0.5** If alignment is unclear at any point, run the interview loop (hypothesis + confidence + one focused question) and stop for Tu before coding. **Gate:** Tu (or Claude on Tu's behalf) signs off the Phase 0 restatement before Phase 1.

### Phase 1 — Tier 1 backend: session-scoped real progress (D1)

- **1.1** **File:** new `supabase/migrations/<ts>_kael_chat_session_progress.sql`. **Action:** add `kael_progress jsonb` (nullable) to `kael_chat_sessions`; RLS so only the session owner (and admin/service-role) can read it. Do not edit merged migrations. **Acceptance:** migration applies clean on a branch; RLS positive/negative proven. **Evidence:** `kael-supabase` workflow + RLS test. **Verify:** Claude reviews migration + RLS test.
- **1.2** **File:** `packages/shared/src/types/database.types.ts` (regen) + `validation.ts`. **Action:** regenerate DB types; add a `kaelChatProgressSchema` matching the existing `kael_progress` shape (`current_stage`, `status`, `progress 0..1`, `failure_reason`, `updated_at`). **Acceptance:** types compile; schema unit-tested. **Verify:** Claude type-check.
- **1.3** **File:** `supabase/functions/mobile-api/_shared/kael/streaming.ts`. **Action:** generalize `updateKaelProgress` to accept a target `{table, id}` (default keeps `jobs`/`id` working) so it can write `kael_chat_sessions.kael_progress`. **Acceptance:** existing `POST /jobs` progress path unchanged; new session path writes. **Evidence:** unit tests both targets. **Verify:** Claude.
- **1.4** **File:** `supabase/functions/mobile-api/_shared/services.ts` (chat turn handler ~`:1763`). **Action:** at turn start, reset progress to a clean initial state for the session, and pass the session progress target into `runKaelPipeline` so all stages write. **Acceptance:** a chat turn produces a row transitioning `intent → … → price_synthesis`; failed/skipped stages carry honest `status`/`failure_reason`. **Evidence:** integration test against real DB observing intermediates mid-flight (unit mocks would miss this — they have before). **Verify:** Claude runs the integration test and reads the rows.
- **1.5** **File:** `supabase/functions/mobile-api/_shared/router.ts` + `services.ts` + `access.ts`. **Action:** add `GET /kael/chat/:id/progress` returning the latest progress payload (lightweight; owner-access-checked). **Acceptance:** 200 for owner, 404/403 for non-owner; schema-valid body. **Evidence:** edge router + access tests. **Verify:** Claude.
- **1.6** **Phase gate:** all backend tests green; `Plan.md §14` gates pass; `/log`. No fake data; no provider names in any payload (`kael-security-sweep`).

### Phase 2 — Tier 1 frontend: real thinking-state VISIBLE in app (D2, D6)

- **2.1** **File:** `apps/mobile/lib/services.ts`. **Action:** add `kaelChatProgressService.get(sessionId)` calling the new route via `api.ts`. **Acceptance:** typed result; no direct fetch in UI. **Verify:** Claude.
- **2.2** **File:** `apps/mobile/components/customer/kael-chat/{state.ts, kael-chat-surface.tsx}`. **Action:** while `sending === true`, run a scoped fast-poll (~800ms, single small read) that stops on terminal stage / error / POST-resolve / timeout, with full cleanup. **Acceptance:** no poll leak after completion; no poll when not sending. **Evidence:** RNTL timer test. **Verify:** Claude.
- **2.3** **File:** `apps/mobile/components/customer/kael-chat/thread.tsx` (copy block) + EN switch. **Action:** add the stage→copy map (§4) including `{district}` interpolation and the failed/skipped neutral line. **Acceptance:** VI primary + EN parity; no provider names. **Verify:** Claude reads copy.
- **2.4** **File:** `thread.tsx` (`KaelLiveActivityIndicator`, `resolveKaelLiveActivityLabel`). **Action:** feed the **real** stage label/progress from the poll; keep the local guess only as the pre-first-event fallback. **Acceptance:** label tracks real stages in order; falls back gracefully before first event. **Evidence:** RNTL per-stage render test. **Verify:** Claude.
- **2.5 (honesty, RULES #8)** **File:** `thread.tsx`. **Action:** on `status: failed`/skipped, show neutral copy (never a fake "done"); hide `vision_analysis` when skipped. **Acceptance:** forced market failure shows no "đã tra cứu" success. **Evidence:** RNTL negative test. **Verify:** Claude.
- **2.6 (a11y)** **File:** `thread.tsx`. **Action:** announce stage changes through the existing `accessibilityLiveRegion="polite"` node; honor Reduce Motion (freeze sheen) and Reduce Transparency. **Acceptance:** live region updates per stage; reduced-motion path static. **Evidence:** RNTL + `kael-motion` audit. **Verify:** Claude.
- **2.7 (VISIBLE DONE)** **Evidence required:** a screen recording / screenshots of the running app showing the thinking-state advancing through real stages ("🧭 → 🔍 Quận 7 → 🧠"), light + dark, plus reduced-motion. **Verify:** Claude reviews the recording; Phase 2 is not done without it.

### Phase 2M — Thinking-state MOTION choreography (frontend, visible; reproduces §2A beats 1–3 + 5)

Goal: make the real stages from Phase 2 *animate* inside Kael's chat frame like a premium assistant, within the house motion system. Primitives: `react-native-reanimated`, `apps/mobile/components/ui/{motion-tokens.ts,reduce-motion-aware-animation.ts,accessibility-motion.ts}`, `glass-surface.tsx`; skills `kael-motion` + `glass-liquid-signature`; contract `design.md` (LOCKED).

- **2M.1 Instant ack + fast first paint (beats 1–2).** **File:** `kael-chat-surface.tsx`, `state.ts`, `thread.tsx`. **Action:** on send, optimistically mount the user bubble + a Kael "thinking" container **immediately** (before the first poll event) with a breathing/shimmer indicator using `motion-tokens` easing. **Acceptance:** thinking container visible < 800ms on a real device, independent of network. **Evidence:** recording + TTF-thinking-state log. **Verify:** Claude.
- **2M.2 Stage stepper that ticks off (beat 3).** **File:** `thread.tsx` (`KaelLiveActivityIndicator` → stepper). **Action:** render stages as a vertical stepper; each real stage row enters with a spring fade+translateY, shimmers while `running`, then shows a mint check (glass-liquid mint accent) and dims when `completed`; the single active row is emphasized, finished rows recede. Sequence is driven by real `kael_progress`, never a fixed timer. **Acceptance:** rows appear/tick in lockstep with backend stage transitions; glanceable (one active line). **Evidence:** RNTL state test + recording. **Verify:** Claude.
- **2M.3 Kael avatar micro-motion.** **File:** `thread.tsx`/`agentic-parts.tsx` (the `kael-model-8a-head` avatar). **Action:** subtle breathing/pulse while thinking, settle on done (`kael-motion` mascot guidance). **Acceptance:** calm, non-distracting; stops on completion. **Verify:** Claude.
- **2M.4 Thinking → answer transition — "Thought for 4s" collapse (beat 5, locked by Tu 2026-06-04).** **File:** `thread.tsx`, `state.ts`. **Action:** on the final result, the stepper fully collapses (height→0, spring) into a single quiet, **tappable disclosure chip** — avatar + "Kael đã phân tích trong {n}s" / "Kael analyzed in {n}s" + chevron — exactly like Claude's "Thought for Xs" block; the estimate card reveals as the focus in one choreographed transition (not a hard swap). Tapping the chip **re-expands** the now-static, checked-off stage trace (no shimmer); default after settle = collapsed. **Acceptance:** (a) stepper collapses to one chip; (b) `{n}` is the **real measured** elapsed `sendStarted → result` in whole seconds — never a fabricated number (RULES #8); (c) chip is re-expandable and shows the honest completed trace; (d) collapse + estimate reveal read as one motion, no layout jump. Copy uses "phân tích" (analyzed), not "suy nghĩ" — Kael ran a pipeline, not chain-of-thought; stay honest. **Evidence:** recording of collapse + tap-to-re-expand. **Verify:** Claude.
- **2M.5 Reduce Motion / Reduce Transparency.** **Action:** RM → instant state changes + ≤ existing reduced durations, no shimmer/blink; RT → solid surfaces via `glass-surface` fallback. **Acceptance:** both paths correct (`accessibility-motion`). **Evidence:** RNTL both modes. **Verify:** Claude.
- **2M.6 Performance budget.** **Action:** drive animations on Reanimated worklets / native driver; do not re-render the whole turn list per stage; keep the `kael-motion` perf budget. **Acceptance:** smooth on a low-end Android profile, no dropped-frame jank. **Evidence:** profiler note / recording. **Verify:** Claude.
- **2M.7 VISIBLE DONE.** Recording of the stepper entering and ticking stage-by-stage, the Kael avatar micro-motion, and the collapse-to-estimate transition — in light, dark, and reduced-motion. Conform to `design.md`/glass-liquid; FLAG any new pattern for Tu. **Verify:** Claude reviews; phase not done without it.

### Phase 3 — Tier 2 backend: SSE stage + token stream (D3, D4)

- **3.0 (spike)** Verify Supabase Edge wall-clock tolerance for a 4–10s open SSE connection on the deployed tier; confirm `callAI`/`provider-client.ts` can expose a streaming mode for the streamable fields from 0.4. **Acceptance:** documented yes/no + approach; if `callAI` lacks streaming, sub-task to add a server-side streaming mode that still validates the final object via Zod (RULES #3). **Verify:** Claude reads the spike note.
- **3.1** **File:** new `supabase/functions/mobile-api/_shared/sse.ts` helper. **Action:** `text/event-stream` response builder over `Deno.serve` (`index.ts:8`) with `event:`/`data:` framing + `:` heartbeat (~10s). **Acceptance:** unit test of framing. **Verify:** Claude.
- **3.2** **File:** `router.ts` + `services.ts`. **Action:** streaming variant of the chat turn (e.g., `Accept: text/event-stream` or `POST /kael/chat/:id/stream`) emitting `stage` (every transition), `token` (streamable fields only), `result` (final Zod-validated session), `error` (friendly VI). Keep the JSON endpoint as fallback. **Acceptance:** event order correct; `result` always carries the validated object; `error` never leaks stack/provider. **Evidence:** edge stream tests. **Verify:** Claude.
- **3.3 (D4)** **File:** AI boundary (`provider-client.ts` / `callAI` + the streamable stages). **Action:** forward tokens **only** for fields classified streamable in 0.4. **Acceptance:** non-streamable fields never emit `token`; final validation unchanged. **Verify:** Claude.
- **3.4** **Phase gate:** stream tests green; fallback intact; `/log`.

### Phase 4 — Tier 2 frontend: consume SSE, TTFT measured, VISIBLE (D3, D6)

- **4.1** **File:** new `apps/mobile/lib/kael-stream.ts` (separate transport; do NOT change buffered `api.ts`). **Action:** `expo/fetch` `.body.getReader()` + `TextDecoder` + SSE parser. **Acceptance:** parses multi-event stream; auth headers reused. **Evidence:** unit test on a captured stream. **Verify:** Claude.
- **4.2** **File:** `kael-stream.ts` + `state.ts`. **Action:** on stream drop, do **not** attempt mid-stream token replay — follow-up turns carry no `client_request_id` and the §5 SSE contract defines no `id:` replay. Instead stop the stream and re-fetch the already-persisted turn via the idempotent JSON `GET /kael/chat/:id`, resuming the Tier-1 progress poll for any in-flight stages; also degrade to poll/JSON when streaming is unsupported. **Acceptance:** a mid-stream kill converges to the correct final session with **no duplicate turn and no lost result** (token-level replay is explicitly out of scope for v1 — see §5). **Evidence:** RNTL drop-recovery test. **Verify:** Claude.
- **4.3** **File:** `thread.tsx` / `state.ts`. **Action:** render `stage` into the live-activity (reusing Phase 2 UI) and `token` deltas into the clarification/advisory bubble as true incremental text; estimate renders on `result`. **Acceptance:** clarification text streams token-by-token in app. **Verify:** Claude.
- **4.4 (TTFT)** **File:** mobile timing util. **Action:** measure TTF-thinking-state (`sendStarted`→first stage paint) and TTF-estimate; log safely. **Acceptance:** TTF-thinking-state < 800ms on a real device. **Evidence:** logged numbers. **Verify:** Claude reads numbers.
- **4.5 (VISIBLE DONE)** **Evidence required:** device recording showing (a) stage progress, (b) clarification text streaming token-by-token, (c) graceful recovery on a dropped stream, (d) captured TTFT numbers. **Verify:** Claude; Phase 4 not done without it.

### Phase 4M — Streaming-text MOTION & settle (frontend, visible; reproduces §2A beats 4–5)

Goal: the conversational fields (clarification/advisory, per D4) stream token-by-token *visibly*, then settle cleanly into the final layout.

- **4M.1 Streaming caret (beat 4).** **File:** `thread.tsx`. **Action:** show a blinking caret (`▍`) at the streaming text edge while `token` events arrive; remove it on `result`. **Acceptance:** caret present only mid-stream. **Evidence:** recording. **Verify:** Claude.
- **4M.2 Token-driven reveal.** **File:** `thread.tsx` (`useProgressiveKaelText`). **Action:** for streamed fields, drive reveal from **real token arrival** instead of the fixed 110ms timer; append smoothly without layout thrash; progressive text. Keep the timed reveal only as the Tier-1 / non-streamed fallback. **Acceptance:** text tracks real tokens; no flicker on append. **Evidence:** RNTL on a captured stream + recording. **Verify:** Claude.
- **4M.3 Auto-scroll follow.** **File:** `thread.tsx` (FlatList/ScrollView). **Action:** keep the streaming edge in view; pause auto-scroll if the user scrolls up; offer a "jump to latest" affordance. **Acceptance:** matches standard chat scroll behavior. **Evidence:** recording. **Verify:** Claude.
- **4M.4 Completion settle (beat 5).** **File:** `thread.tsx`, `agentic-parts.tsx` (`EstimateCard`). **Action:** on `result`, caret + shimmer off; the estimate card performs the glass-liquid signature entrance (spring overshoot + specular sheen). **Acceptance:** one settled finish, no double-render flash. **Evidence:** recording. **Verify:** Claude.
- **4M.5 Reduce Motion.** **Action:** no caret blink, instant text, crossfade settle. **Acceptance:** correct RM path. **Verify:** Claude.
- **4M.6 VISIBLE DONE.** Recording showing token-by-token streaming with caret, auto-scroll follow, and the settle into the estimate card, with the TTFT numbers captured. **Verify:** Claude; phase not done without it.

### Phase 5 — Cross-cutting close-out

- **5.1** Contrast verification of the live-activity surface (a11y criterion #5). **Verify:** Claude.
- **5.2** Full Reduce Motion / Reduce Transparency pass (`kael-motion`). **Verify:** Claude.
- **5.3** Honesty + security audit: no fake stages, no provider names in copy/rows, no PII in progress rows (`kael-security-sweep`, RULES #8/#9). **Verify:** Claude.
- **5.4** Error UX: distinguish timeout vs failure with different friendly guidance + retry (improves criterion #6). **Verify:** Claude.
- **5.5** Docs: add a `Plan.md` section pointing to this plan with the phase list + DoD; flag any `STRUCTURES.md` / `design.md` (LOCKED) updates for Tu approval (do NOT edit locked docs). Update `docs/architecture/code-ownership-map.md` `streaming.ts` note to job/session-scoped. **Verify:** Claude + Tu approval on locked-doc flags.
- **5.6** Test log + evidence index (`/test-log`, `/log`).

---

## 3B. Part B — Worker track (Kael on the worker side)

Deep audit (2026-06-04, **verified in code** — corrects the earlier assumptions):

| Surface | Where (evidence) | Real nature | Perceived-perf value |
|---|---|---|---|
| **Scope-change B6** | worker `requestScopeChange` (`services.ts:3396`) **awaits** `computeScopeChangeEstimate` (`scope-change.ts`, real `callAI` Anthropic ~4s, `maxRetries:0`) before responding | **REAL LLM, blocks worker ~4s**, writes no `kael_progress`; UI shows only static `'Kael đang xét'` (`worker-surfaces.tsx:460`) | **HIGH — the one genuine worker thinking-state target** |
| Worker JobRoom "chat" | `WorkerChatSurface` (`worker-surfaces.tsx:1620`) → `useJobChatThread` → `POST /jobs/:id/messages`; `submitWorkerChatMessage` calls `jobChat.send` | **human worker↔customer messages, Kael-branded relay** ("Kael chuyển tiếp với khách"). Not an AI call. | low — normal optimistic send; no Kael latency to mask |
| Worker "ask Kael" Q&A | `askKael` → `askKaelForWorker` (`services.ts:3577`); answer from `buildWorkerKaelAnswer` (`services.ts:3641`) | **deterministic canned template** (no `callAI`), capped 3×/job; effectively instant. Not a real AI chatbot. | none (instant) — and functionally a stub |
| Worker brief | `buildWorkerBriefOutput` called **synchronously, no `await`** (`services.ts:700,2408,3066`) | **deterministic formatting** of already-computed pipeline data, not an LLM call; core pre-computed, guidance after accept | none (instant) |
| JobRoom waiting-for-handoff | `waitingTitle: 'Đang chờ Kael đưa việc'` (`worker-surfaces.tsx:471`) | passive orchestration wait | low (calm waiting state only) |

> **Resolved by audit.** The full functional audit (`docs/architecture/kael-worker-functional-audit-20260604.md`) proved: the worker-Kael *system* (dispatch, autonomy, worker protection) is built and deterministic; the only worker LLM is scope-change; the "worker Kael chatbot" is a canned stub (`askKaelForWorker` → `buildWorkerKaelAnswer`, no `callAI`). **Tu locked option 2 (2026-06-04): build a bounded advisory chatbot, then layer perceived-perf.** Part B has two sub-tracks — **B-FUNC** (functional build) then **B-PERF** (perceived-perf). Both stay inside the runtime lock; money/scope NEVER leave the structured scope-change + `buildKaelAutonomyDecision` rails.

#### B-FUNC — Worker Kael chat at core felt-parity (role-adapted) — Tu option 1 + reuse audit

Scope: a worker Kael chat **session system** at *capability*-parity with the customer's (multi-turn session, history, advisory engine), built as a **role-adapted sibling** that reuses the customer's proven *patterns* — NOT a role flag on the customer-bound `kael_chat_sessions` table (it is `customer_id`/`service_type` NOT NULL). This keeps the working customer chat untouched (survival/simplicity). Reuse map: `docs/architecture/kael-worker-functional-audit-20260604.md` (Reuse assessment). The small capability endpoints (feedback, training-consent, memory-delete) are the WBF.7 fast-follow.

Hard guardrail (RULES #2/#3/#6/#8, `kael-ai-boundary`): the chat is **advisory-only** — explain the brief, answer job questions, safety guidance, guide the structured scope-change. It may **never** set/propose a binding price/scope/status or change money state; it redirects money/scope to the structured scope-change + `buildKaelAutonomyDecision` rails. Every turn is Zod-validated + `self-check`-screened; safe-template fallback on AI failure.

- **WBF.0 (design, no code):** read `kael-ai-boundary`, charter (`packages/shared/kael/charter/**`, `system-prompt.ts`), `self-check.ts`, the customer chat stack (`createKaelChat`/`sendKaelChatTurn` `services.ts:942+`, the `kael_chat_sessions` schema, the `kael-chat/` mobile components), and `askKaelForWorker` (`services.ts:3577`). Produce the advisory boundary spec **and** the reuse/adaptation map (patterns to mirror vs build new). **Acceptance:** spec + reuse map signed off by Tu. **Verify:** Claude + Tu.
- **WBF.1 (schema — sibling tables):** new migration `kael_worker_chat_sessions` (job-scoped: `worker_id NOT NULL`, `job_id`, worker statuses, `safe_metadata`, idempotency/cost columns) + `kael_worker_chat_turns` (role `'worker'|'kael'|'system'`; content-types text/clarification/guidance/`photo_request`/`photo_attached`/error — no `estimate`; **`media_refs text[]`** for on-site evidence references, mirroring the customer turns + private Storage path refs so WBF.5 photo-attach has somewhere to persist), mirroring the customer design + indexes; worker RLS (`worker_id = auth.uid()`, read-only to client, service-role writes) + a worker chat rate-limit RPC. **Acceptance:** migration applies clean; RLS positive/negative (worker A cannot read worker B). **Verify:** Claude.
- **WBF.2 (routing):** add a `worker_assist` purpose to `routing.config.ts` (cheap primary, Anthropic fallback, latency budget, cost ceiling, `maxTokens`, `userVisible:true`, daily cap). **Verify:** Claude.
- **WBF.3 (backend — engine + handlers):** `kael/worker-assist.ts` advisory engine (prompt from job brief + conversation, real `callAI`, Zod + `self-check`, cost log, safe-template fallback, **zero autonomy authority**) + worker chat handlers `createWorkerKaelChat`/`sendWorkerKaelChatTurn`/`getWorkerKaelChat`/`listWorkerKaelChats` modeled on the customer handlers (idempotency, rate-limit, session/turn lifecycle) but **job-scoped + advisory** (no `runKaelPipeline`, no estimate/booking). New routes `/workers/me/kael/chat` (+ `/:id`). **Acceptance:** worker holds a real multi-turn advisory conversation scoped to a job. **Evidence:** unit + integration. **Verify:** Claude.
- **WBF.4 (safety suite — money-state gate):** negative tests — refuses to set price/scope/status, redirects to structured scope-change; prompt-injection; out-of-service-scope refusal; no provider names; PII-safe logs; RLS isolation. **Gate before any UI wiring.** **Verify:** Claude.
- **WBF.5 (mobile — shared primitives + worker surface):** extract reusable chat UI from `kael-chat/` (thread render, thinking-state indicator, progressive text, composer, glass) into shared primitives (or adapt), then build the worker Kael chat surface (job-assist content + history) consuming a new `workerKaelChatService`, **distinct** from the human↔customer relay chat, conforming to `worker-production-contract.md`. Include the conversational-UX parity items the customer chat has, role-adapted: **photo attach** (on-site evidence — high value for workers), **voice mic**, and clarification affordances. (The local-greeting fast-path is customer-intake-specific — adapt or omit, decide in WBF.0.) **Acceptance:** worker chat at UX parity (multi-turn + history + attach + mic), role-adapted. **Evidence:** RNTL + recording. **Verify:** Claude.
- **WBF.6 (mobile wiring):** `workerKaelChatService` in `apps/mobile/lib/services.ts` mirroring `kaelChatService`; route + nav for the worker Kael chat. **Verify:** Claude.
- **WBF.7 (fast-follow — capability parity):** mirror the small customer Kael endpoints still missing for workers — `/workers/me/kael-feedback` and `/workers/me/kael-training-consent` (get/set) — + minimal UI. (Worker **memory delete already exists** via the shared role-aware `DELETE /me/kael-memory` — `deleteMyKaelMemory` switches to `worker_kael_memory` for `ctx.role==='worker'`; do **not** add a duplicate worker delete endpoint.) Ships right after core. **Verify:** Claude.

#### B-PERF — Perceived-performance on worker (after B-FUNC; reuses Part A mechanism + §2A motion)

- **WBP.1 (scope-change thinking-state):** emit 2-step progress (`reviewing` → `estimating`) across `reviewScopeChange`→`computeScopeChangeEstimate` via the generalized `updateKaelProgress` ({table,id} from 1.3) to a scope-change-scoped target; mobile replaces the static `'Kael đang xét'` (`worker-surfaces.tsx:460`) with the real 2-step state + honest failed/fallback copy. **Evidence:** integration test + worker recording. **Verify:** Claude.
- **WBP.2 (advisory chat thinking-state + token streaming):** `worker_assist` is a **single streamable `callAI` text completion** → under D4 it IS a token-stream candidate (unlike the structured estimate — this is where beat-4 token streaming finally fully applies). Apply Tier-1 thinking-state then Tier-2 SSE token streaming (reuse Phase 3/4 contract) to the advisory answer, with the §2A caret + settle. **Evidence:** recording of tokens streaming in the "Hỏi Kael" bubble + TTFT. **Verify:** Claude.
- **WBP.2M (worker motion):** apply §2A choreography (stepper for scope-change; caret/settle for advisory chat; "Thought for {n}s" where a multi-step wait exists) conforming to `worker-production-contract.md` + `glass-liquid-signature` + `kael-motion`; Reduce Motion/Transparency. **Evidence:** worker recording light/dark/reduced-motion. **Verify:** Claude.
- **WBP.close:** Phase-5 gates scoped to worker (contrast; honesty — no fake stages / provider names; PII-safe), test log + recordings. **Verify:** Claude + Tu.

> **Sequencing:** Part A (customer) first — it proves the `updateKaelProgress` generalization, SSE contract, and §2A motion. Then **B-FUNC** (build the advisory agent; **gated on the WBF.4 safety suite** — the money-state negative tests, which must pass before any worker streaming/motion in B-PERF) before **B-PERF** (decorate it). Do not duplicate the SSE/motion specs — reference Phases 3/4/2M. Money/scope stay on the structured rails throughout.

---

## 4. Stage → user-facing copy contract (VI primary, EN switch)

Labels MUST reflect real stage state from `kael_progress`. On `status: failed`/skipped/fallback, show honest neutral copy — never a fake "done". HCMC product context: district examples use HCMC (e.g., "Quận 7"), interpolated from the request district when present. No provider names ever.

| stage / status | VI (primary) | EN (switch) |
|---|---|---|
| `intent_classification` running | 🧭 Đang đọc và phân loại yêu cầu… | Reading and classifying your request… |
| `vision_analysis` running (photo only) | 🖼️ Đang phân tích mô tả và hình ảnh… | Analyzing your description and photos… |
| `market_lookup` running | 🔍 Đang tra cứu giá thị trường khu {district}… | Checking market rates in {district}… |
| `problem_synthesis` running | 📚 Đang đối chiếu khung giá chuẩn… | Matching against standard price bands… |
| `price_synthesis` running | 🧠 Đang tổng hợp ước tính và rủi ro… | Synthesizing the estimate and risks… |
| any stage `failed`/fallback | ⚙️ Đang dùng dữ liệu nội bộ của Kael… | Using Kael's internal data… |

`{district}` omitted gracefully when unknown ("…khu vực của bạn…"). `vision_analysis` hidden when skipped. Strings live in the chat copy layer, not the backend.

---

## 5. SSE event contract (Tier 2 reference)

```
event: stage    data: {"stage":"market_lookup","status":"running","progress":0.32,"district":"Quận 7"}
event: token    data: {"field":"clarification","delta":"Bạn cho mình …"}   // streamable fields only (D4)
event: result   data: { <full Zod-validated KaelChatResponse session> }
event: error    data: {"code":"AI_FAILED","message":"<friendly VI message>"}
: heartbeat                                                                 // ~10s keepalive
```

**Reconnect (v1):** the contract intentionally omits SSE `id:` fields, so there is **no token-level replay**. On a dropped stream the client re-fetches the already-persisted turn via the idempotent `GET /kael/chat/:id` (see 4.2) — it does not resume mid-stream. Token/stage replay would require adding `id:` to every event **and** a per-turn server-side event buffer keyed by `Last-Event-ID`; that is deferred until a real need appears.

---

## 6. Risks & mitigations

- **RN streaming reality (Phase 4):** global `fetch` has no readable body → use `expo/fetch`; new transport, device-verified, JSON fallback kept.
- **Edge wall-clock (Phase 3.0):** SSE stays open 4–10s; verify tier limit before committing Tier 2. Tier 1 has no such risk (POST already blocks that long).
- **Cost (RULES #8 spirit):** zero extra provider calls — progress is existing telemetry, SSE forwards work already done. Only added load: bounded DB reads (Tier 1 poll).
- **Runtime lock (STRUCTURES/CLAUDE):** progress is read-only telemetry; no workflow-state mutation; `KaelAutonomyDecision` / money paths untouched.
- **Honesty (RULES #8/#9):** never render a failed/skipped stage as done; map `failure_reason` to neutral copy; no provider names; progress rows hold only stage/status/progress/safe district — no raw user text.
- **Accessibility:** announce via existing live region; verify contrast; honor Reduce Motion/Transparency.

---

## 7. Open decisions for Tu (remaining)

All four scope decisions are locked (D1–D4). One item still needs Tu's eye during the build:
- **Token-stream field set** is resolved empirically in Phase 0.4; Claude will bring the `{streamable?}` table to Tu before Phase 3.3 wires it, in case Tu wants to exclude a field for tone/safety reasons.

## 8. Locked-doc impact (flag only — needs Tu approval, not edited here)

- `Plan.md` (not locked): add a pointer section (phases + DoD).
- `STRUCTURES.md` (LOCKED): if it pins the `/kael/chat` response contract, the streaming variant needs a documented note — Tu approval required.
- `design.md` (LOCKED): the stage-streaming loading pattern may belong in the motion/loading contract — Tu approval required.
- `docs/architecture/code-ownership-map.md` (not locked): extend `streaming.ts` note to job/session-scoped progress.

## 9. Limitations / honesty

- Latency numbers are **config budgets, not measured** — capture real device numbers in Phase 4.4.
- The audit did not read every handler (confirm path, `advisory.ts`); the plan assumes the chat estimate path in §1 is representative — Phase 0.3 must confirm.
- Edge wall-clock tolerance for long SSE is **assumed** until the Phase 3.0 spike proves it.
- **Worker-side Kael IS covered** by Part B (§3B). The functional audit (`docs/architecture/kael-worker-functional-audit-20260604.md`) confirmed: only scope-change is a real LLM wait; the worker brief is **deterministic** (`buildWorkerBriefOutput` is sync/no-await — not a `callAI` wait); the "worker chatbot" was a canned stub. So Part B builds a bounded advisory worker Kael chat (B-FUNC) + worker perceived-perf (B-PERF). *(This supersedes an earlier draft limitation note that wrongly marked worker out-of-scope and called the worker brief a `callAI` wait.)*
