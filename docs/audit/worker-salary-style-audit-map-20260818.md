# Worker Salary settlement UI — Style Audit Map

## Scope

The settlement change covers Worker Earnings/Withdrawal, Admin Finance reconciliation and Worker detail, plus the Customer payment confirmation rail. The UI remains a read-only presentation of server settlement snapshots; it does not calculate salary, commission, eligibility or payout status.

## Reuse map

| Surface | Reused authority | Added or changed pattern |
| --- | --- | --- |
| Worker Earnings | `apps/mobile/components/worker/earnings/overview-surfaces.tsx`, `overview-model.ts` | Separate provisional income, available balance, held amount, collected commission and commission due. |
| Worker Withdrawal | `payout-request-surfaces.tsx` and existing payout action/button primitives | Server-owned `eligible_at`, 24-hour waiting copy and Admin-verification copy. |
| Admin Finance | `admin-finance.tsx`, `admin-finance-reconciliation-modal.tsx`, `admin-finance-reconciliation-status.ts` | Cash confirm/reject actions, reason validation and server-supplied gross/platform fee/Worker net preview. |
| Admin Worker detail | Existing `reviewSection`, `metaGrid`, `MetaItem` and finance formatter primitives | Adds a capability-gated finance snapshot: provisional, available, held, reserved, cash commission collected/due and withdrawal eligibility. |
| Customer payment | `customer-payment-rail-surface.tsx` and existing payment surface/button primitives | Online and cash claims explicitly say salary is provisional until Admin reconciliation. |

## Token and component audit

- Typography stays on `apps/mobile/design/theme.ts` system typography and existing Worker/Admin/Customer style modules.
- Status colors and borders reuse the existing semantic `color` and surface tokens; no settlement component adds raw color literals.
- Existing card radius, spacing rhythm, button hierarchy, touch targets and glass/aura primitives remain the source of truth.
- No new glass layer or blur is introduced. The settlement UI uses the existing opaque/lightly tinted card language and existing modal shell.
- `Reduce Transparency` continues to select the opaque surface path. `Reduce Motion` does not receive a countdown animation or transition-heavy effect.
- The withdrawal time display is derived from server `eligible_at`; local time is used only to refresh presentation and never to authorize a payout.

## State matrix covered

- Customer online claim: accepted, provisional salary visible, Admin pending.
- Customer cash claim: accepted, provisional salary visible, Admin pending.
- Admin online verify/reject: verified/held or rejected/reversed.
- Admin cash confirm/reject: Worker net preserved; commission collected or recorded as due.
- Admin Worker detail: finance snapshot is read-only and requires `finance.read`; it does not expose client-side money calculations.
- Worker withdrawal: reserved, waiting 24 hours, awaiting Admin verification, processing, paid, rejected/reversed.
- Error/retry: existing refresh/action busy/error treatment is retained.
- Locale/theme/accessibility: VI/EN copy pairs are supplied; light/dark and Reduce Motion/Transparency paths remain in existing surface authority.

## Explicit gaps kept outside this batch

- Native iOS/Android screenshots across the full state matrix require device or simulator execution.
- SQL transition tests require the local Supabase/Docker runtime; the migration contract test is present, but runtime execution is not claimed while the host RAM/daemon preflight is below the repository gate.
- No broad token refactor or design-system rewrite was introduced.
