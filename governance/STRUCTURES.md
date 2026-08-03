# NestScout App Structures

This file is the single source of truth for NestScout product workflow, app operation, and build direction.

AI coding agents MUST read this file before implementing frontend, backend, database, AI, admin, worker, customer, or workflow logic. This file describes the full app operation, but implementation still follows the current approved phase. It is a blueprint, not permission to build every future capability immediately.

**§1.5 is the exception: it is a status report, not a blueprint.** Read it to learn what already runs before proposing to build anything.

If this file conflicts with `RULES.md`, `critical.md`, or Tu's current instruction, stop and ask Tu for a decision before implementation.

---

## 0. How To Use This File

Use this file to answer:

- What product are we building?
- **Where is the product actually today, and what is still a plan?** -> §1.5
- Which services are in scope?
- How does the customer workflow run?
- How does the worker workflow run?
- What does Kael do?
- What must the backend support before frontend screens can work?
- Which state machines must frontend/backend share?
- What must not be built yet?

Rules for AI agents:

- Treat this file as the workflow source of truth.
- Do not invent new product flows that are not represented here.
- Do not convert Next.js into the consumer web product.
- React Native is the primary app surface.
- Next.js exists for backend, admin, and prototypes only.
- User-facing app text must be Vietnamese.
- Technical implementation notes may be English.
- Every money-impacting transition must be backed by a validated server-side decision, audit trail, and appeal/override path.
- Every workflow step must have loading, empty, error, success, and retry considerations when implemented.

Current phase note:

```text
The file may describe full app operation.
Implementation must still be phase-controlled.
The approved service scope is the six-service catalog in §1; do not expand beyond it or add multi-city workflows without Tu's explicit approval.
```

---

## 1. Product Identity And Hard Scope

NestScout is a mobile-first home repair platform for HCMC apartment residents.

Current service scope:

```text
Supported now
-
|- Electrical repair
|- Plumbing repair
|- Home cleaning / housekeeping
|- Air conditioning and indoor air service
|- Sofa, mattress, curtain, and carpet care
|- Minor repair and installation
|- HCMC apartments
|- Customer-to-worker matching
|- Basic Intake at the service route, then Kael Case Work for diagnosis/scope, price check, worker brief, matching, and support
```

Canonical service identifiers and Kael performance profiles:

```text
electrical -> electric_diagnose
plumbing -> water_diagnose
cleaning -> clean_scope
hvac -> air_scope
upholstery -> fabric_scope
handyman -> task_scope
```

The six profiles share one server-side Case Work spine and one phase contract. Each profile owns service-specific quote drivers, safety/capability checks, evidence guidance, completion checks, and scope-change triggers; it is not a separate client-side questionnaire or an uncontrolled collection of autonomous agents.

Out of scope now:

```text
Not supported now
-
|- Appliance repair
|- Services outside the six approved categories
|- Multi-city expansion
|- Autonomous actions from raw AI output or client-side UI
|- Payment provider execution beyond implemented rails
|- Uncontrolled multi-agent orchestration outside the validated Case Work spine
|- Consumer web app
```

If a user asks for an unsupported service, Kael must politely decline:

```text
Current meaning:
"Yêu cầu này hiện chưa thuộc phạm vi NestScout. NestScout đang hỗ trợ sửa điện, sửa nước, vệ sinh nhà cửa, điều hòa và không khí, sofa/nệm/rèm/thảm, cùng sửa vặt và lắp đặt nhỏ."
```

Kael today:

```text
Kael = phase-gated Agentic Case Work
-
|- receives Basic Intake: service, location, desired time, short description, and optional privacy-safe evidence
|- identifies the applicable service profile and builds a structured diagnosis/scope artifact
|- asks exactly one focused question per turn until the case is quote-ready
|- analyzes photos, editable on-device voice transcripts, and 1-3 locally extracted video frames
|- estimates a market price range only when validated baseline/market evidence exists
|- explains uncertainty
|- pauses for customer offer confirmation before starting matching
|- prepares worker pre-brief and searches verified, service-capable workers
|- pauses for customer confirmation of a proposed worker before final assignment
|- mediates explicit scope-change, completion, and payment confirmation gates
```

Kael is not:

```text
Kael is not
-
|- a raw-LLM status writer
|- a client-side money/payment actor
|- an unverified payment executor
|- a worker punishment system
|- a generic repair chatbot
|- a service expansion engine
```

---

## 1.5 Where The Product Actually Is

**Updated to PR #145 — 2026-08-03 (commit `4f392953`). Merged range: #1 -> #145, 142 PRs.**

§1 above and §5–§21 below describe the intended product. This section describes what exists today. When the two disagree, this section is the fact and the rest is the target.

Status vocabulary — every claim is anchored to the PR that delivered it, so `git log --pretty="%s" | grep "#<n>"` verifies it:

```text
RUNNING (#n)              - code exists and is covered by tests or a recorded run
PARTIAL (#n, missing X)   - code exists, the gap is named
NOT BUILT                 - blueprint only, no runtime code
```

Surface counts at this milestone: 21 Expo Router route files, 97 `mobile-api` route kinds across 13 groups, 94 tables + 7 views + 111 RPCs over 208 migrations, 5 Edge functions. Test files: 279 in `apps/api`, 24 in `packages/shared`, 106 mobile suites (1026 tests).

| Capability | Status |
|---|---|
| Auth, profile, account lifecycle | RUNNING (#10 foundation, #126 simplified registration, #143 auth hardening, #139 account deletion) |
| Six-service taxonomy + Basic Intake | RUNNING (#110 six-service Case Work foundation) |
| Kael Case Work pipeline (intent -> knowledge -> baseline -> synthesis) | RUNNING (#37 pipeline/orchestrator, #84 agentic harness, #142 agentic production flow, #144 layer split) |
| Kael provider layer: routing, circuit breaker, spend budget, batching | RUNNING (#37 `routing.config.ts`, #138 role-based subfolders) |
| Job lifecycle + state machine | RUNNING (#7 workflow alignment; 29 job route kinds) |
| Matching + broadcast (atomic accept, retry claims) | RUNNING (#7, #144 `domains/matching`) |
| Chat, media evidence, realtime | RUNNING (#29 realtime; `chat_messages`, `job_media_assets`, `evidence_snapshots`) |
| Scope change (request -> command -> effect) | RUNNING (#7 tables; worker propose + customer decide routes) |
| Completion + review | RUNNING (`reviews`, confirm-completion route) |
| Dispute (open, counter-statement, admin decision) | RUNNING (#37 dispute case tables) |
| Kael evidence-gated learning | RUNNING (#7 candidate tables, #124 loop learning + `kael-learning-monitor`) |
| Notifications + push tokens | RUNNING (`device_push_tokens`, 4 notification route kinds) |
| Worker self-service: register, verification upload, availability | PARTIAL (#109 availability guard) — admin approval happens outside the app |
| Admin controls | PARTIAL (#29 dashboard) — the 8 admin endpoints cover Kael learning candidates, A/B price synthesis, and market-cache invalidation only. Worker approval, job review, price-baseline management, dispute review, and taxonomy management from §3 are NOT BUILT |
| Payments | PARTIAL (#135 SePay VietQR intent + webhook, #139 cash confirm + commission ledger) — no real transaction has been processed |
| Worker map | NOT BUILT as a real map. #66 shipped `map-proxy-spike` and it is still a spike; `apps/mobile` has no map SDK dependency, so the worker map surfaces are SVG |
| Actor stats / gamification | NOT WIRED. #70 created `worker_stats`, `customer_stats`, and the `worker_overview` / `customer_overview` views, but nothing calls `private.recompute_all_actor_stats()` and no Edge code reads the views |
| Consumer web app | NOT BUILT — deliberately out of scope per §1 |

Known-unverified at this milestone. State these plainly; do not let a green JS gate stand in for them:

```text
Expo SDK 54 -> 57 (#132)  - JS gates green (type-check + 1026 mobile tests). Never run on a
                            real device or simulator from this repo.
Payment rails (#135,#139) - code and tests only. No money has moved.
Store readiness           - no TestFlight or Play internal validation recorded.
```

Refreshing this section: run `git log 4f392953..HEAD --pretty="%s" | grep -E "^#"` to get the new PRs, re-check the rows they touch, and move the milestone line to the newest PR.

---

## 2. Competitor-Derived Product Principles

We learn from apps that already operate in home services, but we do not copy their full complexity. bTaskee, JupViec, Rada, 246SHOME, Urban Company, and Taskrabbit are references for product patterns, not the product spec.

Adopt these patterns:

```text
Good patterns to adopt
-
|- fast booking path
|- transparent estimate before booking
|- worker verification and profile trust
|- clear audit, override, and appeal paths for money-impacting actions
|- in-app chat as the source of truth
|- photo/video evidence before and after job
|- rating and feedback loop
|- support/admin review path
|- cancellation and rebooking handling
|- worker earning transparency
|- customer sees enough trust signals before accepting service
```

Avoid these patterns:

```text
Bad patterns to avoid
-
|- overloaded service catalog
|- unclear address handling
|- hidden price changes
|- scope change without Kael policy decision, evidence, and appeal path
|- weak support resolution
|- no transaction evidence trail
|- slow, heavy, confusing app flow
|- too many user decisions before the first useful estimate
|- pretending price is exact when it is only an estimate
```

Product principle:

```text
Copy the validated shape.
Remove what is heavy or unclear.
Adapt it to the six approved services and the same phase-gated Case Work contract.
Keep the path to the first real transaction short.
```

---

## 3. App Roles And Surfaces

### Customer

The customer is an HCMC apartment resident who needs one of the six supported services, wants a fair evidence-backed estimate, and wants a trustworthy worker.

Customer app responsibilities:

```text
Customer app
-
|- collect Basic Intake only: service, location, desired time, short description, and optional media
|- hand the case to Kael for one-question-at-a-time analysis
|- show the structured Kael diagnosis/scope and estimate
|- collect explicit offer and proposed-worker confirmation
|- show Kael orchestration and audit trail
|- show worker match
|- support in-app chat
|- provide scope-change evidence and explicit confirmation/appeal
|- provide completion evidence and explicit confirmation/appeal
|- show payment only when an implemented rail and real payment state exist
|- collect review
```

### Worker

The worker is a verified service provider approved manually by admin.

Worker app responsibilities:

```text
Worker app
-
|- register and submit verification
|- upload identity/selfie files into the private worker-verification storage box
|- toggle availability
|- receive incoming job request
|- accept or skip within countdown
|- view full job details after accept
|- update job status
|- chat with customer
|- report scope change
|- submit completion evidence
|- view earnings
```

### Admin

Admin is the operational control surface. Admin does not need to handle every learning event, but must be able to review, override, and roll back high-risk outcomes.

Admin responsibilities:

```text
Admin panel
-
|- approve workers
|- review jobs
|- manage price baselines
|- inspect AI logs and failures
|- monitor scope changes
|- review support/disputes
|- manage service taxonomy
|- view and roll back learned Kael rules
```

### Kael

Kael is the AI reasoning layer for price checking, problem analysis, clarification, worker pre-briefs, and evidence-gated self-learning.

Kael responsibilities:

```text
Kael
-
|- classify intent
|- enforce service scope
|- select the service performance profile
|- analyze privacy-safe text/media and build the diagnosis/scope artifact
|- ask one focused question per turn until quote-ready
|- search market price only when a source-backed lookup is available
|- synthesize a structured estimate or an honest not-ready state
|- stop at offer, proposed-worker, scope-change, completion, and payment gates
|- create advisory only when justified
|- generate worker pre-brief
|- explain scope change
|- learn from completed jobs through evidence gates
```

### Support / Operator

Support may be handled by admin initially.

Support responsibilities:

```text
Support
-
|- investigate disputes
|- inspect chat/evidence
|- handle worker no-show
|- help with failed payment
|- help with failed matching
|- review flagged fraud or overcharge patterns
```

---

## 4. Build Order Blueprint

Build backend foundations before frontend polish. Screens without state machines and backend contracts create fragile code.

Recommended build order, with the status each item has reached at PR #145 (detail and evidence: §1.5):

```text
Foundation order                                 Status at #145
-
|- 1.  Auth + profiles                           RUNNING (#10, #126, #143)
|- 2.  Service taxonomy                          RUNNING (#110)
|- 3.  Price baselines                           PARTIAL (#7) - read path only; no in-app
|                                                write/management surface
|- 4.  Kael AI wrapper + output schemas           RUNNING (#37, #84, #142)
|- 5.  Job lifecycle                             RUNNING (#7)
|- 6.  Customer price-check flow                 RUNNING (#110, #142) - 13 kael.* route kinds
|- 7.  Worker verification + availability         PARTIAL (#109) - approval is manual, outside
|                                                the app
|- 8.  Matching + broadcast                      RUNNING (#7, #144)
|- 9.  Chat + evidence                           RUNNING (#29)
|- 10. Scope change                              RUNNING (#7)
|- 11. Completion + review                       RUNNING (#7)
|- 12. Admin controls                            PARTIAL (#29) - Kael learning only; 5 of the 6
|                                                §3 admin duties NOT BUILT
|- 13. Learning candidates and evidence gates     RUNNING (#7, #124)
|- 14. Payments integration later                PARTIAL (#135, #139) - no real transaction
```

The order above is still the dependency order for anything new. Items marked PARTIAL are the honest frontier: they are where the next backend work belongs, not the RUNNING rows.

Frontend should follow stable backend contracts:

```text
Frontend build order
-
|- Customer auth/profile
|- Customer home
|- Six-service Basic Intake
|- Kael one-question-at-a-time analysis + diagnosis/scope artifact
|- Kael estimate + customer offer confirmation
|- Searching/matching status
|- Proposed-worker confirmation
|- Active job
|- Scope-change confirmation
|- Completion confirmation
|- Implemented payment rail
|- Review
|- Worker app surfaces
|- Admin panel surfaces
```

Backend-first rule:

```text
If a screen needs persistent state, permissions, or AI output,
define the backend contract before building final UI.
```

---

## Detailed Contracts (spokes)

§5–§21 are extracted into `governance/structures/*` for progressive disclosure. Load only the spoke your task needs; each spoke keeps its original section number. The hub above (§0–§4) plus this table is enough to navigate.

| § | Domain | Spoke |
|---|---|---|
| 5 | Six-service taxonomy and performance-profile mapping | [`structures/service-taxonomy.md`](structures/service-taxonomy.md) |
| 6 | Customer workflow (A0–A14) | [`structures/customer-workflow.md`](structures/customer-workflow.md) |
| 7 | Worker workflow (B0–B8) | [`structures/worker-workflow.md`](structures/worker-workflow.md) |
| 8 | Admin workflow | [`structures/admin-workflow.md`](structures/admin-workflow.md) |
| 9 | Kael workflow | [`structures/kael-workflow.md`](structures/kael-workflow.md) |
| 9A | Agentic coordination workflow / Case Work | [`structures/agentic-coordination-workflow.md`](structures/agentic-coordination-workflow.md) |
| 10 | Kael evidence-gated self-learning | [`structures/kael-learning.md`](structures/kael-learning.md) |
| 11 | Backend domain model | [`structures/backend-domain-model.md`](structures/backend-domain-model.md) |
| 12 | State machines | [`structures/state-machines.md`](structures/state-machines.md) |
| 13 | Matching & broadcast rules | [`structures/matching-broadcast.md`](structures/matching-broadcast.md) |
| 14 | Trust, safety & evidence | [`structures/trust-safety-evidence.md`](structures/trust-safety-evidence.md) |
| 15 | Pricing, fees & scope change | [`structures/pricing-fees-scope.md`](structures/pricing-fees-scope.md) |
| 16 | Notifications | [`structures/notifications.md`](structures/notifications.md) |
| 17 | Cancellation, reschedule & failure recovery | [`structures/cancellation-recovery.md`](structures/cancellation-recovery.md) |
| 18–20 | Frontend / backend / testing build contracts | [`structures/build-contracts.md`](structures/build-contracts.md) |
| 21 | Do not build now | [`structures/do-not-build-now.md`](structures/do-not-build-now.md) |

---

## 5. Service Taxonomy

> Moved to [`structures/service-taxonomy.md`](structures/service-taxonomy.md). Six-service taxonomy, Case Work profile mapping, and taxonomy rules.

## 6. Customer Workflow

> Moved to [`structures/customer-workflow.md`](structures/customer-workflow.md). Step contract + customer workflow illustration + A0–A14.

## 7. Worker Workflow

> Moved to [`structures/worker-workflow.md`](structures/worker-workflow.md). Worker workflow illustration + B0–B8.

## 8. Admin Workflow

> Moved to [`structures/admin-workflow.md`](structures/admin-workflow.md). Admin workflows and human control points.

## 9. Kael Workflow

> Moved to [`structures/kael-workflow.md`](structures/kael-workflow.md). Kael artifact lifecycle, price-check flow, AI provider roles, structured output.

## 9A. Agentic Coordination Workflow

> Moved to [`structures/agentic-coordination-workflow.md`](structures/agentic-coordination-workflow.md). Case Work phase-gated reveal, saved-worker direct re-booking, dual chat, pre-arrival scope timing, payment-confirm gating, and giao thoa points.

## 10. Kael Evidence-Gated Self-Learning System

> Moved to [`structures/kael-learning.md`](structures/kael-learning.md). MarketMemory + CaseReview, evidence gate, learned-rule example, forbidden effects (10A–10F).

## 11. Backend Domain Model

> Moved to [`structures/backend-domain-model.md`](structures/backend-domain-model.md). Backend modules, module contracts, and backend hard rules.

## 12. State Machines

> Moved to [`structures/state-machines.md`](structures/state-machines.md). Job / broadcast / scope / verification / payment / learning / notification state machines.

## 13. Matching And Broadcast Rules

> Moved to [`structures/matching-broadcast.md`](structures/matching-broadcast.md). Worker eligibility, broadcast behavior, pre-accept visibility, failure rules.

## 14. Trust, Safety, And Evidence

> Moved to [`structures/trust-safety-evidence.md`](structures/trust-safety-evidence.md). Trust signals, worker verification, evidence trail, chat conduct, PII rules.

## 15. Pricing, Fees, And Scope Change

> Moved to [`structures/pricing-fees-scope.md`](structures/pricing-fees-scope.md). Pricing principles, fees/commission, scope-change flow, forbidden pricing behavior.

## 16. Notifications

> Moved to [`structures/notifications.md`](structures/notifications.md). Customer / worker / admin notification events and rules.

## 17. Cancellation, Reschedule, And Failure Recovery

> Moved to [`structures/cancellation-recovery.md`](structures/cancellation-recovery.md). Failure recovery, cancellation moments, reschedule, dispute flow.

## 18. Frontend Build Contract

> Moved to [`structures/build-contracts.md`](structures/build-contracts.md). Frontend contract, implementation ownership, navigation, screen + mobile rules.

## 19. Backend Build Contract

> Moved to [`structures/build-contracts.md`](structures/build-contracts.md). Backend contract, server responsibilities, client-forbidden list, idempotency.

## 20. Testing Blueprint

> Moved to [`structures/build-contracts.md`](structures/build-contracts.md). Testing layers, workflow test areas, critical / security / AI test cases.

## 21. Do Not Build Now

> Moved to [`structures/do-not-build-now.md`](structures/do-not-build-now.md). Over-engineering boundary, allowed-in-docs, Kael learning exception, current priority.
