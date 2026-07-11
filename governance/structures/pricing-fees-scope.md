# Structures Spoke - Pricing, Fees, and Scope Change

> Extracted from `STRUCTURES.md` section 15 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for pricing principles, fees, and scope-change flow. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 15. Pricing, Fees, And Scope Change

### Pricing Principles

```text
Price principles
-
|- estimate before booking
|- an offer may be locked only after the customer explicitly confirms the current Kael diagnosis/scope and estimate
|- Kael owns price-computation authority (Phase 2.0 2026-05-23): initial lock = confirmed kael_price_max at A7; updates require Kael recomputation plus explicit customer scope-change confirmation
|- worker does not enter or change final price; worker submits scope description + reason + photos and Kael recomputes
|- estimate shown as range, not exact guarantee
|- required disclaimer on every price estimate
|- no hardcoded VND values in source code
|- baseline prices live in DB/admin-managed data
|- Perplexity is market lookup only
|- no category may receive an invented baseline merely to make all six services look quoteable
|- missing baseline/market evidence keeps the case not-ready or routes it to review; it never fabricates a price
```

### Fees

Current business model:

```text
Commission model
-
|- customer pays service price + 7.5% platform/service protection fee
|- worker receives service price minus about 10% platform fee
|- platform gross around 15% total before AI/payment/support costs
```

Example only:

```text
Example job: 300,000 VND
-
|- customer pays about 322,500 VND
|- worker receives about 270,000 VND
|- platform gross about 52,500 VND
|- AI cost tracked separately
```

### Scope Change

Scope change exists because real on-site inspection may reveal a different issue.

```text
Scope change flow (Phase 2.0 2026-05-23)
-
|- worker inspects
|- worker reports new issue/scope (description + reason + optional photos)
|- Kael compute new estimate from original Kael context + worker reported scope
|- customer sees hard-stop review/appeal surface with Kael-computed new estimate (badge: computed by Kael)
|- server validates the Kael-computed proposal from policy/evidence; customer explicitly confirms, keeps the old scope, or appeals
|- only after customer confirmation may jobs.final_price be relocked to the Kael-computed max
|- when the customer rejects the proposal, the job resumes its captured pre-change status and the old agreed scope remains authoritative
|- worker continues changed work only after a validated proposal plus customer confirmation, or an explicit admin override resolving a dispute
```

Scope change modal must show:

```text
Modal content
-
|- original issue
|- new issue
|- original Kael estimate
|- new Kael-computed estimate
|- Kael compute badge clarifying authority (Phase 2.0 2026-05-23)
|- reason
|- Kael explanation
|- explicit confirm-change button
|- keep-old-scope/appeal action; cancellation is a separate explicit flow
```

Forbidden:

```text
Forbidden pricing behavior
-
|- hidden price change
|- exact guarantee
|- worker-entered final price (Phase 2.0 2026-05-23)
|- threshold-based or silent scope auto-apply without customer confirmation
|- final price change without a validated server proposal plus explicit customer confirmation, or explicit admin override
|- scope change without explicit customer confirmation, appeal path, and audit trail
|- AI-fabricated market price
```
