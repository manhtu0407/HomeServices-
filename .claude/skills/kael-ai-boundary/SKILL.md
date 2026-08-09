---
name: kael-ai-boundary
description: Guardrails for AI/LLM work in NestScout (Kael). Use when touching AI providers, prompts, prompt routing, price synthesis, vision analysis, advisory or worker-brief generation, AI output validation, AI logging, or AI cost tracking. Keeps calls server-side through callAI(), structured-output-first, schema-validated, with the price disclaimer and no fake data.
---

# kael-ai-boundary

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/ai-data-security.md` — do not duplicate it here. Hard rules live in `governance/RULES.md` #2, #3, #4, #8.

When this fires:

1. All AI calls stay server-side through `callAI()` or an approved wrapper — never import provider SDKs in routes/components.
2. Structured data first, prose second; validate every user-facing AI output with Zod or equivalent.
3. Price estimates require the Vietnamese disclaimer (`governance/RULES.md` #4); no hardcoded VND; Perplexity = market pricing only.
4. Track session cost before the next call; enforce timeouts/retries; fallback is allowed, fake success is forbidden.
5. Pair with `kael-security-sweep` and `kael-tdd` (negative cases).

Output:

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
