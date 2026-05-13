# Pre-App Build Foundation Contract

This document prepares Home Services for the next implementation phase. It does not authorize building customer booking, worker matching, admin operations, payments, or Kael runtime behavior yet.

Agents MUST treat `STRUCTURES.md` as the product workflow source of truth and this file as the prepared execution contract for the app foundation.

## 1. Mission Boundary

Current mission:

```text
Prepared foundation only
-
|- repair red local gates
|- define repo topology before mobile scaffold
|- define mobile foundation contract
|- define backend API contract
|- audit Supabase schema drift against STRUCTURES.md
|- define Kael foundation contract
|- define test gates before feature work
```

Do not build in this mission:

```text
Do not build now
-
|- customer booking screens
|- worker app screens
|- admin dashboards
|- Kael runtime orchestration
|- payment logic
|- autonomous booking/cancel/payment/scope changes
|- new service categories
|- remote production schema changes
```

## 2. Secret And Token Handling

Supabase management access tokens, service role keys, AI provider keys, and database secrets MUST never be written into repo files, logs, README entries, memory entries, tests, fixtures, screenshots, or committed command output.

Allowed:

```text
Allowed
-
|- use a temporary token only in the current process when remote inspection is required
|- keep .env.local ignored by git
|- keep .env.example with key names and empty values only
|- revoke temporary management tokens after task completion
```

Forbidden:

```text
Forbidden
-
|- hardcode sbp_ management tokens
|- copy API keys into docs or tests
|- expose service role or AI provider keys in React Native
|- add secrets to EXPO_PUBLIC_ or NEXT_PUBLIC_ variables
|- log phone numbers, full addresses, CCCD, or API keys
```

## 3. Repo Topology Contract

Default target topology:

```text
home-services
-
|- apps/mobile
|  -
|  |- React Native Expo app
|  |- customer and worker surfaces
|  |- no direct AI provider calls
|  |- no server secrets
|
|- apps/admin
|  -
|  |- future Next.js admin surface
|  |- current root Next.js app remains active until migration is explicitly approved
|
|- packages/shared
|  -
|  |- shared schemas
|  |- shared state machines
|  |- shared constants
|  |- no server secrets
|
|- supabase
|  -
|  |- migrations
|  |- seed data
|  |- generated database types
|
|- docs
   -
   |- technical contracts
   |- test logs
```

Important default:

```text
The current root Next.js app stays in place for now.
Do not move it to apps/admin until Tu explicitly approves the migration.
```

## 4. Mobile Foundation Contract

When mobile scaffold is approved, use:

```text
Mobile stack
-
|- Expo
|- TypeScript
|- Expo Router
|- React Query for server state
|- Zustand only for small local UI/session state
|- React Hook Form plus Zod for forms
|- fetch for network calls
|- expo-secure-store for auth/session storage
```

Mobile routes must map to `STRUCTURES.md` workflow steps:

```text
Mobile route groups
-
|- app/(auth)
|- app/(customer-tabs)
|- app/(worker-tabs)
|- app/job/[id]
|- app/chat/[jobId]
|- app/scope-change/[jobId]
|- app/profile
```

Required mobile states:

```text
Every data-driven screen supports
-
|- loading
|- empty
|- error
|- retry
|- offline or network unavailable
|- success
```

Mobile API boundary:

```text
React Native App
-
|- calls Home Services backend over HTTPS
|- sends user auth token only
|- sends problem text/media references
|- receives validated structured responses
|- never calls Anthropic, Perplexity, DeepSeek, or OpenAI directly
|- never reads Supabase service role or management credentials
```

## 5. Backend API Contract

Every backend route or server action MUST define:

```text
Route contract fields
-
|- auth role
|- input schema
|- output schema
|- state transition
|- idempotency behavior
|- error response shape
|- audit/logging behavior without PII
|- tests required
```

Required route groups before frontend implementation:

```text
Backend route groups
-
|- auth/profile
|- service catalog
|- price baseline read
|- Kael price-check request
|- job draft
|- booking confirm
|- broadcast/matching
|- worker accept/decline
|- chat/evidence
|- scope change
|- completion
|- review
|- admin monitor
|- learning candidates/rules
```

Backend hard rules:

```text
Backend hard rules
-
|- AI calls are server-side only
|- all user input is validated before database writes or LLM calls
|- database is the source of truth
|- no hardcoded VND fallback prices in application code
|- every money-impacting action requires explicit confirmation
|- all job state changes are idempotent where duplicate requests are possible
|- logs contain metadata, not PII
|- API errors are structured for mobile loading/error/retry states
```

Standard error shape:

```json
{
  "ok": false,
  "code": "ERROR_CODE",
  "message": "Vietnamese user-facing message",
  "request_id": "safe-debug-id"
}
```

## 6. Supabase Schema Alignment Audit

Current schema is useful but behind the new `STRUCTURES.md` blueprint. Before feature implementation, prepare migrations for these gaps:

```text
Known schema drift
-
|- job_status enum does not match the new full workflow state machine
|- service taxonomy is implicit, not table-driven
|- price_baselines are service_type plus complexity only
|- price_baselines do not support district/problem/category granularity
|- learning_candidates table does not exist
|- learning_rules table does not exist
|- learning rule versions/audit/rollback storage does not exist
|- notification/event table does not exist
|- scope changes are embedded in jobs instead of event-like records
|- chat/evidence permissions need stronger review before mobile launch
|- storage policies need role-specific review before media upload launch
```

Required Supabase work rules:

```text
Supabase work rules
-
|- check current Supabase CLI/docs/changelog before schema work
|- create migrations only when the schema decision is approved
|- enable RLS for every exposed public table
|- do not use user-editable metadata for authorization
|- avoid security definer functions in exposed schemas
|- update generated database types after migration changes
|- add RLS tests for customer, worker, and admin access
```

## 7. Kael Foundation Contract

Kael is not a generic chatbot. Kael is the bounded AI price-check and problem-understanding layer for electrical and plumbing repair.

Before implementing Kael runtime, define:

```text
Kael contracts
-
|- input schema for service type, problem chips, text, media references
|- structured output schema
|- prompt versioning plan
|- provider fallback order
|- price baseline fallback behavior
|- PII scrub rules
|- AI log shape
|- cost/session budget policy
|- retry/timeout policy
|- worker pre-brief output shape
```

Allowed Kael effects:

```text
Allowed
-
|- classify electrical/plumbing issue
|- reject out-of-scope services
|- ask clarification
|- estimate price range with disclaimer
|- explain uncertainty
|- prepare worker pre-brief
|- create learning candidates later
```

Forbidden Kael effects:

```text
Forbidden
-
|- auto-booking
|- auto-payment
|- auto-cancel
|- auto-scope-change approval
|- auto-punish worker
|- auto-expand service scope
|- hide fallback or failed AI calls
```

## 8. Testing Blueprint

No feature build should start unless the base gates are clean or Tu explicitly accepts a known limitation.

Foundation gates:

```text
Foundation gates
-
|- npm run test
|- npm run lint
|- npm run build
```

Required future test groups:

```text
Future tests
-
|- env validation tests
|- no-secret-in-client tests
|- API schema validation tests
|- state machine transition tests
|- Supabase RLS policy tests
|- storage permission tests
|- Kael output schema tests
|- AI fallback tests
|- mobile API client error handling tests
|- booking confirmation guard tests
```

Critical acceptance cases:

```text
Must test
-
|- customer cannot create booking without explicit confirm
|- worker cannot see full address before accept
|- worker cannot continue scope change before customer decision
|- price estimate always has disclaimer
|- out-of-scope service returns polite decline
|- learning candidate cannot promote before evidence gate
|- learning rule cannot affect booking/payment/cancel
|- learning rule can be rolled back
```

## 9. Next Execution Sequence

Recommended next task after this mission:

```text
Next sequence
-
|- design Supabase schema alignment migration
|- design shared state machine package
|- scaffold Expo mobile app
|- build mobile auth shell
|- build backend profile/service-catalog endpoints
|- build Kael Price Check backend after schemas are ready
```

Do not skip directly to screens that need backend state. The frontend must not invent state that the backend cannot represent.
