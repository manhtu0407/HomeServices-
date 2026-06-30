---
name: kael-ai-boundary
description: Guardrails for AI/LLM work in Home Services (Kael). Use when touching AI providers, prompts, prompt routing, price synthesis, vision analysis, advisory or worker-brief generation, AI output validation, AI logging, or AI cost tracking. Keeps calls server-side through callAI(), structured-output-first, schema-validated, with the price disclaimer and no fake data.
---

# kael-ai-boundary

Auto-trigger wrapper. Full procedure is canonical in `protocols/ai-data-security.md` (repo root) — do not duplicate it here. Hard rules live in `RULES.md` #2, #3, #4, #8.

When this fires:

1. All AI calls stay server-side through `callAI()` or an approved wrapper — never import provider SDKs in routes/components.
2. Structured data first, prose second; validate every user-facing AI output with Zod or equivalent.
3. Price estimates require the Vietnamese disclaimer (`RULES.md` #4); no hardcoded VND; Perplexity = market pricing only.
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

## Red flags — stop and re-read the boundary

- Importing a provider SDK (Anthropic/Perplexity/etc.) in a route, component, or RN file.
- Rendering AI output to a user without a Zod (or equivalent) validation step.
- Parsing AI JSON with an ad-hoc/greedy regex instead of a real parser.
- A price/number not traceable to config or market data (hardcoded VND).
- A price estimate shown without the Vietnamese disclaimer.
- "The model returns clean JSON, validation is unnecessary."

## Rationalization table

| Rationalization | Reality | Do instead |
|---|---|---|
| "The AI output is already well-formed." | Models drift, truncate, and wrap JSON in prose. | Validate with a schema before it reaches a user. |
| "A quick regex extracts the JSON." | A non-greedy regex once broke on nested JSON — wrong data parsed while looking valid. | Use a brace-counting/real parser; schema-validate the result. |
| "Hardcode the fee/price for now." | Hardcoded VND breaches RULES and rots silently. | Read from config/env or the market path. |
| "Fallback can fake a success card." | Fake success is forbidden; it lies to the user. | Fall back to an honest empty/error state. |

## Baseline-fail scenario (documented)

A `safeParseJSON` helper used a non-greedy regex to pull JSON out of an AI response. It silently truncated nested JSON, so the parsed estimate was wrong while looking valid. Lesson: never trust AI output shape — validate structure, parse defensively; the boundary is a contract, not a formality. (Memory: safeParseJSON-regex, duplicate-types, hardcoded-vnd.)
