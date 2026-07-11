# Structures Spoke - Agentic Coordination Workflow

> Extracted from `STRUCTURES.md` section 9A after the #70 stack-unification work. Load this spoke for Case Work phase-gated reveal, saved-worker direct re-booking, dual chat, pre-arrival scope-change timing, and payment-confirm gating. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## Agentic Coordination Workflow (Case Work)

Kael runs the customer and worker journeys as one agentic coordination process ("Case Work"): Basic Intake and worker proposals flow through Kael, which analyzes, prices, validates, and notifies both sides at defined intersection ("giao thoa") points. This section is the current workflow truth. Older architecture process maps are historical support material and must be reconciled to this updated phase/gate contract before implementation. Frontend and backend cooperate at giao thoa points, and the backend always drives the phase.

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
|- route collects Basic Intake only: service + location + desired time + short description + optional chips/media
|- Basic Intake is pushed into Kael Case Work; Kael selects one service performance profile and shows its live process + analysis (stage stream)
|- Kael asks exactly one focused question per turn and updates the diagnosis/scope artifact until quote-ready
|- analysis may accept photos, editable on-device voice transcript, and 1-3 locally extracted video frames; raw audio/video never reaches an AI provider
|- if the customer has questions -> tap "yêu cầu chỉnh sửa" -> opens a Case Work chat to revise the offer with Kael
|- Kael produces an evidence-backed offer; customer explicitly confirms it before matching
|- worker search runs; an accepting worker is a candidate, not a final assignment
|- customer explicitly confirms the proposed worker before exact-address release, final match, or on-the-way state
|- main-flow screens: matching -> candidate confirmation -> location/ETA -> live job alert -> job in progress
|- any scope change stops for explicit customer confirmation
|- worker completes -> customer explicitly confirms done -> payment phase appears -> customer pays through an implemented rail
|- review + optional note; if happy -> Kael suggests "⭐ lưu thợ" -> that worker becomes the customer's "chuyên gia riêng" (personal expert)
|- re-booking a saved worker runs full Case Work but targets that worker first; both worker acceptance and customer candidate confirmation still apply
```

#### Worker Case Work Flow

```text
Worker Case Work
-
|- offers appear in the "Công việc" board (free slots + matching jobs + accept)
|- accept a job -> worker becomes a candidate and waits for customer confirmation
|- after customer confirmation, the job is pushed into worker Case Work (normal chat + Case Work chat) and exact address may be revealed
|- to add info or propose a more-optimal plan -> "điều chỉnh" button (next to "xem chi tiết")
|- Kael validates the proposal and computes any price change -> customer explicitly confirms before changed work continues (central giao thoa)
|- worker arrives -> does the work -> submits completion evidence -> customer confirms completion -> payment proceeds
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
| 1 | Basic Intake | service, location, desired time, short description, optional chips/media | `draft` | privacy-safe multimodal capture |
| 2 | Kael analyzing | live agentic trace + one focused question + evidence input; no offer yet | `analyzing` (+ `kael_progress` jsonb) | #1 (stream) |
| 3 | Offer confirmation | diagnosis/scope + estimate + "confirm" + "yêu cầu chỉnh sửa" | `estimate_ready` -> `awaiting_customer_confirm` | hard gate |
| 3b | Edit (optional) | Case Work chat panel | (unchanged; analysis chat turns) | #2 |
| 4 | Matching | matching status (or saved-worker target) | `broadcasting` | starts only after offer confirm |
| 5 | Candidate confirmation | proposed worker card + trust signals + confirm/decline | `worker_candidate_pending` | hard gate |
| 6 | Matched | confirmed worker card | `worker_matched` | exact address may now be released |
| 7 | On the way | map / real ETA / live alert | `worker_on_way` | no fabricated ETA |
| 8 | Arrived | arrived state | `arrived` | — |
| 9 | In progress | progress + worker actions | `inspecting` / `repairing` | — |
| 10 | Scope change | old/new scope, Kael-computed delta, confirm/reject/appeal | `scope_change_pending` | hard gate |
| 11 | Completion confirmation | completion evidence + confirm/dispute | `completed_by_worker` -> `confirmed_by_customer` | hard gate |
| 12 | Payment | real available payment rail + explicit pay/verified result | `payment_pending` -> `paid` | hard gate |
| 13 | Review | review form + ⭐ lưu thợ suggestion | `reviewed` | — |

#### Giao Thoa (Intersection) Points

```text
Giao thoa (FE + BE together)
-
|- 1 Basic Intake -> Kael: FE sends the minimum fields plus privacy-safe evidence; BE runs the selected profile; FE streams the agentic trace and one-question-at-a-time analysis
|- 2 "Request edit" -> chat -> revise offer: offer state <-> conversation stay in sync; a chat turn can change the offer
|- 3 Offer confirm -> matching: customer confirmation is persisted and audited before the validated matching transition
|- 4 Worker accepts -> candidate confirm: BE holds the candidate; FE shows trust evidence; customer confirm/decline controls final assignment
|- 5 Worker "điều chỉnh" -> Kael validates -> customer confirms: BE recomputes (Kael price authority), FE updates BOTH worker and customer views; changed work stays blocked
|- 6 ⭐ save worker -> targeted re-book: BE targets the saved worker first, then still requires worker acceptance and customer candidate confirmation
|- 7 Completion confirm -> payment: customer completion confirmation is persisted before the real payment phase can open
```

#### Agentic Coordination Decisions (Tu, updated 2026-07-11)

```text
Decisions
-
|- D-A re-book saved worker = full Case Work and target that worker first; worker accepts/declines, customer confirms the candidate, then fallback behavior follows the matching policy
|- D-B every money- or work-impacting pre-arrival/on-site scope change is a hard customer-confirmation gate; no amount threshold may auto-apply it
|- D-C completion confirmation precedes payment: worker submits evidence -> customer confirms/disputes -> validated completion decision -> payment phase -> explicit pay/verified callback
|- D-D chat dual-mode scope confirmed (normal = always-on general; Case Work = per active deal/job; edit buttons open Case Work chat)
|- D-E Basic Intake stays lightweight; all deeper service-specific questioning happens in Kael Case Work, one focused question per turn until quote-ready
|- D-F raw voice never leaves the device and raw video never goes to an AI provider; voice becomes editable on-device text and video becomes 1-3 local frames, while an original video may remain private human evidence
```

#### Agentic Workflow Backend Deltas

```text
Reuse vs new
-
|- extend: Basic Intake -> six-profile Kael pipeline -> versioned diagnosis/scope artifact -> clarification loop -> evidence-backed offer
|- extend: private photo access + editable voice transcript + extracted video-frame evidence; raw audio/video excluded from model input
|- reuse: worker-proposes-plan + Kael owns price computation = existing scope-change + kael_final_price_authority, with explicit customer confirmation before mutation
|- reuse: broadcast/accept (job_broadcasts, accept_broadcast_atomic); completion/confirm/review; dual chat tables; notifications
|- NEW candidate-confirmation state between worker acceptance and final match; exact address/on-the-way remain blocked until customer confirmation
|- NEW favorite_workers (customer_id, worker_id, created_at) + targeted-worker branch (accept/decline, customer confirm, policy fallback)
|- NEW pre-arrival adjust state reconciled with on-site scope-change into one timing-parameterized, customer-confirmed mechanism (D-B)
|- NEW completion-before-payment gating: customer completion confirmation and validated decision open the payment phase; only implemented rails may mark paid
|- NEW chat dual-mode contract: formalize normal-vs-case-work scoping + the "edit/adjust -> Case Work chat" trigger
|- notifications: "Kael hỗ trợ nhận việc" surfaced via notifications (placement rule, not a new flow)
```

These backend deltas (six performance profiles, versioned diagnosis/scope, candidate confirmation, favorite-worker targeting, unified scope change, completion-before-payment gating, and one contract source at every giao thoa) must be implemented as one coordinated Edge/shared/mobile workflow. Do not split mobile surfaces for these flows twice.

#### Agentic Workflow Open Questions (Not Yet Decided)

```text
Open — do NOT treat as decided
-
|- OQ-B favorite fallback UX: when a saved worker declines/unavailable, does Kael auto-broadcast or ask the customer first?
|- OQ-C express re-book: D-A keeps full Case Work — confirm we do NOT add a lighter express path for repeat workers (keep one path for now)
|- OQ-D payment rail availability/protection copy remains implementation-dependent; do not display or simulate an unavailable rail
|- OQ-A is RESOLVED: all work/money-impacting scope changes require explicit customer confirmation; no amount threshold bypasses the gate
```

---
