# Structures Spoke - Kael Evidence-Gated Self-Learning

> Extracted from `STRUCTURES.md` section 10 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for Kael learning services, evidence gate, learned rules. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 10. Kael Evidence-Gated Self-Learning System

This is the controlled learning system that lets Kael improve while keeping autonomy server-side, evidence-gated, reversible, and audited.

Earlier conservative model rejected:

```text
Rejected model
-
|- every learning candidate requires admin approval
|- Kael only reports, never improves itself
```

Current model:

```text
Approved model
-
|- self-learning is allowed
|- learning must be evidence-gated
|- learning can improve analysis behavior, price suggestions, and autonomy policy evidence thresholds
|- learning cannot execute booking/payment/cancel without a validated KaelAutonomyDecision
|- learning cannot auto-approve worker punishment
|- learning cannot expand supported service scope
|- every learned change must be logged, reversible, and measurable
```

### 10A. MarketMemoryService

Purpose:

```text
MarketMemoryService
-
|- compare Kael estimate vs final accepted price
|- compare Perplexity result vs actual transaction
|- detect baseline drift by district/problem/complexity
|- detect repeated underestimation/overestimation
|- create price learning candidates
|- auto-promote price priors only after evidence gate passes
```

Inputs:

```text
Inputs
-
|- service_type
|- problem_category
|- district
|- Kael estimate
|- Perplexity context
|- baseline used
|- worker confirmed facts/evidence
|- Kael-locked final price
|- scope change reason
|- completion status
|- customer rating
```

Output:

```text
Market learning output
-
|- candidate_type: price_prior_update
|- affected_service
|- affected_problem
|- affected_district
|- old_range
|- observed_range
|- suggested_range
|- confidence
|- evidence_count
|- promotion_status: pending / auto_promoted / rejected / rolled_back
|- version
|- audit_reason
```

### 10B. CaseReviewService

Purpose:

```text
CaseReviewService
-
|- review completed jobs
|- detect wrong estimate patterns
|- detect missing clarification questions
|- detect repeated scope-change patterns
|- detect worker overcharge risk
|- propose better clarification/advisory behavior
|- auto-promote analysis rules only after evidence gate passes
```

Output:

```text
Case learning output
-
|- estimate_accuracy
|- detected_error_pattern
|- missing_question_candidate
|- advisory_candidate
|- fraud_risk: low/medium/high
|- recommended_learned_rule
|- confidence
|- evidence_count
|- promotion_status
|- rollback_available: true
```

### 10C. Evidence Gate

A learning candidate can auto-promote only if:

```text
Evidence gate
-
|- similar pattern appears >= 5 times
|- cases are completed transactions, not drafts
|- final outcome is confirmed by validated Kael completion/dispute/payment decision or explicit admin override
|- no major contradiction from recent similar cases
|- confidence is above configured threshold
|- learning changes to booking/payment/cancel policy require versioned evidence, rollback, and audit
|- learning does not expose or depend on unsafe PII
|- learning has a rollback path
```

### 10D. Learning Flow Illustration

```text
Job completed
-
|- collect safe metadata
|- compare Kael estimate vs actual outcome
|- compare problem classification vs worker final report
|- review scope change and customer rating
|- create learning candidate
|- check evidence gate
   -
   |- if gate fails
   |  -
   |  |- keep as pending candidate
   |  |- show in admin learning dashboard
   |  |- do not affect runtime behavior
   |
   |- if gate passes
      -
      |- auto-promote to learned rule or price prior
      |- assign version
      |- apply to future Kael analysis
      |- monitor future accuracy
      |- allow admin rollback
```

### 10E. Example Learned Rule

```text
Observed pattern
-
|- 5 completed plumbing jobs
|- user said: repeated clogging
|- Kael classified as small clogged drain
|- workers repeatedly found main pipe blockage
|- final price was consistently higher than initial estimate

Auto-promoted learned rule
-
|- when user mentions repeated clogging
|- ask whether multiple drains are affected
|- increase complexity prior from small to medium
|- include advisory about main-pipe clearing when justified
|- monitor next 10 similar cases
```

### 10F. Forbidden Autonomous Learning Effects

```text
Forbidden
-
|- raw AI auto-charges customer
|- raw AI auto-confirms booking
|- raw AI auto-cancels job
|- raw AI auto-approves worker
|- auto-punish worker
|- raw AI changes final price without validated policy evidence
|- auto-expand supported service scope
|- hide learning changes from admin
```
