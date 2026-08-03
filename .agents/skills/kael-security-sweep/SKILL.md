---
name: kael-security-sweep
description: Security review for NestScout. Use when touching secrets, PII, auth, logging, payment, booking, AI APIs, rate limits, input validation, file uploads, or database access. Verifies no client secrets, no PII in logs, validated input, timeouts and bounded retries, and security negative tests.
---

# kael-security-sweep

Auto-trigger wrapper. Full procedure + PII classification table are canonical in `governance/protocols/ai-data-security.md` — do not duplicate them here. Hard rules: `governance/RULES.md` #1, #9, #10 + Security Invariants.

When this fires:

1. Secrets server-side only; none in code, RN bundle, logs, or git-tracked examples; `config/env/workspace.env.example` has names only.
2. Classify PII (phone, CCCD, address, bank, exact location, raw description) — logs use IDs/safe metadata only; scrub before LLM.
3. Validate/sanitize all user input before DB or LLM; enforce timeout + bounded retry on every network call.
4. Add security negative tests where behavior changed. Never return fake success on provider/DB failure.

Output:

```text
Secrets:
PII:
Input validation:
Logging:
Network/timeouts:
Rate/cost limits:
Security tests:
```
