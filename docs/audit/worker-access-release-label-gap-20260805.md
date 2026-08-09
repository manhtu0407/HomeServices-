# Worker access-release label — dead helper, and what the worker actually sees

**Date:** 2026-08-05 · **Trigger:** Nhóm A dead-code sweep · **Severity:** LOW (test integrity), not a product hole
**Related:** `governance/Plan.md` §32.7 / §32.14 · `docs/audit/security-audit-20260614.md`

## Why this document exists

Removing the dead helper `workerV5ArrivalDestinationMeta` turned an assertion in
`apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` red. That assertion looked for the
Vietnamese unlock copy `'Đã mở căn hộ'` inside the worker surface tree. The string existed **only**
inside the dead helper, so the test had been passing on dead code for as long as the helper sat
unwired.

The first read of that failure was that the worker never sees the last-50m access state at all.
**That read was wrong**, and this document corrects it with the evidence. What is real is narrower
and mostly about test integrity.

## Correction to the initial claim

| Claimed during the sweep | Verified state |
|---|---|
| "Nhãn mở khoá căn hộ/tòa nhà chưa từng hiển thị cho thợ" | True only of *that specific meta string*. The release **state** is surfaced by two other live paths |
| "Thợ check-in xong không biết đang chờ khách bấm Cho thợ lên" | **False.** A persistent, server-state-derived disabled button says exactly that |
| Severity: product gap blocking §32 | **Overstated.** Functional loop is closed; only a redundant third signal was missing |

## What the worker actually sees across the last-50m stages

Source: `apps/mobile/components/worker/jobs/in-progress-surfaces.tsx`, the `phaseAction` chain at
`:413-450`. All three branches are derived from `addressAccess`, i.e. from server state, so they
survive a remount — they are not transient local notices.

| Server state | Worker-facing affordance | Anchor |
|---|---|---|
| `arrived` + `!worker_checked_in` | Enabled button **"Check-in bằng ảnh tại sảnh"** | `:413-421` |
| `arrived` + checked in + `!exact_unit_released` | **Disabled** button **"Chờ khách cho thợ lên"** | `:422-428` |
| `arrived` + `exact_unit_released` | Enabled button **"Bắt đầu kiểm tra"** — gate lifted | `:429-435` |

Two supporting signals, also live:

- Right after a successful check-in, a one-shot notice: *"Đã check-in tại sảnh. Đang chờ khách cho
  phép lên căn hộ."* (`:376-380`). Local component state, cleared once released (`:334`).
- The destination label resolves to the real unit address once the backend releases it:
  `workerV5ArrivalDestinationLabel` returns `deal.broadcast.fullAddressLabel` when
  `fullAddressVisible` (`apps/mobile/components/worker/ui/route.ts:85`), rendered by
  `route-map-surfaces.tsx`. The address appearing *is* the unlock signal.

Backend supplies more than the UI consumes. `AddressAccessView`
(`apps/mobile/lib/api-types/shared.ts:3-12`) carries `release_stage`
(`area_only | building_released | unit_released`), `exact_unit_released`, `worker_checked_in`,
`check_in_required`, `identity_check_required`, `customer_handoff_required`, `evidence_mode`.
Worker-side consumers of those fields today:

- `in-progress-surfaces.tsx:332-334` — `worker_checked_in`, `exact_unit_released`.
- `use-worker-route-preview.ts:37` — `release_stage !== 'area_only'` gates the map fetch only.

## What was actually dead

`workerV5ArrivalDestinationMeta` (removed from `apps/mobile/components/worker/ui/route.ts`) composed
a status meta-line: release stage (`Đã mở căn hộ` / `Đã mở tòa nhà` / `Địa chỉ đã mở` /
`Địa chỉ đang bảo vệ`) joined with the localized job status. A repo-wide grep before removal returned
**zero call sites** — no surface ever rendered it. Its live sibling
`workerV5ArrivalDestinationLabel` is wired and untouched.

So the deleted helper was a **redundant third signal**, not the only one. Removing it changed no
worker-visible behaviour.

## The finding that does matter: an assertion guarding dead code

The old assertion was `expect(workerSurface).toContain('Đã mở căn hộ')` — a source-string check over
the worker component tree. Because the string lived in an unwired helper, the assertion reported
"§32 unlock copy is present" while proving nothing about shipped UI. It would have stayed green even
if every rendering path had been deleted.

Replaced with a check on the real consumer:

```ts
expect(workerSurface).toContain('exact_unit_released === true')
```

**Generalizable lesson:** a source-string assertion proves a string exists in a file, not that a user
can ever see it. Where a test means to guarantee user-visible behaviour, it must anchor on a render
path or an RNTL query, not on `toContain` over source text. Worth a sweep of other
`toContain('<Vietnamese copy>')` assertions on the same grounds — not done here.

## Optional follow-up (not scheduled)

An explicit release-stage chip near the destination in `route-map-surfaces.tsx` (beside
`destinationLabel`) or in the check-in block would name the stage rather than implying it through the
button. Pure frontend, reuses `addressAccess`, no backend change. **Value is cosmetic** given the
button chain already communicates the state — do not treat it as a §32 blocker.

## Proposed amendment to a LOCKED document (not applied)

`governance/STRUCTURES.md` is locked; the line below is a proposal for Tu, not an edit. It would slot
into the §1.5.2 capability table only if Tu wants the redundancy recorded at that altitude. **My
recommendation is to skip it** — §1.5.2 tracks capability status, and this capability is RUNNING.

```text
| Worker last-50m access | RUNNING (#66 §32.14 Steps 1-2) — check-in → customer authorize → unit
release is surfaced to the worker through the phaseAction button chain; no explicit release-stage
label (the one helper that produced it was dead and was removed 2026-08-05) |
`components/worker/jobs/in-progress-surfaces.tsx:413-450` |
```

## Evidence commands

```bash
grep -rn "exact_unit_released\|release_stage" --include="*.tsx" --include="*.ts" apps/mobile/components/worker | grep -v __tests__
sed -n '413,450p' apps/mobile/components/worker/jobs/in-progress-surfaces.tsx
grep -n "fullAddressVisible" apps/mobile/components/worker/ui/route.ts
```
