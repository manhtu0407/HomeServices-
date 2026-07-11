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
|- diagnosis_scope
|- ai_diagnosis
|- ai_notes
|- estimate
|- worker_brief
|- worker_candidate
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

These artifacts are created or updated by Kael, workers, clients, or admin according to the workflow phase. They are audit records and phase-gated UI inputs, not direct status writers. Any artifact that implies money, booking, cancellation, scope, completion, dispute, or payment movement still requires the actor-specific validated server transition: a `KaelAutonomyDecision` only for eligible non-confirmation automation, an explicit authenticated customer action at a required gate, or an explicit admin override.

### Kael Case Work Analysis And Offer Flow

```text
Kael Case Work flow
-
|- classify intent
|- reject out-of-scope service
|- select exactly one of the six service performance profiles
|- understand the case from text, private photos, editable on-device voice transcript, and 1-3 locally extracted video frames
|- never send raw audio or raw video to an AI provider
|- build/update the structured diagnosis/scope artifact
|- ask exactly one focused question per turn until quote-ready; no fixed question cap
|- run price search only when the case is quote-ready and a validated source path exists
|- compare search result with baseline
|- synthesize a structured price estimate or an honest not-ready state
|- generate at most one advisory
|- stop for explicit customer offer confirmation
|- create worker pre-brief after the validated matching decision
|- search eligible workers; treat worker acceptance as a candidate proposal
|- stop for explicit customer candidate confirmation before final assignment
|- stop again at scope-change, completion, and payment confirmation phases
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
|- performance_profile
|- problem_category
|- problem_summary
|- facts
|- missing_facts
|- evidence_summary
|- included_scope
|- excluded_scope
|- safety_flags
|- required_worker_capabilities
|- quote_ready
|- complexity
|- price_min_optional
|- price_max_optional
|- confidence
|- next_focused_question_optional
|- next_action
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
|- no invented baseline, worker, ETA, or payment state
|- HVAC may cover cleaning, diagnosis, or repair when evidence and worker capabilities support it
|- service-specific behavior comes from the selected server profile, not a long client-side questionnaire
|- one advisory max
|- no fear-based upsell language
```
