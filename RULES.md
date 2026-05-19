# Home Services — Non-Negotiable Coding Rules

Rules này không được vi phạm. Nếu có conflict giữa rules và yêu cầu cụ thể → rules thắng → báo cáo conflict cho cộng sự.

---

## AI Coding Agents Skills Reference

Project đã cập nhật thêm Skills cho AI Coding Agents trong `skills.md`.

- `skills.md` tổng hợp tinh túy Karpathy-inspired workflow cho repo này: think before coding, simplicity first, surgical changes, goal-driven execution.
- `.agents/skills/karpathy-guidelines/SKILL.md` là skill project-local đã cài cho Codex/agent trong repo.
- Các skill này hướng dẫn cách làm việc; chúng KHÔNG thay thế các rule non-negotiable trong file này.
- Nếu `skills.md` hoặc skill `karpathy-guidelines` conflict với `RULES.md`, luôn ưu tiên `RULES.md`.

---

## Rule #1: Secrets không được ở client

**ĐÚNG:**
- API keys trong environment variables (server-side)
- Keys đọc trong server functions / Edge Functions
- `.env.example` (không có value) commit vào repo

**SAI — cấm tuyệt đối:**
- Hardcode key trong code
- API key trong client-side code (browser, React component, RN bundle)
- API key trong git history

Mỗi API key mới: (1) thêm `.env.example` (2) thêm env validator (3) thêm deployment config.

---

## Rule #2: Mọi AI API call qua centralized wrapper

```typescript
// ĐÚNG
import { callAI } from '@/lib/ai/client'
const result = await callAI({
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  messages: [...],
  maxTokens: 1000
})

// SAI — FORBIDDEN
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: 'sk-...' })
```

Wrapper phải có: timeout, retry, error handling, cost logging.

---

## Rule #3: AI response validate trước khi đến user

Kael không bao giờ gửi raw AI output thẳng cho user:
- Kiểm tra response có chứa giá → format đúng chưa?
- Kiểm tra off-topic → nếu có, replace bằng template mặc định
- Kiểm tra ngôn ngữ: phải là tiếng Việt (hoặc Anh nếu user dùng Anh)

---

## Rule #4: Price estimate phải có disclaimer

Mọi response chứa giá phải kèm:

> "Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu."

Không bỏ disclaimer. Không cam kết giá chính xác.

---

## Rule #5: Vietnamese first

- Mọi user-facing text: tiếng Việt
- Error messages: tiếng Việt
- Push notifications: tiếng Việt
- Log messages (developer-facing): English OK
- Code comments: English OK

---

## Rule #6: Kael chỉ trả lời trong scope Home Services điện, nước, vệ sinh

```typescript
if (
  service_category !== 'electrical' &&
  service_category !== 'plumbing' &&
  service_category !== 'cleaning'
) {
  return POLITE_DECLINE_MESSAGE
}
```

Hard rule. Kael trả lời ngắn gọn, đúng trọng tâm, thân thiện cho các vấn đề Home Services trong 3 nhóm active: sửa điện, sửa nước, vệ sinh/dọn dẹp nhà. Ngoài scope này thì từ chối lịch sự; nội dung nguy hiểm, 18+, làm lộ PII, hoặc không liên quan thì không phân tích.

---

## Rule #7: Không autonomous action không có user confirmation

Kael không tự làm bất kỳ điều gì ảnh hưởng đến tiền hoặc booking mà không có user tap/confirm tường minh:
- Tạo booking: user phải confirm
- Thanh toán: user phải confirm
- Cancel booking: user phải confirm

Không có exception ở phase hiện tại.

---

## Rule #8: Honesty — không fake data hay silent degrade

**Khi AI response fail hoặc data không có:**

ĐÚNG:
- Trả template response mặc định + thông báo rõ đang dùng fallback
- Log lỗi với đủ context để debug
- Hiển thị user: thông báo tiếng Việt phù hợp (không technical details)

SAI — cấm tuyệt đối:
- Return empty content và pretend thành công
- Fabricate price data khi Perplexity fail
- Fabricate worker info khi DB không có data
- Silently swallow error mà không log

**Fallback chấp nhận được. Fake success = KHÔNG BAO GIỜ.**

---

## Rule #9: Logging — không PII hoặc secrets

```typescript
// ĐÚNG — log metadata
console.log('Booking started', { bookingId, serviceType, district })
console.warn('API retry', { attempt, backoffMs, endpoint })

// SAI — cấm
console.log('User data', { phone: '09012345678', cccd: '001...' })
console.error('API failed', { apiKey: process.env.ANTHROPIC_API_KEY })
```

Chỉ log: IDs, status codes, error codes, metadata không nhạy cảm.
Không log: token, password, API key, SĐT đầy đủ, CCCD, địa chỉ đầy đủ.

---

## Rule #10: Timeout cho mọi network call

```typescript
const withTimeout = (promise, ms = 20000) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
```

Timeout theo API:
- Anthropic: 20,000ms
- Perplexity: 15,000ms
- DeepSeek: 10,000ms

Retry: tối đa 2 lần, exponential backoff (`backoffMs = Math.min(1000 * 2^attempt, 10000)`).

Không có network call nào không có timeout. Không có exception.

---

## Security Invariants

### Secrets Management
- `.env` và `.env.local` không bao giờ commit (`.gitignore` must include)
- `.env.example` commit với key names, không values
- Secrets chỉ đọc ở server-side — không bundle vào RN app binary
- Mọi secret mới: 3 bước bắt buộc (`.env.example` → env validator → deployment config)

### PII Handling
- Không log SĐT, CCCD, địa chỉ đầy đủ
- Chat customer ↔ worker qua Kael relay (không expose contact trực tiếp đến khi cần)
- Scrub thông tin nhạy cảm trước khi gửi lên LLM
- Không share PII giữa customer và worker ngoài những gì cần cho job

### Input Validation
- Validate + sanitize mọi user input trước khi đưa vào DB hoặc LLM prompt
- System prompt của Kael phải có refusal instruction cho off-topic
- Rate limit: tránh user gọi AI API không giới hạn trong một session

### Environment Variables (server-side only)
```
ANTHROPIC_API_KEY
PERPLEXITY_API_KEY
DEEPSEEK_API_KEY
```
