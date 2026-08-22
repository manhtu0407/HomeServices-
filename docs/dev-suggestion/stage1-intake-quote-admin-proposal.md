# Đề xuất: Stage 1 intake + cấu hình quote trên Admin

**Loại:** Dev suggestion (chưa phê duyệt)  
**Người đề xuất:** Backend dev (onboarding)  
**Ngày:** 2026-08-22  
**Đối tượng đọc:** Team AI, backend, product (Tu)  
**Case minh hoạ:** Sửa điện → Mất điện một phòng → chat lặp câu hỏi → chặn báo giá `validated_price_evidence_unavailable`

---

## 1. Tóm tắt đề xuất

Chia cấu hình intake/quote thành **hai tầng**, quản lý trên **Admin site** theo từng loại dịch vụ (6 service):

| Tầng | Tên đề xuất | Ý nghĩa | Ví dụ |
|---|---|---|---|
| **A** | **Necessary information** (thông tin cần) | Đủ để **mở đơn / matching** — không phụ thuộc Kael chốt giá | Dịch vụ, địa chỉ (quận), lịch hẹn, mô tả tối thiểu, chip vấn đề |
| **B** | **Better to have** (thông tin nên có) | Làm phạm vi rõ hơn cho thợ / Kael — **không chặn tạo đơn** nếu thiếu | Các slot hiện gọi là `quote_drivers` (tình trạng điện, triệu chứng, ảnh…) |

**Luồng mong muốn:**

```text
Booking / intake form
  → đủ Tầng A? ──yes──► tạo job + matching (giá do thợ báo / thương lượng sau)
  → thiếu Tầng A? ──► hỏi đúng field thiếu (checklist rõ, không chat mù)
  → Tầng B? ──► gợi ý / optional; không lặp bubble “thiếu giá”
```

**Quan điểm product kèm theo:** gắn **chặn toàn flow** vào **Kael price evidence** (catalog giá DB) trước khi có đơn là không hợp lý với trải nghiệm khách; giá nên là **thỏa thuận chủ nhà ↔ thợ**, platform không nên bắt buộc AI chốt giá chỉ để kiểm soát % hoa hồng.

---

## 2. Phân tích — phần nào hợp lý, phần nào cần quyết định product

### 2.1 Hợp lý và nên làm (kỹ thuật + UX)

| Ý dev | Đánh giá | Lý do |
|---|---|---|
| Stage 1 hỏi mãi trong khi khách đã có dịch vụ + địa chỉ + giờ | **Đúng — bug UX / thiết kế** | Hai vòng độc lập: thu slot (`quote_drivers`) vs chặn giá (`price_baselines`). Khách trả lời slot **không** mở được giá nếu slug không có baseline. |
| Không có popup / checklist “còn thiếu gì” | **Đúng** | Mobile chỉ có card chung khi `escalate`; intake checklist bị ẩn khi `serverPriceReviewBlocked`. |
| Cấu hình “cần / nên có” theo dịch vụ trên admin | **Hợp lý vận hành** | Hiện slot nằm cứng trong TypeScript, đổi phải deploy Edge — không phù hợp vận hành HCMC. |
| Tách “đủ để tạo đơn” khỏi “đủ để AI báo giá” | **Hợp lý kiến trúc** | Matching cần scope tối thiểu + lịch + khu vực; không nhất thiết cần `price_min/max` từ Kael. |
| Giá là deal 2 bên, platform không nên fake/auto block | **Hợp lý với marketplace điện/nước** | Nhiều job thực tế cần khảo sát; ép auto-quote gây dead-end (case `power_outage_one_room`). |

### 2.2 Cần product / governance quyết (không tự implement)

| Ý dev | Trạng thái repo hiện tại | Ghi chú |
|---|---|---|
| Tạo đơn **không** qua Kael price / `confirm_kael_chat_atomic` | **Xung đột** với `governance/RULES.md` Rule #7 | Rule #7: Kael chuẩn bị estimate; khách **confirm offer** trước matching. Confirm RPC validate `estimate_ready`, `price_reasoning_receipt`, `price_min/max`. |
| Bỏ kiểm soát giá platform | **Xung đột** với Rule #4, #8 | Rule #4: estimate phải có disclaimer Kael; Rule #8: cấm fake price. |
| % hoa hồng / take rate | **Chưa chứng minh E2E payment** | Phase 0 chưa có giao dịch thật; đề xuất tách “pricing model” khỏi “intake slot config”. |

**Kết luận cho team AI:** Đề xuất **Tầng A / B + admin config + UX checklist** có thể triển khai **mà không cần bỏ Rule #7 ngay**. Riêng luồng **“đủ Tầng A → tạo đơn không cần Kael giá”** là **product pivot** — cần Tu + cập nhật governance trước khi code.

**Hướng thỏa hiệp (đề xuất):**

1. **Ngắn hạn:** Admin + Stage 1 — stop dead-end; slug không auto-quote → nhánh **“mời thợ báo giá / khảo sát”** thay vì hỏi slot vô hạn.  
2. **Dài hạn:** Product chọn một trong hai: (a) giữ Kael estimate cho subset slug có catalog, (b) **request-for-quote (RFQ)** — job không có `kael_price_min/max` ban đầu, thợ propose sau.

---

## 3. As-is — Stage 1 và quote settings hiện tại

### 3.1 Stage 1 — cơ chế thật (backend)

```text
Intake booking confirm (intake.ts)
  → advanceKaelChatEstimate (advance.ts)
  → prepareKaelChatPrePipeline (branches-pre-pipeline.ts)
       • resolveIntakeFactCoverage (intake-runtime.ts)
       • thiếu slot → NEEDS_CLARIFICATION → clarification.service.ts
  → runKaelPipeline (AI intent + baseline stages)
  → finalizeKaelChatEstimate (estimate-support.ts)
       • hasValidatedKaelPriceEvidence → fail → escalate
```

**Ai quyết slot thiếu:** **Code**, không phải admin UI.  
**Ai viết câu hỏi:** chủ yếu **template** `buildFocusedClarificationQuestion()`; AI chỉ gợi ý khi hợp lệ.

**Nguồn slot theo dịch vụ (hardcoded):**

| Nguồn | File | Nội dung |
|---|---|---|
| Profile 6 service | `supabase/functions/mobile-api/_shared/kael/learning/performance-profiles.ts` | `quote_drivers[]`, `evidence_suggestions`, safety gates |
| Policy theo slug (điện) | `.../kael-guardrails/electrical-intake-policy.ts` | `minimumSlots` / `optionalSlots` per `problem_slug` |
| Câu hỏi VI/EN | `.../kael/pipeline/intake-runtime.ts` | Map slot → câu hỏi |
| Chip vấn đề mobile | `service_problems` (DB) | Label hiển thị; **không** map admin → slot |

**Đã có trong booking (Tầng A một phần) — trước Stage 1 chat:**

- `service_type`, `problem_chips`, `address_label`, `address_district`, `scheduled_at`, mô tả  
- Xác nhận: `intake_confirmation` (`intake.ts`, `buildKaelIntakeConfirmation`)

→ Khách **đã** cung cấp Tầng A ở form; Stage 1 vẫn hỏi lại slot B và vẫn fail Stage 2 giá.

### 3.2 Quote / price settings — admin hiện có

| Hạng mục | Admin hôm nay | Ghi chú |
|---|---|---|
| `price_baselines` | **List read-only** | `listAdminPriceBaselines()` — `domains/admin/governance.ts` |
| Sửa baseline / evidence | **Không qua admin UI** (chủ yếu migration SQL) | Seed multi-source trong migrations |
| `quote_drivers` / slot policy | **Không có admin** | Chỉ trong TS |
| Câu hỏi intake | **Không có admin** | `intake-runtime.ts` |
| `service_problems` taxonomy | DB có; admin governance disputes/learning | Chưa CRUD intake policy |
| Escalation queue | Admin có (Kael learning / ops) | Khác intake config |

**Kết luận:** Admin **chưa** sở hữu “quote intake policy”; chỉ xem được band giá baseline.

---

## 4. To-be — mô hình cấu hình đề xuất (Admin)

### 4.1 Hai tầng thông tin (per `service_type`, optional per `problem_slug`)

#### Tầng A — `intake_required_fields` (Necessary)

**Mục tiêu:** đủ để tạo job + broadcast matching **không** cần Kael `estimate_ready`.

| Field key (đề xuất) | Mô tả | Nguồn hiện tại |
|---|---|---|
| `service_type` | Một trong 6 service | Booking |
| `problem_slug` hoặc `problem_chips` | Loại việc | Chip / AI classify |
| `address_district` | Quận HCMC (`q1`, `q7`, …) | Booking geocode |
| `address_label` | Mô tả địa chỉ (chưa cần số nhà cho matching sớm) | Booking |
| `scheduled_at` | Lịch hẹn hợp lệ | Booking |
| `description_min` | Mô tả tối thiểu (độ dài / từ khoá) | Booking message |

**Rule đề xuất:** `all(required_fields) present` → **`order_eligible = true`** (flag server), UI hiện CTA “Gửi yêu cầu thợ” / “Tạo đơn”.

#### Tầng B — `intake_enrichment_slots` (Better to have)

Map từ `quote_drivers` + electrical `minimumSlots` hiện tại — **optional cho tạo đơn**, dùng để:

- brief thợ,
- Kael advisory (nếu bật),
- giảm tranh chấp scope sau này.

| Ví dụ điện | Slot key | Bắt buộc tạo đơn? |
|---|---|---|
| Mất điện một phòng | `affected_area_and_power_state` | **Không** (đề xuất) |
| | `device_or_circuit_type` | **Không** |
| | `breaker_state` | **Không** |
| | `symptom_and_duration` | **Không** |
| Ảnh | `evidence_photo` | Optional (handyman có thể required riêng) |

**Rule đề xuất:** thiếu Tầng B → **một** banner “Thêm thông tin giúp thợ báo giá chính xác hơn” — **không** chặn order; **không** lặp error giá.

### 4.2 Bảng cấu hình admin đề xuất (schema gợi ý)

Team AI/backend có thể implement dưới dạng DB + admin API (tên gợi ý):

```text
service_intake_policies
  id, service_type, problem_slug nullable,
  required_fields jsonb,        -- Tầng A: ordered field keys
  enrichment_slots jsonb,       -- Tầng B: slot keys + required_for_quote bool
  allow_order_without_kael_price boolean,
  allow_kael_auto_quote boolean,
  evidence_requirements jsonb,  -- handyman photo required, etc.
  question_overrides jsonb,     -- slot_key -> { vi, en }
  active, version, updated_by, updated_at

service_quote_modes (optional)
  service_type, problem_slug,
  mode: enum('kael_auto_quote', 'rfq', 'inspection_only', 'blocked')
```

**Admin UI (đề xuất màn hình):**

1. **Intake — Thông tin cần (Tầng A)** — checkbox field theo service  
2. **Intake — Nên có (Tầng B)** — danh sách slot, thứ tự hỏi, bật/tắt, override câu hỏi VI/EN  
3. **Quote mode** — auto-quote / RFQ / inspection-only per slug  
4. **Price baselines** — giữ list hiện tại + (future) edit có audit  
5. **Preview** — “Khách chọn Mất điện một phòng → cần gì để tạo đơn?”  

### 4.3 Mapping: settings hiện tại → admin đề xuất

| Setting hiện tại (code/DB) | Nên nằm admin? | Tầng |
|---|---|---|
| `quote_drivers` (performance-profiles) | **Có** → `enrichment_slots` | B |
| `electrical-intake-policy` minimumSlots | **Có** → override per slug | B (hoặc A nếu product quyết) |
| `buildFocusedClarificationQuestion` | **Có** → `question_overrides` | B |
| Booking: district, schedule, chips | **Có** → `required_fields` (readonly mirror) | A |
| `price_baselines` + `price_evidence` | **Có** (đã list) → edit có governance | Stage 2 / quote mode |
| `hasValidatedKaelPriceEvidence` quorum | **Có** → bật theo `allow_kael_auto_quote` | Stage 2 |
| `confirm_kael_chat_atomic` gates | **Giữ** nếu mode = `kael_auto_quote`; **bypass** nếu mode = `rfq` + Tu approve | Stage 3 |

---

## 5. Hành vi Stage 1 đề xuất (cho team AI implement)

### 5.1 Stop rules (fix dead-end)

1. Nếu `quote_mode = rfq` hoặc slug **không** có baseline → **không** chạy vòng hỏi slot B vô hạn; **không** emit lặp `validated_price_evidence_unavailable` mỗi lượt chat.  
2. Nếu Tầng A đủ → hiện CTA tạo đơn; Tầng B hiển thị checklist optional (mobile sheet).  
3. Câu hỏi meta (“thiếu gì”, “cần bổ sung gì”) → **intent = explain_blocker**, không ghi vào `facts[slot]`.  
4. Khi `escalate` vì giá → card nói rõ: **“Ca này cần thợ báo giá tại chỗ — thông tin bạn gửi đã đủ để tạo yêu cầu”** (nếu Tầng A đủ).

### 5.2 Data đã có — có hỏi lại không?

**Giữ nguyên logic tốt hiện tại:** slot đã có trong `diagnosis_scope.facts` → không hỏi lại.  
**Bổ sung:** prefill Tầng A từ booking vào `facts` **trước** turn chat đầu tiên — tránh hỏi lại địa chỉ/giờ.

---

## 6. Stage 2 & 3 trong mô hình mới

### 6.1 Mode `kael_auto_quote` (giữ gần hiện tại)

- Chỉ slug có `price_baselines` + evidence quorum  
- `prepare_offer` → khách confirm → `confirm_kael_chat_atomic`  
- Phù hợp: cleaning visit, AC clean, vài slug đã seed  

### 6.2 Mode `rfq` (đề xuất cho case như mất điện một phòng)

- Stage 2 **không** synthesize `price_min/max`  
- Job tạo với `kael_price_min/max = null` (hoặc band “thỏa thuận”) — **cần migration + Rule #7 exception**  
- Matching broadcast; thợ propose giá trong chat/scope flow hiện có (scope change / worker quote paths)  

### 6.3 Dữ liệu tạo order thành công (Tầng A — đề xuất tối thiểu)

| Field | Bắt buộc |
|---|---|
| `customer_id` | Có (auth) |
| `service_type` | Có |
| `service_problem_id` hoặc chips | Có |
| `address_district` | Có |
| `scheduled_at` | Có |
| `description` / `scope_summary` tối thiểu | Có |
| `diagnosis_scope` | Có thể simplified artifact |
| `kael_price_min/max` | **Chỉ** khi `kael_auto_quote` |
| `price_reasoning_receipt_id` | **Chỉ** khi `kael_auto_quote` |

---

## 7. Việc team AI cần làm (checklist)

### Phase 0 — Docs & alignment (không code)

- [ ] Product (Tu): chọn quote mode mặc định per slug (bảng 6×N slug)  
- [ ] Ghi nhận exception Rule #7 nếu bật RFQ  
- [ ] Chốt: Tầng A field nào bắt buộc trên mobile booking  

### Phase 1 — Admin + config DB

- [ ] Migration `service_intake_policies` (+ seed từ `performance-profiles.ts` + electrical policy)  
- [ ] Admin API CRUD + audit (`updated_by`)  
- [ ] Admin UI 3 tab: Required / Enrichment / Quote mode  

### Phase 2 — Edge intake runtime

- [ ] `resolveIntakeFactCoverage` đọc DB thay vì hardcode (fallback TS nếu row missing)  
- [ ] Prefill facts từ booking  
- [ ] Stop rule: không clarify khi RFQ + Tầng A đủ  

### Phase 3 — Mobile UX

- [ ] Checklist Tầng A/B (sheet) thay vì chat mù  
- [ ] CTA “Tạo yêu cầu” khi `order_eligible`  
- [ ] Blocker-aware copy (RFQ vs thiếu field A)  

### Phase 4 — Order RPC (chỉ nếu product approve RFQ)

- [ ] `create_rfq_job_atomic` hoặc mở rộng confirm RPC  
- [ ] Tests + governance update  

---

## 8. Phụ lục — Case “Mất điện một phòng” map vào mô hình mới

| | As-is | To-be đề xuất |
|---|---|---|
| Tầng A (booking) | Đã có | Coi là **đủ** → `order_eligible` |
| Tầng B slots | Hỏi 3+ lượt | Optional checklist, không chặn |
| Stage 2 giá | Fail — không baseline slug | `quote_mode = rfq` → bỏ auto price |
| UX | Bubble lặp + card mù | “Đã đủ thông tin gửi thợ — thợ sẽ báo giá sau khảo sát” |
| Order | Không tạo được | Tạo job RFQ → matching |

---

## 9. File code tham chiếu (as-is)

| Chủ đề | Path |
|---|---|
| Quote drivers | `supabase/functions/mobile-api/_shared/kael/learning/performance-profiles.ts` |
| Electrical slot policy | `supabase/functions/mobile-api/_shared/kael/kael-guardrails/electrical-intake-policy.ts` |
| Câu hỏi template | `supabase/functions/mobile-api/_shared/kael/pipeline/intake-runtime.ts` |
| Clarification loop | `supabase/functions/mobile-api/_shared/domains/kael-chat/clarification.service.ts` |
| Price gate | `supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support.ts` |
| Confirm / order | `supabase/functions/mobile-api/_shared/domains/kael-chat/confirm.service.ts` |
| Admin price list | `supabase/functions/mobile-api/_shared/domains/admin/governance.ts` |
| Governance | `governance/RULES.md` Rule #4, #7, #8 |

---

## 10. Trạng thái tài liệu

| Mục | Trạng thái |
|---|---|
| Phân tích vấn đề Stage 1 | Draft — chờ review team AI |
| Admin schema đề xuất | Draft — chưa implement |
| RFQ / bỏ Kael price | **Cần phê duyệt Tu** — xung đột Rule #7 hiện tại |
| Implement | Chưa bắt đầu |
