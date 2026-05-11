# Home Services — App Structures

---

## 1. Project Identity

Nền tảng dịch vụ gia đình tại Việt Nam, kết nối thợ lành nghề với cư dân chung cư HCMC.

**Hai dịch vụ duy nhất hiện tại:**
- Sửa điện (electrical repair)
- Sửa nước / ống nước (plumbing)

Không có gì khác. Nếu user hỏi dịch vụ ngoài 2 cái trên → từ chối lịch sự.

**Người dùng mục tiêu:** Cư dân chung cư HCMC. Không biết thợ tin tưởng, không biết giá thị trường, sợ bị chặt chém.

**Kael là gì — HIỆN TẠI:** Kael = AI Price Check. Không hơn không kém. Nhận mô tả vấn đề + ảnh → phân tích → ước tính giá → kết nối thợ.

Kael KHÔNG là: AI Agent tự hành, multi-specialist orchestrator, autonomous system. Đó là tương lai.

---

## 2. Kael Price Check — Scope

### Những gì Kael làm
1. Nhận input từ user (mô tả + ảnh)
2. Phân tích bằng AI → xác định vấn đề
3. Lookup giá thị trường HCMC
4. Trả về ước tính giá + phân tích ngắn gọn
5. Ném job cho thợ confirm
6. Thợ xác nhận → booking được tạo

### Những gì Kael KHÔNG làm

| Hành động | Lý do |
|-----------|-------|
| Tự đặt lịch thay user | Chưa có transaction data để validate |
| Tự chọn thợ mà không hỏi | User phải confirm |
| Trả lời về dịch vụ khác | Out of scope |
| Đảm bảo giá chính xác 100% | Luôn là ước tính có khoảng |
| Xử lý thanh toán autonomously | Phase sau |

### Giới hạn scope — HARD RULE
Nếu user hỏi dịch vụ KHÔNG PHẢI sửa điện/nước → "Hiện tại chúng tôi chỉ hỗ trợ sửa điện và sửa nước. Vui lòng liên hệ lại khi chúng tôi mở thêm dịch vụ." → Không cố tư vấn, không suggest thợ khác.

---

## 3. Workflow — Customer + Worker + Kael

### Kiến trúc tổng quan

```
[CUSTOMER]          [KAEL]              [WORKER]
│                    │                    │
│── vấn đề ────────▶│                    │
│                    │── Search #1 ──────│  (async, ngầm)
│◀── làm rõ? ──────│                    │
│── trả lời ───────▶│                    │
│                    │── Search #2 ──────│  (async, ngầm)
│◀── price card ───│                    │
│── CONFIRM ───────▶│                    │
│                    │── broadcast ─────▶│
│                    │◀── accept ───────│
│◀── matched ──────│                    │
│──── CHAT ─────────────────── CHAT ───▶│
│◀──────────────────────────────────────│
      (Kael relay + inject)
```

### Các bước CONFIRM bắt buộc
- **A7**: Khách xác nhận đặt dịch vụ
- **B2**: Thợ nhận việc (60s countdown)
- **A11**: Khách confirm scope change — Kael block thợ cho đến khi có confirm
- **A12**: Khách xác nhận hoàn thành → kích hoạt payment

---

### 3A. Customer Section

**A0 — Authentication:** SĐT → OTP → tên + địa chỉ chung cư (tên tòa, số căn, tầng, quận) → role: Khách

**A1 — Home (Dashboard):**
- Greeting, notification bell, avatar → hồ sơ
- Address bar: địa chỉ chung cư, editable
- Service section: Sửa Điện | Sửa Nước (active) + dịch vụ khác (greyed — "Sắp ra mắt")
- Active booking banner (nếu có), lịch sử gần đây (2–3 card)
- Bottom tabs: Trang chủ | Đặt lịch | Kael | Lịch sử | Hồ sơ

**A2 — Chọn vấn đề:** Chips chọn nhanh (chọn 1+):
- Điện: Mất điện một phòng | Mất điện toàn căn | Ổ cắm/công tắc hỏng | Cầu dao trip | Đèn chập chờn | Lắp thêm thiết bị | Vấn đề khác
- Nước: Ống rò rỉ | Tắc cống/bồn | Vòi hỏng | Toilet không xả | Áp nước yếu | Lắp/thay thiết bị | Vấn đề khác

**A3 — Mô tả chi tiết:**
- Text input bắt buộc, upload ảnh tối đa 5 hoặc video tối đa 60s
- Địa chỉ auto-fill từ profile, editable
- Submit → KAEL TRIGGER #1 (Perplexity Search #1 async ngầm)

**A4 — Kael làm rõ (nếu cần):**
- Kael hỏi tối đa 1–2 câu cụ thể
- User trả lời → KAEL TRIGGER #2 (Perplexity Search #2)
- Nếu không cần hỏi → Search #2 trigger ngay sau A3

**A5 — Price Estimate Card:**
```
Vấn đề: [Kael xác định]
Độ phức tạp: [Nhỏ / Trung bình / Lớn]
Khoảng giá tham chiếu: [X] – [Y] ₫
──── Kael lưu ý ────  ← chỉ hiện khi có risk signal rõ ràng
[1 gợi ý ngắn — tối đa 1 câu, không pushy]
(Không bắt buộc — chỉ là gợi ý của Kael)
────────────────────
Giá cuối xác nhận bởi thợ sau khi kiểm tra thực tế.
```

**A6 — Chọn thời gian:** Ngay bây giờ (default) | Đặt lịch hẹn → date picker → time slot

**A7 — Order Summary → KEY CONFIRM #1 KHÁCH:**
- Hiển thị: dịch vụ, vấn đề, địa chỉ, thời gian, giá tham chiếu, phí nền tảng 7.5%
- User tap Xác nhận → hệ thống broadcast job

**A8 — Đang tìm thợ:** Kael status updates + cancel option (time-limited)

**A9 — Worker Matched:** Worker card: tên, ảnh, rating, số việc, ETA | Nút chat | Kael note

**A10 — Active Job:**
- Status bar: Đặt lịch → Thợ đang đến → Đang kiểm tra → Đang sửa → Hoàn thành
- Chat thread: customer ↔ worker trực tiếp + Kael system injections

**A11 — Scope Change → KEY CONFIRM #2 KHÁCH:**
- Full-screen modal, không dismiss — phải chọn
- Kael: phạm vi cũ vs mới, giá tham chiếu mới, lý do
- Xác nhận tiếp tục | Hủy dịch vụ
- Thợ bị block hoàn toàn cho đến khi có confirm

**A12 — Hoàn thành → KEY CONFIRM #3 KHÁCH:**
- Summary công việc (thợ ghi) + ảnh hoàn thành
- User tap Xác nhận → kích hoạt payment

**A13 — Payment:** Phí dịch vụ + phí nền tảng 7.5% | Tiền mặt / Chuyển khoản / MoMo / ZaloPay

**A14 — Đánh giá thợ:** 1–5 sao + tags nhanh (Đúng giờ, Chuyên nghiệp, Sạch sẽ, Giải thích rõ, Giá hợp lý) + nhận xét optional

---

### 3B. Worker Section

**B0 — Đăng ký thợ (5 bước, admin duyệt thủ công):**
1. SĐT → OTP
2. Thông tin: tên (theo CCCD), ngày sinh, giới tính
3. Nghề: loại dịch vụ (Điện/Nước/Cả hai), số năm KN, khu vực (quận HCMC)
4. Xác minh: CCCD mặt trước + sau + selfie cầm CCCD + số tài khoản ngân hàng
5. Màn chờ: "Admin đang xem xét — 1–2 ngày làm việc"

Admin review thủ công → approve → push notification → tài khoản active.

**B1 — Worker Home:**
- Toggle: NHẬN VIỆC / TẠM NGHỈ
- Stats: việc hôm nay, thu nhập hôm nay, rating trung bình
- Incoming job card (khi online + có match)
- Bottom tabs: Trang chủ | Công việc | Chat | Thu nhập | Hồ sơ

**B2 — Job Request → KEY CONFIRM #1 THỢ:**
```
[Loại sự cố] — [khu vực chung, chưa lộ địa chỉ]

Kael Pre-brief:
  Tóm tắt: [vấn đề + mô tả khách]
  Đánh giá: [độ phức tạp + phỏng đoán nguyên nhân]
  Gợi ý vật tư: [nếu có]

Kael Advisory Flag (nếu có risk signal):
  "[Gợi ý thêm — thợ có thể đề xuất on-site tự nhiên]"

Giá Kael ước tính cho khách: [X] – [Y] ₫
Thu nhập ước tính của bạn: ~[X*0.9] – [Y*0.9] ₫

⏱ 00:60
[ Bỏ qua ]  [ ✓ Nhận việc ]
```
Countdown 60s. Hết giờ → auto-decline → chuyển thợ khác.

**B3 — Chi tiết công việc (sau khi nhận):**
- Full address + contact revealed
- Mô tả đầy đủ + ảnh từ khách
- Kael Full Brief: phân tích chi tiết + gợi ý tools/vật tư
- Status bar, nút Chỉ đường + Nhắn tin khách
- Thợ tự tap update status → notification cho khách qua Kael

**B4 — Báo thay đổi phạm vi:**
- Form: mô tả thực tế + ước tính giá mới + lý do
- → KAEL ESCALATION → sinh modal A11 cho khách
- Thợ bị block — KHÔNG tiếp tục cho đến khi khách confirm

**B5 — Hoàn thành:**
- Ghi chú + upload ảnh hoàn thành + tổng tiền thực tế
- Đánh dấu Hoàn thành → chờ khách confirm A12 → payment

**B6 — Thu nhập:**
- Per-job: [Tổng dịch vụ] − [10% phí nền tảng] = [Thợ nhận]
- Lịch sử | Nút rút tiền

---

### 3C. Kael Pricing Mechanism

**Perplexity Double-Search:**

Search #1 — trigger ngay khi A3 submit:
- Query: "giá sửa [loại dịch vụ] [vấn đề tổng quan] tại HCMC [năm hiện tại]"
- Chạy async ngầm, lưu `price_context_1`

Search #2 — trigger sau khi đủ context:
- Query: "giá sửa [vấn đề cụ thể đã xác định] tại [khu vực] HCMC [năm hiện tại]"
- Lưu `price_context_2`

**So sánh & synthesis:**
```
delta = |price_context_2.midpoint - price_context_1.midpoint| / price_context_1.midpoint

if delta < 0.20 → dùng price_context_2 (đủ cụ thể)
else → pass cả hai cho Anthropic Sonnet để synthesis
```

**Fallback khi Perplexity fail:**
- Dùng price baseline table trong DB (admin-maintained)
- KHÔNG hardcode số VND cụ thể trong code
- Hiển thị cùng format + disclaimer: "Dựa trên dữ liệu thị trường gần nhất của chúng tôi"

**Kael Risk Advisory:**

| Tín hiệu | Advisory |
|-----------|----------|
| Mất điện + chung cư cũ | Có thể kiểm tra toàn bộ CB nhánh khi thợ đến |
| "Tắc nhiều lần" / "tắc lại" | Thông tổng thường hiệu quả hơn thông từng điểm |
| Rò rỉ ống + không biết tuổi ống | Ống cũ thường rò đồng loạt — nên check lân cận |
| Áp nước yếu bất thường | Có thể do van tổng, không chỉ vòi đơn lẻ |

Rules advisory: tối đa 1 gợi ý, không generate khi không có tín hiệu rõ, không ngôn ngữ lo sợ, luôn kèm "(Không bắt buộc — chỉ là gợi ý của Kael)".

**Kael Worker Pre-brief:** Model Haiku, output 3–4 dòng, thợ đọc trong 10 giây.

**Kael Escalation (scope change B4):**
1. Nhận report từ thợ
2. So sánh với mô tả ban đầu + price_context
3. Sinh modal A11 cho khách
4. Log: old_scope, new_scope, delta_price, customer_decision, timestamp

---

### 3D. Chat Mechanism

Customer ↔ Worker giao tiếp trực tiếp qua app — SĐT không bị lộ:
- Customer gửi → Kael relay → Worker (không filter)
- Worker gửi → Kael relay → Customer (không filter)
- Kael inject system messages (style/màu phân biệt rõ)

---

### 3E. Key Confirmation Map

| Điểm | Side | Mô tả | Nếu không confirm |
|------|------|-------|-------------------|
| A7 | Khách | Xác nhận đặt dịch vụ | Không broadcast job |
| B2 | Thợ | Nhận việc (60s) | Chuyển thợ khác |
| A11 | Khách | Scope change | Thợ bị block |
| B5 | Thợ | Đánh dấu hoàn thành | Không trigger A12 |
| A12 | Khách | Xác nhận nhận dịch vụ | Payment không xử lý |

---

### 3F. Error Handling

| Điểm | Lỗi | Xử lý |
|------|-----|-------|
| A3 input | Mô tả rỗng/không rõ | Kael hỏi lại cụ thể |
| A3 ảnh | Ảnh mờ/không liên quan | Bỏ qua ảnh, text-only |
| Perplexity Search | Timeout/fail | Fallback DB baseline |
| Cả hai Perplexity fail | Cả hai fail | DB baseline + disclaimer rõ |
| Anthropic Vision | Timeout >20s | Retry 1x → bỏ qua vision, text-only |
| Anthropic Synthesis | API fail | Template response — không fake data |
| Worker matching | Không tìm thấy | Thông báo user, ghi nhận, follow up |
| Thợ không confirm | Quá 15 phút | Rebroadcast đến thợ khác |
| Khách không confirm A11 | Hủy scope change | Job kết thúc, không charge thêm |

---

## 4. AI Stack

### Ba API — vai trò cụ thể

**Anthropic Claude (PRIMARY):**
- Vision analysis: phân tích ảnh user upload
- Problem identification: xác định loại vấn đề
- Response synthesis: tạo response tiếng Việt
- Model: Sonnet cho analysis, Haiku cho response đơn giản

**Perplexity API (PRICING):**
- Real-time price lookup: "giá thị trường sửa [X] tại HCMC"
- Không dùng cho việc gì khác
- Fail → fallback DB price table
- Timeout: 15s

**DeepSeek API (SUPPORT):**
- Intent classification: sửa điện / sửa nước / khác / không rõ
- Simple FAQ: booking, thời gian, chính sách
- Pre-screening: lọc input rác/off-topic trước Anthropic
- Ưu tiên DeepSeek trước (rẻ hơn), escalate Anthropic khi cần

### Routing Logic

```
User input
│
▼
[DeepSeek] Intent classification
├─ FAQ → [DeepSeek] trả lời → done
├─ "ngoài scope" → polite decline → done
├─ "không rõ" → hỏi lại → loop
└─ "điện"/"nước" → tiếp tục
│
▼ (A3)
[Perplexity #1] async ──→ price_context_1
[Anthropic Sonnet Vision] ──→ structured problem (nếu có ảnh)
│
▼ (sau A4)
[Perplexity #2] ──→ price_context_2
│
▼
[Compare] delta < 20%? → dùng #2 : pass cả hai cho Anthropic
│
▼
[Anthropic Sonnet] Synthesis → Price card + Advisory → Customer (A5)
│
▼ (sau A7 confirm)
[Anthropic Haiku] Pre-brief → Worker (B2)
│
▼
Broadcast → Workers trong khu vực
```

### Quy tắc API
- Tất cả API calls server-side. Không bao giờ gọi từ client.
- Timeout: Anthropic 20s, Perplexity 15s, DeepSeek 10s
- Retry: tối đa 2 lần, exponential backoff
- Logging: mọi API call (model, tokens, cost USD, latency ms, success/fail)
- Budget hard cap: $0.50 per user session

---

## 5. Business Model

### Commission (15% tổng)

Ví dụ job 300,000 VND:

| Bên | Số tiền | Ghi chú |
|-----|---------|---------|
| Khách trả | ~322,500 VND | Gồm 7.5% "phí bảo vệ dịch vụ" |
| Thợ nhận | ~270,000 VND | Sau khi trừ ~10% platform fee |
| Platform gross | ~52,500 VND | Trước chi phí |
| AI cost | ~2,000 VND | ~$0.008 per interaction |
| Net per deal | ~31,000 VND | |

### Lợi thế cạnh tranh
Đối thủ (Grab Home, etc.) charge 30-33%. Platform này 15% → thợ kiếm nhiều hơn → thợ chọn platform → mạng lưới tốt hơn → dịch vụ tốt cho khách.

---

## 6. Architecture

### Tech Stack

```
Phase 1 (NOW):
  [Next.js Web + Admin] ──→ [Supabase: DB + Auth + Realtime + Edge Functions]
                                    │
                                    ├──→ [Anthropic API]
                                    ├──→ [Perplexity API]
                                    └──→ [DeepSeek API]

Phase 2 (after validation):
  [React Native App] ──→ [Same Supabase backend]
  [Next.js] ──→ Admin panel only
```

### Components
- **Next.js**: Admin panel + API routes + web prototype (validate trước RN)
- **Supabase**: Database (users, jobs, prices, workers), Auth (phone OTP), Realtime (notifications), Edge Functions (AI API calls)
- **React Native (Phase 2)**: Mobile client iOS + Android

### Data Flow
```
[Client] ──HTTPS──→ [API/Edge Functions] ──secrets──→ [AI APIs]
                           │
                           ▼
                      [Supabase DB]
                           │
                           ▼
                    [Realtime] → Worker app + Customer app
```

### Quy tắc kiến trúc
1. Client không biết gì về AI. Mọi AI call ở backend.
2. Một API endpoint cho price check flow.
3. Database là source of truth. Không cache phức tạp ở phase đầu.
4. Real-time chỉ cho notification.

---

## 7. Future Roadmap — DO NOT BUILD NOW

### Trigger Conditions

| Condition | Target |
|-----------|--------|
| Real transactions | 1,000+ completed |
| Platform stable | 3+ tháng không critical bug |
| Revenue | Consistent positive unit economics |
| Team capacity | Đủ người handle complexity thêm |

### Phases
- **Phase 1 — NOW**: Kael Price Check. Điện + nước. HCMC. B2C chung cư.
- **Phase 2** (sau 500+ transactions): Booking flow hoàn chỉnh. Payment integration. Worker rating.
- **Phase 3** (sau 1,000+ transactions): Kael Agentic begins. Autonomous matching. Expand dịch vụ.
- **Phase 4** (sau stable revenue): Multi-city. SEA expansion.

### Don't Build Now List

| Item | Lý do |
|------|-------|
| Multi-agent orchestration | Không có transaction data để validate |
| Autonomous booking | User chưa tin tưởng đủ |
| Custom memory system | Supabase đủ ở scale hiện tại |
| Review Agent / CI Agent | Post-beta |
| L3/L4 autonomy | Phase 4+ |
| Web platform expansion | Sau khi mobile stable |
| Service expansion | Sau khi điện + nước profitable |
| Multi-city | Sau khi HCMC thành công |

**Heuristic:** >1 tuần build VÀ chỉ cần ở >10x scale → hoãn.
