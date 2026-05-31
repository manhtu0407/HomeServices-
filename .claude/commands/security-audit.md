# Security Audit

Use `protocols/ai-data-security.md` as the canonical checklist. This file is only the command entry point.

## Required Areas

- client/Edge/provider boundary
- secrets and environment values
- PII in logs, prompts, storage, notifications, uploads, and memory
- input validation and sanitization before DB/LLM use
- RLS/RPC privilege, service-role-only paths, and owner checks
- rate limits, retries, idempotency, and timeout behavior
- data honesty when provider calls, DB reads, or fallbacks fail

## Output

```
Clean:
Warnings:
Critical:
Verification:
```

Critical issues block completion until fixed or explicitly deferred by Tu.
