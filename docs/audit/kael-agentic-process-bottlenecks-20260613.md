# Notes — Điểm nghẽn THẬT của Kael (review 2026-06-13)

> Mục đích: chốt nhanh các **điểm nghẽn đã verify trên live path** từ phiên audit (lifecycle + agentic process + perceived-performance + UI interaction).
> Nguyên tắc: chỉ ghi cái **có bằng chứng wiring thật** (file:line). Cái đã đính chính / chờ verify được tách riêng để không tự lừa mình.
> Chi tiết đầy đủ: `docs/audit/kael-agentic-process-audit-20260613.md` (Part 1 — flow/component-first) + `docs/audit/kael-perf-agentic-hardening-audit-20260613.md` (Part 2 + §8 deep pass + §9 perceived-perf).
> Status: chưa sửa code/file khóa nào. Đây là notes để chọn ưu tiên fix.

---

## 📋 TÓM TẮT HÀNH ĐỘNG (cho Codex/Tu) — sau sweep toàn diện 3 pass

> Kết luận: **engine Kael cực vững ở agentic-safety/money/AI-boundary** (xem mục ✅ cuối file — đừng phá). Điểm nghẽn thật **dồn vào perceived-perf + design-skeleton-gap + data-honesty**, KHÔNG ở agentic correctness. Không tìm thấy bug HIGH mới ở pass 3 (chủ yếu affirming + vài cleanup).

**P0 — phải làm trước first real case:**
1. **Wire realtime seam** (`apps/mobile/lib/realtime.ts` đã có, chưa caller) → vá CỤM B-1/B-2/B-5/H9-1 (timeline 15s, broadcast 20s vs cửa-sổ-60s, notif 60s, chat no-live). 1 fix = 4 bug. DB index đã đủ.
2. **Đưa vào design skeleton 2 phía:** X-1 last-50m access (check-in + "Cho thợ lên" — đang build thật, board thiếu → regression), L-1 nửa-sau-KH (scope-decision/nghiệm-thu/thanh-toán/đánh-giá), H8 dispute screens (đọc bảng disputes vì không có job-status "disputed").
3. **Render phase-context contract (U-2)** — không dựng màn tĩnh; case-surface = `phaseContext.sections`.
4. **Data honesty:** U-1 tắt gamification giả (no backend) → empty-state; A-2 estimate card render needs_inspection/price_source/confidence/disclaimer (đọc `estimate_card_v3`).

**P1 — calibration (K-1 đã chốt) + cost/perf:**
5. **TẮT `tryAutoApproveScopeChange`** → mọi scope = customer confirm (K-1). Xác nhận cờ `KAEL_AUTONOMY_FULL_ENABLED` cho completion/payment/dispute/cancellation.
6. **Kael chủ động lớp vật lý** (theo model "Kael chạy tất"): nudge "Cho thợ lên"+timeout (X-2), surface broadcast realtime (B-2).
7. **C-1 enforce cost cap DB-backed** (hiện dead code → no $ ceiling). P-2 coalesce ~10 progress DB writes. P-3 latency lượt đầu ~10s (đã có stage-stream che).
8. U-3 chốt nav theo role.

**P2 — defense-in-depth / cleanup (low):**
9. A-1 clamp learned price ±X% baseline lúc apply (belt-and-suspenders; promotion đã data-grounded). W-1 wire vision vào worker-assist (đang blind). C-2 prune dead `checkKaelActorRateLimit`. M-1/K-2/X-3 minor.

---

# 🗺️ MAP PLAN — FIX TOÀN BỘ (chốt 2026-06-13, CHƯA execute — chờ Tu yêu cầu)

> Nguyên tắc xuyên suốt: theo authority order `critical.md > RULES.md > STRUCTURES.md > design.md > AGENTS.md`. **File khóa** (CLAUDE/STRUCTURES/RULES/critical/design/README) — KHÔNG sửa nếu Tu chưa duyệt trong hội thoại. Mỗi step: bounded change → verify thật (test/type-check) → no-fake-data. Codex rebuild = **UI-only, preserve logic/nav** → step UI phải render contract, không tự chế.
> ID finding tham chiếu các mục bên dưới trong file này (B-1, C-1, U-2, X-1, K-1, …).

## PHASE 0 — PRE-PLAN (đọc + DÙNG docs, bắt buộc trước mọi step)
- **0.1** Đọc governance/locked: `CLAUDE.md`, `critical.md`, `RULES.md`, `STRUCTURES.md` (§6/§7/§9/§12), `design.md`, `AGENTS.md`. → trích rule liên quan cho từng step; xác định step nào đụng file khóa (cần Tu duyệt).
- **0.2** Đọc `docs/architecture/code-ownership-map.md` → map mỗi task vào owner file TRƯỚC khi sửa. Đọc `workflow-step-contracts.md` + `status-vocabulary.md`.
- **0.3** Đọc 3 audit doc: `docs/audit/kael-agentic-process-audit-20260613.md`, `kael-perf-agentic-hardening-audit-20260613.md`, `kael-cross-side-handshake-audit-20260613.md` + `Notes.md` (file này).
- **0.4** Đọc design handoff: `CODEX_REBUILD_PROMPT.md`, `design/design-system.md`, `design/theme.ts`, `design/flows/*.png` (+ `tokens.json`). Xác định component/phase mapping.
- **0.5** Mở owner files của vùng sắp sửa (per 0.2) + chạy baseline test/type-check để biết trạng thái ĐỎ/XANH trước khi đụng.
- **0.6** Với mỗi step phía sau: ghi pre-edit status (critical.md): Asked task / Real goal / Task class / Selected protocols / Risk. **DÙNG** nội dung docs (cite rule + contract), không chỉ đọc cho có.

## PHASE 1 — BACKEND: enforcement gaps + defense-in-depth (ít rủi ro, không phụ thuộc UI; làm trước)
- **1.1 (C-1)** Cost cap durable: tạo RPC + bảng đếm chi phí AI (atomic, mẫu `check_kael_chat_rate`/`kael_chat_rate_limit_log`); gọi trước call AI tốn tiền trong `pipeline.ts`/`provider-client`. Verify: test vượt cap→degrade honest. RULES: no-fake; degrade message rõ.
- **1.2 (C-2)** Prune dead `kael/rate-limit.ts checkKaelActorRateLimit` (hoặc thay bằng 1.1 DB-backed). Verify: grep no-caller; test xanh.
- **1.3 (K-1a)** TẮT `tryAutoApproveScopeChange` (`services.ts:4744`): mọi scope-change → customer confirm (route `scope_change_requested`, không auto-approve). Verify: integration test scope low-risk vẫn chờ customer. Contract: STRUCTURES A11 (customer decide) — nếu cần đổi STRUCTURES wording, hỏi Tu.
- **1.4 (K-1c)** Xác nhận + set chính sách cờ `KAEL_AUTONOMY_FULL_ENABLED` cho completion/payment/dispute/cancellation (Tu chốt ON/OFF từng action). Ghi vào doc ops. (Config, không code-logic.)
- **1.5 (A-1)** `learning.ts applyLearnedPriceRule`: clamp learned range trong ±X% baseline lúc apply; vượt→bỏ qua rule + log alert. Verify: unit test rule lệch bị clamp.
- **1.6 (J-1)** Hợp nhất `utils.ts safeParseJSON` dùng brace-counting parser (tái dùng `process-batch-results.ts parseJsonObjectFromText`). Verify: unit test JSON-trong-prose-có-brace.
- **1.7 (P-2)** `pipeline.ts`: chuyển ~10 `updateKaelProgress` await → fire-and-forget/coalesce (mốc 0.2/0.6/1.0). Verify: estimate latency giảm; SSE stage vẫn hiện.
- **1.8 (P-1)** `orchestrator.ts timeoutAfter`: thêm `clearTimeout` / bỏ lớp race thừa (provider-client đã abort). Verify: no dangling timer (test).

## PHASE 2 — REALTIME CLUSTER (1 fix = 4 bug; wire seam có sẵn `realtime.ts`)
- **2.1 (B-1)** Wire `subscribeToJobStatus(jobId)` vào `frontend-workflow-provider.tsx` cho status active (worker_matched…completed_by_worker); on event → `refreshCurrentJob`/patch state; giữ poll 15s làm fallback (giảm còn 30-60s). Verify: thay đổi status thợ hiện ≤2s phía khách.
- **2.2 (H9-1)** Wire `subscribeToJobMessages(jobId)` vào `use-job-chat-thread.ts` → reload/append khi có tin mới. Verify: 2 thiết bị chat thấy tin nhau live.
- **2.3 (B-2)** Worker broadcast surfacing realtime (subscribe broadcast cho worker available) thay/giảm poll 20s; đảm bảo trong cửa sổ 60s. Verify: broadcast hiện ≤2s.
- **2.4 (B-5)** Thêm listener `AppState 'active'` → refresh tức thì khi quay lại foreground (notif + active job).
- **2.5** Cleanup: unsubscribe trên unmount/blur (tránh leak channel). Verify: no duplicate channel.

## PHASE 3 — DATA HONESTY + UI CONTRACT (frontend; feed Codex rebuild)
- **3.1 (U-1)** Gamification hồ sơ: map từng field (cấp/hạng/bảo-vệ-đồng-tiền/radar/thu-nhập-30-ngày) → nguồn backend thật; field không có nguồn → **empty-state trung thực / ẩn** (KHÔNG số giả — RULES). Liệt kê field cần backend mới (đưa sang Phase 5 nếu Tu muốn dựng).
- **3.2 (A-2)** Estimate card (design 2.5) render từ `estimate_card_v3`: confidence + **needs_inspection badge** + price_source + disclaimer + fallback state. Verify: case confidence thấp hiện "cần kiểm tra hiện trường".
- **3.3 (U-2)** Màn case-work + Agentic Center 5.2 render `buildWorkflowPhaseContext().sections` (mode hidden/loading/partial/review/final) — KHÔNG dựng 8 màn tĩnh state riêng. Verify: mỗi WorkflowPhase render đúng primary+sections; test snapshot theo phase.
- **3.4 (U-4)** Interaction safety: chống double-submit (createJob/accept), optimistic rollback khi API fail, 60s countdown thợ, scope hard-stop không bypass, chat send theo `isWorkflowJobChatSendable`. Verify: test các state.

## PHASE 4 — DESIGN SKELETON GAPS (cập nhật handoff; phần đụng `design.md` LOCKED → cần Tu duyệt)
- **4.1 (X-1)** Thêm last-50m access handshake vào skeleton 2 phía: worker lobby check-in + "chờ khách cho lên" + customer "Cho thợ lên"; render theo `job.address_access.release_stage`. (Backend đã có — chỉ thêm UI/design.)
- **4.2 (L-1)** Thêm dải màn nửa-sau phía KH: scope-decision (hard-stop), nghiệm thu/completion review, payment, review/đánh giá. (Backend endpoint đã có.)
- **4.3 (H8)** Thêm màn mở/theo-dõi dispute 2 phía (đọc bảng disputes; không có job-status "disputed").
- **4.4 (U-3)** Chốt bottom-nav theo role (customer vs worker), reconcile `theme.ts` token vs route hiện tại; cập nhật `design-system.md`/`AGENTS.md` handoff. KHÔNG đổi navigation behavior nếu chưa chốt (brief Codex cấm).
- **4.5** Worker registration/KYC (B0) + pending-approval (B1) screens (Part-1 gap) — backend `workers.register` đã có.
- **4.6** Cập nhật `CODEX_REBUILD_PROMPT.md`/`design-system.md` cho khớp 4.1–4.5. (handoff files — không phải `design.md` khóa; nhưng nếu phải sửa `design.md` thì xin Tu.)

## PHASE 5 — VISION + AGENTIC CENTER BACKEND + MINOR
- **5.1 (W-1)** Wire vision vào worker-assist: handler worker-chat truyền `photo_urls` → `analyzeDescription` trước/within `runWorkerAssist`; theo `kael-ai-boundary` (server-side, schema-validated, no raw output). Verify: worker gửi ảnh → advice tham chiếu nội dung ảnh.
- **5.2 (U-5)** Agentic Center surfaces thiếu backend — Tu chọn build hay descope: (a) `GET /me/pending-decisions` cho Approval Queue 5.3; (b) `PATCH /me/kael-memory` cho Memory edit 5.4; (c) `/me/threads` cho tab Tin nhắn. Mỗi cái: RPC + RLS test.
- **5.3 (P-3)** Estimate lượt đầu: cân nhắc trả baseline-first rồi refine; xem lại vision budget / thêm fallback vision. Verify: đo latency thực.
- **5.4 (P-4)** Provider cost alert 70/90% + degrade message; tách cap theo purpose. (Đi kèm 1.1.)
- **5.5 (M-1, K-2)** Cân nhắc cache nhánh source-trust; nâng embedding RAG nếu cần (low — chỉ khi thành vấn đề).

## PHASE 6 — VERIFY GATES (mỗi phase phải qua trước khi sang phase sau)
- **6.1** Backend step: TDD (test fail trước), type-check (`packages/shared` + edge), integration test trên DB thật (không chỉ mock — xem `feedback_mock_vs_real_tests`), RLS positive+negative test cho RPC/endpoint mới.
- **6.2** Frontend step: jest-expo/RNTL, type-check, state coverage (loading/empty/error/retry), render-theo-phase test; chạy app + screenshot bằng preview tools (đúng `kael-frontend-test`).
- **6.3** Security: `kael-security-sweep` cho step đụng auth/PII/payment/upload; xác nhận no client secret, no PII log, service-role vẫn qua `requireJobAccess`.
- **6.4** Honesty report: ghi kết quả thật vào `README.md`/test-log (`/log`), nêu rõ cái CHƯA test.
- **6.5** Scope check mỗi phase: không build ngoài scope đã duyệt (STRUCTURES "do not build now").

## THỨ TỰ ƯU TIÊN EXECUTE
P0 trước: Phase 2 (realtime cluster) + Phase 3 (data-honesty/contract) + Phase 4.1/4.2 (X-1/L-1) → đe dọa case đầu nhiều nhất.
P1: Phase 1 (backend gaps, đặc biệt C-1, K-1a) + Phase 4.3/4.4 + Phase 5.2.
P2: phần còn lại Phase 5 + minor.

---

## ▶️ LỆNH KHI EXECUTE (đọc kĩ trước khi chạy plan)
**Khi execute plan thì làm liên tục tới khi nào plan xong. Sau khi xong thì review và audit lại đúng 10 lần liên tục để xem còn thiếu sót hay build sai logic gì không. Có bugs nào vô tình được tạo ra không? Có thể enhancement code chỗ nào được không?**

---

## 🔴 TOP — đe dọa "case thật không sai" nhiều nhất

### B-1 (HIGH) — Timeline job live: poll 15s, KHÔNG realtime
- **Evidence:** `apps/mobile/lib/frontend-workflow-provider.tsx:733-735` `setInterval(refreshCurrentJob, 15_000)` cho status broadcasting…completed_by_worker.
- **Impact:** thợ bấm "đã đến / đang làm" → khách thấy trễ tới **15s**. Cảm giác "Kael theo dõi realtime" hỏng ở pha active.
- **Nuance (objectivity):** KHÔNG phải "quên realtime". `apps/mobile/lib/realtime.ts` đã có `subscribeToJobStatus` nhưng defer có chủ đích (Plan §22.10.L, header "do NOT wire it"); **verified không có caller**.
- **Fix:** wire `subscribeToJobStatus` sẵn có vào provider (low-effort). Đòn bẩy perceived-perf lớn nhất.
- **Status:** ✅ verified.

### B-2 (HIGH) — Worker thấy broadcast qua poll 20s, cửa sổ nhận việc chỉ 60s
- **Evidence:** `frontend-workflow-provider.tsx:695-697` `setInterval(workerRefresh, 20_000)`.
- **Impact:** tới **20s (⅓ cửa sổ 60s)** trôi trước khi thợ THẤY job trong app → thợ mất việc oan. Push token có đăng ký (out-of-app) nhưng in-app vẫn poll 20s.
- **Fix:** realtime broadcast surfacing (seam B-1), hoặc hạ poll khi worker đang available.
- **Status:** ✅ verified.

### U-1 (HIGH) — Gamification hồ sơ = SỐ GIẢ (không có backend)
- **Evidence:** `router.ts` `WorkerProfileResponse` chỉ có rating/total_jobs/verification/service_types/years; **không có** cấp 1–10, điểm, "đúng giá %", radar, thu-nhập-30-ngày. **Không có endpoint customer profile** ngoài `me/kael-memory`.
- **Impact:** design profiles (3 màn thợ + 3 màn khách) hiển thị cấp/hạng/"Bảo vệ đồng tiền 92/100"/radar — nếu build nguyên = số bịa → vi phạm RULES no-fake-data, giết niềm tin case đầu.
- **Fix:** empty-state trung thực; chỉ render field suy ra từ dữ liệu thật (rating, total_jobs, earnings tổng); còn lại ẩn / "sắp có".
- **Status:** ✅ verified (qua response types).

### U-2 (HIGH) — Rebuild phải render phase-context, không tự chế màn tĩnh
- **Evidence:** contract `packages/shared/src/workflow/workflow-phase-context.ts` + `workflow-ui-rules.ts`; app HIỆN TẠI render đúng (`agentic-parts.tsx:674-697`, `kael-chat-surface.tsx:495,499`).
- **Impact:** nếu Codex dựng 8 màn rời với state riêng → desync server-truth (sai section/mode, lộ địa chỉ sớm, mở chat sai lúc) + đụng luật "preserve navigation/logic". Đây là **rủi ro REGRESSION**, không phải bug hiện tại.
- **Fix:** màn case-work = renderer của `phaseContext.sections`; Agentic Center 5.2 (`me/jobs/active`) làm surface chính.
- **Status:** ✅ verified (hiện trạng tốt; rủi ro ở rebuild).

### L-1 (HIGH) — Flow board KH dừng ở 2.12, thiếu nửa sau lifecycle
- **Evidence:** flow board `01_main_flows.png` + overview: customer flow hết ở "2.12 Job in Progress". Backend CÓ endpoint (`scope.decide`, `confirm-completion`, `review`) nhưng board thiếu màn scope-decision / nghiệm thu / thanh toán / đánh giá phía KH. Job Status machine bắt buộc `confirmed_by_customer → payment_pending → paid → reviewed`.
- **Impact:** nếu rebuild theo board → mất hẳn nửa sau giao dịch phía khách → case thật không đóng được vòng.
- **Fix:** dựng các phase này trong case-surface (G1) hoặc bổ sung board KH 2.13+.
- **Status:** ✅ verified.

---

## 🟠 MEDIUM — perf/agentic cần xử lý

### P-2 / B-3 (MEDIUM) — Progress = ghi+đọc DB khuếch đại trên hot path
- **Evidence:** pipeline gọi `updateKaelProgress` (`streaming.ts:32`) ~10 lần/estimate và **đang await**; SSE `streamKaelChatTurn` (`services.ts:1663`) đọc `kael_progress` mỗi 800ms (`KAEL_CHAT_STREAM_POLL_MS=800`, `:234`) ~11 đọc/estimate ⇒ **~21 op DB/estimate** chỉ cho progress, nhân theo case song song.
- **Impact:** latency lượt đầu + tải DB khi nhiều case đồng thời.
- **Fix:** progress writes fire-and-forget/coalesce (chỉ mốc 0.2/0.6/1.0); progress đã có kênh SSE riêng.
- **Status:** ✅ verified.

### P-3 (MEDIUM) — Latency lượt đầu worst-case ~10s vs ngân sách 9s
- **Evidence:** `routing.config.ts:36-41` intent 2.5s + parallel max(vision **4.5s**/market 4s) + price 3s ≈ ~10s; `case-1-normal.ts` mốc ≤9s. Vision (Anthropic) **không fallback provider**.
- **Impact:** mạng yếu/cold start → lượt đầu chạm ~9-10s, cảm giác "đứng hình" nếu UI không hiện tiến trình.
- **Nuance:** stage **hard-abort tại budget** (provider-client maxRetries:0 + AbortController) nên không overrun; đã có stage streaming che (§9.1).
- **Fix:** estimate sơ bộ baseline trước→refine; xem lại vision budget / thêm fallback vision.
- **Status:** ✅ verified.

### P-4 (MEDIUM) — Cap provider $30/ngày = single-point-of-failure
- **Evidence:** `routing.config.ts:20` `DAILY_PROVIDER_CAP_USD = 30` toàn cục. ~$0.08/case ⇒ ~375 case/ngày là trần.
- **Impact:** ngày launch/marketing chạm cap → mọi call AI fail đồng loạt.
- **Fix:** alert 70/90%; degrade message trung thực; tách cap theo purpose (vision đắt không làm sập intent rẻ).
- **Status:** ✅ verified.

### A-1 (LOW — hạ cấp sau khi đọc promotion path) — Learned price rule không clamp lệch vs baseline lúc apply
- **Evidence:** `learning.ts:127-185` chỉ validate `priceMin>0 && priceMax>=priceMin`; `pipeline.ts:408` dùng `learnedPrice ?? baseline`, không clamp biên độ lúc apply.
- **Đính chính (`cron/process-batch-results.ts:461-551`):** promotion RẤT chặt + data-grounded — `aggregateLS1PriceEvidence` tính new_min/new_max từ **final_price job `reviewed` THẬT** (IQR p25/p75, cửa sổ 90 ngày, ≤50 mẫu), **loại outlier 1.5×IQR**, **loại job có scope-change**, qua evidence-gate (≥5/confidence-spread/contradiction), promote bằng RPC versioned+rollback; LLM suggested price BỊ ghi đè bằng IQR thật. ⇒ rule lệch hoang **rất khó xảy ra**.
- **Fix (belt-and-suspenders):** thêm clamp ±X% baseline lúc apply + alert. Nên có nhưng không phải bug khả dĩ.
- **Status:** ✅ verified → LOW.

### A-2 (MEDIUM) — Estimate card chưa render `needs_inspection`/`price_source`
- **Evidence:** `agentic-parts.tsx:1013-1048` render confidence (`:1036`) + disclaimer (`:1047`) nhưng dùng `estimate` cơ bản (`KaelEstimate`), **không phải `estimate_card_v3`** (vốn có needs_inspection/price_source). Engine đã honest (`output-pipeline.ts:88-104` ép low/needs_inspection khi confidence thấp).
- **Impact:** khi cần kiểm tra hiện trường, UI không báo rõ → khách hiểu nhầm giá chắc → tranh chấp khi thợ tới.
- **Fix:** estimate card đọc `estimate_card_v3`, render needs_inspection badge + fallback state.
- **Status:** ✅ verified.

### U-3 (MEDIUM) — Bottom-nav mâu thuẫn 3 nguồn
- **Evidence:** token `theme.ts` (Trang chủ/Lịch sử/Tin nhắn/Hồ sơ+orb) ≠ route app hiện tại (customer home/booking/kael/history/profile; worker home/jobs/chat/earnings/profile) ≠ STRUCTURES A1/B2.
- **Impact:** đổi nav = đổi navigation (brief Codex cấm); 1 bộ 4-tab không phục vụ nổi 2 role.
- **Fix:** chốt nav theo role trước khi Codex đụng; sửa token cho khớp.
- **Status:** ✅ verified.

### U-5 (MEDIUM) — Agentic Center: surface thiếu backend
- **Evidence:** 5.3 Approval Queue (không có endpoint list pending-decisions), 5.4 Memory edit (`me/kael-memory` chỉ GET+DELETE, không PATCH), tab Tin nhắn (không có inbox xuyên job).
- **Impact:** build UI = rỗng/giả.
- **Fix:** thêm endpoint (`/me/pending-decisions`, `PATCH /me/kael-memory`, `/me/threads`) hoặc descope vòng đầu.
- **Status:** ✅ verified.

---

## 🔵 CROSS-SIDE handshake (client↔worker) — chi tiết doc riêng `kael-cross-side-handshake-audit-20260613.md`

### X-1 (HIGH) — Last-50m access handshake: ĐÃ build end-to-end nhưng design board BỎ → rebuild REGRESSION
- **Evidence:** built đủ 3 lớp: backend (`services.ts:9060 buildCheckInAccessState`→building_released; `:8957 authorizeApartmentAccess`→unit_released, hardened current-worker-only/active-only) + **worker mobile** (`worker-surfaces.tsx:859/5381`: arrival=lobby check-in manual_photo, copy "căn hộ mở sau khi khách bấm Cho thợ lên", building_released display) + **customer mobile** (`customer-surfaces.tsx:621-623,1413-1420`: CTA "Cho thợ lên", hiện khi `worker_checked_in && !exact_unit_released`→`authorizeApartmentAccess()`). NHƯNG `CODEX_REBUILD_PROMPT.md` group C/D + `design-system.md` **không liệt kê** các màn này; và nó **không nằm trong phase-context** (sống trong `job.address_access.release_stage`).
- **Impact:** đây là **feature đang chạy thật**; rebuild UI thay màn dễ **xóa mất** handshake privacy/an toàn quan trọng nhất (lộ căn hộ không consent / thợ không biết được cho lên).
- **Fix:** đưa vào skeleton design 2 phía; render theo `address_access.release_stage` (area_only→building_released→unit_released), KHÔNG suy từ phase.
- **Status:** ✅ verified (built cả backend + 2 mobile side; gap nằm ở design board).

### W-1 (MEDIUM) — Worker-assist chat "BLIND" với ảnh
- **Evidence:** `kael/worker-assist.ts` chỉ mang `mediaRefs` (line 29) và emit `media_ref_count` (line 416); `runWorkerAssist` (`:82`) KHÔNG có `photo_urls`/`analyzeDescription`/vision. → Kael tư vấn thợ tại hiện trường biết SỐ LƯỢNG ảnh nhưng KHÔNG thấy nội dung ảnh.
- **Impact:** design 3.3 "Kael On-site Advisory Chat" ngụ ý Kael giúp thợ (có thể qua ảnh) nhưng Kael không phân tích ảnh thợ gửi → lời khuyên kém chính xác.
- **Fix:** nối vision vào worker-assist (đúng plan `project_plan_kael_vision_voice_ux`).
- **Status:** ✅ **VERIFIED tuyệt đối** — handler `services.ts:4339 runWorkerAssist({job:{...text...}, question})` chỉ truyền text (no photo_urls/vision); không có vision call nào trong worker-chat path (vision chỉ ở customer-pipeline stage `:8130`). Worker-assist thật sự BLIND.

### X-2 (MEDIUM) — Không timeout/Kael-nudge cho "Cho thợ lên"
- **Evidence:** `authorizeApartmentAccess` chỉ customer-initiated; không thấy timeout/escalation nếu khách không bấm.
- **Impact:** thợ chờ ở sảnh vô thời hạn nếu khách bận/không phản hồi.
- **Fix:** Kael nhắc khách + timeout escalate.
- **Status:** ✅ verified (vắng mặt timeout).

### X-3 (LOW — đã hạ cấp) — Worker status control: CÓ trong app, chỉ là design board chưa thể hiện rõ
- **Đính chính:** control status thợ **đã tồn tại** trong app hiện tại (`worker-surfaces.tsx:2010,5325-5340` `worker_mark_arrived`/`worker_start_inspection`→`workerUpdateStatus`). Không phải missing-feature.
- **Residual (LOW):** design board 3.x chưa vẽ rõ control này → rebuild cần giữ. Chỉ là vấn đề thể hiện trên board.
- **Status:** ✅ verified (CÓ trong app).

### H9-1 (HIGH) — Chat client↔worker KHÔNG có live delivery
- **Evidence:** `use-job-chat-thread.ts` chỉ `reload()` lúc mount + sau khi CHÍNH MÌNH `send()`; KHÔNG poll, KHÔNG realtime. Surfaces (`customer-surfaces.tsx:3818`, `worker-surfaces.tsx:2175`) không gọi `.reload()` theo timer.
- **Impact:** đối phương gửi tin → mình KHÔNG thấy cho tới khi mình gửi tin hoặc mở lại chat. Hội thoại tại hiện trường (thợ hỏi "đồng hồ điện ở đâu?" → khách trả lời) gãy.
- **Fix:** wire `subscribeToJobMessages` (đã có trong `realtime.ts`) hoặc poll chat khi mở.
- **Status:** ✅ verified.

> **CỤM REALTIME (1 fix, 4 bug):** B-1 (timeline 15s) + B-2 (broadcast 20s) + B-5 (notif 60s) + H9-1 (chat no-live) **cùng 1 gốc**: `apps/mobile/lib/realtime.ts` đã build (`subscribeToJobStatus`/`subscribeToJobMessages`) nhưng **deferred, không có caller** (Plan §22.10.L). Wire seam này = vá cả 4. **Đòn bẩy perceived-perf lớn nhất.** DB index cho các query này ĐÃ đủ (jobs(status), job_broadcasts(status), chat_messages(job_id,created_at), notifications(user_id,status,created_at)) ⇒ vấn đề là tần suất/realtime, KHÔNG phải index.

### ✅ Model Kael-orchestration — Tu CHỐT 2026-06-13 + K-1
**Tu: Kael chạy TẤT (analysis/searching/negotiation/pricing/matching); user CHỈ confirm "deal".**
- **Kiến trúc ĐÃ sẵn sàng** (verified `artifact-contract.ts` + `workflow-orchestrator.ts`): dual-path (Kael-auto event + customer-confirm event) cho mỗi bước money; artifact `may_transition:false` (raw AI không đổi state); cờ `KAEL_AUTONOMY_FULL_ENABLED`. ⇒ việc còn lại = **calibration cấu hình, KHÔNG rebuild**.
- `start_matching` KHÔNG flag-gated → **searching luôn Kael-auto** ✅ (estimate→broadcasting auto, no confirm trước search).
- Negotiation = Kael tính (scope/market-based, không haggle, không counter-offer module). ✅

**K-1 (CHỐT 2026-06-13 — Tu ĐỒNG Ý):** "confirm deal" = **scope-change accept + completion accept + "Cho thợ lên" access**; mọi thứ trước (analysis/search/pricing/match/negotiation-compute) = Kael auto.
- **(a) ĐÃ CHỐT → TẮT `tryAutoApproveScopeChange`** (`services.ts:4744`): mọi scope-change = customer confirm (vì đổi GIÁ deal); Kael chỉ tính+đề xuất, không tự duyệt kể cả low-risk. → **ACTION cho Codex.**
- **(b) Resolved theo model:** KHÔNG có confirm-deal trước search (booking-submit = consent; "searching do Kael"). Estimate hiển thị trong chat trước khi match (2.4/2.5) là đủ minh bạch.
- **(c) Ops cần xác nhận:** cờ `KAEL_AUTONOMY_FULL_ENABLED` prod ON/OFF? Quyết Kael auto tới đâu cho completion/payment/dispute/cancellation. completion-accept theo K-1 = customer confirm (Kael chỉ auto-confirm khi đủ evidence — giữ hay tắt tùy (c)).
- Lớp vật lý (accept/check-in/authorize/status): theo model Tu → Kael **chủ động nhắc/điều phối** (nhắc "Cho thợ lên"+escalate X-2; surface broadcast realtime B-2) thay passive poll → **wire realtime cluster + Kael-nudge**.
- Không có coupling trực tiếp client↔worker (verified).

---

## 🟡 LOW / cosmetic

### B-5 (LOW) — Notif poll 60s + không refresh khi về foreground
- **Evidence:** `frontend-workflow-provider.tsx:684-686` 60s; poll gated `isAppForeground()` nhưng không có listener AppState 'active'.
- **Fix:** AppState 'active' listener refresh tức thì.
- **Status:** ✅ verified.

### P-1 (LOW — ĐÃ ĐÍNH CHÍNH) — Timer race thừa ở orchestrator
- **Ban đầu nghi HIGH "timeout không hủy request, rò token" → SAI.** `provider-client.ts:19,38-44` có AbortController + mọi call site `timeoutMs=budget`+`maxRetries:0` ⇒ fetch abort đúng budget, không rò.
- **Residual thật:** `orchestrator.ts:69,154` còn lớp `timeoutAfter` race thừa + không `clearTimeout` (dangling timer/unhandled-rejection nhỏ).
- **Fix:** bỏ race thừa hoặc clearTimeout. Cosmetic.
- **Status:** ✅ verified (đã hạ cấp).

---

## ⏳ CHỜ VERIFY (chưa đủ bằng chứng — KHÔNG mark là lỗi)

- ~~**N-1**~~ **RESOLVED — KHÔNG vi phạm.** `services.ts:9414-9420` `hcmcHourlyRateVnd = readEdgeEnvNumber("SCOPE_CHANGE_HCMC_HOURLY_RATE_VND") ?? derivedHourlyRate` (derive từ `originalPriceMax` của chính job, `:9410`); `baseMultiplier ?? 1.5`; `complexityHours{1,3,6}`=giờ. KHÔNG có literal VND. ✅
- ~~**N-2**~~ **RESOLVED — wired live.** `classifyCustomerCancellationReason` (`services.ts:453,3114`), `recordCustomerCancellationReview` (`:3193`), `determineDisputeSubCase`/`buildNeutralDisputeSummary` (`:3244,:3248`). Không chỉ unit-test. ✅
- ~~Worker-assist BLIND~~ → đã nâng thành **W-1** (verified ở module; caveat handler).
- ~~**DB index hot-path**~~ **RESOLVED — index đủ.** `jobs(status)`/`jobs(status,created_at)`/`job_broadcasts(status)`/`chat_messages(job_id,created_at)`/`notifications(user_id,status,created_at)` đều có (migrations init + align). Poll cost = tần suất×concurrency, không phải index gap. ✅
- ~~chat realtime (H9)~~ → **RESOLVED thành H9-1** (chat wired nhưng no-live).
- ~~`permission-gate.ts`, `memory.ts`/`memory-sanitizer`, `demanding-customer-detect.ts`~~ → **ĐÃ đọc pass 3, all clean/strong** (xem mục ✅ + SWEEP).
- ~~worker-chat handler vision~~ → **RESOLVED**: W-1 confirmed tuyệt đối (handler `services.ts:4339` chỉ text, no vision). **KHÔNG còn item chờ-verify nào.**
- Đọc nốt pass 3: `price-synthesis-ab.ts` (admin A/B eval, off live-path, clean), `decline-templates.ts` (EMPATHY_TEMPLATES_V2 static, non-fear, `refund_demand`→admin, clean). ⇒ **toàn bộ `kael/` đọc 100%.** Còn lại pure-wrapper/schema (zero-finding-expected): `provider-batch.ts` (Anthropic Batch API client), `packages/shared` schemas, LS1-7 candidate builders.

---

## 🟣 SWEEP CUỐI (deep pass 3, 2026-06-13) — rà soát toàn diện lần cuối

### C-1 (MEDIUM) — Cost cap KHÔNG được enforce ở live path
- **Evidence:** caps định nghĩa ở `kael/rate-limit.ts` (`monthlyCostCapUsd:5` customer, `dailyCostCapUsd:30` system) + `routing.config.ts:20` `DAILY_PROVIDER_CAP_USD=30` — nhưng hàm enforce `checkKaelActorRateLimit` **KHÔNG có caller nào** (dead/test-only). `dailyProviderCapUsd` chỉ xuất hiện ở definition. ⇒ **không có trần $ chủ động cho AI spend** ở runtime.
- **Impact:** chi phí AI chỉ bị chặn bởi (a) per-user frequency limit (chat 5/min,20/hr DB-backed) và (b) circuit-breaker phản ứng khi provider hết credit (HTTP_402). Ngày bị abuse nhiều account → không có trần ngân sách global → đội chi phí.
- **Fix:** thêm cost cap DB-backed (atomic, như `check_kael_chat_rate`) hoặc bật provider-side budget alert; wire lại enforcement.
- **Status:** ✅ verified (enforcement = dead code).

### C-2 (LOW) — Dead/test-only code: `kael/rate-limit.ts checkKaelActorRateLimit`
- Không có caller ở `supabase/functions` (chỉ test p5). In-memory counters/costCounters → nếu sau này wire nhầm sẽ KHÔNG bền trên Edge stateless. Hiện = dead code nên không phải runtime bug. **Fix:** prune hoặc thay bằng DB-backed nếu cần dùng.
- **Status:** ✅ verified (dead).

### J-1 (LOW) — `safeParseJSON` live pipeline dùng fallback indexOf/lastIndexOf, không brace-counting
- **Evidence:** `utils.ts:59-72` fallback = `indexOf("{")`..`lastIndexOf("}")` (naive). NHƯNG `process-batch-results.ts:358 parseJsonObjectFromText` ĐÃ có brace-counting parser đúng (theo lesson regex cũ). Live pipeline (intent/vision/market) dùng cái naive.
- **Impact:** nếu AI bọc JSON trong prose có brace lạ → slice sai → `null` → honest fallback (degraded, KHÔNG corrupt). Primary path `JSON.parse` trực tiếp nên hiếm khi chạm fallback.
- **Fix:** dùng chung brace-counting parser cho `safeParseJSON`. Low (degrade an toàn).
- **Status:** ✅ verified.
- Note phụ: `scrubSensitiveForLLM` scrub số khá mạnh (`\d{8}`→bank-account) → có thể nuốt số tiền KH nhắc trong input; an toàn-thiên-lệch, không phải bug.

### K-2 (LOW — quality note) — "Semantic" knowledge retrieval = local hash embedding
- **Evidence:** `knowledge.ts:467 localSemanticEmbedding` = FNV-hash 64-dim (token+bigram), `embedding_model:"kael-local-hash-64-v1"`, minSimilarity 0.62. KHÔNG phải embedding model thật → gần keyword-overlap.
- **Impact:** recall/precision RAG thấp hơn vector thật; lựa chọn rẻ/không phụ thuộc — chấp nhận được cho MVP. Knowledge text ĐÃ PII-scrub (`safeText`) + label "admin-reviewed, not legal advice" → an toàn.
- **Fix (tùy chọn):** nâng lên embedding model thật nếu RAG quality thành vấn đề.
- **Status:** ✅ verified (note chất lượng, không phải bug).

### M-1 (LOW) — Source-trust ON ⇒ bypass market cache
- **Evidence:** `market.ts:114-117` cache chỉ dùng khi `!sourceTrustEnabled`. Source-trust ON → mọi estimate gọi Perplexity live (no cache).
- **Impact:** cost/latency/estimate tăng khi source-trust bật (đánh đổi để có citation tin cậy tươi).
- **Fix:** cân nhắc cache cả nhánh source-trust (kèm citation validation) nếu chi phí Perplexity thành vấn đề.
- **Status:** ✅ verified.

### Rate-limit live path (verified — phần lớn ỔN)
- Chat: **DB-backed `check_kael_chat_rate` RPC** (`services.ts:1280`, durable) + in-memory fallback (`:1306`). ✅
- `AI_SESSION_LIMIT` 10/min (`:774,:6253`) = in-memory (non-durable, throttle phụ). LOW.

### Modules quét sạch, không thấy bug mới (affirming)
`market.ts` (failure→baseline fallback, no fabrication, citation quorum gate), `intent.ts` (fallback→low-conf valid slug, description scrubbed upstream), `synthesis.ts` (pricing deterministic), `cost-tracking.ts` (cost estimate model; provider prices hardcoded USD — maintenance note, không phải VND-RULES), `vision.ts` (AbortController+clearTimeout+size/type validation; fallback medium honest; skipped khi no photo — customer-side vision WIRED, chỉ worker-assist blind W-1), `process-learning-queue.ts` (flag-gated; batch LLM bị constrain "never change price/payment/booking/scope"; requires_manual_review→admin; promotion sau evidence-gate), `lifecycle.ts` (transition graph khớp §12 + event-gate = defense-in-depth), `source-trust.ts` (validateCitations: ≥2 tier-1 domain active + effective-trust≥0.5, decay theo tuổi review, prompt cấm fabricate/forum/blog, insufficient→honest error), `knowledge.ts` (admin-reviewed source, PII-scrub, label "not legal advice", flag-gated, error-tolerant — K-2 embedding hash), `advisory.ts` (max 1 advisory, chỉ khi có danger indicator, safety-first "ngắt nguồn/khóa nước", no fear-upsell, deterministic), `utils.ts` (scrub/sanitize/withDbTimeout clearTimeout — J-1 safeParseJSON naive fallback), `prompts.ts` (mọi prompt: guardrails+JSON-only+scrub input; scope-review prompt ENCODE K-1 "customer must decide", scope-estimate "worker does NOT propose price"; disclaimer add ở output layer không phải prompt), `system-prompt.ts` charter (identity "Kael KHÔNG quyết booking thay customer"), `memory.ts` (actor-scoped+PII-scrub+audit), `registry.ts` (target whitelist + forbidden-effects enum).
> Minor note (không phải bug): giá initial = deterministic `synthesis` (market 0.6+baseline 0.4); giá scope-change = LLM-computed + anti-fraud + customer-confirm. Khác phương pháp nhưng đều bounded.

> **SWEEP HOÀN TẤT (pass 3).** Đã đọc first-hand toàn bộ module lõi Kael: pipeline/orchestrator/autonomy-gate/artifact-contract/workflow-orchestrator/lifecycle/synthesis/intent/vision/market/source-trust/knowledge/advisory/scope-change/scope-risk/output-pipeline/self-check/permission-gate/boundary-guard/memory-sanitizer/cost-tracking/rate-limit(×2)/circuit-breaker/provider-client + learning (queue/batch-results/monitor/registry-gate/skills) + cron + RLS migrations + frontend (workflow-provider/use-service-workflow/kael-chat/use-job-chat-thread/customer+worker-surfaces). Pass 3 đọc THÊM: `prompts.ts`, `system-prompt.ts` charter, `memory.ts`, `registry.ts` (LS gate+scope), `knowledge.ts`, `advisory.ts`, `utils.ts`, `source-trust.ts`, `cost-tracking.ts`, `rate-limit.ts`(×2), `process-batch-results.ts`, `monitor-learning-rules.ts`, `boundary-guard.ts`, `lifecycle.ts`, RLS migrations. Chưa đọc (prose/trivial, bỏ qua an toàn): `decline-templates.ts` (static strings), `provider-batch.ts` (Anthropic API wrapper), `price-synthesis-ab.ts` (admin A/B), `packages/shared` schemas, LS1-7 candidate builders. **Kết luận: 0 bug HIGH mới ở pass 3; engine vững; điểm nghẽn thật = perceived-perf + design-gap + data-honesty (đã liệt kê P0/P1/P2 ở đầu file).**

### NEW STRENGTH — `boundary-guard.ts` (X1/Plan §27.4): input guard cost-0
Pre-pipeline guard CHẶN trước mọi provider call (cost=0 cho turn declined): prompt-injection (EN+VN patterns + semantic classifier optional: roleplay-admin/exfiltration/constraint-bypass/privilege-escalation), out-of-scope (điều hòa/tủ lạnh/tivi/internet/sửa khóa/sơn/nấu ăn/viết code; máy-bơm-NƯỚC exception→plumbing), service-mismatch (gợi ý dịch vụ đúng). ⇒ injection defense **3 lớp**: input (boundary-guard) + decision (autonomy-gate I5) + output (self-check). Deterministic, server-side.

### Learning loop — VERIFIED an toàn toàn trình (affirming)
**Bound cấu trúc (`registry.ts:14-34`):** learning chỉ được chạm 6 target whitelist (analysis_prompt/price_prior/clarification/advisory/detection/intent_category) + **FORBIDDEN_LEARNING_EFFECTS enum** (auto_charge_payment/auto_confirm_booking/auto_cancel_job/auto_approve_worker/auto_suspend_worker/auto_change_final_price/auto_expand_service_scope/hide_from_admin) bị Zod-schema + scope-limit chặn ⇒ learning **KHÔNG THỂ** đụng tiền/booking/worker-punish/scope-expand. Evidence-gate (`:354-376`): insufficient→pending; **contradiction>0.2→manual_review**; low-confidence→manual_review; chỉ all-pass→auto_promote. Promotion data-grounded (IQR job reviewed thật). Rollback monitor (`monitor-learning-rules.ts`): 30 ngày accuracy/satisfaction drop→`rollback_learning_rule` RPC+admin notify + loop-health (SLA 3 ngày). ⇒ chuỗi: bound→gate→promote(real-data)→monitor→auto-rollback hoàn chỉnh.

### RLS / data-access — VERIFIED sạch (affirming)
209 RLS policies/30 migrations; chỉ 1 `using(true)` = `price_baselines SELECT` (reference data, no PII, admin-managed writes) → benign. + grant hardening (anon/authenticated DML revoked, memory). Không thấy RLS gap.

### Note cấu trúc — KHÔNG có job status "disputed"
`lifecycle.ts` `completed_by_worker → ONLY confirmed_by_customer`; dispute = side-record (bảng disputes), không phải job status. ⇒ UI phải đọc disputes table để hiện trạng thái tranh chấp (liên quan H8 thiếu màn dispute trong design).

---

## 🟤 VÙNG CHƯA REVIEW KĨ — đã review thêm (pass 4, evidence-first)

### Đã review thêm — SOLID, không bug mới (evidence)
- **auth.ts:** role lấy từ DB `profiles.role` theo `getUser(token).id` (KHÔNG từ JWT/client metadata) ⇒ chống role-escalation ✅. Bearer required, timeoutFetch 10s.
- **access.ts `requireJobAccess`:** ownership enforced — customer `customer_id!==user.id`→404, worker `worker_id!==user.id`→404, admin bypass; `requiredRole` check; trả 404 (không lộ tồn tại). ⇒ getJob (route no-required-roles) KHÔNG IDOR ✅.
- **`accept_broadcast_atomic` SQL** (`20260518071000`): job FOR UPDATE trước (lock order job→broadcast→worker_profile, chống deadlock) + status CAS `WHERE status='broadcasting'` ⇒ **double-accept bất khả** + eligibility under lock + no-other-active-job + reassign sent khác + service-role-only grant. Race-safe ✅.
- **`decide_scope_change_atomic` SQL** (pr29 `:165`): scope+job FOR UPDATE + status CAS (waiting_customer_decision/reviewing→ALREADY_DECIDED; job scope_change_pending); **SQL ownership** `customer_id<>p_customer_id→NOT_FOUND`; approve cần `kael_computed_max>0` + lock `final_price=kael_computed_max`. Race+money-safe ✅.
- **`confirm_kael_chat_atomic` SQL** (`:99`): session FOR UPDATE + ownership + idempotent (ALREADY_CONFIRMED) + status CAS (estimate_ready) + validate estimate tồn tại trước khi tạo job ✅.
- **Router/validation boundary:** `MAX_JSON_BODY_BYTES=64KB` **enforced thật** (`readJson:2059` check content-length + actual `TextEncoder().encode().length`→413); **mọi route** `schema.safeParse(readJson)` + `!success→VALIDATION 400`; `domain.ts` schemas length-bounded (desc≤2000, chips≤10×100, photo_urls url-validated≤5). Boundary kín ✅. (Note: `client_request_id`/`session_id` dùng `.uuid()` — OK vì mobile gen RFC-4122; chỉ lỗi nếu client gửi UUID phi chuẩn.)
- **Media/storage:** bucket `job-media` **private** + 25MB + mime-whitelist; table `job_media_assets` RLS = `is_job_participant(job_id) or is_admin` (participant-scoped); server `validateJobMediaPath`(path↔job) + `canAttachJobMediaStage`(role↔stage)+requireJobAccess. worker-documents (CCCD) owner-folder-scoped. ✅ (Legacy buckets `job-photos`/`completion-photos` policy `authenticated`-broad — chỉ rủi ro nếu còn dùng; current = job-media).
- **`index.ts`:** entry sạch (env→authenticator+services→Deno.serve); handler: OPTIONS 204, route-match, auth, dispatch, ApiFailure→jsonError, unhandled→500 generic.

### ⚠️ Note kiến trúc (KHÔNG phải bug — risk-surface cần track)
mobile-api tạo client bằng **`supabaseSecretKey` (service-role) → RLS BỊ BYPASS trong Edge**. 209 RLS policies chỉ bảo vệ direct client→DB. ⇒ an ninh handler phụ thuộc **app-level check** (`requireJobAccess` + `.eq(owner, ctx.user.id)`). Pattern áp dụng nhất quán (8+ handler verified). **Thoroughness còn lại:** sweep toàn bộ handler tìm query job/PII nào KHÔNG qua `requireJobAccess` (chưa thấy gap, nhưng chưa audit 100% từng handler trong 9000 dòng services.ts).

- **Dispute RPCs (p13) — spot-verified ✅:** `open_dispute_atomic`/`submit_counter_statement_atomic`/`admin_decide_dispute_atomic` đều `security invoker` + `for update` + status guard (INVALID_STATUS/ALREADY_*) + ownership (`customer_id<>p_initiated_by_id`) + **evidence immutable** (trigger `prevent_evidence_snapshot_mutation`) + service_role-only. `promote_learning_candidate`: `for update` + service_role grant ✅.

### ✅ Đã đóng nốt (pass 5 — đọc hết phần còn lại)
- **RLS helpers `private.is_admin`/`is_job_participant`** (`align_structures:62,77`): is_admin=`profiles where id=auth.uid() and role='admin'`; is_job_participant=`jobs where id=p_job_id and (customer_id=auth.uid() or worker_id=auth.uid())`. `security definer` + `search_path` hardened (`20260518043000`). ⇒ **nền của 209 RLS policy đúng + hardened** ✅ (item impact cao nhất còn lại — clean).
- **`customer_cancellation_atomic` RPC** spot-verified: `security invoker`+`for update`+ownership(`customer_id<>p_`)+status guard+ALREADY_REQUESTED+admin_review từ category+service-role-only. ⇒ **8 RPC verified uniform**; `worker_cancellation`/`submit_review` cùng lineage/pattern.
- **`push.ts`**: rate-limit/user, chỉ token `enabled+granted`, **bounded retry** (3×, 500ms→2s→8s, chỉ 5xx/request-failed), DeviceNotRegistered→auto-disable token, payload truncate, 10s timeout. Clean.
- **IDOR sweep `.from("jobs")` trong services.ts**: mọi route nhận jobId qua `requireJobAccess` trước; direct query còn lại đều scoped (`customer_id/worker_id=ctx.user.id` + CAS) hoặc internal-helper post-authorization (idempotent-return/post-accept/notify). **Không thấy IDOR** ✅.

### ✅ KẾT LUẬN BACKEND BOUNDARY SWEEP (2026-06-13)
Đã quét: entry (`index.ts`), auth (role-from-DB), access (`requireJobAccess` ownership/IDOR), router+validation (64KB enforced + mọi input Zod-bounded), atomic RPCs (7 verified: FOR UPDATE+status-CAS+SQL-ownership+service-role-only+dispute-evidence-immutable), media/storage (job-media private+participant-RLS+size/mime+server-validate), RLS (209 policies, 1 benign). **0 bug mới ở backend boundary — engine cực vững.** Gap enforcement DUY NHẤT vẫn là **C-1 cost cap** (định nghĩa nhưng dead-code; tương phản với body-cap 64KB ĐƯỢC enforce). Mọi điểm nghẽn actionable vẫn = perceived-perf (realtime cluster) + design-gap + data-honesty (P0/P1 đầu file).
> **PASS 5 (đọc hết phần còn lại): RLS helpers (nền 209 policy) đúng+hardened, customer_cancellation RPC (8 RPC uniform), push.ts (bounded retry+token cleanup), IDOR sweep (không thấy IDOR) — tất cả CLEAN.** Backend giờ đã review 100%; chỉ còn body 2 RPC (worker_cancellation/submit_review, cùng pattern đã verify) là chưa đọc từng dòng nhưng không còn risk-surface chưa kiểm. **Tổng: 0 bug HIGH/MED mới ở toàn backend; gap enforcement duy nhất = C-1.**

## ✅ Đã xác minh là MẠNH (đừng phá khi rebuild — để cân bằng, không chỉ bới lỗi)
**Charter/persona** (`system-prompt.ts`) ENCODE đúng model Tu: identity "Kael KHÔNG phải người quyết định booking thay customer" + "layer phân tích/ước tính/brief/bảo vệ"; worker style "never ask worker to set price"; mission Trust/Safety/Transparency/Fairness(no upcharge/lowball)/Humility; forbidden 7 categories khớp self-check · **Kael memory** (`memory.ts`) actor-scoped (worker≠customer) + PII-sanitized mọi layer + audited (`kael_memory_audit`) + token-budget (U-5: read+delete, KHÔNG có edit) · Autonomy gate 6 lớp (PII/prompt-injection/evidence-truth/high-stakes escalate) · transition CAS+atomic RPC+rollback · provider hard-cap+maxRetries:0+circuit-breaker · output double-validate+sanitize(VND/PII) · worker KHÔNG đặt giá (Kael tính) · **scope auto-approve money-safe** (chặn nếu anti-fraud flag/conf<0.55/qua autonomy gate) · dispute Kael chỉ tóm tắt trung lập + evidence lock + admin-decides · cancellation sub-case đúng (cancel sau completed→dispute) + Phase-0 honest + abuse · self-check guardrail (fear/absolute/exact_vnd/accusatory) · learning flag-gate+kill-switch · **estimate-turn streaming ĐÃ wired** (đính chính claim "disconnected" cũ) · **last-50m access handshake build đủ 2 phía+backend** (gap chỉ ở design board — X-1) · **permission-gate** (worker pre-accept PII deny, topic boundary: deny exact-price/fear-upsell/legal/medical/financial, money scoped own-job, audited) · **memory-sanitizer** (strip email/phone/CCCD/unit/floor/bank + drop sensitive keys khỏi Kael memory) · **demanding-customer detect** (case-2: phân biệt detail-oriented vs pressure; LLM soft-only, keyword own hard-escalation) · DB index hot-path đủ.

· **pricing/negotiation deterministic + market-anchored** (`synthesis.ts`: price = round((market×0.6 + baseline×0.4)×complexityMult), 1000đ rounding, confidence≤0.85; baseline từ DB `price_baselines`; no LLM free-pricing, no hardcode VND) · **autonomy 2-tầng** (artifact `may_transition:false` + autonomy decision `actor:kael_system` = đường duy nhất đổi state; dual-path Kael-auto/customer-confirm — KHỚP model Tu, chỉ cần calibration).

> Deep pass 2+3 ĐÃ quét: handshakes H1–H9, access X-1, scope/completion/cancellation/dispute, realtime cluster (B-1/B-2/B-5/H9-1), W-1 worker-assist blind, permission-gate, memory PII, case-2 demanding, DB index, N-1/N-2, **workflow-orchestrator (transition authority), artifact-contract (autonomy schema), synthesis (pricing)**. Còn lại (minor, affirming): `system-prompt.ts`/charter, `market.ts`/`source-trust.ts`, `intent.ts`/`vision.ts`, `knowledge.ts`, `cron/*`, `rate-limit.ts`, worker-chat handler vision (caveat W-1).
