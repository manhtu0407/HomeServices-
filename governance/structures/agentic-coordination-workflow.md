# Structures Spoke - Agentic Coordination Workflow

> Extracted from `STRUCTURES.md` section 9A after the #70 stack-unification work. Load this spoke for Case Work phase-gated reveal, saved-worker direct re-booking, dual chat, pre-arrival scope-change timing, and payment-confirm gating. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## Agentic Coordination Workflow (Case Work)

Kael runs the customer and worker journeys as one agentic coordination process ("Case Work"): the customer's offer and the worker's proposals flow through Kael, which analyzes, prices, validates, and notifies both sides at defined intersection ("giao thoa") points. This section is the workflow-truth summary; the full process maps (Mermaid customer/worker journeys + money-state diagram) live in `docs/architecture/agentic-workflow-spec-20260616.md`. Recurring rule: frontend and backend cooperate at giao thoa points, and the backend always drives the phase.

#### Phase-Gated Reveal (appear in order, not all-at-once)

```text
Phase-gated reveal
-
|- each UI component is bound to a workflow phase
|- a component reveals only when the workflow ENTERS its phase, never earlier
|- the BACKEND drives the phase (workflow state); the FRONTEND renders only what the current phase allows
|- the frontend never forces a later phase's UI early
|- Kael's live agentic trace (analyzing -> vision -> market -> price) is itself a phased reveal (stage streaming), not a single dump
|- applies to customer Case Work, worker Case Work, and payment screens
```

Single source of truth for phase -> allowed components / actions / `artifact_mode`: `packages/shared/src/workflow/workflow-phase-context.ts` + `workflow-ui-rules.ts` + `JOB_STATUS_TO_WORKFLOW_PHASE`. The rebuild MUST render from this contract and must not self-invent component visibility ("render không tự chế").

#### Customer Case Work Flow

```text
Customer Case Work
-
|- open app -> login/register -> home -> choose service
|- provide the "offer": info + photos + video + voice + address + booking date
|- offer is pushed into Kael Case Work; Kael shows its live process + analysis (stage stream)
|- if the customer has questions -> tap "yêu cầu chỉnh sửa" -> opens a Case Work chat to revise the offer with Kael
|- customer confirms the offer Kael produced
|- main-flow screens: matching + AI score -> options -> quote -> location/ETA -> live job alert -> job in progress
|- worker arrives -> completes -> customer confirms done + pays
|- review + optional note; if happy -> Kael suggests "⭐ lưu thợ" -> that worker becomes the customer's "chuyên gia riêng" (personal expert)
|- re-booking a saved worker runs full Case Work but SKIPS broadcast (decision D-A)
```

#### Worker Case Work Flow

```text
Worker Case Work
-
|- offers appear in the "Công việc" board (free slots + matching jobs + accept)
|- select a job -> pushed into Kael Case Work (normal chat + Case Work chat)
|- to add info or propose a more-optimal plan -> "điều chỉnh" button (next to "xem chi tiết")
|- Kael validates the proposal; if genuinely better -> updates the price if needed -> notifies the customer BEFORE the worker arrives (central giao thoa)
|- worker arrives -> does the work -> confirms payment received (D-C) -> presses confirm done -> end
|- "Kael hỗ trợ nhận việc" lives in the "Thông báo" (notifications) section
|- worker receive-money + cash-flow view lives in the profile
```

#### Chat Dual-Mode

```text
Chat dual-mode
-
|- normal chat = always-on general assistant, NOT tied to a job
|- Case Work chat = per active deal/job, only shows when a case is running; uses case-scoped data/tools
|- "yêu cầu chỉnh sửa" (customer) / "điều chỉnh" (worker) open the Case Work chat
```

#### Phase -> Component -> Job Status Contract

The frontend reveals only the current phase's components; `jobs.status` is the real enum that drives the phase.

| # | Phase | FE reveals only | `jobs.status` | Giao thoa |
|---|---|---|---|---|
| 1 | Intake | service picker, media/voice/address/date form | `draft` | multimodal capture |
| 2 | Kael analyzing | live agentic trace (stage stream), no offer yet | `analyzing` (+ `kael_progress` jsonb) | #1 (stream) |
| 3 | Offer ready | estimate card + "confirm" + "yêu cầu chỉnh sửa" | `estimate_ready` -> `awaiting_customer_confirm` | actions from phase-context |
| 3b | Edit (optional) | Case Work chat panel | (unchanged; chat turns) | #2 |
| 4 | Matching | matching status + AI score (or direct-to-saved) | `broadcasting` | ⭐ direct skips broadcast |
| 5 | Matched | worker card | `worker_matched` | — |
| 6 | On the way | map / ETA / live alert | `worker_on_way` | — |
| 7 | Arrived | arrived state | `arrived` | — |
| 8 | In progress | progress + worker actions | `inspecting` / `repairing` | — |
| 9 | Plan/price adjust | delta >100k -> Kael applies + notice (audited/appealable); delta ≤100k -> suggestion -> customer opts in | `scope_change_pending` | #3 (D-B) |
| 10 | Completion | confirm-done + pay CTA | `completed_by_worker` -> `confirmed_by_customer` | #5 |
| 11 | Payment | pay state (digital auto / cash worker-confirm) | `payment_pending` -> `paid` | D-C |
| 12 | Review | review form + ⭐ lưu thợ suggestion | `reviewed` | — |

#### Giao Thoa (Intersection) Points

```text
Giao thoa (FE + BE together)
-
|- 1 Intake -> Kael: FE sends multimodal; BE runs the Kael pipeline; FE streams the agentic trace in real time
|- 2 "Request edit" -> chat -> revise offer: offer state <-> conversation stay in sync; a chat turn can change the offer
|- 3 Worker "điều chỉnh" -> Kael validates -> price update -> notify/approve customer: BE recomputes (Kael price authority), FE updates BOTH worker and customer views + a notification (bidirectional, the biggest giao thoa)
|- 4 ⭐ save worker -> direct re-book: BE direct-match (skip broadcast), FE shows saved workers, both sides connected directly
|- 5 Completion <-> payment <-> confirm: payment state gates the completion confirm (D-C)
```

#### Agentic Coordination Decisions (Tu, 2026-06-16)

```text
Decisions
-
|- D-A re-book saved worker = full Case Work, skip broadcast; worker still accepts/declines; fallback to broadcast if busy/declined
|- D-B worker pre-arrival plan adjustment, threshold = 100,000đ (INVERSE of the initial proposal):
|   |- Kael-validated price delta > 100,000đ -> Kael applies the change immediately (only when genuinely appropriate + calc is sound) and notifies the customer before arrival
|   |- delta ≤ 100,000đ -> Kael does NOT auto-change; it surfaces the suggestion and lets the customer decide (don't disrupt over a small amount)
|   |- safeguard: the >100k auto-change must be a server-validated, audited, transparent, reversible/appealable KaelAutonomyDecision (NOT a silent binding charge) — per the §0 money rule + CLAUDE.md Kael-autonomy rule
|   |- differs from on-site decide_scope_change_atomic (explicit accept/reject); the unified scope-change mechanism must branch by (timing + delta size)
|- D-C payment-confirm gating: digital = system knows payment happened, worker just marks done; cash = worker confirms "cash received" before done
|- D-D chat dual-mode scope confirmed (normal = always-on general; Case Work = per active deal/job; edit buttons open Case Work chat)
```

#### Agentic Workflow Backend Deltas

```text
Reuse vs new
-
|- reuse: intake + Kael pipeline (createJob -> intent -> vision -> baseline -> market -> synthesis)
|- reuse: worker-proposes-plan + Kael owns final price = existing scope-change + kael_final_price_authority (extend timing)
|- reuse: broadcast/accept (job_broadcasts, accept_broadcast_atomic); completion/confirm/review; dual chat tables; notifications
|- NEW favorite_workers (customer_id, worker_id, created_at) + a direct-booking branch in the state machine (target saved worker, accept/decline, fallback-to-broadcast)
|- NEW pre-arrival adjust state (after accept, before arrival) reconciled with on-site scope-change into ONE timing-parameterized mechanism (D-B)
|- NEW payment-confirm gating: couple the job money state with completion (worker "confirm done" requires payment-confirmed: digital auto / cash worker-confirm)
|- NEW chat dual-mode contract: formalize normal-vs-case-work scoping + the "edit/adjust -> Case Work chat" trigger
|- notifications: "Kael hỗ trợ nhận việc" surfaced via notifications (placement rule, not a new flow)
```

These backend deltas (favorite_workers + direct-rebook, the unified scope-change, payment-confirm gating, and one-contract-source at every giao thoa) belong to the #5 stack-unification build (Tracks C/S + §S4); see `docs/architecture/stack-unification-plan-20260616.md`. Do not split mobile surfaces for these flows twice.

#### Agentic Workflow Open Questions (Not Yet Decided)

```text
Open — do NOT treat as decided
-
|- OQ-B favorite fallback UX: when a saved worker declines/unavailable, does Kael auto-broadcast or ask the customer first?
|- OQ-C express re-book: D-A keeps full Case Work — confirm we do NOT add a lighter express path for repeat workers (keep one path for now)
|- OQ-D cash payment + protection: cash jobs have no money-protection (§S4) — confirm the UI clearly signals "cash = không có Bảo vệ thanh toán"
|- OQ-A is RESOLVED (threshold = 100,000đ; see D-B)
```

---
