---
name: kael-security-sweep
description: Security review for Home Services. Use when touching secrets, PII, auth, logging, payment, booking, AI APIs, rate limits, input validation, file uploads, or database access. Verifies no client secrets, no PII in logs, validated input, timeouts and bounded retries, and security negative tests.
---

# kael-security-sweep

Auto-trigger wrapper. Full procedure + PII classification table are canonical in `protocols/ai-data-security.md` (repo root) — do not duplicate them here. Hard rules: `RULES.md` #1, #9, #10 + Security Invariants.

When this fires:

1. Secrets server-side only; none in code, RN bundle, logs, or git-tracked examples; `.env.example` has names only.
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

## Red flags — stop and run the full sweep

- Adding a log line that includes a request body, address, phone, CCCD, bank field, or raw description.
- A new provider/DB call with no timeout and no bounded retry.
- An AI/provider-spend path with no spend gate or kill-switch.
- A secret read from anything other than server-side env; a real key in `.env.example` or a test fixture.
- "It's just staging" / "just a debug log" on a PII or secret path.

## Rationalization table

| Rationalization | Reality | Do instead |
|---|---|---|
| "Logging the payload helps debugging." | PII in logs breaches RULES #9 and persists in log storage. | Log IDs + safe metadata only; scrub before any LLM. |
| "The limiter/gate can come later." | An AI-spend path once shipped without a durable gate — unbounded-spend risk found only in a later audit. | Gate spend + add a kill-switch in the same change. |
| "Fail open so users are not blocked." | Fail-open on auth/money/validation is a vulnerability, not UX. | Fail closed on security paths; degrade honestly elsewhere. |
| "No time for a negative test." | The negative path IS the security contract. | Add the authz/validation/injection negative test now. |

## Baseline-fail scenario (documented)

A backend audit surfaced ~47 issues at once — including PII reachable in logs and an AI-spend path with no durable gate. Each was invisible to happy-path tests; only a deliberate security sweep plus negative tests caught them. Lesson: security holes do not fail the build — you must go looking for them. (Memory: 47-audit-issues, security-audit-2026-06-14, no-hiding-gaps.)
