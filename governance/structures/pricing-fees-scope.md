# Structures Spoke - Pricing, Fees, and Scope Change

> Extracted from `STRUCTURES.md` section 15 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for pricing principles, fees, and scope-change flow. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 15. Pricing, Fees, And Scope Change

### Pricing Principles

```text
Price principles
-
|- estimate before booking
|- Kael owns final-price authority (Phase 2.0 2026-05-23): initial lock = kael_price_max at A7 Kael decision; updates only via Kael-computed A11 scope decision
|- worker does not enter or change final price; worker submits scope description + reason + photos and Kael recomputes
|- estimate shown as range, not exact guarantee
|- required disclaimer on every price estimate
|- no hardcoded VND values in source code
|- baseline prices live in DB/admin-managed data
|- Perplexity is market lookup only
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
|- Kael decides approve/reject from policy/evidence; customer can accept outcome or appeal
|- on Kael approve, jobs.final_price relocked to Kael-computed max
|- on Kael reject, job cancelled (per migration 20260518181500)
|- worker continues only if Kael decision or admin override allows it
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
|- continue button
|- cancel/reject button
```

Forbidden:

```text
Forbidden pricing behavior
-
|- hidden price change
|- exact guarantee
|- worker-entered final price (Phase 2.0 2026-05-23)
|- final price change without validated KaelAutonomyDecision or explicit admin override
|- scope change without validated KaelAutonomyDecision, appeal path, and audit trail
|- AI-fabricated market price
```
