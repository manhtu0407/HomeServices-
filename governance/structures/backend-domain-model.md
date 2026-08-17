# Structures Spoke - Backend Domain Model

> Extracted from `STRUCTURES.md` section 11 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for backend modules and their contracts. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 11. Backend Domain Model

Backend modules should be built as deep modules with clear interfaces and testable seams.

The module names below are **contract names, not file names**. Each one is keyed to the folder that actually implements it so a contract can be checked against the tree. Paths are relative to `supabase/functions/mobile-api/_shared/`; file counts are regenerated with `git ls-files <path> | wc -l`.

| Contract module | Implemented in | Notes |
|---|---|---|
| AuthProfileModule | Supabase Auth + `domains/customer/**` (9), `domains/worker/registration.ts` | identity is Auth's; the profile/account surface is split customer/worker |
| ServiceCatalogModule | `domains/catalog/catalog.ts` (1) | one file; the taxonomy itself lives in `packages/shared` |
| PriceBaselineModule | migrations + `kael/tools/**` read path | **no dedicated module** — read path only, no in-app write/management surface |
| KaelPriceCheckModule | `kael/pipeline/**` (16), `kael/tools/**` (9), `kael/agents/**` (20) | the Case Work spine |
| MarketMemoryService / CaseReviewService | `kael/learning/**` (32) | **not two separate modules** — both are roles inside the learning folder; do not go looking for files by these names |
| JobLifecycleModule | `domains/job/**` (34), `platform/lifecycle.ts`, `workflow-orchestrator.ts` | transition validity is `platform/`, not `domains/` |
| BroadcastMatchingModule | `domains/matching/**` (12) | |
| ChatEvidenceModule | `domains/job/{chat,media,evidence-refs,incident}*.ts` | lives inside the job domain, not a folder of its own |
| NotificationModule | `domains/notification/**` (4) | |
| ScopeChangeModule | `domains/job/scope-change/**` (9) | |
| ReviewModule | `domains/payment/completion-review.ts` | completion and review are one module |
| PaymentModule | `domains/payment/**` (5) + the `sepay-webhook` Edge function | **absent from the original blueprint list**; added because the code exists (#135, #139) |
| DisputeModule | `domains/dispute/dispute.ts` (1) | |
| LearningRuleModule | `kael/learning/**` + `domains/admin/learning.ts` | |
| AdminModule | `domains/admin/learning.ts` (1) | one file covering Kael-learning ops only — see `STRUCTURES.md` §1.5 |

Module contract:

```text
Each module must define
-
|- responsibility
|- inputs
|- outputs
|- state owned
|- actions forbidden
|- test requirements
```

The responsibility/forbidden blocks below are the contract. They bind regardless of which folder currently hosts the code; if a module moves, update the table above, not the contract.

### AuthProfileModule

```text
Responsibility
-
|- customer/worker/admin identity
|- role-first Supabase email/password auth in Phase 0
|- phone OTP auth later after SMS provider setup
|- role-safe profile creation
|- customer apartment profile
|- worker verification profile

Forbidden
-
|- client-controlled role escalation
|- logging phone/CCCD/address
```

### ServiceCatalogModule

```text
Responsibility
-
|- exactly six active services: electrical/plumbing/cleaning/HVAC/upholstery/handyman
|- canonical service-to-performance-profile mapping
|- problem categories
|- complexity hints
|- service-specific quote drivers, evidence guidance, safety/capability checks, completion checks, and scope-change triggers

Forbidden
-
|- enabling a seventh service without Tu approval
|- exposing profile questions as a required client-side static questionnaire
```

### PriceBaselineModule

```text
Responsibility
-
|- fallback price ranges
|- service/problem/district/complexity baselines
|- versioned updates

Forbidden
-
|- hardcoded VND prices in source code
|- exact guaranteed price claims
```

### KaelPriceCheckModule

```text
Responsibility
-
|- orchestrate Basic Intake, six-profile diagnosis/scope, privacy-safe evidence, clarification, price search, and synthesis
|- ask one focused question per turn until the structured diagnosis/scope artifact is quote-ready
|- validate structured output
|- return diagnosis/scope plus estimate card data or an honest not-ready state
|- compute scope-change estimate from worker reported scope (Phase 2.0 2026-05-23)
|- own final-price authority across A7 baseline + A11 Kael-decided updates

Forbidden
-
|- raw AI output to UI
|- client-side AI calls
|- raw audio/video model input
|- invented price baseline or market result
|- unsupported service advice
|- accepting worker-typed prices for final price decisions (Phase 2.0 2026-05-23)
```

### JobLifecycleModule

```text
Responsibility
-
|- job state transitions
|- customer/worker inputs, confirmations, overrides, and appeals
|- KaelAutonomyDecision validation
|- worker status updates
|- completion states

Forbidden
-
|- matching without explicit customer offer confirmation and A7 KaelAutonomyDecision
|- final worker assignment without customer candidate confirmation
|- scope mutation without explicit customer scope-change confirmation
|- payment start without explicit customer completion confirmation and A12 completion decision
```

### BroadcastMatchingModule

```text
Responsibility
-
|- eligible worker search
|- job broadcast
|- 60s accept window
|- candidate hold and explicit customer candidate confirmation
|- rebroadcast on expiry/decline

Forbidden
-
|- exposing full address before customer confirms an accepted candidate
|- assigning unavailable/unapproved worker
|- assigning a worker without every required verified capability
```

### ChatEvidenceModule

```text
Responsibility
-
|- customer-worker message relay
|- Kael system messages
|- private photos, editable voice transcript, extracted video frames, and private human-review video evidence
|- dispute evidence trail

Forbidden
-
|- logging raw sensitive messages
|- accepting a raw-audio upload or sending raw audio/raw video to an AI provider
|- rewriting normal human chat content
```

### ScopeChangeModule

```text
Responsibility
-
|- worker scope-change request (description + reason + photos only; Phase 2.0 2026-05-23)
|- delegate price re-computation to KaelPriceCheckModule (computeScopeChangeEstimate)
|- persist Kael-computed price (kael_computed_min/max) for audit
|- KaelAutonomyDecision validates the proposal from evidence/policy; customer can add evidence, confirm, reject, appeal, or cancel
|- on explicit customer confirmation, lock jobs.final_price = Kael-computed max
|- worker blocking until decision

Forbidden
-
|- raw LLM output mutating scope status or price
|- threshold-based scope auto-apply without customer confirmation
|- hidden price change
|- worker-proposed price (Phase 2.0 2026-05-23)
```

### PaymentModule

```text
Responsibility
-
|- SePay VietQR payment intent and verified webhook callback
|- cash confirmation recorded as an explicit customer action
|- commission ledger entries derived from the locked final price
|- payment state stays a projection of a real rail; never a UI-local guess

Forbidden
-
|- starting payment before the A12 completion confirmation
|- marking paid from client input, raw LLM output, or an unverified callback
|- showing a payment state for which no implemented rail exists
```

Open gap at the current milestone: the status table `VALID_TRANSITIONS` in `platform/lifecycle.ts` still allows `confirmed_by_customer -> reviewed`, the Phase-0 skip added when no rails existed. The event table in `workflow-orchestrator.ts` narrows it further — `kael_decided_dispute` is the only event that may cause that edge, and it is the only event reaching a terminal status without passing `paid` — so the skip is dispute-only rather than open, and the gate is the composition of the two tables, not `lifecycle.ts` alone.

Rails now exist (#135, #139) but no real transaction has been processed, so the skip has not been closed. Closing it means requiring `payment_pending -> paid -> reviewed`; that is a deliberate decision tied to the first real transaction, not a cleanup, and it also means deciding whether a dispute resolved in the customer's favour should still reach `reviewed` unpaid. `P12-workflow-transition-composition` pins the current answer either way.

### LearningRuleModule

```text
Responsibility
-
|- learning candidates
|- evidence gates
|- learned rule versions
|- monitoring
|- rollback

Forbidden
-
|- applying learning to booking/payment/cancel autonomy without versioned policy evidence
|- hiding learned changes from admin
```

Backend hard rules:

```text
Backend hard rules
-
|- all AI calls server-side
|- all user input validated with Zod or equivalent
|- database is source of truth
|- no hardcoded VND prices
|- no booking/payment/cancel without validated server-side decision
|- logs never contain PII
|- learning events must be versioned and auditable
|- idempotency required for job/broadcast/payment-like transitions
```
