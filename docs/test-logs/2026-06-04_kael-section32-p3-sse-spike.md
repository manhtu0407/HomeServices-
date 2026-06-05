# Kael Section 32 P3.0 SSE Spike

Date: 2026-06-04
Scope: Plan.md §32 Part A Phase 3.0

## Local code findings

- `supabase/functions/mobile-api/_shared/kael/provider-client.ts` currently has only one `callAI(request, secrets)` path.
- Provider calls use `fetch(...)` and parse `await response.json()`.
- No `ReadableStream`, `stream: true`, SSE parser, chunk parser, or callback/onToken API exists in the Kael provider layer today.
- Existing Kael `callAI` call sites are structured or final-text responses:
  - `intent.ts` intent classification and intake diagnosis: structured JSON, not token-streamable.
  - `vision.ts`: structured JSON, not token-streamable.
  - `market.ts`: market lookup JSON/metadata, not token-streamable for user-visible tokens.
  - `price-synthesis-ab.ts`: eval path, not user stream.
  - `scope-change.ts`: structured scope-change review/estimate, not token-streamable for money/scope.

## P3 implication

Tier-2 stage SSE can be implemented independently by forwarding real `kael_progress` transitions.

Token SSE cannot honestly be claimed yet. It requires a new server-side provider streaming API that:

- keeps secrets server-side;
- emits tokens only for fields classified streamable by §32 D4;
- still returns and validates the final object before persistence;
- never streams prices/scope/status/money decisions.

## Real deployment gap

Supabase Edge wall-clock tolerance for a 4-10 second open SSE connection has not been proven on staging in this pass. That remains a G1 limitation until a deployed smoke test holds an SSE stream open through a real Kael turn.

## Recommendation

Build P3 in two layers:

1. `stage` SSE using existing progress telemetry and JSON final-result fallback.
2. Add token streaming only after `callAI` grows a provider-specific streaming mode and a final validation path.
