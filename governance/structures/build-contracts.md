# Structures Spoke - Build Contracts (Frontend / Backend / Testing)

> Extracted from `STRUCTURES.md` section 18-20 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for frontend build contract, backend build contract, and testing blueprint. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 18. Frontend Build Contract

Every frontend screen must map to a workflow step.

```text
Frontend contract
-
|- every screen maps to a workflow step
|- every screen has loading/empty/error state
|- user-facing text is Vietnamese
|- future services are hidden unless Tu explicitly approves a specific non-functional state
|- price UI always shows estimate disclaimer
|- audit/override/appeal UI required for money-impacting Kael decisions
|- Kael messages visually differ from human chat
|- Next.js is not consumer web product
|- React Native is the primary app surface
```

### Implementation Ownership

`STRUCTURES.md` defines the workflow truth. `docs/architecture/code-ownership-map.md` defines where that workflow currently lives in code.

Before enhancing, refactoring, or reorganizing code, agents must map the task to:

```text
Implementation ownership map
-
|- workflow step or cross-cutting concern
|- route / entry file
|- UI surface owner
|- state/provider owner
|- runtime/API boundary
|- shared contract/schema/type owner
|- test or static gate
```

Layer ownership:

```text
Layers
-
|- routes stay thin and select surfaces
|- surfaces own visual composition, copy, and user-triggered actions
|- providers own frontend orchestration and remote state hydration
|- `apps/mobile/lib/services.ts` owns typed mobile API method groups
|- `apps/mobile/lib/api.ts` owns the `mobile-api` HTTP boundary
|- Edge `mobile-api` owns workflow-sensitive writes and service-role behavior
|- `packages/shared` owns service scope, schemas, workflow state, selectors, and shared types
```

If a change does not fit the current ownership map, stop and ask Tu before adding a new structure.

Customer navigation:

```text
Customer tabs
-
|- Home
|- Book
|- Kael
|- History
|- Profile
```

Worker navigation:

```text
Worker tabs
-
|- Home
|- Jobs
|- Chat
|- Earnings
|- Profile
```

Admin navigation:

```text
Admin sections
-
|- Dashboard
|- Jobs
|- Workers
|- Price Baselines
|- Learning Rules
|- Learning Candidates
|- AI Logs
|- Support
```

Screen implementation rule:

```text
Every non-trivial screen must define
-
|- purpose
|- state source
|- primary action
|- secondary action
|- loading state
|- empty state
|- error state
|- success state
|- telemetry/logging boundary
```

Mobile readiness:

```text
React Native constraints
-
|- small screen layout
|- slow network
|- image upload permissions
|- camera/photo access
|- push notification permissions
|- keyboard behavior
|- touch targets
|- interruption recovery
```

---

## 19. Backend Build Contract

Backend owns business logic. Client displays state and submits user input, overrides, and appeals.

```text
Backend contract
-
|- API routes / Edge Functions validate input
|- Supabase is source of truth
|- RLS protects actor boundaries
|- AI calls are server-side only
|- every network call has timeout
|- every provider call logs safe metadata
|- every money-impacting transition is validated, audited, reversible/appealable when policy allows
|- every state transition is validated
```

API/server responsibilities:

```text
Server responsibilities
-
|- create/update profiles
|- validate service taxonomy
|- create draft job
|- call Kael analysis
|- create estimate
|- validate Kael autonomy decision
|- start booking search / matching
|- accept/decline worker request
|- update job status
|- create scope change request
|- record customer/worker scope evidence and Kael scope decision
|- record completion
|- record review
|- create learning candidates
|- apply evidence gates
```

Client must not:

```text
Client forbidden
-
|- call AI providers directly
|- hold API secrets
|- decide final RLS-sensitive permissions
|- mutate worker approval
|- mutate learning rules directly
|- bypass state transitions
|- fabricate successful payment/booking states
```

Idempotency:

```text
Idempotency required for
-
|- auth/profile creation
|- OTP/profile creation later when SMS provider is enabled
|- Kael matching decision
|- job broadcast
|- worker accept
|- scope change decision
|- Kael completion decision
|- payment callback later
|- learning rule promotion
```

---

## 20. Testing Blueprint

Tests must prove behavior, not just file existence.

Testing layers:

```text
Testing layers
-
|- Static/Type
|- Unit
|- Integration
|- SQL/Migration
|- Wiring
|- E2E later
|- UI visual/manual verification
|- Security negative tests
```

Workflow test areas:

```text
Testing blueprint
-
|- Auth/profile tests
|- Service taxonomy tests
|- Price baseline tests
|- Kael output schema tests
|- AI fallback tests
|- Job lifecycle state tests
|- Broadcast expiry tests
|- Scope change Kael decision, accept, and appeal tests
|- RLS customer/worker/admin tests
|- Chat/evidence permission tests
|- Learning candidate creation tests
|- Evidence gate tests
|- Learning rule auto-promotion tests
|- Learning rule rollback tests
|- Admin visibility tests
```

Critical test cases:

```text
Must test
-
|- matching cannot start without validated A7 KaelAutonomyDecision
|- worker cannot see full address before B3 accept
|- worker cannot continue scope change before A11 decision
|- price estimate always has disclaimer
|- no hardcoded price fallback
|- out-of-scope service returns polite decline
|- learning candidate cannot promote before evidence gate
|- learning rule can auto-promote after evidence gate
|- learning rule cannot affect booking/payment/cancel
|- learning rule can be rolled back
```

Security tests:

```text
Security tests
-
|- customer cannot read another customer's job
|- worker cannot read job before accept
|- unapproved worker cannot receive jobs
|- user cannot create admin role through metadata
|- logs do not include full phone/address/CCCD/API keys
```

AI tests:

```text
AI tests
-
|- provider timeout
|- provider retry
|- provider fallback
|- cost logging
|- structured output validation
|- raw output never reaches UI
|- unsupported service declines
```
