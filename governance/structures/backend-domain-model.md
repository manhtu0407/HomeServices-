# Structures Spoke - Backend Domain Model

> Extracted from `STRUCTURES.md` section 11 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for backend modules and their contracts. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 11. Backend Domain Model

Backend modules should be built as deep modules with clear interfaces and testable seams.

```text
Backend modules
-
|- AuthProfileModule
|- ServiceCatalogModule
|- PriceBaselineModule
|- KaelPriceCheckModule
|- MarketMemoryService
|- CaseReviewService
|- JobLifecycleModule
|- BroadcastMatchingModule
|- ChatEvidenceModule
|- NotificationModule
|- ScopeChangeModule
|- ReviewModule
|- LearningRuleModule
|- AdminModule
```

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
