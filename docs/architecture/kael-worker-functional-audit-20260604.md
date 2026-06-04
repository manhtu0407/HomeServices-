# Kael Worker-Side Functional Audit

Date: 2026-06-04
Status: audit result for Tu — decides whether to build a conversational worker-Kael agent. Evidence-cited, verified in code.
Surface: Supabase Edge `mobile-api` + worker mobile (`apps/mobile/components/worker/worker-surfaces.tsx`)

Purpose: answer "what is Kael, functionally, on the worker side — what is real LLM, what is deterministic, what is a stub, what is missing." Triggered by Tu's note that worker-Kael is the deal-giver / orchestrator / negotiator and the worker Kael chatbot is critical.

## Decisive fact — the entire Kael LLM surface

Every `callAI()` call site in the whole Kael codebase (`supabase/functions/mobile-api/_shared/**`):

- Customer estimate pipeline: `intent.ts:62`, `intent.ts:175`, `vision.ts:62`, `market.ts:150`, `price-synthesis-ab.ts:88`.
- Worker scope-change: `scope-change.ts:25` (`reviewScopeChange`), `scope-change.ts:82` (`computeScopeChangeEstimate`).

That is all. **The only worker-facing LLM is scope-change.** Everything else Kael does for workers is deterministic code.

## The three pillars (Tu's framing), verified

### 1. Giao deal — dispatch / handoff: BUILT, deterministic, functional
- Matching → broadcast → accept → worker brief. Brief = `buildWorkerBriefOutput` called **synchronously, no `await`** (`services.ts:700, 2408, 3066`) → deterministic card: problem summary, full address released **after accept** (`persistWorkerBriefGuidanceAfterAccept`, `services.ts:3046`), estimated earnings = price × (1 − `PLATFORM_FEE_WORKER`).
- Not AI. No per-request LLM wait. The worker waits passively during matching/broadcast (orchestration), not on a generation.

### 2. Điều phối — orchestration / autonomy: BUILT, deterministic policy, wired
- `buildKaelAutonomyDecision` is used at 28+ sites across the lifecycle (`services.ts` broadcast/match/scope/completion/cancellation). Each produces a structured decision (`action`, `policyId`, `evidence[]`, `confidence`, `reversible`, `appealable`, `resulting_event`), is checked by `validateKaelAutonomyTransition`, drives an **atomic RPC** (e.g. `decide_scope_change_atomic`), and is evidence-logged via `logJobEvent`. This is the real "Kael điều phối" — RULES-compliant (no raw LLM touches money state).
- Worker protection is real too: `detectDemandingCustomerPatterns` (`agentic/demanding-customer-detect.ts`, keyword + threshold pressure/escalation; one *soft* `llmSentiment` assist that can never trigger a hard stop alone), worker-cancel classification + no-show + abuse evaluation (`agentic/case-3-worker-cancel.ts`) → `kael_admin_queue` + `worker_kael_memory`.

### 3. Thương lượng khi worker bất mãn: mixed
- **Scope-change (the real one):** `requestScopeChange` (`services.ts:3396`) **awaits** `computeScopeChangeEstimate` (real `callAI` Anthropic ~4s, `maxRetries:0`) → anti-fraud/challenge/customer-card outputs → `tryAutoApproveScopeChange` (`services.ts:3666`, Kael auto-approves if confidence ≥ 0.55 and no fraud flag) **or** customer `decideScopeChange` (`services.ts:4380`) → `notifyWorkerScopeDecision`. **BUILT, real LLM, but FORM-based, not conversational.** Writes no `kael_progress` → no thinking-state today.
- **Worker "ask Kael" Q&A:** `askKaelForWorker` (`services.ts:3577`) → `buildWorkerKaelAnswer` (`services.ts:3641`) = **deterministic canned template**, capped 3×/job, no `callAI`. A stub.
- **Worker JobRoom "chat":** `WorkerChatSurface` (`worker-surfaces.tsx:1620`) → `useJobChatThread` → `POST /jobs/:id/messages` = **human worker↔customer messages, Kael-branded relay.** Not AI.
- **Conversational negotiation agent** (worker talks, Kael reasons/responds/negotiates): **MISSING.**

## Verdict

The worker-Kael **system** — dispatch, orchestration, autonomy, worker protection, scope-change negotiation — is **genuinely built and functional**, as deterministic rule/policy engines + a wired autonomy-decision layer + one LLM touchpoint (scope-change). It is not a stub overall.

What does **not** exist is a **conversational AI worker agent**. The worker experiences Kael as structured cards, policy decisions, and notifications — not a chat partner. The only thing branded as a "Kael chat" for workers is either human relay or a canned stub.

So: "is the worker Kael chatbot built?" → **No (it's a stub/relay).** "Is worker-Kael built?" → **Yes, as a structured system.**

## Parity matrix — customer Kael vs worker Kael (Tu's parity principle, 2026-06-04)

Tu's principle: anything the customer chatbot has, the worker chatbot must have too — adapted to role. Two layers behave very differently.

**Workflow / lifecycle layer — parity EXISTS (genuinely built for both).** `packages/shared/src/workflow/workflow-phase-context.ts` is role-aware (`WorkflowPhaseSectionRole = 'customer' | 'worker' | 'shared'`) with the full lifecycle (matching → worker_matched → on_way → on_site → scope_change → completion → review) and role-tagged sections; both `KaelChatSurface` and the worker surfaces consume the same `useServiceWorkflow`. (This corrects the earlier audit's under-emphasis.)

**Chatbot + Kael-capability layer — parity DOES NOT exist.**

| Capability | Customer | Worker | Gap |
|---|---|---|---|
| Multi-turn Kael chat session | ✅ `kaelChatService` create/list/get/sendTurn/confirm (`kael_chat_sessions`/`turns`) | ❌ only `POST /jobs/:id/kael-clarify` — 3×/job canned Q&A stub | build worker Kael session, role-adapted |
| Conversational UX (typewriter, clarification, voice mic, attach, local greeting, thinking-state) | ✅ | ❌ | missing |
| Chat history / archive | ✅ list sessions | ❌ | missing |
| Streaming / thinking-state | ❌ (Part A builds it) | ❌ (Part B) | both pending — in plan |
| Kael memory: read | ✅ `/me/kael-memory` | ✅ `/workers/me/kael-memory` | ok |
| Kael memory: delete (data right) | ✅ DELETE | ❌ | missing |
| Kael training consent | ✅ get/set `/me/kael-training-consent` | ❌ | missing |
| Kael feedback (rate Kael) | ✅ `/me/kael-feedback` | ❌ | missing |
| Kael charter | ✅ shared `/kael/charter` | ✅ shared | ok |

**Role adaptation (what does NOT copy 1:1):** the customer chat is a *price-check intake* (service → estimate → confirm booking). The worker has no booking/estimate intake; its Kael chat should be a **job-assist / negotiation-support** conversation scoped to the worker's accepted job(s) — explain the brief, answer job questions, guide the structured scope-change, safety. Money/scope still never leave the structured rails. So "parity" = same *capabilities* (multi-turn session, streaming, history, memory rights, consent, feedback), not the same *content*.

This matrix is the answer to "what's missing." Reaching it is larger than "upgrade the Q&A stub": it is a **worker Kael chat session system at capability-parity with the customer's, role-adapted** — which subsumes the bounded-advisory build (the advisory agent becomes the worker chat's response engine).

## Reuse assessment (for the core felt-parity build, Tu chose option 1)

Verified against the customer chat internals:
- **Schema is customer-bound, NOT role-flaggable safely.** `kael_chat_sessions` (`migrations/20260520130514_kael_chat_sessions.sql`) has `customer_id NOT NULL`, `service_type NOT NULL`, booking statuses (`estimate_ready`, `confirmed`), customer RLS; `kael_chat_turns.role` is `'customer'|'kael'|'system'` with booking content-types (`estimate`, `analysis`). Generalizing it to a polymorphic owner would migrate a live table + its RLS + all customer code — high regression risk for pre-revenue.
- **Handlers are booking-coupled but pattern-rich.** `createKaelChat`/`sendKaelChatTurn` (`services.ts:942+`) run `runKaelPipeline` (estimate) and `service_intake` semantics — not reusable directly, but the **scaffolding is**: idempotent re-POST (`client_request_id`), DB-backed rate-limit RPC (`check_kael_chat_rate`, 5/min·20/hr), session/turn lifecycle, cost tracking, `self-check`, charter.
- **Mobile `kael-chat/` is half reusable.** Reusable: thread render, thinking-state indicator, progressive text, composer, glass. Not reusable: estimate/booking/service-select/archive.

**Build shape (the better answer):** a **role-adapted sibling chat system** — new job-scoped `kael_worker_chat_sessions`/`turns` (worker RLS) that mirror the customer *design*, worker chat handlers modeled on the customer ones, a `worker_assist` advisory engine in place of `runKaelPipeline`, and extracted shared chat UI primitives. This reuses proven patterns, keeps the working customer chat untouched (survival/simplicity), and reaches felt parity. The bounded-advisory agent becomes the worker chat's response engine. Small capability endpoints (feedback, training-consent, memory-delete) are a fast-follow.

## Recommendation (survival-first)

For the first real transaction, the structured system is likely **enough**, and a money-affecting conversational worker agent is a large, risky build (a worker arguing with an LLM that can move money/scope state). If a worker chatbot is wanted, scope it safely:

- Upgrade `askKaelForWorker` from canned to a real `callAI` **advisory** assistant (new `worker_assist` purpose in `routing.config.ts`, guardrails per `kael-ai-boundary`, keep the 3×/job cap), that **explains the brief / answers job questions only** and has **zero autonomy authority** — all money/scope keeps flowing through the existing structured scope-change + `buildKaelAutonomyDecision` gates.
- Then perceived-performance (streaming/thinking-state) becomes meaningful for that advisory chat **and** for scope-change.

Do **not** build a conversational agent with money/scope authority. Keep money on the structured rails.

## Decision (Tu, 2026-06-04): option 2 — bounded advisory chatbot

Locked: build a **bounded advisory** worker-Kael chatbot — upgrade `askKaelForWorker` from canned template to a real `callAI` agent (new `worker_assist` purpose), advisory-only (explain brief, answer job questions, safety guidance), **zero autonomy authority** (never sets price/scope/status/money; redirects money/scope to the existing structured scope-change + `buildKaelAutonomyDecision` rails), keep the 3×/job cap. Then layer perceived-performance (thinking-state + token streaming) on this chat and on scope-change. Build + perceived-perf phases are specified in `docs/design/kael-perceived-performance-streaming-20260604.md` §3B (Part B).

Rejected: option 1 (no chatbot) and option 3 (conversational negotiator with money authority — unsafe, violates RULES #2/#8 spirit).

## Honesty / limits

- Verified by reading `scope-change.ts`, `services.ts` (`askKaelForWorker`, `buildWorkerKaelAnswer`, `requestScopeChange`, `decideScopeChange`, `tryAutoApproveScopeChange`, `persistWorkerBriefGuidanceAfterAccept`), `agentic/case-3-worker-cancel.ts`, `agentic/demanding-customer-detect.ts`, `worker-surfaces.tsx` (chat surface), and the full `callAI` grep.
- Not individually read: `agentic/case-1/2/4/5`, `permission-gate.ts`, `boundary-guard.ts` internals — inferred deterministic from the `callAI` grep (none call an LLM). Confirm if Tu wants the dispute/completion cases audited at the same depth.
