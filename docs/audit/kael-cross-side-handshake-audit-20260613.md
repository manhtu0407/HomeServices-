# Kael Cross-Side Agentic Handshake Audit — client ↔ worker

> Ngày: 2026-06-13 · first-hand, token-conscious (grep định vị → đọc đúng đoạn) · read-only.
> Câu hỏi Tu giao: tương tác qua lại **client section ↔ worker section** có thật là **một Agentic Process do Kael chủ trì toàn bộ** (components → phases → times) không, và có khớp **design mới** cho cả 2 flow không. Không bỏ chi tiết nhỏ.
> Liên quan: Part 1 (`kael-agentic-process-audit-20260613.md`), Part 2 + §8/§9 (`kael-perf-agentic-hardening-audit-20260613.md`), `Notes.md`.

---

## 0. Verdict (objective)

1. **KHÔNG có coupling trực tiếp client↔worker.** Mọi tương tác cross-side đi qua server (atomic RPC + state machine + notification). Không P2P, không client ghi state của worker. ✅ verified.
2. **Money/agentic spine = Kael chủ trì THẬT** (matching, scope, completion, payment, dispute, cancellation đều qua KaelAutonomyDecision/policy; Kael tính giá, Kael auto-decide hoặc escalate). ✅ verified.
3. **Operational physical handshakes** (accept 60s, lobby check-in, "Cho thợ lên" authorize, status advance) = **actor-driven + server-gated + Kael-branded notification**, KHÔNG phải KaelAutonomyDecision. Đây là điểm cần Tu xác nhận chủ đích (§4).
4. **GAP design:** vài handshake quan trọng (đặc biệt **last-50m access** + **nửa sau phía khách**) đã có backend nhưng **KHÔNG có trong design inventory** và/hoặc **không nằm trong phase-context** → rebuild dễ bỏ sót. (§5)

---

## 1. Bảng handshake cross-side (layer-by-layer)

| # | Handshake | Trigger (side) | Mediation (Kael/server) | Propagation (notify) | Components 2 phía | Có trong design? | Trong phase-context? |
|---|---|---|---|---|---|---|---|
| H1 | Booking → broadcast | customer create job | **Kael autonomy** `start_matching` (`services.ts:980-1040`) → `createBroadcasts` | `estimate_ready` (customer) | KH "đang điều phối" + thợ broadcast card | 2.6 (KH) + 3.2 Jobs (thợ) ✅ | `matching` ✅ |
| H2 | Worker accept (60s) → matched | worker | `accept_broadcast_atomic` + `validateWorkflowTransition(broadcasting→worker_matched)` (`:3387`) | `notifyCustomerWorkerMatched` (`:3421`) | thợ accept+đếm 60s + KH "đã có thợ" | 2.10/2.11 (KH) + 3.x (thợ) ✅ | `worker_matched` ✅ |
| H3 | Worker status advance | worker | `updateJobStatus` **CAS** `.eq("status",...)` (`:3687`) | `notifyCustomerJobStatus` (arrived) + silent on_way/inspecting/repairing (case-1) | thợ status control + KH timeline | KH 2.9/2.12 ✅; **thợ status control ⚠️ chưa rõ** | `active_timeline` ✅ |
| H4 | **Last-50m access** (lobby check-in ↔ "Cho thợ lên") | worker check-in → customer authorize | check-in `buildCheckInAccessState`→`building_released` (`:9060`); customer `authorizeApartmentAccess`→`unit_released` (`:8957`, hardened: current-worker-only, active-only) | notify worker "Khách đã cho phép lên" (`:9033`) | thợ check-in (geofence) + thợ "chờ khách cho lên" + **KH "Cho thợ lên"** | ❌ **KHÔNG có trong inventory** | ❌ **không có phase** (sống trong `job.address_access`) |
| H5 | **Scope-change money** | worker request | Kael **tính giá** + `request_scope_change_atomic` + **`tryAutoApproveScopeChange`** auto/escalate (`:3957-4063`); worker bị khóa `scope_change_pending` | `notifyCustomerScopeChangeRequested`/`Decided` + `notifyWorkerScopeDecision` | thợ scope request (reason+ảnh, **no price**) + KH quyết định (hard-stop) + thợ chờ | thợ 3.8 ✅; **KH scope-decision ❌ (L-1)** | `scope_change_pending` ✅ |
| H6 | Completion | worker `completed_by_worker` (notes≥5+≥1 ảnh) | **Kael completion autonomy** auto-confirm nếu đủ evidence (`:3717-3775`) → `confirmed_by_customer` | `notifyKaelConfirmedCompletion` 2 phía (`:7255`) | thợ evidence upload (3.4) + KH nghiệm thu/notify | thợ 3.4 ✅; **KH completion ❌ (L-1)** | `completed_by_worker→customer_confirmed_completion` ✅ |
| H7 | Cancellation (2 phía) | customer/worker | **Kael sub-case policy** (`case-3/4`, `request_*_cancellation_atomic`) → reassign/goodwill | `notifyWorkerCustomerCancellation` / `notifyCustomerWorkerReplacementSearch` | UI hủy 2 phía + Kael outcome | một phần | `cancelled` ✅ |
| H8 | Dispute | customer/worker post-job | **Kael neutral summary** (KHÔNG quyết) → admin decides (`case-5`, `open_dispute_atomic`) | counter-statement / admin decision | mở dispute 2 phía + trạng thái | ❌ **không có màn dispute trong inventory** | (post) ⚠️ |
| H9 | Job chat | customer/worker | relay nhưng **server-stored** (`jobs.messages`), Kael system msg phân biệt | `job_message_received` (`:7099`) | chat 2 phía | KH Kael chat + thợ advisory chat ✅ | `job_chat` section ✅ (poll, không realtime) |

---

## 2. Components/phases parity (cả 2 phía dùng chung contract Kael)
- `apps/mobile/components/customer/customer-surfaces.tsx` **và** `worker/worker-surfaces.tsx` đều tiêu thụ `buildWorkflowViewModel` (shared `workflow-phase-context`, sections lọc theo `role: customer|worker|shared`). ⇒ **components/phases 2 phía do chung một contract Kael lái** — đúng tinh thần "Kael chủ trì components/phases". ✅
- **Ngoại lệ:** H4 access handshake sống trong `job.address_access.release_stage` (`area_only`/`building_released`/`unit_released`), **ngoài** phase-context section model ⇒ phải render riêng dựa trên `address_access`, không tự suy từ phase.

## 3. Times layer (timing cross-side)
- **60s** cửa sổ accept (H2) vs **20s** worker poll (B-2) → mất tới ⅓ cửa sổ trước khi thợ thấy job.
- **15s** customer timeline poll (B-1) → status thợ trễ tới 15s phía khách.
- Broadcast expiry → `no_worker_found` / `broadcast_expired`.
- Geofence radius check-in (`ACCESS_GEOFENCE_RADIUS_KM`, `:3641`).
- Scope-change có **streaming progress riêng** (`scope_estimating` stage) — Kael "đang xét phạm vi".
- Estimate stage stream 800ms (§9).
- **X-2:** KHÔNG có timeout/Kael-nudge cho "Cho thợ lên" (H4) — nếu khách không bấm authorize, thợ chờ ở sảnh vô thời hạn, không escalate.

## 4. Kael-orchestration integrity — điểm Tu cần quyết
**Hiện trạng (verified):**
- Spine tiền (H1/H5/H6/H7/H8) = Kael quyết (auto hoặc escalate). ✅ "Kael chủ trì" đúng nghĩa.
- Handshake vật lý (H2 accept, H3 status, H4 check-in/authorize) = **actor action + server gate + Kael notify**, KHÔNG phải Kael-decision.

**Câu hỏi cho Tu:** "Agentic Process do Kael chủ trì TOÀN BỘ" — cậu muốn Kael **chủ động điều phối/nhắc** cả các handshake vật lý không? Ví dụ:
- Kael nhắc khách "Thợ đã tới sảnh — Cho thợ lên?" + **timeout escalate** nếu khách không phản hồi (vá X-2).
- Kael chủ động surface broadcast cho thợ (vá B-2) thay vì thợ tự thấy qua poll.
Nếu CÓ → cần thêm Kael-orchestration cho lớp operational (hiện chưa). Nếu KHÔNG → giữ actor-action + notification (đang đúng STRUCTURES: Kael owns money, actor owns physical ops).

## 5. Design-fit findings (NEW — cả 2 flow)
- **X-1 (HIGH)** — **Last-50m access handshake** (worker lobby check-in + customer "Cho thợ lên" authorize + worker "chờ cho lên") đã build backend (§32.7/§32.14, PR #66; `services.ts:8957`, `:9060`) nhưng **vắng mặt trong design inventory** (`CODEX_REBUILD_PROMPT.md` group C/D + `design-system.md`) và **không nằm trong phase-context**. ⇒ rebuild sẽ bỏ sót handshake privacy/safety quan trọng nhất. **Phải thêm 2 phía, render theo `job.address_access.release_stage`.**
- **X-2 (MEDIUM)** — Không timeout/Kael-nudge cho authorize (H4) → thợ chờ sảnh vô thời hạn. Cần Kael nhắc + escalate.
- **X-3 (MEDIUM)** — Worker status-update control (on_way/arrived/inspecting/repairing) **chưa rõ là component nào** trong design worker flow (3.x). Cần xác nhận/bổ sung (đây là nguồn của timeline KH ở H3).
- **Tái khẳng định L-1 (HIGH)** — màn KH cho scope-decision (H5) / completion (H6) / payment / review **thiếu trong board** dù backend có endpoint.
- **Dispute (H8)** — không có màn mở/theo dõi dispute trong inventory.

## 6. Khuyến nghị
1. **Thêm last-50m access handshake vào design + rebuild (X-1)** — worker check-in + "chờ cho lên" + customer "Cho thợ lên", driven bởi `address_access.release_stage`. Đây là chi tiết nhỏ-nhưng-chí-mạng (privacy + an toàn).
2. Bổ sung màn nửa-sau phía KH (L-1) + dispute (H8) vào skeleton.
3. Quyết §4: Kael có chủ động lớp operational không (X-2 timeout, B-2 surface). Nếu có → thêm Kael-nudge/escalation.
4. Xác nhận worker status control (X-3).
5. (Từ §9) wire realtime cho H3/H2 để timeline + broadcast tức thì.

## 7. Đã verify thêm + còn chờ verify

**✅ VERIFIED (money-safe) — Kael auto-approve scope-change KHÔNG đụng case rủi ro cao.** `tryAutoApproveScopeChange` (`services.ts:4744-4758`): chỉ auto-approve khi **(1)** anti-fraud KHÔNG flag (`!challenge_required && !admin_flag_required`), **(2)** `confidence ≥ 0.55`, **(3)** qua trọn `runPolicyAutonomyGate` (mà `decide_scope_change` ∈ FLAG_GATED_FULL_AUTONOMY_ACTIONS → cờ off thì KHÔNG auto-approve, luôn đẩy khách quyết). Quyết định `reversible:true, appealable:true`. ⇒ scope drift cao luôn về tay khách. Strength — đừng phá.

**⏳ Còn chờ verify (không mark lỗi):**
- Worker-side render H4 (màn "chờ khách cho lên") + status control (X-3): cần đọc `worker-surfaces.tsx` sâu.
- Dispute open handler + chat realtime (H9 poll vs realtime).
- N-1/N-2 (Notes.md): hardcode VND ở `scope-risk` config; case-4/5 wired live.

---

## 8. Autonomy model vs "Kael chạy tất, user chỉ confirm deal" (Tu chốt 2026-06-13)

> Model Tu: *"Kael tự vận hành toàn bộ (analysis/searching/negotiation/pricing/matching); chỉ bước confirm deal là user confirm."*

### 8.1 Kiến trúc 2 tầng — KHỚP model (verified `artifact-contract.ts`)
- **Artifact** (estimate/ticket/brief…): `may_transition: z.literal(false)` + `ticket_patch` CẤM mọi key status/phase/workflow (`FORBIDDEN_WORKFLOW_KEYS`). ⇒ Kael "nghĩ"/đề xuất, KHÔNG tự đổi state. Raw AI bị chặn ở schema.
- **Autonomy decision**: `actor:"kael_system"` + evidence(1-12) + reversible + appealable → đường DUY NHẤT đổi state.
→ Hiện thân kỹ thuật của "Kael vận hành toàn bộ": mọi thứ qua artifact + autonomy decision; raw output không bao giờ tự đổi tiền/state.

### 8.2 Bản đồ "ai lái" (verified `workflow-orchestrator.ts`)
7 Kael actions: confirm_ticket, start_matching, process_cancellation, decide_scope_change, confirm_completion, decide_payment, decide_dispute. MỖI bước money có **dual-path** (Kael-auto + customer-confirm).
- `start_matching` **KHÔNG flag-gated → LUÔN Kael-auto** ⇒ "searching do Kael" ✅ (estimate→broadcasting tự động; Autonomy v2 bỏ confirm trước search).
- `decide_scope_change`/`confirm_completion`/`decide_payment`/`decide_dispute`/`process_cancellation` **flag-gated** `KAEL_AUTONOMY_FULL_ENABLED`: ON→Kael auto; OFF→customer/admin confirm.

### 8.3 Khớp/lệch
- ✅ analysis/searching/pricing/matching/cancellation-reassign = Kael-auto.
- ✅ negotiation = Kael TÍNH (scope Kael computes, market-based; KHÔNG haggle, không module counter-offer). Worker không đặt giá.
- ⚠️ **"Confirm deal" cần Tu định nghĩa chính xác = bước nào.** Đề xuất theo model: **scope-change acceptance + completion acceptance + "Cho thợ lên" access** = user confirm (đây là "deal"/đổi điều khoản deal). Mọi thứ trước đó = Kael.
- ⚠️ **Điểm lệch cụ thể (K-1):** `tryAutoApproveScopeChange` (low-risk) + `confirm_completion` auto-path có thể **tự quyết bước "deal"** nếu cờ full-autonomy ON → over-automate so với "user confirms deal". Scope-change = đổi GIÁ deal ⇒ theo model Tu nên **LUÔN customer confirm** (kể cả low-risk); Kael chỉ tính + đề xuất.
- ❓ **Không có confirm-deal TRƯỚC search** (auto). Nếu booking-submit = consent thì OK; nếu muốn "đồng ý giá → tìm thợ" thì cần gate (design 2.8 "Gửi đề xuất/Chốt" có thể là chỗ đó).

### 8.4 Kết luận
Hệ thống **đã sẵn sàng kiến trúc** cho model Tu (dual-path + `may_transition:false` + flag) — việc còn lại là **calibration cấu hình, KHÔNG phải rebuild**:
1. Giữ `start_matching` Kael-auto (đã đúng).
2. Định nghĩa "confirm deal" = scope-accept + completion-accept + access-authorize → default CUSTOMER confirm.
3. Quyết `tryAutoApproveScopeChange`: theo model Tu nên **tắt auto-approve scope** (mọi scope = customer confirm vì đổi giá deal); Kael chỉ tính.
4. Quyết có cần confirm-deal trước search không (hiện: không).
