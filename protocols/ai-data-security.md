# Kael Protocols — AI, Data & Security

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Contains `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep`. Load for AI/provider/prompt work, Supabase/DB/RLS/migrations/types, and any secrets/PII/auth/logging/rate-limit/upload work.

## 12. Kael Protocol: `kael-ai-boundary`

Use when a task touches AI providers, prompts, prompt routing, price synthesis, vision analysis, advisory generation, worker brief generation, AI validation, AI logging, or AI cost tracking.

### Inputs Required

- AI boundary being changed.
- Provider(s): Anthropic, Perplexity, DeepSeek.
- Prompt version.
- Schema for structured output.
- Cost/budget impact.
- Fallback behavior.

### Workflow

1. Keep all AI calls server-side.
2. Route provider calls through `callAI()` or an approved wrapper above it.
3. Never import provider SDKs directly in routes/components.
4. Store prompt templates under `src/lib/ai/prompts/` when implemented.
5. Version prompts in code.
6. Require structured data first, prose second.
7. Validate all AI output crossing into user-facing UI with Zod or equivalent.
8. Track session cost before making the next provider call.
9. Enforce provider timeouts and retry limits.
10. Use fallback behavior without fake success.
11. Ensure logs contain only safe metadata.

### Mandatory AI Rules

- Price estimates MUST be structured data before prose.
- Price estimates MUST include the required disclaimer.
- No hardcoded VND price values in source code.
- Perplexity is for market pricing only.
- Anthropic handles vision/problem identification/synthesis.
- DeepSeek handles classification, simple FAQ, and lightweight pre-screening.
- Raw AI output MUST NOT be shown to users.

### Prompt Version Example

```typescript
export const KAEL_PRICE_SYNTHESIS_PROMPT_VERSION = "2026-05-13.v1";
```

### Output Format

```text
AI boundary touched:
Provider routing:
Prompt/version:
Structured schema:
Validation:
Fallback:
Cost tracking:
Tests:
```

### Failure Modes

- Prompt inline inside a random route.
- Parsing prose instead of structured output.
- Missing output validation.
- Missing budget tracking.
- Fake price data when provider fails.

### Anti-Patterns

- Direct SDK call in route/component.
- Client-side AI call.
- Hardcoded prices.
- Silent fallback.
- Raw LLM text shown to users.


## 14. Kael Protocol: `kael-supabase`

Use for every task involving Supabase database, Auth, RLS, migrations, generated types, storage, realtime, seed data, edge functions, or Supabase clients.

### Inputs Required

- Existing migrations.
- Generated `database.types.ts`.
- Affected tables/policies/functions.
- Actor roles: customer, worker, admin.
- Existing SQL/tests.

### Workflow

1. Read current schema and generated types.
2. Add a new migration for schema changes. Do not edit old merged migrations.
3. Update generated types whenever migration changes the schema.
4. Add or update seed data when needed.
5. Write RLS positive and negative tests for each relevant actor.
6. Test constraints, triggers, indexes, and function behavior when relevant.
7. Verify Supabase client/server code remains type-safe.
8. Apply `kael-security-sweep` for PII, auth, and logging.

### Required Tests

For migration/schema changes:

- RLS positive tests.
- RLS negative tests.
- Constraint tests.
- Trigger tests when triggers are touched.
- Generated type checks.
- Wiring tests when new modules/files are introduced.

### Output Format

```text
Schema area:
Migration strategy:
Generated types:
RLS impact:
Actor tests:
Data integrity tests:
Limitations:
```

### Failure Modes

- Editing old migration after merge.
- Schema changed but generated types stale.
- Admin path not tested.
- Customer can access another customer's data.
- Tests only grep SQL text without runtime confidence.

### Anti-Patterns

- RLS enabled but untested.
- No negative tests.
- Storing PII without classification.
- Using untyped Supabase clients.

## 15. Kael Protocol: `kael-security-sweep`

Use for any task involving secrets, PII, auth, logging, payment, booking, AI APIs, rate limits, input validation, file uploads, or database access.

### Inputs Required

- Changed files.
- Data touched.
- User inputs touched.
- Logs produced.
- Network/API calls.
- Storage/database paths.

### Workflow

1. Check secrets are server-side only.
2. Check no secrets in code, client bundle, logs, or git-tracked examples.
3. Check `.env.example` has names only, no values.
4. Check new secrets are added to env validation and deployment config.
5. Classify PII.
6. Ensure logs use IDs and metadata only.
7. Validate/sanitize all user input before DB or LLM.
8. Enforce timeout and retry rules for network calls.
9. Enforce rate limit and AI budget rules.
10. Verify security negative tests where behavior changed.

### PII Classification

| Data | Classification | Rule |
|---|---|---|
| Phone number | Sensitive PII | Never log full value. Scrub before LLM unless required. |
| CCCD images/numbers | Highly sensitive PII | Never log. Store only through approved secure flow. |
| Full apartment address | Sensitive PII | Do not log full value. Share only when job requires it. |
| Unit number/floor | Sensitive PII | Avoid logs and LLM unless necessary. |
| Worker bank account | Financial PII | Never log. Never send to LLM. |
| Exact worker/customer location | Sensitive PII | Never log exact coordinates/address. |
| Raw problem description | Potential PII | Do not log raw text if it may include phone/address. |
| API keys/tokens | Secret | Never expose, log, or commit. |

### Output Format

```text
Secrets:
PII:
Input validation:
Logging:
Network/timeouts:
Rate/cost limits:
Security tests:
```

### Failure Modes

- Logs include raw user text or address.
- Secrets appear in client code.
- Missing validation before LLM.
- No negative test for security behavior.

### Anti-Patterns

- "It is only a dev log."
- Swallowing security failures.
- Returning fake success when a provider or DB fails.
- Sending more PII to LLM than needed.

