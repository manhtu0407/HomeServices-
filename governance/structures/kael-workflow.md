# Structures Spoke - Kael Workflow

> Extracted from `STRUCTURES.md` section 9 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for Kael artifacts, price-check flow, provider roles, structured output. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 9. Kael Workflow

Kael is the default server-side workflow actor for money-impacting orchestration when policy has enough evidence. Raw LLM output remains non-authoritative: every transition requires a validated `KaelAutonomyDecision` with policy id, evidence, confidence, reversibility/appealability, and resulting event.

### Kael Artifact Lifecycle

```text
Canonical artifacts
-
|- service_request
|- process_ticket
|- ai_diagnosis
|- ai_notes
|- estimate
|- worker_brief
|- provider_match
|- booking
|- scope_change
|- cancellation_review
|- completion_evidence
|- completion_review
|- dispute_decision
|- payment_decision
|- review
```

These artifacts are created or updated by Kael, workers, clients, or admin according to the workflow phase. They are audit records and phase-gated UI inputs, not direct status writers. Any artifact that implies money, booking, cancellation, scope, completion, dispute, or payment movement still requires a server-validated `KaelAutonomyDecision` or explicit admin override.

### Kael Price Check Flow

```text
Kael Price Check flow
-
|- classify intent
|- reject out-of-scope service
|- understand problem from text/photos
|- ask clarification if needed
|- run price search
|- compare search result with baseline
|- synthesize structured price estimate
|- generate at most one advisory
|- create worker pre-brief after validated Kael matching decision
```

### AI Provider Roles

```text
DeepSeek
-
|- primary text default for intent_classification, clarification, problem_synthesis, advisory_generation, worker_brief, post_job_learning, educational_response
|- Anthropic fallback when `ai_provider_routing` / `routing.config.ts` allows it

Anthropic
-
|- required vision_analysis with no fallback
|- scope_change reasoning
|- price_synthesis primary after F26 A/B rejected Perplexity for purpose #6

Perplexity
-
|- market_lookup
|- restricted to Tier 1 Vietnamese sources when source-trust filtering is enabled

Provider role mapping is sourced from `ai_provider_routing` (DB) plus `routing.config.ts` (code). Effective 2026-05-26 per Plan.md §23 P3 and §25 R2; Tu approval is recorded in Plan.md §26 F1.
```

### Structured Kael Output

```text
Kael output shape
-
|- service_type
|- problem_category
|- problem_summary
|- complexity
|- price_min
|- price_max
|- confidence
|- advisory_optional
|- disclaimer
|- worker_prebrief
```

Rules:

```text
Kael output rules
-
|- structured data first
|- prose second
|- schema validation before UI
|- no raw AI output to user
|- no exact price guarantee
|- no unsupported service advice
|- one advisory max
|- no fear-based upsell language
```
