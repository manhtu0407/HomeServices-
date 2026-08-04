# Prototype handoff — Worker Agentic v5.0

Point-in-time record of the Worker v5.0 design package, rescued from the untracked agent scratch directory where it was the only copy. Eight source files were merged into this one; every substantive claim is carried over unchanged, but the package-layout and screen-inventory sections were consolidated (the per-row `render 390×844` repetition was factored into the section note) and the folder-pairing instructions were folded into *Package layout*.

**Authority: reference only.** Per `CLAUDE.md` and `docs/INDEX.md`, the governance stack outranks this file. The state names in *Workflow logic* below are **prototype names, not the shipped vocabulary** — the canonical list is `docs/architecture/status-vocabulary.md`, and the transition contracts are `docs/architecture/workflow-step-contracts.md`. Do not code against the names recorded here.

| | |
|---|---|
| Source package | `HomeServices_Workers_Agentic_Code_v5_0` / `..._Images_v5_0` |
| Package date | 2026-06-26 |
| Rescued from | `.scratch/workers-v5-image-source/`, `.scratch/stage14-source/docs/` |
| Screens | 38 routes across 5 product areas + Kael global accessory |
| Derived from | the Customer v2.1 package (`prototype-handoff-customer-v21-20260619.md`) |

Downstream contracts that carry this direction into production: `worker-production-contract.md`, `docs/architecture/kael-worker-advisory-boundary-spec-20260604.md`, `docs/architecture/agentic-workflow-spec-20260616.md`.

---

## Package layout

The Images package held every visual and non-code handoff artifact:

- `screens/` — 38 production-scale reference renders.
- `boards/` — contact sheet, workflow, Customer parity, Kael suite, lifecycle, profile and source-asset audit.
- `assets/` — supplied 3D icons, Kael/avatar and bank materials.
- `materials/` — Customer/Entry visual references used to preserve style.
- `docs/` — design, Kael, workflow, provenance and validation reports (the content of this file).
- Root JSON manifests — machine-readable contract for coding agents.

It was paired beside `HomeServices_Workers_Agentic_Code_v5_0` so the default relative asset path resolved automatically.

---

## Coding agent handoff

### Recommended implementation order

1. Open `NestScout_Workers_Agentic_SEMANTIC_v5_0.html` to inspect the complete interactive implementation.
2. Open `NestScout_Workers_Agentic_EXACT_v5_0.html` to compare each 390×844 exact render.
3. Use `contracts/screen-routing.json` and `typescript/worker-agentic.registry.ts` as the route source of truth.
4. Use `contracts/worker-workflow.json` and `typescript/worker-agentic.workflow.ts` for state transitions.
5. Use `contracts/authority-matrix.json` before wiring any Kael automation.
6. Reuse files in `assets/`; do not redraw or substitute the supplied icons.

### Non-negotiable acceptance rules

- Preserve the Customer v2.1 liquid-glass tokens and component grammar.
- Keep four primary tabs together and Kael as the separate global accessory.
- Keep all 3 Kael modes: Chat thường, Nhận việc, Case Work.
- Never allow Kael to auto-accept jobs, check in, send high-impact drafts, submit completion or request payout.
- Keep the removed top audit/brand banner absent on every Worker screen.
- Match each route against `screens/<screen-id>.png` before completion.

---

## Kael Chat specification

### 3 chế độ trực tiếp tương ứng Customer

1. **Chat thường (`3.1`)**: hỏi đáp không ghi quyết định vào Case. Dùng để tìm hiểu kỹ năng, lịch, khu vực và thu nhập.
2. **Nhận việc (`3.2`)**: Kael lọc cơ hội theo kỹ năng, lịch trống, khoảng cách, thu nhập và rủi ro; Worker tự mở và nhận đề nghị.
3. **Case Work (`3.3`)**: chỉ hoạt động trên một Case thật, nguồn dữ liệu độc lập theo Case, có tiến độ agent, bằng chứng, draft và approval boundary.

### Các màn bổ trợ

- `3.4` Case Chat: trao đổi Worker–Customer–System theo Case.
- `3.5` Command Center: trạng thái Case, ETA, scope, task và action tiếp theo.
- `3.6` Approval Queue: quyết định high-impact chờ Worker xác nhận.
- `3.7` Timeline: audit trail tuần tự.
- `3.8` Safety escalation: dừng việc, bằng chứng và hỗ trợ khẩn cấp.

### Quy tắc quyền hạn

Kael được phép phân tích, lọc, đề xuất, giải thích và soạn bản nháp. Kael không được tự nhận việc, tự check-in, tự gửi scope change, tự xác nhận completion hoặc tự yêu cầu payout.

---

## Workflow logic

Prototype state names — see the authority note at the top of this file.

### Happy path

`AVAILABLE → OPPORTUNITY_ISSUED → OFFER_REVIEWED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETION_DRAFTED → COMPLETION_SUBMITTED → CASE_CLOSED → PAYOUT_AVAILABLE → PAYOUT_PENDING`

### Nhánh phạm vi

Trong `IN_PROGRESS`, Kael có thể phát hiện phát sinh và soạn draft. Worker xem lại và gửi; Customer là chủ thể phê duyệt. Sau khi được duyệt, Worker quay về completion evidence.

### Nhánh an toàn

Worker có thể mở Safety escalation từ Kael/Case. Workflow chỉ trở lại `IN_PROGRESS` sau khi Worker xác nhận rủi ro đã được xử lý.

### Tính liên kết

- 38 màn đều có route ID ổn định.
- 26 transition được kiểm tra source/target.
- 18 màn happy path liên tục từ chuẩn bị ca tới tài khoản payout.
- Kael Chat có deep links vào offer, scope draft, approval queue, timeline và safety.

---

## Screen inventory

38 màn hình, chia thành 5 khu vực sản phẩm và một Kael global accessory; Profile được mở rộng thành 10 màn chi tiết. Overflow figures are from the 390×844 reference render.

### Trang chủ / chuẩn bị ca

- `1.1-worker-home` — **Trang chủ thợ** · Chuẩn bị · overflow 0px
- `1.2-shift-brief` — **Bản tin trước ca** · Chuẩn bị · overflow 16px
- `1.3-demand-map` — **Bản đồ cơ hội** · Khám phá · overflow 18px
- `1.4-smart-schedule` — **Tối ưu ca làm** · Khám phá · overflow 0px

### Công việc / lifecycle

- `2.1-opportunity-inbox` — **Hộp thư cơ hội** · Khám phá · overflow 0px
- `2.2-offer-detail` — **Chi tiết đề nghị** · Khám phá · overflow 33px
- `2.3-accept-review` — **Xác nhận nhận việc** · Xác nhận · overflow 0px
- `2.4-route-eta` — **Di chuyển & ETA** · Di chuyển · overflow 0px
- `2.5-arrival-checkin` — **Check-in tại điểm** · Di chuyển · overflow 0px
- `2.6-work-plan` — **Kế hoạch thực hiện** · Thực hiện · overflow 0px
- `2.7-in-progress` — **Đang thực hiện** · Thực hiện · overflow 16px
- `2.8-scope-change` — **Đổi phạm vi** · Phê duyệt · overflow 0px
- `2.9-approval-wait` — **Chờ khách phê duyệt** · Phê duyệt · overflow 0px
- `2.10-completion-evidence` — **Bằng chứng hoàn tất** · Hoàn tất · overflow 2px
- `2.11-completion-submitted` — **Đã gửi hoàn tất** · Hoàn tất · overflow 11px
- `2.12-case-closed` — **Case đã đóng** · Hoàn tất · overflow 34px

### Kael Chat / Case Work

- `3.1-kael-chat-normal` — **Kael Chat thường** · Kael · overflow 0px
- `3.2-kael-job-intake` — **Kael nhận việc** · Kael · overflow 26px
- `3.3-kael-case-work` — **Kael Case Work** · Kael · overflow 66px
- `3.4-job-room-chat` — **Phòng việc / Case Chat** · Kael · overflow 0px
- `3.5-kael-command-center` — **Active Case Command Center** · Kael · overflow 0px
- `3.6-worker-approval-queue` — **Worker Approval Queue** · Phê duyệt · overflow 0px
- `3.7-case-timeline` — **Dòng sự kiện Case** · Kael · overflow 0px
- `3.8-safety-escalation` — **An toàn & hỗ trợ** · Kael · overflow 0px

### Thu nhập / payout

- `4.1-earnings-overview` — **Thu nhập** · Đối soát · overflow 14px
- `4.2-ledger-detail` — **Chi tiết đối soát** · Đối soát · overflow 0px
- `4.3-payout-request` — **Yêu cầu rút tiền** · Đối soát · overflow 37px
- `4.4-payout-method` — **Tài khoản nhận tiền** · Đối soát · overflow 0px

### Hồ sơ / ranking

- `5.1-profile-overview` — **Hồ sơ thợ** · Phát triển · overflow 518px
- `5.2-worker-ranking` — **Xếp hạng thợ** · Phát triển · overflow 314px
- `5.3-skills-service-area` — **Kỹ năng & khu vực** · Phát triển · overflow 97px
- `5.4-reliability-insights` — **Độ tin cậy** · Phát triển · overflow 79px
- `5.5-account-utilities` — **Chức năng cơ bản** · Phát triển · overflow 310px
- `5.6-agent-memory-preferences` — **Bộ nhớ & ưu tiên** · Phát triển · overflow 325px
- `5.7-verification-documents` — **Giấy tờ & xác minh** · Phát triển · overflow 100px
- `5.8-bank-tax-center` — **Ngân hàng & thuế** · Phát triển · overflow 43px
- `5.9-reviews-feedback` — **Đánh giá & phản hồi** · Phát triển · overflow 94px
- `5.10-support-settings` — **Hỗ trợ & cài đặt** · Phát triển · overflow 235px

---

## Design parity report

### Kết luận

Worker v5.0 dùng cùng visual grammar với Customer v2.1: mint liquid-glass, canvas gradient, white translucent cards, soft emerald shadows, Apple-style rounded controls, 3D pastel assets, typography/spacing hierarchy và Kael orb độc lập.

Kiểm chứng nguồn: **38,862 byte CSS Customer được giữ nguyên ở đầu stylesheet**, **67/67 asset** và **12/12 material reference** trùng SHA-256 với handoff gốc.

### Các yếu tố được giữ đồng nhất

- Token nền, ink, mint, stroke, glass, shadow và radius được lấy từ code Customer v2.1 rồi mở rộng cho Worker.
- Navigation dùng 4 tab nghiệp vụ đặt cùng nhau, Kael là global accessory tách riêng, đúng pattern Customer.
- `Chat thường` giữ cấu trúc mode switch, bubble, media strip, action chips và composer như Customer.
- `Case Work` giữ case-isolated source, progress rail, evidence sources, proposal card và approval boundary.
- Profile/Ranking giữ liquid score, utility cards, rank progression và Kael continuity.
- Asset hình ảnh dùng đúng file gốc từ handoff; không redraw, không ảnh sinh mới.

### Khác biệt có chủ đích

- Nội dung Kael nghiêng về tìm việc, lọc cơ hội, giải thích mức phù hợp, mở Case và soạn đề xuất phạm vi.
- Authority matrix khóa các quyết định có tác động: nhận việc, check-in, scope change, completion, payout đều cần Worker/Customer xác nhận.
- Worker có lifecycle chi tiết từ ca trực đến payout; Customer là case discovery/service continuity.

---

## Validation report

Results as recorded by the package author at build time. Not re-verified against the current codebase.

### Render

- Screens rendered: **38/38**
- Viewport: **390×844**
- Request failures: **0**
- Console errors: **0**
- Maximum scroll overflow: **518px**; bottom navigation/primary actions remain visible or content remains intentionally scrollable.

### Static verification

- TypeScript typecheck: PASS
- Package verifier: PASS
- Workflow verifier: PASS
- Code package binary image check: PASS
- Removed-banner text and visual element check: PASS
- Image dimensions and corruption check: PASS
- Browser interaction smoke tests: **25/25 PASS**
- Paired SEMANTIC/EXACT integration: **15/15 PASS**
- Customer CSS base exact match: **TRUE**
- Source asset SHA-256: **67/67 PASS**
- Customer material SHA-256: **12/12 PASS**

### Logic

- Happy path reachable end-to-end.
- Kael authority boundaries validated.
- High-impact transitions require explicit human confirmation.
- Customer approval and system payout release remain external authorities.

---

## Asset provenance

### Primary source materials

- `NestScout_Customer_Frontend_Images_v2_1_FINAL(3).zip`
- `NestScout_Customer_Frontend_Code_v2_1_FINAL_VERIFIED(3).zip`
- `NestScout_Entry_Brand_Access_Images_v1_1(2).zip`
- `NestScout_Entry_Brand_Access_Code_v1_1(2).zip`

### Usage

- 3D Worker, Client, Kael and bank assets were copied byte-for-byte from the supplied handoffs.
- Customer boards/screens are included under `materials/customer-style-reference` solely as implementation references.
- Entry brand overview is included under `materials/entry-brand-reference`.
- New Worker screens and boards are deterministic renders from the supplied assets plus the code package.
- No generative-image output is included in this package.

---

## Render manifest

The PNG renders are ~41 MB and stay out of git. They live on disk at `.scratch/workers-v5-image-source/HomeServices_Workers_Agentic_Images_v5_0/`. This manifest preserves the index if the binaries are ever lost.

**Screens (38):** one `screens/<screen-id>.png` per row of the inventory above.

**Root manifests:** `ASSET_PROVENANCE.json`, `BUILD_CONTRACT.json`, `FILE_MANIFEST.json`, `HANDOFF_MANIFEST.json`, `SCREEN_MANIFEST.json`, `STYLE_PARITY_REPORT.json`.
