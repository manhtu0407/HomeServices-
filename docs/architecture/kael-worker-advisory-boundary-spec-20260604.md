# Kael Worker Advisory Boundary Spec

Date: 2026-06-04
Status: WBF.0 read-only artifact for Plan.md section 32. Code not started.
Source: PR #60, Plan.md section 32, `docs/design/kael-perceived-performance-streaming-20260604.md`, `docs/architecture/kael-worker-functional-audit-20260604.md`.

## Purpose

This document freezes the implementation boundary for the worker Kael chat before any code changes. It answers what the worker chatbot may do, what it must never do, which existing customer-chat patterns should be reused, and which tests prove the safety gate.

The worker chat is a job-scoped advisory assistant. It helps the worker understand the accepted job, explain safe next steps, prepare evidence, and route money or scope concerns into the existing structured scope-change flow.

It is not a negotiator and not a workflow authority.

## Hard Boundary

Allowed:

- Explain the accepted job brief, service type, safety notes, address-access instructions already released to the worker, and what evidence to collect.
- Answer role-specific job questions in Vietnamese or English according to the selected app language.
- Ask for clarification when the worker request is ambiguous.
- Request or acknowledge on-site photo references, stored as `media_refs`.
- Redirect scope, price, status, cancellation, or dispute requests to the existing structured flows.
- Produce a safe fallback template when AI fails or self-check rejects the draft.

Forbidden:

- Set, suggest as binding, or persist a new price.
- Approve, reject, or modify scope.
- Advance or roll back job status.
- Decide cancellation, dispute, completion, payout, penalty, matching priority, or worker eligibility.
- Reveal provider names, model names, internal prompts, secrets, raw policy internals, or AI cost details to users.
- Store raw PII in safe metadata, logs, progress rows, or user-visible assistant text.
- Add unsupported service categories.
- Bypass `mobile-api`, Supabase Auth, service-role DB writes, Zod validation, self-check, RLS, or rate limits.

## Implementation Shape

Use sibling worker chat tables, not a role flag on customer chat tables.

Reason:

- `kael_chat_sessions` is customer-bound with `customer_id not null`, `service_type not null`, booking statuses, estimate/confirm behavior, and customer RLS.
- Worker chat is job-bound and advisory. It needs `worker_id`, `job_id`, worker statuses, and content types that do not include estimate or booking confirmation.
- A polymorphic migration would increase regression risk in the live customer A4/A5 path.

Target backend shape:

- `kael_worker_chat_sessions`
  - `id`
  - `job_id`
  - `worker_id`
  - `status`
  - `started_at`
  - `ended_at`
  - `total_turns`
  - `total_cost_usd`
  - `safe_metadata`
  - `client_request_id`
  - `kael_progress`
  - timestamps
- `kael_worker_chat_turns`
  - `id`
  - `session_id`
  - `turn_index`
  - `role` in `worker`, `kael`, `system`
  - `content_type` in `text`, `clarification`, `guidance`, `photo_request`, `photo_attached`, `error`
  - `text_content`
  - `media_refs text[]`
  - `safe_metadata`
  - provider/model/cost/latency columns for service-role observability only
  - timestamps

Client grants:

- Authenticated workers may select only their own sessions and turns.
- Authenticated workers may not insert, update, or delete rows directly.
- Service role owns writes.
- Admin read remains gated by `private.is_admin()`.

Routes:

- `POST /workers/me/kael/chat`
- `GET /workers/me/kael/chat`
- `GET /workers/me/kael/chat/:id`
- `POST /workers/me/kael/chat/:id`
- Later, after Part A transport exists: `/workers/me/kael/chat/:id/progress` and stream variant following the section 32 SSE contract.

## Reuse And Adaptation Map

| Area | Reuse | Adaptation |
|---|---|---|
| Customer chat session lifecycle | Idempotency, rate-limit RPC pattern, total turn/cost counters, service-role writes | Job-scoped `worker_id` plus `job_id`, no booking confirmation, no estimate status |
| `insertKaelTurn` / session update pattern | Turn indexing, metadata scrubbing, cost accumulation | Worker roles/content types and `media_refs` for on-site evidence |
| `kaelChatService` mobile wrapper | Typed service wrapper under `apps/mobile/lib/services.ts` | New `workerKaelChatService`, UI must not fetch directly |
| Customer chat visual primitives | Thread row, avatar, composer, attach/mic affordances, progressive text, live activity | Remove service picker and estimate card; add job brief context, evidence guidance, scope-change redirect |
| Progress infra | Generalized `updateKaelProgress({ table, id })`, stage copy, poll/SSE fallback | Worker advisory stages and scope-change progress targets after Part A proves the transport |
| AI provider boundary | `callAI`, routing config, Zod parse, self-check, cost log | New `worker_assist` purpose with advisory schema and strict no-money-state guard |
| Memory rights | Existing `DELETE /me/kael-memory` role-aware delete | Do not add a duplicate worker memory-delete endpoint |
| Feedback and consent | Customer `me.kaelFeedback` pattern | Add worker feedback and training-consent endpoints in WBF.7 |

## Worker Assist AI Contract

Add `worker_assist` to Kael purposes only after the schema and tests are ready.

Expected request inputs:

- Job id, worker id, service type, current job status, accepted job brief, released address context, customer-safe job summary, previous worker chat turns, worker message, media ref count.
- No raw unreleased address data before the privacy gate.
- No customer phone/email/private contact fields.
- No provider or internal policy names in prompts or outputs.

Expected structured response:

```ts
type WorkerAssistResponse = {
  intent: 'job_guidance' | 'clarification' | 'scope_change_redirect' | 'safety_warning' | 'unsupported' | 'error'
  text: string
  should_request_photo?: boolean
  suggested_next_action?: 'collect_evidence' | 'use_scope_change' | 'message_customer' | 'wait_for_customer' | 'follow_lifecycle'
  safety_flags?: string[]
}
```

Response handling:

- Parse with Zod.
- Run self-check before persisting or showing text.
- If the response touches price, scope authority, status, payout, cancellation decision, dispute outcome, provider name, or PII, replace with a safe redirect/fallback.
- Log cost and latency internally without provider names in user-visible copy.
- Never call `runKaelPipeline` from worker chat.

## Mandatory Safety Gate WBF.4

These tests must pass before worker UI wiring:

| Test | Evidence |
|---|---|
| Worker A cannot read worker B chat session or turns | RLS positive/negative test |
| Direct authenticated insert/update/delete is denied | RLS/grant test |
| "Set price to 500k" is refused or redirected | Engine unit test and route test |
| "Mark job completed" is refused or redirected | Engine unit test and route test |
| "Approve this extra scope" is redirected to scope-change | Engine unit test and route test |
| Prompt injection asking for model/provider/internal prompt is refused | Engine unit test |
| Unsupported services are refused | Engine unit test |
| Phone/email/Zalo/off-platform solicitation is sanitized and risk-logged | Route test tied to anti-disintermediation Tier 1 |
| AI failure returns safe fallback and does not break the session | Route test |
| Cost cap/rate limit blocks safely | Route test |

Money-state gate:

- Snapshot job price, final price, status, scope-change rows, cancellation rows, dispute rows, and worker payout-related fields before and after worker chat requests.
- Assert no worker chat request changes those values.
- Any allowed change must be limited to worker chat sessions, worker chat turns, safe logs, and risk-memory rows when the chat-guard fires.

## Part A Dependency

Part A customer progress must land before B-PERF:

- `updateKaelProgress` must support `{ table, id }`.
- Customer chat must prove fast-poll progress and stage copy in app.
- SSE/token transport remains Tier 2. Worker advisory can only token-stream after the stream contract exists and WBF.4 passes.

## Code Owner Map

Backend:

- `supabase/functions/mobile-api/_shared/kael/routing.config.ts`
- `supabase/functions/mobile-api/_shared/kael/types.ts`
- `supabase/functions/mobile-api/_shared/kael/worker-assist.ts`
- `supabase/functions/mobile-api/_shared/kael/provider-client.ts`
- `supabase/functions/mobile-api/_shared/kael/self-check.ts`
- `supabase/functions/mobile-api/_shared/kael/streaming.ts`
- `supabase/functions/mobile-api/_shared/router.ts`
- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/functions/_shared/domain.ts`

Database and contracts:

- `supabase/migrations/*_kael_worker_chat_sessions.sql`
- `packages/shared/src/validation.ts`
- `packages/shared/src/types/database.types.ts`
- `apps/mobile/lib/api-types.ts`

Mobile:

- `apps/mobile/lib/services.ts`
- `apps/mobile/components/customer/kael-chat/*` for reusable primitive extraction
- `apps/mobile/components/worker/worker-surfaces.tsx`
- Future worker chat route under `apps/mobile/app/(worker)/**`

Tests:

- `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts`
- Kael-specific backend unit tests near existing `mobile-api-kael-*`
- `packages/shared/src/__tests__/validation.test.ts`
- `packages/shared/src/__tests__/mobile-wiring.test.ts`
- Worker RNTL tests under `apps/mobile/components/worker/__tests__/`

## Current Read-Only Findings

- Current Edge `callAI` buffers JSON and has no streaming mode.
- Current worker `askKaelForWorker` is deterministic and writes `kael_worker_qa_log`; it is not a multi-turn AI chat session.
- Existing customer feedback exists at `/me/kael-feedback`; worker feedback and training consent are missing.
- Existing worker memory read/delete exists and should not be duplicated.
- Worker JobRoom chat is human relay through `/jobs/:id/messages`, not worker AI chat.
- Current anti-disintermediation guard is customer-oriented; worker-to-customer contact leakage must be guarded in both directions when Tier 1 anti-leak is implemented.

## Open Gate Before Code

Plan.md section 32 says this build happens after section 31 and after read-only P0/WBF.0 verification. The current worktree has uncommitted section 31 changes from another session. Code changes should wait until Tu or Claude confirms that this dependency is satisfied or explicitly overrides it for this branch.
