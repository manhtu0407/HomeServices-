# NestScout - Non-Negotiable Coding Rules

These rules are hard constraints. If a user request, implementation shortcut, skill, plan, or historical doc conflicts with this file, stop, report the conflict, and ask Tu before proceeding.

`critical.md` defines execution flow. This file defines product/security/runtime boundaries that must not be bypassed.

**This file is Tier 1 of the Map Process (`CLAUDE.md`).** Tier 1 is unconditional: it applies to every task at every size, including a one-line fix. Nothing in Tier 2 or Tier 3 — no protocol, skill, plan section, or design doc — can relax a rule here.

---

## AI Coding Agent Skills Reference

The repository includes AI coding agent skills in `skills.md` and `.agents/skills/karpathy-guidelines/SKILL.md`.

- `skills.md` summarizes the repo's Karpathy-inspired workflow: think before coding, simplicity first, surgical changes, and goal-driven execution.
- `.agents/skills/karpathy-guidelines/SKILL.md` is the project-local Codex/agent skill for NestScout.
- `kael-core-hygiene` (canonical `governance/protocols/code-hygiene.md`, mirrored in `.claude/skills/` and `.agents/skills/`) is the always-on output-hygiene skill: it forbids AI self-attribution and dated/phase/status/plan/audit note-banners in source, and is enforced by `pnpm lint:comments`, the comment-hygiene Stop hook, and the `comment-discipline` CI job.
- Skills guide how agents work. They do not replace the non-negotiable rules in this file.
- If a skill conflicts with `RULES.md`, `RULES.md` wins.

---

## Rule #0: Mobile Runtime Boundary

The store-bound runtime path is:

```text
Expo React Native mobile app
-> Supabase Auth
-> Supabase Edge Function `mobile-api`
-> Supabase DB/RPC/Storage/Realtime
-> server-side AI and external providers
```

Correct:
- Mobile signs users in with Supabase Auth.
- Mobile calls `supabase/functions/mobile-api` for workflow-sensitive APIs.
- Edge/server code owns service-role access, AI provider calls, external provider keys, role guards, workflow writes, and sensitive validation.
- `apps/api` remains reference/parity/admin/support code unless Tu explicitly assigns a Next.js runtime task.
- Direct authenticated mobile Supabase access is read/bootstrap-oriented unless a documented contract explicitly permits a narrow write.

Forbidden:
- Do not make the mobile app call AI providers directly.
- Do not put server secrets, service-role keys, Maps keys, AI provider keys, or payment secrets in the RN bundle.
- Do not bypass `mobile-api` for booking, worker matching, scope change, completion, review, notification, cancellation, reassignment, or other workflow-sensitive writes.
- Do not turn hosted Next.js/Vercel into the mobile release runtime without explicit approval.

---

## Rule #1: No Secrets In Client Code

Correct:
- API keys live in server-side environment variables.
- Keys are read only inside server functions, Supabase Edge Functions, or approved server runtimes.
- `config/env/workspace.env.example` may be committed with key names only, never values.

Forbidden:
- Hardcoded keys.
- API keys in browser code, React components, React Native bundle code, screenshots, logs, docs, or git history.
- Printing or copying secrets into chat, memory, README, test logs, or handoff docs.

For every new secret:

1. Add the key name to `config/env/workspace.env.example`.
2. Add environment validation.
3. Add deployment/runtime configuration instructions without exposing values.

---

## Rule #2: All AI API Calls Go Through The Centralized Wrapper

There are two wrappers, one per runtime. Use the one that matches where your code runs:

- **Store-bound runtime (canonical):** `supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client.ts`. Every AI call on the mobile path goes through this one.
- **`apps/api` reference/parity surface:** `apps/api/src/lib/ai/client.ts` (`@/lib/ai/client`). Not the mobile runtime — see Rule #0.

```typescript
// Correct — inside supabase/functions/mobile-api
import { callAI } from '../kael-providers/provider-client.ts'

const result = await callAI(request, secrets, gate)

// Forbidden
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: 'sk-...' })
```

The Edge wrapper takes the spend gate as an argument; do not call a provider around it. Provider/model pairs come from the per-task model ladder in `kael/agents/agentic-harness.ts`, which declares a primary and its fallbacks — do not hardcode a new model ID at a call site.

Both wrappers must provide timeout, retry, error handling, cost logging, response validation hooks, and safe fallback behavior.

---

## Rule #3: Validate AI Output Before It Reaches Users

Kael must never send raw AI output directly to users.

Required checks:
- Price content is formatted correctly and includes the required disclaimer.
- Off-topic, unsafe, adult, unrelated, PII-leaking, or unsupported-service content is refused or replaced with a safe template.
- Language matches the selected app language: Vietnamese by default, English only through the intended VI/EN switch.
- JSON/tool output is schema-validated before use.

---

## Rule #4: Price Estimates Require A Disclaimer

Every response or UI state containing a price estimate must include this Vietnamese disclaimer:

> "Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới."

Do not remove the disclaimer from Kael estimates. Auto-quote prices require a server-validated Kael policy decision.

For `rfq` and `inspection_only` only, the assigned worker may propose an exact price and scope after inspection. This is a worker quote, not a Kael estimate. The owning customer must explicitly approve that immutable proposal before the server locks the final price or work continues. Validate actor, assignment, phase, currency/amount, proposal identity and retry identity atomically; retain the proposal and decision audit. Never infer an agreed price from a range, let an admin approve for the customer, or relabel a worker quote as source-verified Kael pricing.

---

## Rule #5: Vietnamese-First Product Copy

- User-facing app text defaults to Vietnamese.
- Error messages shown to users are Vietnamese.
- Push notifications shown to users are Vietnamese.
- English mode is allowed only through the intended VI/EN switch.
- Developer logs, code comments, doc instructions, and engineering artifacts may use English technical language.

The app must not mix visible Vietnamese and English in one selected language mode.

---

## Rule #6: Kael Only Supports The Active NestScout Scope

Active service scope is exactly six services:
- electrical repair (`electrical`),
- plumbing repair (`plumbing`),
- home cleaning / housekeeping (`cleaning`),
- air conditioning and indoor air service (`hvac`),
- sofa, mattress, curtain, and carpet care (`upholstery`),
- minor repair and installation (`handyman`).

```typescript
if (
  service_category !== 'electrical' &&
  service_category !== 'plumbing' &&
  service_category !== 'cleaning' &&
  service_category !== 'hvac' &&
  service_category !== 'upholstery' &&
  service_category !== 'handyman'
) {
  return POLITE_DECLINE_MESSAGE
}
```

Hard rule: Kael answers NestScout questions for these six services, including directly tied educational responses, safety advisories, and legal-awareness warnings. HVAC is broad enough to cover cleaning, diagnosis, and repair when evidence and verified worker capabilities support the work; safety or capability gates may stop or reroute the case, but must not silently narrow HVAC to cleaning-only maintenance. For unsupported services, dangerous content, adult content, PII exposure, or unrelated requests, Kael must politely decline instead of analyzing.

---

## Rule #7: Kael Autonomy V2 Requires Validated Server Decisions

Kael is the default workflow actor between explicit phase gates when backend policy has enough data. Kael may create/update tickets, analyze evidence, prepare estimates, search for eligible workers, re-match, and prepare scope/completion/payment proposals, but it must stop for the required confirmation before crossing a confirmation gate.

Required confirmation gates:
- the customer confirms the offer before matching starts,
- a worker acceptance creates a candidate; the customer confirms that candidate before final assignment, exact-address release, or on-the-way state,
- the customer confirms every money- or work-impacting scope change before changed work continues,
- the customer confirms completion before payment begins,
- payment requires an explicit customer action or a verified callback from an implemented payment rail.

Analysis, clarification, evidence processing, eligibility checks, and other non-confirmation work may continue within their current phase. A later phase must never be entered early or run continuously across one of the gates above.

When Kael performs an autonomous non-confirmation transition, autonomy is only valid through a server-side `KaelAutonomyDecision`:
- `actor = kael_system`,
- action and resulting event are schema-validated,
- `policy_id`, evidence, confidence, reversible/appealable flags, and audit metadata are recorded,
- raw LLM output, mobile UI, and client-side code cannot directly set workflow status or money-impacting state.

An authenticated customer action at a required gate is not a Kael autonomy decision. The server must validate ownership, the current phase, the pending proposal, and the atomic transition before applying that customer decision.

Client, worker, and admin actions are inputs, override/appeal paths, and audit controls unless a specific contract marks the action as a physical-world requirement.

---

## Rule #8: Data Honesty - No Fake Data Or Silent Degradation

When AI output fails or real data is unavailable:

Correct:
- Return a safe fallback template and clearly mark fallback internally.
- Log enough safe metadata to debug the failure.
- Show users an appropriate non-technical Vietnamese unavailable/error state.
- Use empty states instead of fake rows, fake numbers, or fake success.

Forbidden:
- Returning empty content while pretending success.
- Fabricating price data when Perplexity/market data fails.
- Fabricating worker info, ratings, queue counts, earnings, prices, or provider availability.
- Displaying `0`, `--`, fake counts, fake payouts, fake worker names, or "coming soon" as if real product data exists.
- Silently swallowing provider, Edge, or DB failures without safe logging.

Fallback is acceptable. Fake success is never acceptable.

---

## Rule #9: Logging Must Not Expose PII Or Secrets

```typescript
// Correct: safe metadata only
console.log('Booking started', { bookingId, serviceType, district })
console.warn('API retry', { attempt, backoffMs, endpoint })

// Forbidden
console.log('User data', { phone: '09012345678', cccd: '001...' })
console.error('API failed', { apiKey: process.env.ANTHROPIC_API_KEY })
```

Allowed in logs:
- IDs,
- status codes,
- error codes,
- safe metadata,
- coarse district-level location when needed.

Forbidden in logs:
- full phone numbers,
- passwords,
- OTPs,
- access/refresh tokens,
- API keys,
- service-role keys,
- CCCD/national ID,
- exact home address,
- full raw chat text when it may contain PII.

---

## Rule #10: Every Network Call Needs Timeout And Bounded Retry

```typescript
const withTimeout = (promise, ms = 20000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
```

Default provider timeouts:
- Anthropic: 20,000ms
- Perplexity: 15,000ms
- DeepSeek: 10,000ms

Retry policy:
- maximum 2 retries,
- exponential backoff,
- cap backoff at 10,000ms,
- log safe metadata for retry and final failure.

No unbounded network call is allowed.

---

## Security Invariants

### Secrets Management

- `.env` and `.env.local` must never be committed.
- `config/env/workspace.env.example` contains key names only, never values.
- Secrets are server-side only and must not be bundled into the RN app binary.
- Every new secret requires `config/env/workspace.env.example`, validation, and deployment/runtime config.

### PII Handling

- Do not log full phone numbers, CCCD/national ID, exact addresses, tokens, or passwords.
- Customer and worker chat is relayed through Kael; do not expose direct contact details unless the product contract explicitly requires it.
- Scrub sensitive information before sending anything to LLMs.
- Share only the minimum job context required for customer/worker workflow.

### Multimodal Evidence Privacy

- Customer photos are private evidence; only the minimum required image content may reach vision analysis through short-lived server-side access after validation and PII scrubbing.
- Voice is transcribed on-device into editable text. Raw audio must not leave the device and must be discarded after transcript confirmation; it is never uploaded or used as model input.
- Video analysis uses 1-3 frames extracted locally. Only those validated frames may reach vision analysis; raw video must never be sent to an AI provider.
- An original video may be kept in private storage only as human-review evidence with explicit product disclosure, least-privilege access, retention controls, and deletion support.
- If local transcription or frame extraction is unavailable, the product must offer honest text/photo fallback instead of silently uploading raw media.

### Input Validation

- Validate and sanitize all user input before DB writes, Edge processing, LLM prompts, or external provider calls.
- Kael system prompts must include refusal instructions for off-topic, unsafe, unsupported, adult, or PII-leaking content.
- Rate limit AI/provider routes to prevent unbounded usage.

### Environment Variables

Server-side only:

```text
ANTHROPIC_API_KEY
PERPLEXITY_API_KEY
DEEPSEEK_API_KEY
GOOGLE_MAPS_API_KEY
VIETMAP_API_KEY
SEPAY_WEBHOOK_SECRET
SEPAY_VIETQR_BANK_CODE
SEPAY_VIETQR_ACCOUNT_NUMBER
SEPAY_VIETQR_ACCOUNT_HOLDER
SUPABASE_SERVICE_ROLE_KEY
```

This list is not exhaustive and drifts as providers are added. `config/env/workspace.env.example` is the authoritative key-name inventory; every entry there that carries server authority is server-side only.

Mobile-public values must be limited to intentionally public runtime configuration, such as Supabase URL and publishable/anon key, and must never include server authority.
