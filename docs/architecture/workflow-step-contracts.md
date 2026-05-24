# Workflow Step Contracts

> Status: active reference. Phase 5.3 (plan §22.10.D, 2026-05-23).
>
> STRUCTURES.md §6 owns workflow truth. This doc maps each customer step
> A2-A7 to the implementation surface + the responsibility boundary that
> Booking wizard (Phase 3.1) enforces.

## A2 — Choose service

| Field | Value |
|---|---|
| Surface | `apps/mobile/components/customer/booking-wizard.tsx` → `ServiceStep` |
| Inputs | Service type (electrical | plumbing | cleaning) |
| Backend dependency | Service taxonomy in `service_categories` table (DB) |
| State transition | Wizard `select_service` → step `describe` |
| Validation | Service type must be supported (RULES.md Rule #6) |
| Failure modes | Unsupported tap is impossible (cards only render supported services) |
| Tests | `mobile-wiring.test.ts` checks BookingWizard exports + step `service` rendered |

## A3 — Describe issue

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `DescribeStep` |
| Inputs | description (min 10 chars), 0-5 photos, address autocomplete (HCMC district required) |
| Backend dependency | `jobService.createJob`, `uploadJobMediaDrafts(stage='before')` |
| State transition | Wizard `submit_describe` → calls `createRemoteJobFromDraft` → step `analyzing` |
| Validation | Description min 10 chars, district must be a known HCMC district |
| Failure modes | DescribeStep shows error if validation fails or API rejects |
| Tests | `mobile-workflow.test.ts` covers `createRemoteJobFromDraft`; address autocomplete tested separately |

## A4 — Kael clarification

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `AnalyzingStep` |
| Inputs | none (waits for Kael) |
| Backend dependency | `runKaelPipeline` inside `createJob` Edge handler |
| State transition | Wizard `analyzing` → when remote estimate appears, auto-jump to step `estimate` |
| Validation | n/a |
| Failure modes | If pipeline returns unsupported/no_baseline/AI_FAILED, Edge cancels the job and the wizard returns to `describe` step |

## A5 — Estimate card

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `EstimateStep` |
| Inputs | none (renders Kael estimate) |
| Backend dependency | `jobs.kael_price_min/max/advisory` via `dealToSnapshot` |
| State transition | Wizard `goto time` on continue |
| Validation | Always shows price disclaimer (Rule #4) |
| Failure modes | If `estimate` is null, shows fallback dash values |

## A6 — Time selection

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `TimeStep` |
| Inputs | Now only (Phase 5.10 keeps `schedule` chip disabled with "sắp có" hint) |
| Backend dependency | none |
| State transition | Wizard `goto summary` |
| Failure modes | n/a |

## A7 — Summary + Confirm

| Field | Value |
|---|---|
| Surface | `booking-wizard.tsx` → `SummaryStep` |
| Inputs | none (renders service + address + estimate + fee + cancellation) |
| Backend dependency | `actions.confirmRemoteSearch` → `jobService.confirmSearch` |
| State transition | Wizard `done` on confirm success |
| Validation | Disabled while confirming; back button available |
| Failure modes | Confirm error surfaces in workflow provider state; wizard remains on summary |

## Cross-cutting rules

- Wizard never auto-advances past A7 confirm (Rule #7).
- Wizard does not show worker info — that lives in History tab once worker accepts.
- Phase 2.0 (2026-05-23): final_price source is Kael-locked at A7 confirm baseline (`jobs.final_price = kael_price_max`). Workers do not change this value at B7.
