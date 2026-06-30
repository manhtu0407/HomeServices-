# Kael Performance & Agentic-Process Hardening Audit — Part 2

> Ngày: 2026-06-13 · Tác giả: Claude (MTS – Agent Systems & Applied Product) · Loại: **audit read-only**
> Nối tiếp `docs/audit/kael-agentic-process-audit-20260613.md` (Part 1 = flow + component-first map).
> Trọng tâm Tu giao: mọi thứ ảnh hưởng **performance của Kael** + **process agentic của Kael**, và components/flow/interaction UI phải setup đúng để **một work-case thật không xảy ra sai lầm**.
> Ràng buộc giữ nguyên: không sửa code, không sửa file khóa, không sửa handoff. Đây là phân tích + đề xuất.

## Phương pháp & độ trung thực (đọc trước)

Tôi đã chạy 2 lần workflow đa-agent (14 finder + adversarial verify). **Cả 2 đều bị chặn bởi infra phía Anthropic**: lần 1 rate-limit tạm thời, lần 2 **session limit (reset 2:40pm Asia/Saigon)** → subagent không chạy được. Vì vậy audit này được hoàn thành bằng **đọc code trực tiếp first-hand** trong main loop (không phụ thuộc subagent). Thực tế điều này cho **độ tin cậy cao hơn** cho phần đã đọc (tôi đọc đúng file:line), đổi lại **độ phủ hẹp hơn** so với fan-out 14 chiều — phần chưa đọc sâu được liệt kê trung thực ở §6. Có thể chạy lại workflow sau 2:40pm để mở rộng độ phủ.

---

## 0. Kết luận đầu (verdict)

Trên các trục đáng sợ nhất — **Kael có ra quyết định sai về tiền/trạng thái khi có case thật không?** — engine **vững**: autonomy gate 6 lớp, transition compare-and-swap + atomic RPC + rollback, timeout cho mọi stage, output double-validate + sanitize, learning bị flag-gate + kill-switch, worker không bao giờ tự đặt giá. **Đây là tài sản, đừng phá khi rebuild.**

Rủi ro thật cho case đầu **không** nằm ở "Kael tính sai tiền" mà ở 3 nhóm:
- **(P) Performance/cost khi có tải**: ~10 lượt ghi progress DB tuần tự mỗi estimate (P-2), latency lượt đầu worst-case ~10s sát ngân sách 9s (P-3), cap $30/ngày là single-point-of-failure ngày launch (P-4). [Provider call ĐÃ abort đúng hạn + `maxRetries:0` — xem S9; P-1 ban đầu nghi "rò token" đã được đính chính thành cosmetic.]
- **(A) Defense-in-depth thiếu vài chỗ**: learned price rule không có clamp lệch so với baseline ở thời điểm áp dụng.
- **(U) UI/flow honesty** (từ Part 1, vẫn là rủi ro lớn nhất cho rebuild): nếu Codex dựng màn tĩnh bỏ qua phase-context contract, hoặc render gamification giả, hoặc bỏ rơi confidence/needs_inspection/disclaimer → case thật sẽ desync hoặc mất niềm tin.

---

## 1. Điểm mạnh đã xác minh first-hand (KHÔNG được phá khi rebuild)

| # | Điểm mạnh | Bằng chứng |
|---|---|---|
| S1 | **Autonomy gate 6 lớp** + chống prompt-injection | `autonomy-gate.ts:115-204`: schema→policy_id prefix→state_transition→permission→**I4 PII/secret**→**I5 direct-mutation** ("set status=", "rpc(", "release payment", "charge customer")→**I2 evidence-truth** (ref phải có thật)→evidence_sufficiency→high-stakes(<0.82)→`escalate` vào `kael_admin_queue`. `llm_proposed` bị chặn nếu cờ full-autonomy off. |
| S2 | **Transition an toàn**: compare-and-swap + atomic RPC + rollback | `services.ts:1007-1040` (A7 analyzing→broadcasting: gate → `.eq("status","analyzing")` → `STATUS_CHANGED` 409 → `createBroadcasts` → rollback về analyzing nếu DB lỗi); `:3687-3706` (worker status: `.eq("status", job.status)` CAS); `:3746-3755` (completed→confirmed CAS + gate). RPC: `accept_broadcast_atomic`, `confirm_kael_chat_atomic`, `decide_scope_change_atomic`, `submit_review_atomic`, `*_atomic`. |
| S3 | **Timeout cho mọi stage AI** + fallback + self-check | `orchestrator.ts:69-72` `Promise.race([run, timeoutAfter])`; `:73-99` selfCheck `checkKaelResponse` cho output string trước khi trả. |
| S4 | **AI boundary**: double schema-validate, không bao giờ render raw AI | `output-pipeline.ts:62-78` parse→fallback→sanitize→re-parse→render; `:124` disclaimer luôn đính; `:95-100` clamp giá + ép `needs_inspection/low` khi confidence thấp. |
| S5 | **Output sanitize**: chặn rò PII + giá thô trong prose | `output-pipeline.ts:304-355` `sanitizeKaelText` strip VND patterns + scrub email/bank/phone/CCCD/unit/floor; áp đệ quy `sanitizeKaelOutputObject`. |
| S6 | **Scope-change: worker KHÔNG đặt giá** | `output-pipeline.ts:223-302` worker chỉ nhận `worker_challenge` (yêu cầu bằng chứng), Kael tự tính `new_price_min/max`; `customer_card.decision_required:true` + anti-fraud (drift/score/admin_flag). |
| S7 | **Learning bị gate chặt** | `learning.ts:70,134` cần `learningEnabled`; chỉ đọc rule `status='active'`; `:381-387` READ+WRITE flag + `KAEL_LEARNING_KILL_SWITCH`. |
| S8 | **Streaming thật (SSE)** | `apps/mobile/lib/kael-stream.ts` expo/fetch→ReadableStream→parser (stage/token/result/error/heartbeat); server `streaming.ts` ghi `kael_progress`. |
| S9 | **Provider call hard-cap + no hot-path retry** | `provider-client.ts:19,38-44` callAI dùng `AbortController`+`withTimeout`(clearTimeout); mọi call site truyền `timeoutMs=route.latencyBudgetMs` + `maxRetries:0` (`vision.ts:73`, `intent.ts:69`, `market.ts:186`, `scope-change.ts:32`, `price-synthesis-ab.ts:95`) → fetch abort tại budget (vd vision 4.5s), không retry → không rò token. |
| S10 | **Circuit breaker per (purpose,provider)** | `circuit-breaker.ts:26-71`: credit(402)→open 60m, rate_limit(429)→5m, server/timeout→5m, schema→10m; auto-close + clear khi success. |

---

## 2. Findings — Performance (xếp theo mức độ)

### P-1 (LOW — đã hạ cấp sau khi đọc provider layer) — Timer race thừa ở orchestrator
**Đính chính (doubt-loop):** giả thuyết ban đầu "timeout không hủy request, rò token" là **sai**. `provider-client.ts:19,38-44` callAI dùng `AbortController` + `withTimeout` (có `clearTimeout` khi settle); và mọi call site truyền `timeoutMs = route.latencyBudgetMs` + `maxRetries: 0` (`vision.ts:73`, `intent.ts:69-70`, `market.ts:186-187`, `scope-change.ts:32`, `price-synthesis-ab.ts:95`). Nên khi vision quá 4.5s, fetch **bị abort tại 4.5s**, không chạy nền tới 20s, không retry → **không rò token đáng kể**.
- **Residual (LOW):** `orchestrator.ts:69-72,154-158` còn một lớp `timeoutAfter` race **thừa** bọc ngoài call (vốn đã tự abort), và timer này **không `clearTimeout`** → có thể sinh dangling timer/unhandled-rejection nhỏ khi stage thắng race.
- **Fix (cosmetic):** bỏ lớp race thừa ở orchestrator, hoặc thêm `clearTimeout` khi settle. Không ảnh hưởng chi phí thực.

### P-2 (MEDIUM) — Ghi progress DB khuếch đại trên hot path
`pipeline.ts` gọi `updateKaelProgress` ~10 lần/estimate (intent running/completed, vision+market+synthesis running ×3, từng cái completed, price running/completed). `streaming.ts:32-67` mỗi lần là 1 `UPDATE ... eq(id)` và **đang được `await`** trong critical path.
- **Real-case impact:** mỗi case cộng ~10 round-trip DB nối tiếp vào latency lượt đầu; write amplification lên bảng `jobs`/`kael_chat_sessions` khi nhiều case song song.
- **Fix:** fire-and-forget (`void updateKaelProgress(...)`) hoặc coalesce (chỉ ghi mốc 0.2/0.6/1.0), vì progress đã có kênh SSE realtime riêng cho UI.

### P-3 (MEDIUM) — Latency lượt đầu worst-case ~10s, sát ngân sách 9s
`routing.config.ts:36-41`: intent 2.5s + parallel max(vision **4.5s**, market 4s, baseline) + price 3s ≈ **~10s worst-case**; `case-1-normal.ts` mốc intake ≤9s. Stage **bị hard-abort tại budget** (S9) nên không overrun, `maxRetries:0` nên không cộng dồn retry — nhưng tổng budget vẫn ~10s nếu mọi stage chạm trần. Vision (Anthropic, **không fallback provider** — `routing.config.ts:37`) là cột cao nhất; blip vision → fallback baseline-only ngay (A-2).
- **Real-case impact:** trên mạng yếu/Edge cold start, lượt đầu case thật có thể chạm ~9-10s → cảm giác "đứng hình" nếu UI không hiển thị tiến trình.
- **Fix:** SSE stage progress phải bind đúng ở rebuild để che latency (hạ tầng đã có — S8); cân nhắc trả estimate sơ bộ baseline trước rồi refine; xem lại có nên hạ vision budget hoặc thêm đường fallback cho vision.

### P-4 (MEDIUM) — Cap provider $30/ngày là single-point-of-failure
`routing.config.ts:20` `DAILY_PROVIDER_CAP_USD = 30` toàn cục.
- **Real-case impact:** ngày launch/marketing, nếu chạm cap → mọi call AI fail đồng loạt → mọi case mới chết giữa chừng. Với ~$0.08/case ⇒ ~375 case/ngày là trần.
- **Fix:** alert khi đạt 70/90% cap; thông điệp degrade trung thực ("Kael đang quá tải, thử lại sau") thay vì lỗi trần kỹ thuật; tách cap theo purpose để vision (đắt) không làm sập intent (rẻ).

### P-5 (LOW) — Chưa đọc sâu pass này
`circuit-breaker.ts`, `provider-client.ts` (giới hạn retry/backoff), `rate-limit.ts`, chỉ-mục DB trong migrations cho hot query (`me/jobs/active` hydration, broadcasts) — cần pass sau.

---

## 3. Findings — Agentic process

### A-1 (MEDIUM) — Learned price rule không có clamp lệch vs baseline khi áp dụng
`learning.ts:127-185` `applyLearnedPriceRule` chỉ validate `priceMin>0 && priceMax>=priceMin`; `pipeline.ts:408-409` dùng `learnedPrice?.priceMin ?? baselineResult.priceMin` → **rule active thay thẳng baseline**. Bảo vệ duy nhất là evidence gate lúc **promotion** (≥5 ca, confidence, rollback) + cron monitor; **không có chặn biên độ lúc apply**.
- **Real-case impact:** một rule bị promote sai (dữ liệu lệch nhưng "hợp lệ" về thứ tự) có thể đẩy estimate live lệch nhiều lần → khách thấy giá phi lý hoặc thợ bị thiệt; chỉ phát hiện sau qua monitor.
- **Fix (defense-in-depth):** clamp learned range trong ±X% baseline lúc apply; nếu vượt → bỏ qua rule + ghi alert (không cần block người dùng).

### A-2 (MEDIUM, thành yêu cầu UI) — Fallback tạo estimate từ input suy giảm, UI phải nói thật
Nếu vision **và** market cùng timeout, estimate dựng từ baseline-only + complexity "medium" (`pipeline.ts:194-205, 332-340`). Engine **đã trung thực**: `output-pipeline.ts:88-104` ép `confidence:"low"`, `needs_inspection:true`, `price_source:"inspection_required"`, `fallback_used`.
- **Real-case impact:** nếu UI rebuild **bỏ qua** `confidence/needs_inspection/price_source/disclaimer` (chỉ vẽ khoảng giá đẹp), khách hiểu nhầm là giá chắc → tranh chấp khi thợ tới.
- **Hiện trạng (verified first-hand):** chat estimate card ĐÃ render confidence (`agentic-parts.tsx:1036`) + disclaimer (`:1047`, testID `customer-kael-chat-price-disclaimer`), **nhưng chưa render `needs_inspection`/`price_source`** (chỉ dùng `estimate` cơ bản `KaelEstimate`, không phải `estimate_card_v3`). ⇒ khi confidence thấp/cần kiểm tra hiện trường, UI hiện tại KHÔNG báo rõ.
- **Fix:** estimate card (design 2.5) **bắt buộc** render confidence + **needs_inspection badge** + disclaimer + trạng thái fallback (đọc từ `estimate_card_v3`). Đây là hợp đồng dữ liệu, không phải tùy chọn thẩm mỹ.

### A-3 (LOW) — Chưa đọc sâu pass này
Nội bộ `scope-change.ts` (đã xác minh gián tiếp qua output-pipeline S6 + RPC `decide_scope_change_atomic`), `agentic/case-3/4` (cancellation), `self-check.ts`/semantic guard, `permission-gate.ts` chi tiết — cần pass sau để khẳng định đủ.

---

## 4. Findings — UI / flow / interaction (để case thật không sai)

### U-1 (HIGH) — Gamification hồ sơ = dữ liệu giả (vi phạm RULES no-fake-data)
`router.ts` `WorkerProfileResponse` chỉ có rating/total_jobs/verification/service_types/years; **không có** cấp 1–10, điểm, đúng-giá %, radar, thu-nhập-30-ngày; **không có endpoint customer profile** ngoài `me/kael-memory`. Design profiles (3 màn thợ + 3 màn khách) đầy số này.
- **Real-case impact:** người dùng thật thấy "Hạng 3 Tin cậy 620/1000", "Bảo vệ đồng tiền 92/100" hoàn toàn bịa → mất niềm tin ngay, đúng thứ giết transaction đầu.
- **Fix:** empty-state trung thực; chỉ render field suy ra được từ dữ liệu thật (rating, total_jobs, earnings tổng). Còn lại ẩn/đánh dấu "sắp có".

### U-2 (HIGH) — Phải render phase-context contract, không tự chế màn tĩnh
`workflow-phase-context.ts` + `workflow-ui-rules.ts` đã tính sẵn `primaryArtifact` + `sections` + `mode` cho mỗi phase; mobile tiêu thụ qua `use-service-workflow.ts`.
- **Hiện trạng (verified first-hand):** app HIỆN TẠI đã render đúng phase-context — `agentic-parts.tsx:674-697` render `title/intent/source/primaryArtifact/blocked/nextEvent`; `kael-chat-surface.tsx:495,499` dùng `optimistic:'starting_matching'` + `artifacts.process_ticket.mode`. ⇒ rủi ro là **rebuild gây REGRESSION**, không phải greenfield.
- **Real-case impact:** nếu rebuild dựng 8 màn rời với state riêng, một case thật sẽ desync với server-truth (hiện sai section/mode, mở chat khi chưa được phép, để lộ địa chỉ sớm) → đụng cả luật "preserve navigation/logic" của brief Codex.
- **Fix:** màn case-work = renderer của `phaseContext.sections`; Agentic Center 5.2 (`me/jobs/active`) làm surface chính.

### U-3 (MEDIUM) — Xung đột bottom-nav
`theme.ts` token (`Trang chủ/Lịch sử/Tin nhắn/Hồ sơ`+orb) ≠ route app hiện tại (customer `home/booking/kael/history/profile`; worker `home/jobs/chat/earnings/profile`). Đổi sang token = đổi navigation (brief cấm). 1 bộ 4-tab không phục vụ nổi 2 role.
- **Fix:** chốt nav theo role trước khi Codex đụng; sửa token cho khớp.

### U-4 (MEDIUM) — Interaction safety cho case thật
Cần đảm bảo ở rebuild (engine đã hỗ trợ, UI phải dùng đúng): chống double-submit (createJob/accept), optimistic rollback khi API fail (`optimistic:'starting_matching'` ở view-model — phải revert khi lỗi), đếm 60s nhận việc của thợ (B3), scope hard-stop không bị bypass (chờ `kael_decided_scope_change`), không ghi tiền/đổi status từ client, chat chỉ gửi khi `isWorkflowJobChatSendable`.

### U-5 (MEDIUM) — Surface Agentic Center thiếu backend
Approval Queue 5.3 (không feed), Memory 5.4 (chỉ GET+DELETE, không edit), tab Tin nhắn (không inbox). Build UI = rỗng/giả. Fix: thêm endpoint hoặc descope vòng đầu (chi tiết §5/§7 Part 1).

---

## 5. Real-case walkthrough (điện: aptomat nhảy, chung cư Q.Bình Thạnh)

1. **Intake/estimate** — khách mô tả + 3 ảnh → `runKaelPipeline`. Nếu mạng yếu, vision 4.5s + market 4s → lượt đầu ~9-10s (**P-3**, nhưng stage hard-abort tại budget, không overrun/retry — S9); ~10 ghi progress nối tiếp (**P-2**). Estimate ra `confidence` + `needs_inspection` — UI **phải** hiện (**A-2/U-4**). Nếu có learned price rule lệch → giá phi lý (**A-1**).
2. **A7 orchestration** — autonomy gate allow → CAS analyzing→broadcasting → broadcast; lỗi DB thì rollback (S2). An toàn.
3. **Match/accept** — `accept_broadcast_atomic` chống 2 thợ cùng nhận (S2). Địa chỉ đầy đủ chỉ mở sau accept (S6 brief pre/post).
4. **On-site** — worker status CAS-guarded (S2); check-in geofence (`services.ts:3641`). UI phải hiện timeline đúng phase (**U-2**).
5. **Scope-change** — worker gửi lý do+ảnh, **Kael tính giá** (S6), anti-fraud; khách `decision_required` (Part 1: cần màn quyết định KH — board thiếu). Hard-stop không được bypass (**U-4**).
6. **Complete/pay** — completion auto-confirm qua autonomy gate + evidence (notes≥5 + ≥1 ảnh, `services.ts:3672`); final_price Kael-locked (S2). Payment vẫn placeholder — UI không được nói "đã thanh toán" (Part 1).
7. **Review/learn** — review_atomic; LS1–LS7 evidence-gated (S7).

→ Các điểm "bite" cho case đầu, theo thứ tự đau nhất: **U-1 (giả số) → U-2 (desync) → P-3/P-2 (chậm) → A-1 (giá learned lệch) → A-2/U-4 (không hiện confidence)**.

---

## 6. Độ phủ & việc còn lại (pass sau, có thể chạy lại workflow sau 2:40pm)

- Đã đọc thêm pass này (chuyển thành S9/S10): `provider-client.ts` (AbortController + maxRetries:0 + bounded backoff), `circuit-breaker.ts`. Chưa đọc sâu: `rate-limit.ts`, `self-check.ts` semantic guard, `permission-gate.ts`, `scope-change.ts` nội bộ, `agentic/case-2..5` nội bộ, chỉ-mục DB (migrations) cho hot query, `agentic-parts.tsx`/`thread.tsx` render thực tế.
- Chưa đo latency/cost thực tế (chỉ đọc ngân sách cấu hình, chưa chạy).
- Workflow 14-chiều bị chặn 2 lần (rate-limit + session limit reset 2:40pm) — chạy lại để fan-out adversarial verify khi hết giới hạn.

## 7. Khuyến nghị (ưu tiên)

1. **U-2** render phase-context contract (đòn bẩy đúng-đắn lớn nhất cho rebuild).
2. **U-1** giết gamification giả → empty-state.
3. **P-2** fire-and-forget/coalesce ~10 progress writes; **P-1** (cosmetic) bỏ timer race thừa ở orchestrator + clearTimeout.
4. **A-1** clamp learned price ±X% baseline lúc apply.
5. **A-2/U-4** estimate card bắt buộc render confidence/needs_inspection/disclaimer; interaction-safety (double-submit, optimistic rollback, 60s, hard-stop).
6. **P-4** cảnh báo + degrade khi gần cap; **U-3** chốt nav theo role.

> Trạng thái: audit Part 2 hoàn tất (first-hand). Chưa sửa gì. Bước kế: Tu chọn ưu tiên ở §7; tôi có thể (a) chạy lại workflow mở rộng độ phủ sau 2:40pm, hoặc (b) đi sâu một mục cụ thể cậu chọn.

---

## 8. Deep pass bổ sung (2026-06-13, cont.) — tầng agentic-safety được KHẲNG ĐỊNH vững

Đọc sâu thêm cancellation / dispute / scope anti-fraud / semantic guard. Kết luận: **tầng an toàn agentic rất chắc** — rủi ro tập trung ở perf-under-load (bounded) và UI-honesty (rebuild), KHÔNG ở "Kael ra quyết định sai".

| # | Điểm mạnh (verified first-hand) | Bằng chứng |
|---|---|---|
| S11 | **Dispute: Kael chỉ tóm tắt trung lập, KHÔNG quyết** | `case-5-dispute.ts:117-161` `buildNeutralDisputeSummary` "does not decide outcome"; `assertNeutralDisputeLanguage` chặn "fault/must pay/penalty/refund/compensation"+forbidden-decision; mọi dispute `adminReviewRequired:true`; `buildDisputeEvidenceSnapshot` **khóa** chat/ảnh/timeline/scope/artifact; `evaluateDisputeAbuse` (cust>0.20, worker>0.15, frivolous≥3, repeat≥2). |
| S12 | **Cancellation: sub-case đúng + Phase-0 honest + abuse + memory PII-sanitized** | `case-4-customer-cancel.ts`: cancel sau `completed_by_worker` → **trigger dispute, KHÔNG cancel** (chống trốn thanh toán); `phase0NoMonetaryPenalty:true` luôn; abuse→`kael_admin_queue`+trust patch; `sanitizeReviewExcerpt` redact phone/email trong `customer_kael_memory`. |
| S13 | **Scope anti-fraud có điểm số** | `scope-risk.ts`: driftRatio scoring (>1.5/>3/no-photo&>2x/keyword/worker-rate) → `challengeRequired≥0.5`, `adminFlagRequired≥0.8`; margin vs `fairPriceMax`. Layered với customer-decision + autonomy gate. |
| S14 | **Self-check semantic guard mạnh** | `self-check.ts:134-224`: chặn fear/absolute/ai-self-ref/**exact_vnd**/accusatory-dispute/language-mismatch/sentence-too-long + semantic regex + classifier; pipeline regenerate→fallback; `auditKaelGuardrailTrip`→`kael_guardrail_trip_audit`. |

**Note mới (LOW-MED):**
- **N-1:** `scope-risk.ts` `calculateScopeChangeMargin` dùng `hcmcHourlyRateVnd` từ `ScopeChangeRiskConfig` (param). Cần xác minh nguồn config này (DB/env, không hardcode VND — RULES). Caller: `scope-change.ts`.
- **N-2:** `case-1/3/4/5` là conformance spec (test p9–p13). Cần xác minh logic phân loại/abuse (vd `classifyCustomerCancellationReason`, `evaluateCustomerCancellationAbuse`, `recordCustomerCancellationReview`, dispute neutral-summary) **được gọi trong handler live** quanh RPC `request_customer_cancellation_atomic`/`open_dispute_atomic` — không chỉ unit-test.

**Cập nhật độ phủ (§6):** đã đọc thêm `case-4`, `case-5`, `scope-risk.ts`, `self-check.ts`. Còn lại chưa đọc sâu: `case-3-worker-cancel.ts`, `permission-gate.ts`, `memory.ts`/`memory-sanitizer.ts` nội bộ, `worker-assist.ts`/`vision.ts` (concern "BLIND"), `rate-limit.ts`, chỉ-mục DB (migrations) cho hot query, `demanding-customer-detect.ts`, wiring case-4/5 (N-2).

**Kết luận deep pass:** agentic safety = tài sản đã chín, đừng phá. Để "case thật không sai", ưu tiên dồn vào: **(1) UI render đúng phase-context + honesty fields (U-1/U-2/A-2)**, **(2) perf-under-load (P-2/P-3/P-4)**, **(3) defense-in-depth nhỏ (A-1 clamp giá learned, N-1 config VND, N-2 verify wiring)**.

---

## 9. Perceived-performance & lifecycle UI-interaction — điểm nghẽn (verified trên live path)

> Phương pháp (theo yêu cầu objectivity của Tu): mỗi điểm nghẽn kèm **bằng chứng wiring thật** (file:line + giá trị interval/poll), phân biệt "nghẽn thật trên live path" vs "đã có seam/deferred có chủ đích". Có **đính chính 1 claim cũ sai**.

### 9.1 Cách Kael show "đang làm việc" lúc estimate — ĐÃ wired (không phải disconnected)
- **Server** `streamKaelChatTurn` (`services.ts:1663-1744`): chạy full pipeline (`sendKaelChatTurn`) + một vòng đọc `kael_progress` DB mỗi **800ms** (`KAEL_CHAT_STREAM_POLL_MS=800`, `services.ts:234`) → emit SSE `event:stage`; heartbeat 10s; max 15s. Token events **DISABLED** (chỉ stage-level — đúng intent "stage > token").
- **Client** `apps/mobile/lib/services.ts:219` `kaelChatService` gọi `streamKaelChatTurn(...handlers)`; `kael-chat/state.ts` có `kaelProgress/kaelProgressTrace/kaelProgressElapsedMs/streamTokenReceived`. ⇒ **Live Performance Chat (design 2.4) ĐÃ nối stage-streaming end-to-end** (cả worker advisory chat: `worker-surfaces.tsx:2414 onStage`).
- **ĐÍNH CHÍNH:** note cũ "streaming disconnected 3 chỗ" ([[project_kael_perceived_perf]]) **không còn đúng** — state + service + server SSE đã nối (verified first-hand).

### 9.2 Điểm nghẽn THẬT (verified)
**B-1 (HIGH) — Live job timeline: customer poll 15s, KHÔNG realtime.** `frontend-workflow-provider.tsx:733-735` `setInterval(refreshCurrentJob, 15_000)` cho status broadcasting…completed_by_worker. ⇒ thợ bấm "đã đến/đang làm", khách thấy trễ tới **15s**. Nghẽn perceived-perf lớn nhất ở pha active.

**B-2 (HIGH) — Worker broadcast: poll 20s vs cửa sổ nhận việc 60s.** `:695-697` `setInterval(workerRefresh, 20_000)`. ⇒ tới **20s** (⅓ cửa sổ 60s) trôi trước khi thợ THẤY job trong app. Push token có đăng ký (out-of-app) nhưng in-app surfacing là poll 20s ⇒ risk thợ mất việc oan vì thấy muộn.

**B-3 (MEDIUM) — Progress = DB-poll bridge, read+write amplification.** Pipeline ghi `kael_progress` ~10 lần/estimate (await — xem P-2) + SSE poll đọc DB mỗi 800ms (~11 đọc/estimate ~9s) ⇒ **~21 op DB/estimate** chỉ cho progress, nhân theo số case song song. Stage granularity ~800ms.

**B-5 (LOW) — Notifications in-app poll 60s; quay lại foreground không refresh ngay.** `:684-686` 60s. Mọi poll gated `isAppForeground()` nhưng **không có listener AppState 'active'** để refresh tức thì khi mở lại app ⇒ hiển thị state cũ tới 1 interval (15–60s) sau khi quay lại.

### 9.3 Nuance objectivity — KHÔNG phải "quên realtime"
`apps/mobile/lib/realtime.ts` ĐÃ có `subscribeToJobStatus` (`job-status:${jobId}` postgres_changes) + `subscribeToJobMessages`, nhưng header ghi rõ *"Until then, do NOT wire it"* (Plan §22.10.L — realtime **deferred có chủ đích**). **Verified: 2 helper KHÔNG có caller nào trong apps/mobile** (grep chỉ ra định nghĩa). ⇒ B-1/B-2 **không phải bug "thiếu realtime"** mà là deferred-decision, **seam đã sẵn**. Fix = wire helper sẵn có vào provider (low-effort).

### 9.4 Điểm TỐT (không mark lỗi — đánh giá cân bằng)
- `client_request_id` idempotency chống job trùng (`:283`, X2 §27.5).
- Cold-start `hydrateCustomerActiveJob` (F-17) — không mất active job khi mở lại.
- Poll gated `isAppForeground()` (pin); dedup same-state (`sameWorkerProfile`/`sameNotifications`) tránh re-render.
- Mọi mutation → `refreshCurrentJob()` re-fetch (nhất quán; đổi lại 1 round-trip/action).
- Broadcast countdown client-side tick 1s (`:750`) mượt; chỉ desync nhẹ với poll nền.

### 9.5 Khuyến nghị (ưu tiên perceived-perf)
1. **Wire realtime sẵn có** (`subscribeToJobStatus`) vào provider cho pha active → thay poll 15s (B-1) + surfacing broadcast (B-2). Đòn bẩy lớn nhất, seam đã sẵn.
2. Thêm AppState 'active' listener → refresh tức thì khi quay lại foreground (B-5).
3. P-2/B-3: progress writes fire-and-forget/coalesce để giảm op DB/estimate.
4. Nếu chưa bật realtime: hạ poll xuống ~5–7s khi đang ở pha on-site (đánh đổi pin), giữ 15s ở broadcasting.

**Kết luận §9:** estimate-turn perceived-perf ĐÃ chạy thật (stage streaming, 800ms). Điểm nghẽn dồn ở **pha active job = polling 15s/20s** vì realtime bị defer có chủ đích (seam sẵn). Đây là đòn bẩy đơn lẻ lớn nhất cho cảm giác "Kael theo dõi realtime".
