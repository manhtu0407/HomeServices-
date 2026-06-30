# Home Services - Non-Negotiable Coding Rules

These rules are hard constraints. If a user request, implementation shortcut, skill, plan, or historical doc conflicts with this file, stop, report the conflict, and ask Tu before proceeding.

`critical.md` defines execution flow. This file defines product/security/runtime boundaries that must not be bypassed.

---

## AI Coding Agent Skills Reference

The repository includes AI coding agent skills in `skills.md` and `.agents/skills/karpathy-guidelines/SKILL.md`.

- `skills.md` summarizes the repo's Karpathy-inspired workflow: think before coding, simplicity first, surgical changes, and goal-driven execution.
- `.agents/skills/karpathy-guidelines/SKILL.md` is the project-local Codex/agent skill for Home Services.
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
- `.env.example` may be committed with key names only, never values.

Forbidden:
- Hardcoded keys.
- API keys in browser code, React components, React Native bundle code, screenshots, logs, docs, or git history.
- Printing or copying secrets into chat, memory, README, test logs, or handoff docs.

For every new secret:

1. Add the key name to `.env.example`.
2. Add environment validation.
3. Add deployment/runtime configuration instructions without exposing values.

---

## Rule #2: All AI API Calls Go Through The Centralized Wrapper

```typescript
// Correct
import { callAI } from '@/lib/ai/client'

const result = await callAI({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  messages: [...],
  maxTokens: 1000
})

// Forbidden
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: 'sk-...' })
```

The wrapper must provide timeout, retry, error handling, cost logging, response validation hooks, and safe fallback behavior.

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

Do not remove the disclaimer. Do not promise an exact price outside a server-validated Kael policy decision.

---

## Rule #5: Vietnamese-First Product Copy

- User-facing app text defaults to Vietnamese.
- Error messages shown to users are Vietnamese.
- Push notifications shown to users are Vietnamese.
- English mode is allowed only through the intended VI/EN switch.
- Developer logs, code comments, doc instructions, and engineering artifacts may use English technical language.

The app must not mix visible Vietnamese and English in one selected language mode.

---

## Rule #6: Kael Only Supports The Active Home Services Scope

Active service scope:
- electrical repair,
- plumbing repair,
- home cleaning / housekeeping.

```typescript
if (
  service_category !== 'electrical' &&
  service_category !== 'plumbing' &&
  service_category !== 'cleaning'
) {
  return POLITE_DECLINE_MESSAGE
}
```

Hard rule: Kael answers Home Services questions for electrical repair, plumbing repair, and home cleaning/housekeeping, including directly tied educational responses, safety advisories, and legal-awareness warnings for those three categories. For unsupported services, dangerous content, adult content, PII exposure, or unrelated requests, Kael must politely decline instead of analyzing.

---

## Rule #7: Kael Autonomy V2 Requires Validated Server Decisions

Kael is the default workflow actor for orchestration when backend policy has enough data. Kael may create/update tickets, lock estimates, start matching, re-match, process cancellation, decide scope changes, confirm completion, and issue payment/refund/dispute decisions.

Autonomy is only valid through a server-side `KaelAutonomyDecision`:
- `actor = kael_system`,
- action and resulting event are schema-validated,
- `policy_id`, evidence, confidence, reversible/appealable flags, and audit metadata are recorded,
- raw LLM output, mobile UI, and client-side code cannot directly set workflow status or money-impacting state.

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
- `.env.example` contains key names only, never values.
- Secrets are server-side only and must not be bundled into the RN app binary.
- Every new secret requires `.env.example`, validation, and deployment/runtime config.

### PII Handling

- Do not log full phone numbers, CCCD/national ID, exact addresses, tokens, or passwords.
- Customer and worker chat is relayed through Kael; do not expose direct contact details unless the product contract explicitly requires it.
- Scrub sensitive information before sending anything to LLMs.
- Share only the minimum job context required for customer/worker workflow.

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
SUPABASE_SERVICE_ROLE_KEY
```

Mobile-public values must be limited to intentionally public runtime configuration, such as Supabase URL and publishable/anon key, and must never include server authority.
