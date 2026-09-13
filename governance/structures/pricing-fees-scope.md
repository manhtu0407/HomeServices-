# Structures Spoke - Pricing, Fees, and Scope Change

> Extracted from `STRUCTURES.md` section 15 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for pricing principles, fees, and scope-change flow. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 15. Pricing, Fees, And Scope Change

### Pricing Principles

```text
Price principles
-
|- estimate before booking
|- a confirmed offer authorizes matching against the displayed estimate ceiling; it is not yet an exact payable price
|- Auto-quote: Kael owns price-computation authority; jobs.final_price remains null at A7 and is locked only from a source-verified point quote confirmed by both participants
|- RFQ/inspection: after inspection the assigned worker proposes scope and an exact price; the owning customer approves that exact immutable proposal before work continues or jobs.final_price is set
|- the RFQ exception follows RULES.md #4; neither actor writes jobs.final_price directly and a price range never implies an agreed total
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
|- customer pays the explicitly confirmed final service price through the configured payment rail
|- Level 1 worker commission is 15% of that frozen service price
|- higher worker levels may receive a lower commission only from a server-managed policy row with stronger qualification thresholds
|- the job and worker ledger freeze the applied rate when payment intent is created; later tier changes never rewrite that transaction
|- no additional customer platform fee or bank payout may be implied unless a separately approved payment policy and provider flow exist
```

Example only:

```text
Example job: 300,000 VND
-
|- customer pays 300,000 VND
|- Level 1 worker in-app credit is 255,000 VND
|- platform commission is 45,000 VND
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
|- only after worker confirmation and explicit customer approval may jobs.final_price be locked to the exact Kael-computed full-scope total
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
|- worker-entered final price outside the explicit RFQ/inspection proposal and customer-approval contract
|- threshold-based or silent scope auto-apply without customer confirmation
|- final price change without a validated server proposal plus explicit customer confirmation, or explicit admin override
|- scope change without explicit customer confirmation, appeal path, and audit trail
|- AI-fabricated market price
```
