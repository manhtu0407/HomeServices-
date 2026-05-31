# Client Price Check Production UI Prep

Date: 2026-05-14
Status: ready for Tu review before production UI build planning
Surface: Expo React Native customer app

2026-05-18 update: this remains a historical A2-A5 UI-prep artifact. The
store-bound runtime path is now Supabase Edge Function `mobile-api`; do not use
the older local/mock or "out of scope for the next UI slice" language below to
block the current backend wiring work.

## Purpose

This document converts the approved Client Price Check prototype learnings into a production UI contract. It is a preparation artifact only. The throwaway runtime prototype files were removed after the production slice was accepted; keep the decisions here, not in runtime reference code.

The next implementation plan should use this as the decision baseline for the customer A2-A5 production UI slice:

- A2: select electrical/plumbing/cleaning service and problem chips
- A3: describe the problem and prepare media/address UI affordances
- A4: Kael clarification/loading/fallback states
- A5: price estimate card

Out of scope for the historical A2-A5 slice unless Tu explicitly approves it: A6 time selection, A7 Kael orchestration/matching, worker flow, payment, scope change, Kael learning, production Supabase migrations, and real AI/API calls.

## Current Repo Readiness

The repo is ready for a production UI planning pass, not for direct production absorb without a dedicated build plan.

- `apps/mobile/app/(customer)/booking.tsx` is still a placeholder and should become the primary A2-A5 surface.
- `apps/mobile/app/(customer)/home.tsx` is still a placeholder and should remain a light entry/dashboard surface.
- `apps/mobile/app/(customer)/kael.tsx` is still a placeholder and should stay a read/entry-support surface, not a generic chatbot.
- The former client price-check prototype route/component have been deleted. Treat this document and `docs/agent-lessons.md` as the durable context.
- `packages/shared/src/constants.ts` and `packages/shared/src/validation.ts` already enforce electrical/plumbing/cleaning scope at the shared layer.
- `apps/mobile/constants/colors.ts` is still default blue/slate and should be replaced or extended by production price-check tokens in the next UI build.

Cleanup note: mobile prototype runtime artifacts should not be reintroduced before store-bound builds.

## Production Surface Contract

Primary flow:

- `Dat lich` tab owns A2-A5 and should be the first production surface for the price-check flow.
- The flow should be multi-step, not one dense scroll surface.
- Each step should have a clear primary action and one calm secondary/back action.
- The app should show progress without turning the screen into a presentation deck.

Supporting surfaces:

- `Trang chu` should show address context, service entry cards, and active draft/estimate summary later. It should not duplicate the full A2-A5 flow.
- `Kael` tab should initially show price-check read mode or a secondary entry to the same flow. It must not become a generic repair chatbot.

Future production component boundary:

- Keep production components free from prototype imports or reference-code dependencies.
- Use this document as the design reference, not deleted prototype source.
- Prefer focused components with small interfaces: service selector, problem chip group, detail input, clarification block, estimate card, fallback/error card, and bottom action bar.
- Keep local UI state in the component layer until backend contracts are implemented; do not create fake persistence.

## Visual Contract

Approved direction:

- Color/material: use the V11 material direction as baseline. It should feel mint/green, warm, trustworthy, and layered, but stay at medium complexity.
- Avoid flat mint-only surfaces. Use semantic material layers: soft off-white base, mint/leaf primary areas, deeper mint for selected/active controls, slate/ink text, and restrained copper/clay accents for warnings or fee/uncertainty.
- Do not overbuild the background. Use subtle off-white depth, material bands, or quiet edge treatments. Avoid image backgrounds for this flow unless a later visual pass proves a real product benefit.
- Motion: interaction-triggered only. No decorative auto-loop. The best prototype direction is the mint wave/touch response, distributed lightly across interaction points.
- Icon language: use the approved prototype icon baseline as a starting point, but refine it for clearer service/problem recognition. Prefer outlined pictograms with controlled inner detail, not filled generic blobs.
- Typography: keep the lighter, calm font direction from the latest prototype. Avoid heavy bold weights in dense UI. Use weight and size sparingly to create hierarchy.
- Layout: production must be more breathable than the prototype. Do not pack service choice, chips, explanation, state switchers, and CTA into one cramped area.

Motion rules for production:

- Trigger motion on tap, press-in, selection, successful step transition, retry, or received estimate.
- Keep each motion under the threshold where it competes with content.
- Use the same motion grammar across service cards, chips, and CTA rather than isolated custom effects.
- Respect reduced-motion support when available in React Native.

## State And Data Contract

Initial production UI state can be local/mock-backed until the backend contract is approved, but it must be shaped like the future API flow.

Recommended mobile state shape:

```ts
type PriceCheckUiStep = 'service' | 'details' | 'clarification' | 'estimate'

type PriceCheckUiStatus =
  | 'idle'
  | 'editing'
  | 'loading'
  | 'needs_clarification'
  | 'estimate_ready'
  | 'fallback'
  | 'error'

type PriceCheckDraft = {
  serviceType: 'electrical' | 'plumbing' | 'cleaning'
  problemChips: string[]
  description: string
  photoUris: string[]
  addressLabel?: string
  clarificationAnswers: Record<string, string>
}
```

Recommended estimate card shape:

```ts
type PriceCheckEstimateCard = {
  problemLabel: string
  complexity: 'small' | 'medium' | 'large' | 'unknown'
  priceRangeLabel: string
  confidenceLabel: string
  reasons: string[]
  advisory?: string
  disclaimer: string
  source: 'kael' | 'baseline_fallback'
}
```

Required disclaimer meaning for every estimate:

```text
Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.
```

Stable ASCII-normalized assertion text for tests:

```text
Day la uoc tinh dua tren thi truong. Gia thuc te se duoc xac nhan boi tho truoc khi bat dau.
```

The production UI may display the fully accented Vietnamese version, but tests can also assert the meaning through a stable constant.

Clarification behavior:

- Ask 0-2 specific questions.
- Do not ask generic "please provide more info" questions.
- Allow skip only when the UI clearly explains uncertainty impact.
- Preserve previous answers when moving back and forward.

Fallback/error behavior:

- Fallback means a safe baseline or safe unavailable state, not a fabricated estimate.
- Error copy must be Vietnamese and non-technical.
- Retry must re-enter loading without losing the user's draft.
- If no safe estimate exists, show unavailable state instead of a fake price.

## Backend Boundary

The current mobile runtime is Supabase Edge Function `mobile-api`, not hosted Next.js. Mobile should align with this boundary:

- `GET /functions/v1/mobile-api/services` returns supported electrical/plumbing/cleaning categories, problem chips, and baselines.
- `POST /functions/v1/mobile-api/jobs` accepts validated input and returns a structured estimate, fallback marker, or clear unavailable/error state.
- Mobile sends Supabase access token through `Authorization: Bearer <token>`.
- Edge verifies user and role server-side.
- Service-role Supabase client stays inside Edge/server-only boundary.
- React Native never calls AI providers, never stores server secrets, and never mutates workflow-sensitive tables directly.

Future shared contracts should live in `packages/shared`:

- price-check input schema
- price-check response union
- API success/error envelope
- estimate card shape
- service catalog shape

## Safety Contract

The production UI build must preserve these rules:

- Only electrical, plumbing, and cleaning are active.
- No booking broadcast, matching, worker flow, payment, or scope-change UI in the A2-A5 slice.
- No exact guaranteed price.
- No raw AI output shown to users.
- No fake price when Kael/provider/baseline data is unavailable.
- No client-side AI provider import or direct provider call.
- No API secrets or service-role keys in the mobile bundle.
- No PII logging. Draft descriptions and full addresses are sensitive.
- Vietnamese user-facing copy.

## Readiness Checklist For Next Build Plan

Before implementing production UI:

- Confirm whether the first production UI pass remains local/mock-backed or waits for API contracts.
- Decide whether the new production components live under `apps/mobile/components/client-price-check/production/` or a shorter shared folder such as `apps/mobile/components/price-check/`.
- Decide whether to introduce production design tokens in `apps/mobile/constants/colors.ts` or a dedicated price-check theme module.
- Define static tests that prevent prototype-only imports from customer tabs.
- Define static tests that prevent mobile AI provider imports and mobile secrets.
- Define UI acceptance scenarios for small screen, long Vietnamese copy, loading, clarification, estimate, fallback, error, and retry.

## Recommended Next Step

Write the production UI implementation plan for the A2-A5 customer `Dat lich` slice. That plan should be UI-only unless Tu explicitly approves backend/API work in the same phase.
