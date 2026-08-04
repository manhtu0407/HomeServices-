# Prototype handoff — Customer Frontend v2.1

Point-in-time record of the Customer v2.1 design package that the shipped mobile surface was derived from. Rescued from the untracked agent scratch directory where it was the only copy: three source files merged into this one, their text carried over verbatim.

**Authority: reference only.** Per `CLAUDE.md` and `docs/INDEX.md`, the governance stack outranks this file. Where this record disagrees with `governance/STRUCTURES.md`, `docs/architecture/status-vocabulary.md`, `docs/architecture/workflow-step-contracts.md`, or shipped code, the governance source wins. Prototype packages are reference material, never a source to copy from.

| | |
|---|---|
| Source package | `NestScout_Customer_Frontend_Code_v2_1_FINAL_VERIFIED` / `..._Images_v2_1_FINAL` |
| Package date | 2026-06-19 |
| Rescued from | `.scratch/customer-v21-code/`, `.scratch/tmp-stage5/docs/`, `.scratch/zip-source-v21/` |
| Screens | 23 routes + 8 boards |
| Superseded by | the shipped Expo surface under `apps/mobile/` |

Downstream design contracts that carry this direction into production: `production-glass-motion-contract.md`, `auth-liquid-signature-contract-20260604.md`, `docs/architecture/agentic-workflow-spec-20260616.md`.

---

## Design specification

### Visual language

- Base canvas: near-white mint with large low-contrast aura fields.
- Content: quiet opaque cards with soft edge definition.
- Functional layer: Liquid Glass tab bar, Kael accessory, headers and high-value controls.
- Radius system: 18–31 px at the 390 px design width.
- Motion: spring press, subtle lens breathing and short state morphs; disabled under reduced motion.
- Typography: Apple-system stack with strong title hierarchy and compact Vietnamese body copy.

### Navigation

`Home | Services | Activity | Profile` live in one four-column floating glass tab bar. Kael is a 66 px separate accessory. Agentic Center is reached from the Profile utility card.

### Agentic Work Case

The main path is Discover → Intake → Case Work analysis → Matching → Options → Quote → Approval → Payment protection → Worker handoff → Live service → Completion/release. Secondary screens operate on the same Case and never fork a separate business object.

### Chat isolation

Normal Chat is general assistance. Case Work is case-bound evidence, tool log, artifacts and approvals. Copying information between them requires an explicit user action and a case event.

### Payment

The payment UI identifies supported Vietnamese banks, but the authoritative path remains client pay-in → payment order → immutable internal ledger/protected money → completion approval → worker wallet → verified payout.

### Worker continuity

Customer and Worker Frontends share Case/events, not controls. The future Worker UI receives authorized evidence after assignment and owns worker-only actions.

---

## One Agentic Work Case

All 23 screens are views over one Case aggregate, not a collection of disconnected mini-flows. Utility screens such as Agentic Center, Approval Queue, Memory, Usage Ranking and Protect Money either operate on the active Case or on explicitly scoped customer preferences/history.

The Case path is monotonic where authority matters: intake evidence → analysis artifact → proposal → explicit approval → protected payment → assignment → live work → completion evidence → release. A secondary section may summarize or route the user, but it must not create a shadow payment, shadow assignment or second approval state.

---

## Screen inventory

| Order | ID | Title | Primary navigation context |
|---:|---|---|---|
| 1 | `2.1-home` | Trang chủ khách hàng | Home |
| 2 | `2.2-search` | Tìm & đặt dịch vụ | Services |
| 3 | `2.3-media` | Media / Voice intake | Services |
| 4 | `2.4-chat-normal` | Kael Chat thường | Kael accessory |
| 5 | `2.5-chat-case` | Kael Case Work Agentic | Activity / Case |
| 6 | `2.6-case-overview` | Tổng quan Case | Activity / Case |
| 7 | `2.7-matching` | Matching & AI Score | Activity / Case |
| 8 | `2.8-options` | Kael Helper / Options | Activity / Case |
| 9 | `2.9-quotes` | Báo giá & đề xuất | Activity / Case |
| 10 | `3.1-payment-review` | Xác nhận thanh toán | Activity / Case |
| 11 | `3.2-payment-method` | Phương thức thanh toán | Activity / Case |
| 12 | `3.3-payment-protected` | Bảo vệ thanh toán | Activity / Case |
| 13 | `2.10-location-eta` | Vị trí & ETA | Activity / Case |
| 14 | `2.11-live-alert` | Cảnh báo thợ sắp đến | Activity / Case |
| 15 | `2.12-job-accepted` | Đơn được xác nhận | Activity / Case |
| 16 | `2.13-job-progress` | Công việc đang diễn ra | Activity / Case |
| 17 | `5.1-agentic-home` | Kael Agentic Center | Profile utility |
| 18 | `5.2-command-center` | Active Case Command Center | Profile utility |
| 19 | `5.3-approval-queue` | Approval Queue | Profile utility |
| 20 | `5.4-memory` | Memory & Preferences | Profile utility |
| 21 | `6.1-profile-overview` | Tổng quan khách hàng | Profile |
| 22 | `6.2-usage-ranking` | Xếp hạng sử dụng | Profile |
| 23 | `6.3-protect-money` | Bảo vệ đồng tiền | Profile |

---

## Render manifest

The PNG renders are ~50 MB and stay out of git. They live on disk at `.scratch/customer-v21-ref-full/` (full set) and `.scratch/customer-v21-ref/` (5-screen subset). This manifest preserves the index if the binaries are ever lost.

**Boards (8):** `00_agentic-workflow-map`, `00_customer-frontend-v2.1-contact-sheet`, `01_liquid-glass-navigation`, `02_discover-case-work`, `03_payment-vietnam-banks`, `04_live-service-worker-continuity`, `05_profile-agentic-center`, `06_3d-icon-asset-audit`.

**Screens (23):** one `<screen-id>.png` per row of the inventory above.

The 3D icon masters shipped with this package are byte-identical to the assets already committed under `apps/mobile/assets/`, so they were not rescued.
