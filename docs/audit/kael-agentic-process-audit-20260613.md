# Kael Agentic Operating Process — Flow Audit & Component-First Map

> Ngày: 2026-06-13 · Tác giả: Claude (MTS – Agent Systems & Applied Product) · Loại: **audit read-only**
> Phạm vi đã chốt với Tu: audit rõ flow + quy trình hoạt động của Kael (Kael *làm gì*), và xác định **component nào surface đầu tiên** theo design mới nhất (NestScout handoff). Mục tiêu là một **quy trình Agentic supporting** cho Kael, không phải animation.
> Ràng buộc: **không sửa file khóa** (STRUCTURES/critical/RULES/design), **không sửa code**, **không sửa handoff zip**. Đây là tài liệu phân tích + đề xuất để Tu quyết.

---

## 0. TL;DR (đọc cái này trước)

1. **Quy trình agentic của Kael ĐÃ tồn tại và đã chín**, không phải thứ cần dựng mới. Runtime thật = `pipeline.ts` (estimate) → `workflow-orchestrator.ts` / `services.ts` (transition) → `autonomy-gate.ts` (cổng quyết định tiền). 5 kịch bản agentic (normal/demanding/worker-cancel/customer-cancel/dispute) được pin bằng conformance spec trong `kael/agentic/case-*.ts`.

2. **"Component nào xuất hiện đầu tiên" KHÔNG phải thứ vẽ tay theo từng screen — nó đã là một contract deterministic dùng chung**: `buildWorkflowViewModel` → `buildWorkflowPhaseContext` tính ra, cho **mỗi phase**, một `primaryArtifact` (component surface đầu) + danh sách `sections` đã xếp hạng, mỗi cái kèm `mode` (hidden→loading→partial→review→final→done). Mobile đã tiêu thụ nó qua `use-service-workflow.ts`. **Frontend rebuild phải render cái contract này, không được tự chế thứ tự component theo từng màn.**

3. **Rủi ro lớn nhất của bản rebuild:** design là **các màn rời rạc, đẹp** (2.5, 2.6, 2.7…); engine là **một surface tiến hóa theo phase**. Nếu Codex dựng 8 màn tĩnh độc lập, nó sẽ (a) đánh mất phần "agentic" (phase-driven visibility, streaming stage, blocked/locked trung thực, scope hard-stop, autonomy gate) và (b) đụng chính ranh giới "preserve logic/navigation" mà brief cấm. Đây đúng là cái Tu lo: "agentic process chứ không phải hình động".

4. **Lệch hai chiều giữa design và backend:**
   - **Backend ĐI TRƯỚC design** ở core transaction: nhiều năng lực agentic (autonomy gate, scope Kael-computed, completion auto-confirm, cancellation sub-case, dispute, streaming stage, learning LS1–LS7) chưa được board thể hiện.
   - **Design ĐI TRƯỚC backend** ở: toàn bộ gamification hồ sơ (cấp/hạng/"bảo vệ đồng tiền"/radar/thu nhập 30 ngày), Approval Queue (5.3) không có feed, Memory & Preferences (5.4) chỉ có view+delete chứ không có edit, và tab "Tin nhắn" toàn cục không có inbox endpoint. → nếu build nguyên design sẽ ra **số giả** (vi phạm RULES no-fake-data).

5. **Khuyến nghị xương sống:** neo bản rebuild vào `workflow-phase-context` view-model; dựng **Kael Agentic Center 5.2 (Active Case Command Center)** chính là cái "phase surface" đó; các surface chưa có backend thì empty-state/đánh dấu todo, không bịa số.

---

## 1. Bằng chứng đã đọc (để Tu kiểm chứng)

| Lớp | File | Vai trò |
|---|---|---|
| Action pipeline | `supabase/functions/mobile-api/_shared/kael/pipeline.ts` | `runKaelPipeline`: chuỗi stage thật của Kael |
| Autonomy gate | `supabase/functions/mobile-api/_shared/kael/autonomy-gate.ts` | 6-check cho `KaelAutonomyDecision` |
| Agentic specs | `kael/agentic/case-1-normal.ts` … `case-5-dispute.ts` | 5 kịch bản agentic chuẩn (test p9–p13) |
| Phase model | `packages/shared/src/workflow/workflow-phases.ts` | 18 phase + map JobStatus→phase |
| Phase context | `packages/shared/src/workflow/workflow-phase-context.ts` | title/intent/primaryArtifact/blocked/nextEvent + 17 section |
| UI rules | `packages/shared/src/workflow/workflow-ui-rules.ts` | phase → mode của 15 artifact (component-first engine) |
| Mobile wiring | `apps/mobile/lib/use-service-workflow.ts`, `apps/mobile/components/customer/kael-chat/*` | tiêu thụ view-model + render agentic surface |
| API surface | `supabase/functions/mobile-api/_shared/router.ts` | toàn bộ endpoint + response type (backed/not-backed) |
| Step contract | `docs/architecture/workflow-step-contracts.md` | map A2–A7 → surface, "Kael Autonomy v2" |
| Workflow truth | `STRUCTURES.md` §6/§7/§9/§12 | lifecycle gốc (file khóa) |
| Design mới | `nestscout-codex-handoff.zip`: `flows/*.png`, `pages/01_overview_flow@2x.png`, `theme.ts`, `design-system.md`, `CODEX_REBUILD_PROMPT.md` | skeleton + token + brief |

**Chưa verify pass này (khai báo trung thực):** wiring end-to-end của streaming (`apps/mobile/lib/kael-stream.ts` tồn tại nhưng chưa đọc; memory cũ nói "disconnected 3 chỗ"); worker-assist vision có thật sự nối ảnh chưa (`worker-assist.ts`/`vision.ts` tồn tại; memory nói "BLIND"); nội bộ case-2..5; nội bộ `autonomy-gate` sau dòng 90; PDF trang 2–7 (mascot/typography/icon — cố ý bỏ vì là phần visual/motion ngoài phạm vi Tu giao).

---

## 2. Kael LÀM GÌ — Runtime agentic pipeline

### 2.1 Estimate pipeline (`runKaelPipeline`) — cái chạy khi khách mô tả vấn đề

Trình tự thật, mỗi stage phát `updateKaelProgress` (đây chính là các dòng "đang phân tích…" ở màn **2.4 Kael Live Performance Chat**):

```
intent_classification        (DeepSeek primary)         progress 0.1→0.2
  ├─ unsupported / out_of_scope         → decline UNSUPPORTED   (dừng, 0 chi phí downstream)
  ├─ service_mismatch                   → SERVICE_MISMATCH + gợi ý dịch vụ đúng
  └─ needs_clarification (< CAP)        → hỏi 1 câu (NEEDS_CLARIFICATION)
↓ (knowledge context: safety/legal nếu bật)
PARALLEL block                                            progress 0.3→0.78
  ├─ vision_analysis        (Anthropic)   ← phân tích ảnh/mô tả → complexity_hint
  ├─ market_lookup          (Perplexity)  ← giá thị trường (Tier-1 source khi bật source-trust)
  └─ problem_synthesis      (DB baseline) ← fetchBaselineCandidates
↓ applyLearnedComplexityRule (LS1)  → effectiveComplexity
price_synthesis             (applyLearnedPriceRule + synthesizePrice)   progress 0.86→1.0
↓
estimate { service_type, problem_category, problem_summary, complexity,
           price_min, price_max, confidence, advisory(≤1), disclaimer }
```

→ **Map design 2.4 ↔ stage:** "đang phân tích ảnh" = `vision_analysis`; "đang xác định loại dịch vụ" = `intent_classification`; "đang đánh giá mức độ" = `complexity`; "đang so sánh giá" = `market_lookup` + `price_synthesis`; "đang tìm thợ phù hợp" = sang phase `matching`. **Các dòng này không được fake** — phải bind vào progress thật (`kael.chat.progress` / stream), nếu không sẽ thành "hình động" trang trí.

### 2.2 Autonomy gate (`KaelAutonomyDecision`) — cổng mọi bước động tiền

Mọi transition động tiền đi qua `autonomy-gate.ts`, thứ tự 6 check: `schema → state_machine → permission → invariants → evidence_sufficiency → confidence_calibration`. Kết quả: `allow | reject | escalate`. Action high-stakes (`decide_payment`, `decide_dispute`) cần confidence ≥ 0.82; amount > 1.000.000đ là high-stakes; nhóm full-autonomy (`process_cancellation`, `decide_scope_change`, `confirm_completion`, `decide_payment`, `decide_dispute`) bị **gate bằng feature flag**. → UI **không bao giờ** được tự ghi trạng thái tiền; nó chỉ phản ánh kết quả gate.

### 2.3 5 kịch bản agentic (conformance specs, test p9–p13)

`case-1-normal` định nghĩa plan chuẩn: phases `INTAKE → CONFIRM → MATCH → EXECUTE → COMPLETE → LEARN`, **ngân sách thông báo tối đa 5** (`estimate_ready`, `searching_worker` [chỉ khi match ≥5s], `worker_matched`, `worker_arrived`, `completed_by_worker`, `review_thanks`), **silent statuses** (`worker_on_way`, `inspecting`, `repairing` — không bắn noti), skip clarification khi `hasMedia && desc≥50 && visionConfidence≥0.7`. `case-2..5` = demanding-customer / worker-cancel / customer-cancel / dispute. → **Đây là "agentic supporting process" Tu muốn**: có chính sách rõ về việc Kael chủ động làm gì và *im lặng* khi nào.

### 2.4 Learning sau giao dịch (LS1–LS7)

Post-B7/A14 kích hoạt LS1 (market memory) … LS7 (decline reason), evidence-gated (≥5 ca, completed thật, có rollback). Không nằm trong UI giao dịch nhưng là phần "Kael tự cải thiện".

---

## 3. Phase model = trạng thái agentic (Kael đang ở đâu, sắp làm gì)

18 phase (`workflow-phases.ts`), mỗi phase trong `PHASE_CONTEXT_BY_PHASE` có **title + intent (VI/EN narration) + primaryArtifact + blockedReason + nextExpectedEvent**. Đây là tầng "Kael đang làm gì / chờ gì" trung thực theo server-truth — **bản chất chống-"hình động"**: thay vì spinner vô nghĩa, mỗi trạng thái nói rõ *đang chờ event nào* (vd `kael_explaining` → next `kael_started_matching`, blocked `waiting_for_kael_orchestration`).

`JobStatus` (DB, 17 trạng thái §12) → `WorkflowPhase` (18, gồm các phase suy luận `kael_collecting/estimating/explaining` khi chưa có job thật). Frontend **chỉ được** dùng phase, không tự bịa transition (`workflow-ui-rules` cấm).

---

## 4. COMPONENT-FIRST MAP — câu trả lời cho "component nào xuất hiện đầu tiên"

Lấy trực tiếp từ `primaryArtifact` (phase-context) + `mode` (ui-rules) + thứ hạng `sectionSummaryRank`. **Đây là thứ tự build/surface chuẩn cho mọi màn case-work; design screen chỉ là cách trình bày.**

| Phase | Kael đang làm | **Component surface ĐẦU (primary)** | Section phụ hiện kèm | Design screen | Backed? |
|---|---|---|---|---|---|
| `intake_started` | giữ nháp | `intake_receipt` (service_request·basic) | — | 2.2/2.3 handoff | ✅ |
| `kael_collecting` | gom ngữ cảnh (intent) | `process_ticket` (partial) | diagnosis_trace | 2.4 live chat | ✅ |
| `kael_estimating` | phân tích (vision+market+synth) | `estimate` (loading) | diagnosis_trace (loading) | 2.4 live chat | ✅ |
| `kael_explaining` | có ước tính | `estimate` (review) | process_ticket(annotated), diagnosis | **2.5 Case Overview** | ✅ |
| `matching` | điều phối/broadcast | `provider_match` (loading) | worker_brief, booking, orchestration | **2.6 Matching & AI Score** | ✅ |
| `worker_matched` | thợ nhận | `booking` (final) | provider_match, worker_brief, active_timeline, job_chat | 2.10/2.11 | ✅ |
| `worker_on_way`→`repairing` | timeline hiện trường | `booking` (final) | active_timeline, job_chat, scope_change(basic), completion_evidence(basic@repairing) | 2.9 / 2.12 | ✅ |
| `scope_change_pending` | Kael xét phát sinh **(khóa)** | `scope_change` (review) | booking | A11 hard-stop **(thiếu màn KH)** / 5.3 | ✅ (scope.decide) |
| `completed_by_worker` | Kael rà soát hoàn tất **(khóa)** | `completion_evidence` (review) | completion_review, dispute_decision | **thiếu màn KH** | ✅ (confirmCompletion) |
| `customer_confirmed_completion` | đã xác nhận | `payment_decision` (review) | completion_evidence(final), review | **thiếu màn KH** | ⚠️ placeholder |
| `payment_pending` | chờ thanh toán **(khóa review)** | `payment_decision` (final) | review(blocked) | **thiếu màn KH** | ⚠️ placeholder |
| `paid` | đã trả | `review` (review) | payment_decision(final) | A14 **thiếu màn KH** | ✅ (review) |
| `done` | đóng giao dịch | `review` (done) | — | — | ✅ |
| `cancelled` | đã hủy | `cancellation_review` (final) | — | case-3/4 | ✅ |

**Đọc bảng này thế nào:** một màn case-work (vd Agentic Center 5.2) chỉ cần lấy `phaseContext.sections` đã sắp xếp, render `primaryArtifact` to nhất trên cùng, các section phụ theo `mode`. Không cần 8 component-tree riêng cho 8 màn.

---

## 5. Reconciliation design ↔ engine (các gap cụ thể)

### G1 — Cấu trúc: màn rời rạc vs surface theo phase **(quan trọng nhất)**
Design 2.5–2.12 = 8 màn riêng. Engine = 1 surface tiến hóa. **Đề xuất:** dựng **1 case-surface** render `phaseContext`, đặt nó làm nội dung của **Agentic Center 5.2 Active Case Command Center** (đã có feed `GET /me/jobs/active` → `CustomerActiveJobResponse` kèm `kael_progress`, `current_scope_change`, `broadcast_state`). Các "màn" 2.5–2.12 trở thành **biến thể trình bày của cùng surface theo phase**, không phải route độc lập.

### G2 — Bottom nav mâu thuẫn 3 nguồn + đụng "preserve navigation"
- Token `theme.ts` (thắng tuyệt đối): `Trang chủ / Lịch sử / Tin nhắn / Hồ sơ` + Kael orb.
- STRUCTURES A1: `Home / Book / Kael / History / Profile`. B2 worker: `Home / Jobs / Chat / Earnings / Profile`.
- **App hiện tại** (route thật): customer `{home, booking, kael, history, profile}`, worker `{home, jobs, chat, earnings, profile}` — tức theo STRUCTURES.
→ Token **bỏ Booking/Jobs/Earnings, thêm "Tin nhắn"**. Đổi sang nav token = **đổi navigation**, mà brief Codex cấm ("preserve navigation… STOP nếu cần đổi logic"). Một bộ 4-tab dùng chung **không phục vụ được** worker (cần Jobs/Earnings) lẫn customer (cần Book/History). **Cần Tu chốt nav theo role.**

### G3 — Agentic Center: backing không đều
| Surface | Backend | Trạng thái |
|---|---|---|
| 5.1 Customer Home (agentic) | `me/jobs/active` + `notifications` | ⚠️ thiếu nguồn cho các *đếm* "việc cần làm" |
| 5.2 Active Case Command Center | `me/jobs/active` (đầy đủ) | ✅ build được ngay = phase surface |
| **5.3 Approval Queue** ("3 việc cần duyệt") | **KHÔNG có endpoint list** | ❌ chỉ có `scope.decide` theo-từng-id; không có feed tổng hợp các quyết định chờ |
| **5.4 Memory & Preferences** ("Chỉnh sửa") | `me/kael-memory` chỉ **GET + DELETE** | ❌ không có PATCH → **không sửa được preference** |

Lưu ý 5.3: trong **Kael Autonomy v2**, flow *tự tiến* (không gate xác nhận của khách ở A5/A7). Vậy hàng chờ duyệt thực chất chỉ còn **scope-change** (và dispute) — cần làm rõ Approval Queue hiển thị *cái gì* và cần endpoint `GET /me/pending-decisions`.

### G4 — Tab "Tin nhắn" toàn cục không có inbox
Messaging hiện chỉ per-job (`jobs/:id/messages`) + Kael chat session. Không có endpoint liệt kê hội thoại xuyên job cho customer. Worker có `workers/me/kael/chat` (list) nhưng customer không. → tab "Tin nhắn" cần aggregation endpoint, hoặc descope.

### G5 — Gamification hồ sơ = số giả nếu build nguyên
`WorkerProfileResponse` chỉ có `rating, total_jobs, verification_status, service_types, years_experience…` — **không có** cấp 1–10, điểm, "đúng giá %", radar, thu nhập-30-ngày. **Customer profile không có endpoint nào** ngoài `me/kael-memory`. Vậy: cấp thợ, hạng KH 1–5, "Bảo vệ đồng tiền 92/100", "đã bảo vệ 2.150.000đ", tỷ lệ không tranh chấp, radar, huy hiệu → **0 nguồn backend**. Build nguyên = vi phạm RULES no-fake-data. **Đề xuất:** empty-state trung thực hoặc đánh dấu backend-todo; cái nào suy ra được từ field thật (rating, total_jobs, earnings tổng) thì hiện, còn lại ẩn.

### G6 — Nửa sau flow KH: backend CÓ, board THIẾU
Khác với nhận định pass trước: backend **có** `scope.decide`, `jobs/:id/confirm-completion`, `jobs/:id/review`, cancellation, dispute. Nên scope-decision/nghiệm thu/đánh giá phía KH **không phải gap backend — là board design thiếu màn**. (Thanh toán `A13` vẫn là *placeholder* — `payment_pending→paid` chưa nối provider; đúng theo phase-gated.) Khi dựng case-surface theo G1, các phase `scope_change_pending / completed_by_worker / customer_confirmed_completion / paid` tự có chỗ render — **miễn là không bỏ chúng khỏi skeleton**.

---

## 6. Khuyến nghị (việc nên làm, theo thứ tự)

1. **Neo rebuild vào `workflow-phase-context`**: mọi màn case-work render `phaseContext.sections` + `mode`, không tự chế thứ tự component. Component-first = Bảng §4.
2. **Agentic Center 5.2 = case surface chính** (đã có feed). Coi 2.5–2.12 là biến thể trình bày theo phase, không phải 8 route.
3. **Chốt nav theo role** (G2) trước khi Codex đụng navigation — nếu không Codex sẽ phải STOP.
4. **Quyết 3 surface thiếu backend (G3/G4):** hoặc thêm endpoint (`/me/pending-decisions`, `PATCH /me/kael-memory`, `/me/threads`), hoặc descope khỏi vòng đầu. Không build UI rỗng giả.
5. **Gamification hồ sơ (G5):** empty-state/te todo, không số giả.
6. **Streaming + worker-vision:** verify wiring thật (`kael-stream.ts`, `worker-assist.ts`) trước khi tô màn 2.4 / 3.3 — đang nghi disconnected/BLIND.

---

## 7. Quyết định cần Tu (không chặn — đây là khuyến nghị có sẵn lựa chọn mặc định)

- **Q-A. Cấu trúc case-work:** [mặc định] 1 phase-surface trong Agentic Center 5.2, hay giữ 8 màn rời? → khuyến nghị phase-surface.
- **Q-B. Nav theo role:** giữ nav app hiện tại (STRUCTURES) hay đổi sang token? → khuyến nghị giữ theo role, sửa token cho khớp 2 role.
- **Q-C. 3 surface thiếu backend:** thêm endpoint hay descope? → khuyến nghị descope 5.3/Tin nhắn vòng đầu, giữ 5.2/5.4-view.
- **Q-D. Gamification:** ai sở hữu việc quyết field nào có thật? → tôi có thể dò sâu DB/migration và ra danh sách field-thật vs field-giả.

> Trạng thái: audit hoàn tất, read-only. Chưa sửa code/file khóa/handoff. Bước kế tiếp chờ Tu chọn ở §7.
