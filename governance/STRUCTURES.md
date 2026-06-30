# Home Services App Structures

This file is the single source of truth for Home Services product workflow, app operation, and build direction.

AI coding agents MUST read this file before implementing frontend, backend, database, AI, admin, worker, customer, or workflow logic. This file describes the full app operation, but implementation still follows the current approved phase. It is a blueprint, not permission to build every future capability immediately.

If this file conflicts with `RULES.md`, `critical.md`, or Tu's current instruction, stop and ask Tu for a decision before implementation.

---

## 0. How To Use This File

Use this file to answer:

- What product are we building?
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
Do not build future autonomy, service expansion, or multi-city workflows without Tu's explicit approval.
```

---

## 1. Product Identity And Hard Scope

Home Services is a mobile-first home repair platform for HCMC apartment residents.

Current service scope:

```text
Supported now
-
|- Electrical repair
|- Plumbing repair
|- Home cleaning / housekeeping
|- HCMC apartments
|- Customer-to-worker matching
|- Kael-first AI intake, diagnosis, price check, worker brief, and support
```

Out of scope now:

```text
Not supported now
-
|- AC repair
|- Appliance repair
|- General handyman marketplace
|- Multi-city expansion
|- Autonomous actions from raw AI output or client-side UI
|- Payment provider execution beyond implemented rails
|- Multi-agent orchestration
|- Consumer web app
```

If a user asks for an unsupported service, Kael must politely decline:

```text
Current meaning:
"We currently only support electrical repair, plumbing repair, and home cleaning. Please come back when we open more services."
```

Kael today:

```text
Kael = AI Price Check + camera-based problem understanding
-
|- receives customer text/photos/videos
|- identifies likely electrical/plumbing/cleaning problem
|- asks clarification when needed
|- estimates market price range
|- explains uncertainty
|- prepares worker pre-brief and starts matching when policy has enough evidence
|- mediates scope-change explanation
```

Kael is not:

```text
Kael is not
-
|- a raw-LLM status writer
|- a client-side money/payment actor
|- a payment agent
|- a worker punishment system
|- a multi-specialist orchestrator
|- a generic repair chatbot
|- a service expansion engine
```

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
Adapt it to electrical/plumbing/cleaning Price Check.
Keep the path to the first real transaction short.
```

---

## 3. App Roles And Surfaces

### Customer

The customer is an HCMC apartment resident who needs electrical, plumbing, or home cleaning help, wants a fair price estimate, and wants a trustworthy worker.

Customer app responsibilities:

```text
Customer app
-
|- collect problem description and media
|- show Kael estimate
|- show Kael orchestration and audit trail
|- show worker match
|- support in-app chat
|- provide scope-change evidence/override/appeal
|- provide completion evidence/appeal
|- support payment placeholder
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
|- analyze text/media
|- search market price
|- synthesize structured estimate
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

Recommended build order:

```text
Foundation order
-
|- 1. Auth + profiles
|- 2. Service taxonomy
|- 3. Price baselines
|- 4. Kael AI wrapper + output schemas
|- 5. Job lifecycle
|- 6. Customer price-check flow
|- 7. Worker verification + availability
|- 8. Matching + broadcast
|- 9. Chat + evidence
|- 10. Scope change
|- 11. Completion + review
|- 12. Admin controls
|- 13. Learning candidates and evidence gates
|- 14. Payments integration later
```

Frontend should follow stable backend contracts:

```text
Frontend build order
-
|- Customer auth/profile
|- Customer home
|- Service/problem selection
|- Problem description/media
|- Kael estimate
|- Kael orchestration decision
|- Searching/matching status
|- Active job
|- Scope change
|- Completion/review
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
| 5 | Service taxonomy (electrical / plumbing / cleaning) | [`structures/service-taxonomy.md`](structures/service-taxonomy.md) |
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

> Moved to [`structures/service-taxonomy.md`](structures/service-taxonomy.md). Electrical / plumbing / cleaning taxonomy + taxonomy rules.

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
