# Home Services — Workflow Enhancement Plan

Tài liệu này là execution plan cho enhancement đợt 2026-05-20. Audience: AI coding agent (Codex hoặc Claude Code) thực thi, Tu review, Claude (tôi) audit lại sau khi build xong.

Plan này KHÔNG phải tài liệu marketing. Mỗi phase phải xuất ra evidence verification chạy thật, không phải claim suông.

---

> 2026-05-30 supersession: các đoạn lịch sử trong Plan về rating penalty / auto-suspend khi worker hủy việc KHÔNG còn là runtime truth hiện tại. Nguồn hiện hành là `docs/workflow/worker-cancellation.md`, `STRUCTURES.md`, và các mục P11/P13/P16 sau này: không có autonomous suspension, rating penalty, payment hold, hoặc punishment nếu chưa có phê duyệt mới của Tu.

## 0. Activation Protocol

Trước khi đụng bất kỳ file nào, agent thực hiện plan này MUST:

1. Đọc `critical.md` — execution protocol contract.
2. Đọc `design.md` khi task chạm UI / motion / mascot / token.
3. Đọc `RULES.md` — non-negotiable rules.
4. Đọc `STRUCTURES.md` — workflow blueprint.
5. Đọc `CLAUDE.md` nếu task có ambiguity về identity/scope.
6. Đọc section liên quan trong `Plan.md` này.
7. Đọc file code/test liên quan trước khi sửa.
8. State preflight theo format `critical.md §5` trước khi edit.

Nếu plan này conflict với `RULES.md` hoặc `critical.md`, các file đó thắng. Stop và ask Tu.

Plan này KHÔNG được modify mid-execution. Nếu phát hiện phải đổi, tạo `Plan.md` version mới hoặc viết addendum, không edit silently.

---

## 1. Workflow Vision (locked)

Customer mở app → thấy Home với brand intro + 3 service cards (Sửa điện / Sửa nước / Vệ sinh).

Customer chọn 1 dịch vụ → Kael Chat mở full-screen với serviceType đã set.

Kael chat đa lượt với customer:
- Hỏi vấn đề bằng text.
- Yêu cầu ảnh khi cần để Anthropic vision phân tích.
- Yêu cầu video tùy chọn khi vấn đề phức tạp.
- Hỏi clarify 0-2 câu nếu mơ hồ.
- Sử dụng 2 supporting agent: Anthropic (vision/analysis) + Perplexity (market price).
- Synthesize estimate.

Kael trả estimate card inline trong chat:
- Vấn đề Kael xác định.
- Chẩn đoán có thể (technical, concise).
- Thợ sẽ làm gì (technical, concise).
- Thời gian dự kiến.
- Giá range (VND).
- Advice an toàn / lưu ý (nếu có, max 1).
- Disclaimer bắt buộc theo `RULES.md §4`.
- 2 button: "Đặt thợ" / "Hỏi thêm".

Customer tap "Đặt thợ" → backend confirm-search → broadcasting → push notification gửi đến top thợ phù hợp + nearest.

Worker nhận push notification (Expo Push Service) → tap → app mở IncomingRequestSheet với countdown 60s.

Worker accept → status `worker_matched`, full address reveal, push notification ngược về customer "Đã có thợ".

Worker travel → arrived → inspecting → repairing → completed_by_worker → customer confirm A12 → review A14.

**Auto worker cancellation loop** (đây là phần mới quan trọng):
- Worker hủy mid-job → submit reason + photo evidence.
- Backend KHÔNG có admin gate. Auto-approve cancellation.
- Kael ngay lập tức pick top candidate thay thế:
  - Same service_type.
  - Same/nearby district (Phase 0) → geo distance (Phase 1 sau khi có lat/lng).
  - Specialization match (Phase 1 sau khi có problem_specializations).
  - Exclude cancelled worker.
  - Order: distance ASC, rating DESC.
- Auto create broadcast cho candidate đầu + push notification.
- Push notification cho customer "Đang tìm thợ thay thế".
- Worker hủy bị trừ rating + log cancellation count.
- Abuse protection (superseded 2026-05-30): rate limit remains valid; auto-suspend/rating penalty language here is historical only and must not be implemented without renewed Tu approval.

---

## 1.1 Workflow Map (end-to-end)

Map dưới đây là visualization của §1. Đọc 1 lần để nắm tổng thể trước khi vào chi tiết từng phase. Mỗi node ghi rõ NEW WIRE hoặc phase nào thực hiện.

```
═══════════════════════════════════════════════════════════════════
                    CUSTOMER JOURNEY
═══════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────┐
  │ [1] HOME SCREEN                                 │
  │  ─ Header + brand intro                         │
  │  ─ 3 service cards: Sửa điện / Sửa nước / VS    │
  │    click → set serviceType context              │
  │  ─ Active deal banner (nếu có)                  │
  │  ─ Brand impression card                        │
  │                                                 │  Phase 1
  └────────────────┬────────────────────────────────┘
                   │ click service card
                   │ push /(customer)/kael-chat?serviceType=...
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [2] KAEL CHAT (stack screen, full-screen)       │
  │  ─ Header: "Kael — Sửa điện" theo serviceType   │
  │  ─ Chat history: customer ↔ Kael bubbles        │
  │  ─ Composer: text + [📷 ảnh] + [🎥 video]       │
  │                                                 │
  │  Kael conversation pattern:                     │
  │   1. Greet + hỏi vấn đề                         │
  │   2. Customer mô tả text                        │
  │   3. Kael phân tích + hỏi ảnh khi cần           │
  │   4. Customer gửi ảnh → Anthropic vision        │ ← fix C3
  │   5. Kael clarify thêm 0-2 câu nếu cần          │
  │   6. Perplexity market lookup                   │
  │   7. Kael synthesize estimate                   │
  │                                                 │  Phase 1
  └────────────────┬────────────────────────────────┘
                   │ Kael ready với estimate
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [3] ESTIMATE CARD inline trong chat             │
  │  ─ Vấn đề Kael xác định                         │
  │  ─ Chẩn đoán có thể (1-2 dòng)                  │
  │  ─ Thợ sẽ làm gì (concise technical)            │
  │  ─ Thời gian dự kiến                            │
  │  ─ Giá range (VND)                              │
  │  ─ Confidence + nguồn (baseline / market)       │
  │  ─ Advice (safety, lưu ý) — max 1               │
  │  ─ DISCLAIMER bắt buộc (RULES.md §4)            │
  │  ─ [ Đặt thợ ]  [ Hỏi thêm ]                    │
  │                                                 │  Phase 1
  └────────┬───────────────────┬────────────────────┘
           │ "Hỏi thêm"        │ "Đặt thợ"
           │ → tiếp chat       │  TAP CONFIRM (double-tap pattern)
           │                   ▼
           │      ┌──────────────────────────────────┐
           │      │ [4] BACKEND CONFIRM-SEARCH       │
           │      │  POST /kael/chat/:id/confirm     │
           │      │  ─ Atomic: create job +          │
           │      │    confirm-search → broadcasting │
           │      │  ─ createBroadcasts (top 5 thợ)  │
           │      │  ─ INSERT notification rows       │ ← Phase 2
           │      │  ─ Expo Push → worker phones     │ ← Phase 2
           │      └────────────┬─────────────────────┘
           │                   │
           │                   ▼ (poll 15s OR push từ worker accept)
           │      ┌──────────────────────────────────┐
           │      │ [5] WORKER MATCHED               │
           │      │  ─ Push notification → customer  │ ← Phase 2
           │      │    "Đã có thợ nhận việc"         │
           │      │  ─ Chat tiếp tục với worker info │
           │      │  ─ Track: travel → arrived       │
           │      │    → inspecting → repairing      │
           │      │  ─ Each transition: push cust    │ ← Phase 2
           │      └────────────┬─────────────────────┘
                              │
                              ▼ (worker reports completed_by_worker)
                          ┌──────────────────────────┐
                          │ [6] A12 CONFIRM          │
                          │  Customer xác nhận xong  │
                          │  Required: final_price>0 │
                          └─────────┬────────────────┘
                                    │
                                    ▼
                          ┌──────────────────────────┐
                          │ [7] A14 REVIEW           │
                          │  1-5 stars + tags        │
                          │  → status: reviewed      │
                          └──────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    WORKER JOURNEY
═══════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────┐
  │ [W1] WORKER ONLINE (background)                 │
  │  ─ device_push_tokens registered                │ ← Phase 2
  │  ─ is_available = true                          │
  │  ─ Polling /workers/me/broadcasts every 20s     │
  └────────────────┬────────────────────────────────┘
                   │
                   │ ── PUSH NOTIFICATION ARRIVES         ← Phase 2
                   │    via Expo Push Service
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [W2] PUSH POPUP                                 │
  │  "Có yêu cầu mới — Sửa điện · Quận 1"           │
  │  Tap → deep link                                │
  │  /(worker)/jobs?broadcast_id=...                │
  └────────────────┬────────────────────────────────┘
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [W3] INCOMING REQUEST SHEET (B2)                │
  │  ─ Service + general area (ẨN full address)     │
  │  ─ Kael pre-brief                               │
  │  ─ Estimated earning                            │
  │  ─ COUNTDOWN 60s                                │
  │  ─ [ Chấp nhận ]  [ Bỏ qua ]                    │
  └────────┬───────────────────┬────────────────────┘
           │ Bỏ qua            │ Chấp nhận
           │ → next worker     ▼
           │      ┌──────────────────────────────────┐
           │      │ [W4] ACCEPT → atomic RPC         │
           │      │  accept_broadcast_atomic         │
           │      │  ─ status: worker_matched        │
           │      │  ─ full address REVEALED         │
           │      │  ─ Push customer "Đã có thợ"     │ ← Phase 2
           │      └────────────┬─────────────────────┘
           │                   │
           │                   ▼
           │      ┌──────────────────────────────────┐
           │      │ [W5] OPERATIONAL                 │
           │      │  worker_on_way → arrived →       │
           │      │  inspecting → repairing →        │
           │      │  completed_by_worker             │
           │      │  Each: push customer notify      │ ← Phase 2
           │      └──────────────────────────────────┘
           ▼
       (back to W1 polling)


═══════════════════════════════════════════════════════════════════
       WORKER CANCELLATION AUTO LOOP (NEW — Phase 3)
═══════════════════════════════════════════════════════════════════

     (worker đã accept, đang trên đường hoặc onsite)
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ [WC1] WORKER tap "Hủy việc"                     │
  │  ─ Modal: chọn reason (text ≥ 10 ký tự)         │
  │  ─ Optional: photo evidence                     │
  │  ─ Submit POST /jobs/:id/worker-cancellation    │
  └────────────────┬────────────────────────────────┘
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [WC2] BACKEND AUTO PROCESS (Kael in loop)       │
  │  request_worker_cancellation_atomic (updated)   │
  │                                                 │
  │  Inside atomic transaction:                     │
  │   ─ Check rate limit (max 2 cancel/24h)         │
  │     → fail → return RATE_LIMITED                │
  │   ─ Mark cancellation status='approved'         │ ← bỏ admin gate
  │   ─ Decrement worker rating -0.1                │
  │   ─ Count cancellations last 7d                 │
  │     superseded: no auto-suspend without Tu       │
  │   ─ Job status: → 'broadcasting' (reset)        │
  │   ─ Clear worker_id, matched_at, arrived_at     │
  │   ─ Return prev worker_id + svc + dist + geo    │
  │                                                 │
  │  Then Edge service:                             │
  │   ─ findNextBestWorker(exclude=[prev_worker])   │
  │     score = rating*10                           │
  │           + specialization_match ? 20 : 0       │
  │           + distance_bonus (Phase 3 geo)        │
  │   ─ createBroadcasts(top 5 candidates)          │
  │   ─ INSERT notification rows                    │ ← Phase 2 wire
  │   ─ Expo Push → new worker(s)                   │ ← Phase 2 wire
  │   ─ Expo Push → customer "Đang tìm thợ thay     │
  │     thế"                                        │ ← Phase 2 wire
  │   ─ Log job_events                              │
  └────────────────┬────────────────────────────────┘
                   ▼
       [WC3] Loop back to [W2] PUSH POPUP cho new worker
              → [W3] IncomingRequestSheet
              → [W4] Accept → reveal address
              → [W5] Operational continues


═══════════════════════════════════════════════════════════════════
       SCOPE CHANGE FLOW (A11 — Phase 4 hard-stop modal)
═══════════════════════════════════════════════════════════════════

     (worker đang inspecting / repairing,
      thấy vấn đề khác giá đã estimate)
                              │
                              ▼
  ┌─────────────────────────────────────────────────┐
  │ [SC1] WORKER request scope change               │
  │  request_scope_change_atomic                    │
  │  ─ status: scope_change_pending                 │
  │  ─ Kael generate explanation (Anthropic call)   │ ← Phase 4
  │  ─ Save kael_review JSONB                       │
  │  ─ Push customer URGENT                         │ ← Phase 2 wire
  └────────────────┬────────────────────────────────┘
                   ▼
  ┌─────────────────────────────────────────────────┐
  │ [SC2] CUSTOMER receives push                    │
  │  Tap → deep link                                │
  │  /(customer)/history?scope_change=...           │
  │  → HARD-STOP MODAL force-shown                  │ ← Phase 4 fix C1
  │                                                 │
  │  Modal content:                                 │
  │   ─ Old scope vs new scope comparison           │
  │   ─ Old price vs new price                      │
  │   ─ Worker reason                               │
  │   ─ Kael explanation (why reasonable / not)     │
  │   ─ Cannot dismiss without decision             │
  │   ─ [ Từ chối ]  [ Duyệt ]                      │
  └────────┬───────────────────┬────────────────────┘
           │ Từ chối           │ Duyệt
           │ → job CANCELLED   │ → status: repairing
           │ (per migration    │ (worker tiếp tục)
           │  20260518181500)  │
           ▼                   ▼
       Job ends            Continue workflow


═══════════════════════════════════════════════════════════════════
                    PHASE MAPPING LEGEND
═══════════════════════════════════════════════════════════════════

Phase 1 (Kael-first):    [1] [2] [3] [4 part]
Phase 2 (Notifications): [4 wire] [5 push] [W1 token] [W2 push]
                          [W4 push] [W5 push] [SC1 push]
Phase 3 (Auto cancel):   [WC1] [WC2] [WC3]
Phase 4 (Bug fixes):     [SC2 hard-stop] + A11 modal
Phase 5 (Supporting):    Customer signup, Worker self-onboard,
                          Chat customer↔worker persist
```

Map này là **end-state** sau khi tất cả phase 1-4 hoàn tất. Codex implement TỪNG PHASE, không phải full map 1 lần.

---

## 2. Decisions Locked (Tu confirmed)

| # | Quyết định | Giá trị |
|---|---|---|
| D1 | Customer entry shape | Home: brand intro + 3 service cards. Click service → Kael chat với serviceType đã set |
| D2 | Kael input media progression | Text first → Kael request photos → Kael request video (optional) |
| D3 | Kael output detail | Full technical nhưng concise + dễ hiểu. Cấu trúc: vấn đề + chẩn đoán + thợ làm gì + thời gian + giá + advice |
| D4 | Confirm UX | Tap trong chat. Estimate card có 2 button rõ "Đặt thợ" / "Hỏi thêm" |
| D5 | Worker cancellation flow | Hoàn toàn auto, KHÔNG admin gate. Kael pick next worker ngay lập tức |
| D6 | Geo API | Google Maps Geocoding API chính thức. Free tier $200/m. Vượt → pause + Tu approve |
| D7 | Push provider | Expo Push Service chính thức |
| D8 | Kael chat persist | DB persist (kael_chat_sessions + kael_chat_turns tables) |
| D9 | A6 scheduling | Now-only Phase 1. Slot scheduling defer Phase 2 |
| D10 | Worker cancel abuse | max 2 cancel/24h remains valid; rating penalty and auto-suspend are superseded historical ideas and must not be implemented without renewed Tu approval |
| D11 | Tab layout customer | GIỮ NGUYÊN 5 tabs (Home/Book/Kael/History/Profile). Repurpose Book + Kael per §8.6. KaelChatSurface là stack screen ngoài tab bar |
| D12 | Admin panel web app | DEFER hoàn toàn — KHÔNG build trong plan này. Admin actions qua Supabase Studio direct |
| D13 | Phase ordering | Phase 1→2→3 sequential. Phase 4 parallel với 1-3. Phase 5 sau khi 1-4 done |
| D14 | Customer signup | Phase 5, KHÔNG nâng lên Phase 4 |
| D15 | AGENTS.md unmerged branch | Merge `codex/glass-motion-ui-enhancement` vào main TRƯỚC khi Codex bắt đầu Phase 0. Sau merge → AGENTS.md vào hierarchy §3 |

Nếu Tu thay đổi 1 trong các quyết định trên giữa chừng, agent STOP và ask trước khi tiếp.

---

## 3. Authoritative Source Hierarchy

Khi 2 file conflict:

```
RULES.md          (security/PII/AI/scope non-negotiable)
critical.md       (execution protocols)
design.md         (UI/visual contract)
AGENTS.md         (operating rules: language consistency, glass motion, performance budget)
STRUCTURES.md     (workflow blueprint)
Plan.md           (this — execution plan for current enhancement)
CLAUDE.md         (project identity)
docs/**           (durable contracts, less authoritative than above)
```

**AGENTS.md note**: Per D15, branch `codex/glass-motion-ui-enhancement` merge vào main TRƯỚC khi Codex bắt đầu. Sau merge, AGENTS.md có vị trí trên — vì content cụ thể về language/glass/motion operating rules. Nếu vì lý do gì AGENTS.md chưa merge khi Codex start → STOP, escalate Tu.

Code/migrations đã merge là source of truth cho hiện trạng. Nếu plan và code conflict → re-read code trước khi sửa.

---

## 4. Architecture Baseline (preserve)

Phải GIỮ:

- **Mobile RN (Expo SDK 54)** = primary customer + worker client.
- **Supabase Edge Function `mobile-api`** = production runtime backend.
- **Next.js `apps/api`** = reference/parity code. KHÔNG xóa trong scope này, KHÔNG đẩy production. Tests ở đây giữ để guard contract.
- **Supabase Postgres** = source of truth. RLS enabled mọi public table.
- **3 service categories**: electrical, plumbing, cleaning. KHÔNG mở rộng.

KHÔNG được build / không động:

- Multi-city expansion.
- Service categories khác ngoài 3.
- Autonomous booking (booking mà không cần customer confirm).
- Autonomous payment.
- L3/L4 agent autonomy.
- Web consumer product (Next.js admin OK, consumer KHÔNG).

---

## 5. Audit Findings Reference

Plan này address các finding đã audit ngày 2026-05-20. Cross-reference:

| Finding | Severity | Phase fix | Note |
|---|---|---|---|
| C1: A11 scope change thiếu hard-stop modal | CRITICAL | Phase 4 | Parallel với Phase 1 |
| C2: Worker earnings paid_at bug | CRITICAL | Phase 4 | Quick fix |
| C3: Kael vision không xem photos | CRITICAL | Phase 1 | Core workflow |
| C4: Worker self-onboard blocked | CRITICAL | Phase 5 | Sau core workflow |
| C5: Kael learning dead code | CRITICAL | Phase 6 (defer) | Port sau khi core ổn |
| C6: scope_change_reject migration chưa prod | CRITICAL | Phase 4 | Apply ngay |
| H1: 3 state machines divergence | HIGH | Phase 1.0 (prep) | Align trước core work |
| H2: Contracts duplicate divergence | HIGH | Phase 1.0 (prep) | Sync shared ↔ Edge domain |
| H3: Mobile god-files | HIGH | Phase 1 mobile work | Split khi build KaelChatSurface |
| H4: Test coverage skew | HIGH | Cross-cutting | Mỗi phase yêu cầu Edge tests |
| H5: Service-role bypass RLS inconsistent | HIGH | Phase 1.0 (prep) | Unified `requireJobAccess` helper |
| H6: Migration chaos | HIGH | Phase 4.4 | Document chain, không touch history |
| H7: Photos không deliver value | HIGH | Phase 1 | Fix khi enable Anthropic vision |
| M1: VN copy inconsistent | MEDIUM | Phase 4.4 | Grep sweep |
| M2: Orphan analyzing jobs | MEDIUM | Phase 5 | Cleanup cron |
| M3: Rate-limit in-memory | LOW | Defer | Pre-revenue OK |
| M4: Kael Chat tab gây hiểu nhầm | MEDIUM | Phase 1 | Resolved khi build chat thật |
| M5: Worker chat backend không persist | MEDIUM | Phase 5 | Sau core workflow |
| M6: safeParseJSON nested bug | LOW | Phase 1 | Update khi refactor kael.ts |
| M7: Unsupported services UI | LOW | OK as-is | Disabled cards không pressable |
| M8: Trust signals thiếu | LOW | Phase 5 | Khi có data thật |

---

## 6. Open Research Items (Phase 0 SPIKE)

Trước khi vào code, làm 2 research spike. Output: notes ngắn (1-2 trang/spike) trong `docs/foundation/`.

### 6.1 Geo data model spike — `docs/foundation/geo-data-spike.md`

Câu hỏi cần trả lời:

- Google Maps Geocoding API pricing: free $200/month có đủ HCMC scale Phase 0 không?
- Address autocomplete UI nào fit React Native Expo? (`react-native-google-places-autocomplete`?)
- Schema: lat/lng FLOAT vs PostGIS GEOGRAPHY vs cube extension?
- Distance computation: Haversine SQL function vs PostGIS ST_DistanceSphere?
- Worker `service_radius_km` default = bao nhiêu cho HCMC density?
- Privacy: lat/lng có là PII không (per `RULES.md`)? → kết luận: YES, không log, không gửi LLM.

Deliverable: chốt 1 approach, 1 schema design, 1 distance function. Output là spec, không phải code.

### 6.2 Expo Push integration spike — `docs/foundation/expo-push-spike.md`

Câu hỏi cần trả lời:

- Expo Push Service free tier limit (per FAQ).
- Required: APNS/FCM credentials trong Expo project? Hay chỉ ExpoPushToken là đủ?
- Backend `/jobs/...` muốn gọi Expo Push API từ Deno Edge — auth header gì?
- Push payload size limit (Expo: ~4KB; APNS native: 4KB).
- Deep link format Expo Router: `app/(worker)/jobs?broadcast_id=...` hay scheme custom?
- Notification permission UX: ask khi nào? (mở app lần đầu vs trước khi worker bật available)

Deliverable: chốt push helper signature, payload schema, deep link convention.

**Phase 1-3 KHÔNG bắt đầu đến khi 2 spike này có output**.

---

## 7. Pre-work (Phase 1.0)

Trước core workflow, 3 việc cleanup nhỏ để giảm rủi ro:

### 7.1 Sync shared ↔ Edge domain contracts (H2)

**Mục tiêu**: Eliminate divergence giữa `packages/shared/src/constants.ts` + `packages/shared/src/validation.ts` và `supabase/functions/_shared/domain.ts`.

**Cách làm**:

- Generate `domain.ts` từ shared trong build step, hoặc
- Maintain manual với test `mobile-backend-wiring.test.ts` mở rộng check field-by-field parity.

**Phải fix**:

- `normalizeDistrict` behavior khác nhau (shared comment vs Edge NFD normalize). Pick 1 (đề xuất: Edge approach — diacritic-insensitive). Update shared comment + implementation.
- Schemas thiếu mỗi bên: `workerCancellationRequestSchema`, `jobMediaAttachSchema`, `devicePushTokenSchema` chưa có shared. Port qua shared.
- Constants thiếu Edge: `MESSAGE_SENDERS`, `LEARNING_*_STATUSES`, `PROBLEM_CHIPS`, `REVIEW_TAGS`. Port qua Edge nếu Edge cần (chat persist sẽ cần `MESSAGE_SENDERS`).

**Verification**: test mới `packages/shared/src/__tests__/contracts-parity.test.ts` so sánh cả 2 source, FAIL khi divergence.

**Definition of Done**:

- [ ] Test parity pass.
- [ ] `normalizeDistrict` 1 behavior duy nhất.
- [ ] Comment trong `constants.ts` line 191 update đúng với code.

### 7.2 Unified ownership helper (H5)

**Mục tiêu**: Edge services.ts có pattern check ownership KHÔNG nhất quán. Định nghĩa 1 helper duy nhất.

**File**: `supabase/functions/mobile-api/_shared/access.ts` (NEW)

**API**:

```typescript
export async function requireJobAccess(
  client: DbClient,
  jobId: string,
  ctx: MobileApiContext,
  options?: {
    requiredRole?: 'customer' | 'worker' | 'admin';
    statuses?: JobStatus[];
  }
): Promise<JobRecord>;
```

Hành vi:

- 404 "Không tìm thấy yêu cầu" nếu job không tồn tại (KHÔNG leak qua 403).
- 404 nếu ctx.role là customer nhưng customer_id khác.
- 404 nếu ctx.role là worker nhưng worker_id khác.
- 403 nếu requiredRole không match.
- 409 nếu statuses[] truyền mà current status không in list.
- Admin bypass mọi check trừ requiredRole.

**Audit + refactor**: thay thế các pattern inline `.eq("customer_id", ctx.user.id)` / `assertJobOwnership` ở `services.ts` bằng helper này. KHÔNG refactor logic, chỉ thay check.

**Verification**: test `mobile-api-edge-runtime.test.ts` mở rộng — test cross-role 404, admin bypass, status guard.

**Definition of Done**:

- [ ] Helper exist + tested.
- [ ] Mọi route có job ID đụng helper.
- [ ] Negative tests pass.

### 7.3 State machine alignment (H1)

**Mục tiêu**: `LOCAL_DEAL_STATUSES` (mobile local workflow) skip `estimate_ready`, `payment_pending`, `paid`. Document rõ tại sao + thêm guard.

**File**: `packages/shared/src/mobile-workflow.ts` line 12

**Cách làm**:

- Thêm comment block giải thích vì sao LOCAL_DEAL_STATUSES khác JOB_STATUSES.
- Thêm assertion test: mọi LOCAL_DEAL_STATUSES phải subset của JOB_STATUSES.
- Thêm assertion test: hydrate function mapping JobStatus → LocalDealStatus phải total (handle hết).

**Definition of Done**:

- [ ] Comment giải thích trong code.
- [ ] Tests pass.

---

## 8. Phase 1 — Kael-First Workflow

**Goal**: Customer mở app → Kael chat → estimate → confirm trong chat → broadcasting.

**Dependencies**: Phase 0 spikes done, Phase 1.0 pre-work done.

**Estimated effort**: 5-7 ngày agent build.

### 8.1 Database — chat session schema

**Migration**: `supabase/migrations/YYYYMMDDHHMMSS_kael_chat_sessions.sql`

Tables mới:

```sql
-- kael_chat_sessions: 1 session per draft job
create table public.kael_chat_sessions (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references public.jobs on delete cascade unique,
  customer_id     uuid references public.profiles on delete cascade not null,
  service_type    public.service_type not null,
  status          text not null default 'active' check (status in (
    'active',         -- chat đang diễn ra
    'estimate_ready', -- Kael đã ra estimate
    'confirmed',      -- customer đã tap "Đặt thợ"
    'abandoned'       -- customer rời chat > 24h chưa confirm
  )),
  started_at      timestamptz not null default now(),
  estimate_ready_at timestamptz,
  abandoned_at    timestamptz,
  total_turns     int not null default 0,
  total_cost_usd  numeric(10,6) not null default 0,
  safe_metadata   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- kael_chat_turns: từng lượt trong chat
create table public.kael_chat_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.kael_chat_sessions on delete cascade not null,
  turn_index      int not null,
  role            text not null check (role in ('customer', 'kael', 'system')),
  content_type    text not null check (content_type in (
    'text',
    'photo_request',
    'video_request',
    'photo_attached',
    'video_attached',
    'clarification',
    'analysis',
    'estimate',
    'error'
  )),
  text_content    text,
  media_refs      text[] not null default '{}'::text[],
  safe_metadata   jsonb not null default '{}'::jsonb,
  ai_provider     public.api_provider,
  ai_model        text,
  cost_usd        numeric(10,6),
  latency_ms      int,
  created_at      timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index kael_chat_sessions_customer_idx on public.kael_chat_sessions (customer_id, created_at desc);
create index kael_chat_sessions_job_idx on public.kael_chat_sessions (job_id);
create index kael_chat_turns_session_idx on public.kael_chat_turns (session_id, turn_index);

alter table public.kael_chat_sessions enable row level security;
alter table public.kael_chat_turns enable row level security;

-- RLS: customer reads own sessions; admin reads all; nobody writes directly (Edge service-role)
create policy "Customers read own chat sessions"
  on public.kael_chat_sessions for select
  to authenticated
  using (customer_id = (select auth.uid()) or private.is_admin());

create policy "Customers read own chat turns"
  on public.kael_chat_turns for select
  to authenticated
  using (
    exists (
      select 1 from public.kael_chat_sessions s
      where s.id = session_id
        and (s.customer_id = (select auth.uid()) or private.is_admin())
    )
  );

revoke insert, update, delete on public.kael_chat_sessions from authenticated;
revoke insert, update, delete on public.kael_chat_turns from authenticated;
grant select on public.kael_chat_sessions to authenticated;
grant select on public.kael_chat_turns to authenticated;
grant all on public.kael_chat_sessions to service_role;
grant all on public.kael_chat_turns to service_role;

create trigger kael_chat_sessions_updated_at
  before update on public.kael_chat_sessions
  for each row execute function update_updated_at();
```

**Notes**:

- `job_id` nullable đến khi customer confirm (Phase 1.5). Sau confirm → backend create job + link.
- `cost_usd` tracked per turn cho budget monitoring.
- `media_refs` lưu `supabase://job-media/<path>` references — NEVER store raw user input that could be PII per `RULES.md §9`.

**Verification**:

- Migration apply staging clean.
- RLS test: customer A đọc session customer A OK, đọc của customer B 404.
- Admin bypass OK.

### 8.2 Edge backend — Multi-turn chat endpoint

**File mới**: `supabase/functions/mobile-api/_shared/kael-chat.ts`

**Endpoint mới trong `router.ts`**:

```
POST /kael/chat
  ─ Start new session OR continue existing
  ─ Body: { session_id?, service_type, message: { role: 'customer', content_type, text?, media_refs? } }
  ─ Response: { session_id, turn: KaelChatTurn, next_action: 'await_input' | 'ask_photo' | 'ask_video' | 'estimate_ready' | 'unsupported' }

GET /kael/chat/:session_id
  ─ List turns của session
  ─ Response: { session: KaelChatSession, turns: KaelChatTurn[] }

POST /kael/chat/:session_id/confirm
  ─ Customer tap "Đặt thợ"
  ─ Backend: create job từ session → status awaiting_customer_confirm → confirm-search ngay
  ─ Response: { job_id, status, broadcast_sent }
```

**Pipeline state machine cho Kael chat** (replace single-shot `runKaelPipeline`):

```
State: collecting
  ├─ Customer gửi text turn → classify intent (DeepSeek/Anthropic)
  │   ├─ Out of scope (HVAC, etc.) → return next_action: 'unsupported'
  │   └─ In scope → check enough info
  │       ├─ Need photo → next_action: 'ask_photo' + ask Vietnamese message
  │       ├─ Need clarify → next_action: 'await_input' + ask 1 câu cụ thể
  │       └─ Enough → goto analyzing

State: analyzing
  ├─ Customer gửi photo → Anthropic vision (claude-sonnet-4-6 với image messages)
  │   ├─ Vision returns severity + complexity hint
  │   └─ Continue or ask more
  ├─ Have enough text + photos → goto pricing

State: pricing
  ├─ Fetch baseline from DB
  ├─ Perplexity market search
  ├─ Synthesize estimate
  ├─ Generate "thợ sẽ làm gì" text via Anthropic
  ├─ Generate advisory nếu indicator nguy hiểm
  ├─ Save estimate turn → next_action: 'estimate_ready'

State: estimate_ready
  ├─ Customer tap "Đặt thợ" → confirm endpoint
  ├─ Customer ask thêm → return to collecting (re-analyze if new info)

State: confirmed
  ├─ Frozen, session.status = 'confirmed'
```

**Anthropic vision integration (fix C3)**:

```typescript
// Trong buildVisionMessages, khi có photo URLs:
const messages = [
  { role: 'system', content: KAEL_BUSINESS_GUARDRAILS + KAEL_RESPONSE_STYLE + ... },
  {
    role: 'user',
    content: [
      { type: 'text', text: `Customer mô tả: ${description}` },
      ...mediaUrls.map(url => ({
        type: 'image',
        source: { type: 'url', url },
      })),
    ],
  },
];
```

**Lưu ý**: media URLs phải là signed URL từ Supabase Storage (private bucket). Generate signed URL with 5-min expiry trước khi gửi Anthropic. KHÔNG bao giờ gửi raw image bytes qua text channel.

**File touch list cho Phase 1.2**:

- `supabase/functions/mobile-api/_shared/kael-chat.ts` (NEW, ~500-700 lines tối đa)
- `supabase/functions/mobile-api/_shared/kael.ts` (REFACTOR — split runKaelPipeline thành stateful version, hoặc giữ + extract reusable parts)
- `supabase/functions/mobile-api/_shared/router.ts` (ADD 3 routes mới)
- `supabase/functions/mobile-api/_shared/services.ts` (ADD chat service functions)
- `supabase/functions/_shared/domain.ts` (ADD kaelChatRequestSchema, kaelChatTurnSchema)
- `packages/shared/src/validation.ts` (mirror schemas)
- `packages/shared/src/types/api-responses.ts` (KaelChatResponse types)

**Rule #2 compliance**: tất cả AI call qua centralized `callAI()` helper hiện có trong `kael.ts`. KHÔNG import provider SDK trực tiếp ở chat-state code.

**Rule #3 compliance**: mọi Kael output cho user phải validate qua Zod schema trước khi return Mobile.

**Cost tracking**: mỗi turn ghi `cost_usd` vào kael_chat_turns. Session total = sum. Soft cap session total at $0.50, hard cap $1.00 — beyond hard cap → return `next_action: 'budget_exceeded'`.

**Verification**:

- Unit tests: state transitions, schema validation, Anthropic vision message format.
- Integration test trên staging: full chat flow end-to-end.
- Manual: gửi 3 ảnh ổ cắm cháy → Kael phải nhận diện điện.

### 8.3 Edge backend — Confirm chat → create job

**Endpoint**: `POST /kael/chat/:session_id/confirm`

**Logic**:

```
Atomic operation:
1. Lock session row (FOR UPDATE)
2. Verify session.status = 'estimate_ready'
3. Verify customer_id = ctx.user.id
4. Extract final estimate turn (latest turn với content_type='estimate')
5. Read customer's apartment profile cho address
6. Create job với:
   - status = 'awaiting_customer_confirm'
   - kael_problem_identified, kael_complexity, kael_price_min, kael_price_max from estimate turn
   - service_type, problem_chips từ session
   - description từ first customer text turn
   - photo_urls từ media_refs đã attach
7. Link session.job_id = new job.id
8. Update session.status = 'confirmed'
9. Run confirm-search logic (current confirmSearch sau A7) → broadcasting
10. Return { job_id, status, broadcast_sent }
```

**Use atomic RPC**: tạo function mới `confirm_kael_chat_atomic(p_session_id, p_customer_id)` trong migration cùng với chat tables.

**Verification**:

- Test: confirm 1 session 2 lần → second call return STATUS_CHANGED.
- Test: confirm session khác customer → 404.
- Test: confirm session chưa estimate_ready → INVALID_STATUS.

### 8.4 Mobile — HomeScreen refactor

**File**: `apps/mobile/components/customer/customer-surfaces.tsx` (split thành nhỏ hơn — H3 fix bắt đầu ở đây)

**Decision**: split `customer-surfaces.tsx` thành các file nhỏ hơn khi build phần này. Không phải refactor toàn bộ 2626 lines 1 lần, mà:

- KEEP existing exports để mobile/app/(customer)/*.tsx không break.
- MOVE inner components vào files theo surface:
  - `customer-home/` (new dir): HomeSurface + V4Frame + V4Dock + service cards
  - `customer-history/` (new dir): HistorySurface + timeline + scope change card
  - `customer-profile/` (new dir): ProfileSurface
  - `customer-shared/` (new dir): GlassPressable wrappers, IconGlyph, tokens
- DELETE: `client-price-check-flow.tsx` (booking flow cũ — Kael chat thay thế). Move estimate disclaimer constant qua `customer-shared/`.
- REFACTOR: `CustomerKaelSurface` → mở thẳng KaelChatSurface mới (Phase 1.5).

**HomeSurface mới**:

```
Layout:
  ┌──────────────────────────────┐
  │ Brand intro header           │ ← greeting + Kael mascot identity
  │   "Chào, tôi là Kael."       │
  │   "Bạn cần sửa gì hôm nay?"  │
  ├──────────────────────────────┤
  │ Active deal banner (if any)  │ ← unchanged
  ├──────────────────────────────┤
  │ 3 service cards (primary)    │
  │  Sửa điện | Sửa nước | VS    │ ← each click opens KaelChat with serviceType
  ├──────────────────────────────┤
  │ Disabled future services     │ ← unchanged "Đang khóa"
  ├──────────────────────────────┤
  │ Notification inline (top 2)  │ ← unchanged
  ├──────────────────────────────┤
  │ Brand impression card        │ ← "Không biết giá ..." (unchanged)
  └──────────────────────────────┘
```

**Bỏ**: search pill "Bạn cần sửa gì?" hiện tại đang route booking — không cần nữa.

**Add**: click service card → navigate `/(customer)/kael-chat?serviceType=electrical` với serviceType pre-set.

**Files touched**:

- `apps/mobile/components/customer/customer-home/home-surface.tsx` (NEW, ~200-300 lines)
- `apps/mobile/components/customer/customer-home/service-card.tsx` (NEW)
- `apps/mobile/components/customer/customer-surfaces.tsx` (DELETE inner home logic, re-export)
- `apps/mobile/app/(customer)/home.tsx` (no change in mounting)
- `apps/mobile/app/(customer)/kael-chat.tsx` (NEW route with serviceType param)

**Visual contract**: theo `design.md` §15 Customer Home Recipe + `docs/design/production-glass-motion-contract.md`. Glass material restrained — chỉ accent layer.

**Verification**:

- Type-check pass.
- `mobile-wiring.test.ts` extend: assert 3 service cards exist + each routes to kael-chat with serviceType param.

### 8.5 Mobile — KaelChatSurface (NEW)

**File mới**: `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` (~400-600 lines, KHÔNG vượt 800)

**Anatomy** (theo `design.md` §19 Kael Chat Recipe):

```
┌─────────────────────────────────────┐
│ Header                              │
│   ← back  │  Kael — Sửa điện       │
│           │  (Kael mascot)          │
├─────────────────────────────────────┤
│                                     │
│  Chat history (scrollable)          │
│                                     │
│   [Kael greeting bubble]            │
│   "Mình là Kael. Bạn đang gặp       │
│    vấn đề điện gì?"                 │
│                                     │
│   [Customer bubble — text]          │
│   "Ổ cắm phòng khách bị cháy"       │
│                                     │
│   [Kael bubble — analysis]          │
│   "Cảm ơn! Bạn chụp giúp mình       │
│    ảnh ổ cắm và vùng tường xung     │
│    quanh nha?"                      │
│                                     │
│   [Customer bubble — photos]        │
│   <thumbnails>                      │
│                                     │
│   [Kael thinking indicator]         │
│   ...                               │
│                                     │
│   [Kael estimate card]              │
│   ┌──────────────────────────┐      │
│   │ Vấn đề: ...              │      │
│   │ Chẩn đoán: ...           │      │
│   │ Thợ sẽ làm: ...          │      │
│   │ Thời gian: ~45 phút      │      │
│   │ Giá: 250-450k VND        │      │
│   │ Advice: ⚠ ngắt nguồn... │      │
│   │ Disclaimer: ...          │      │
│   │ [Đặt thợ] [Hỏi thêm]     │      │
│   └──────────────────────────┘      │
│                                     │
├─────────────────────────────────────┤
│ Composer                            │
│  [📷] [Type message...]  [Send →]   │
└─────────────────────────────────────┘
```

**State management**:

- Local state cho composer draft.
- React Query (đã có trong project) hoặc useReducer cho chat history + next_action.
- Hydrate session từ backend qua `GET /kael/chat/:session_id`.
- Optimistic add customer bubble khi gửi.

**Photo upload flow**:

- Tap 📷 → expo-image-picker → multi-select.
- Upload qua existing `media-upload.ts` helper với stage='kael_reference'.
- After upload success → POST /kael/chat với `media_refs` mới.

**Video upload**:

- Tap 📷 → option "Video" trong picker.
- Same flow, stage='kael_reference'.
- Size limit 26MB per existing bucket config.

**Estimate card render**:

- Component riêng: `KaelEstimateCard`.
- Render từ turn.content_type='estimate' + safe_metadata.
- 2 button: "Đặt thợ" → call confirm endpoint; "Hỏi thêm" → focus composer.
- Confirm tap → loading state → on success → navigate to `/(customer)/history?job_id=...`.

**Inline confirmation pattern** (D4):

- Khi customer tap "Đặt thợ":
  1. Show confirmation banner above button: "Xác nhận tìm thợ với mức giá 250-450k?"
  2. Button đổi thành "Có, tìm thợ"
  3. Second tap → execute confirm
- Đây là double-tap pattern → satisfies critical.md "explicit confirmation for money-impacting actions" mà KHÔNG cần bottom sheet.

**Forbidden**:

- KHÔNG show raw AI text (Rule #3). Mỗi turn validate qua schema before render.
- KHÔNG show price không có disclaimer (Rule #4).
- KHÔNG hardcode VND fallback (Rule per `RULES.md`).
- KHÔNG sử dụng English copy.

**Files**:

- `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` (orchestrator)
- `apps/mobile/components/customer/kael-chat/chat-bubble.tsx`
- `apps/mobile/components/customer/kael-chat/composer.tsx`
- `apps/mobile/components/customer/kael-chat/estimate-card.tsx`
- `apps/mobile/components/customer/kael-chat/photo-attach-button.tsx`
- `apps/mobile/lib/kael-chat-service.ts` (API wrapper around new endpoints)
- `apps/mobile/app/(customer)/kael-chat.tsx` (route file)

### 8.6 Mobile — Repurpose Book + Kael tabs (KEEP 5-tab layout)

**Tab layout KHÔNG thay đổi** (Tu locked 2026-05-20): vẫn giữ 5 tabs hiện tại `Home/Book/Kael/History/Profile`.

**Cleanup khi Phase 1 build xong**:

- DELETE `apps/mobile/components/client-price-check/client-price-check-flow.tsx` (replaced by KaelChatSurface logic).
- DELETE `apps/mobile/components/client-price-check/` dir sau cleanup.
- KEEP `apps/mobile/app/(customer)/booking.tsx` nhưng REPURPOSE:
  - Hiển thị "Quick entry" — title + 3 service cards (giống Home dưới gọn hơn).
  - Click service card → push `/(customer)/kael-chat?serviceType=...`.
  - Active deal banner nếu có (link to history).
  - Mục đích: tab này phục vụ user nào quen "Đặt lịch" entry.
- KEEP `apps/mobile/app/(customer)/kael.tsx` REPURPOSE:
  - Nếu có active chat session → resume button "Tiếp tục với Kael" → push to active KaelChatSurface.
  - Nếu chưa có → show 3 service card chips để start mới.
  - List recent sessions (last 5) cho user quay lại review estimate đã có.
  - KHÔNG còn là dumb keyword classifier nữa (M4 resolved).
- UPDATE `apps/mobile/app/(customer)/_layout.tsx`: 5 tabs giữ nguyên. Add new modal/stack `(customer)/kael-chat.tsx` ngoài tab bar cho full-screen chat experience.

**KaelChatSurface tồn tại như stack screen, KHÔNG phải tab** — push từ Home, Book, hoặc Kael tab. Đây là pattern Expo Router standard cho immersive flow.

### 8.7 Phase 1 Testing Plan

**Backend tests (Edge runtime focus)**:

- `apps/api/src/__tests__/unit/kael-chat-state-machine.test.ts` (NEW)
  - State transitions: collecting → analyzing → pricing → estimate_ready
  - Out-of-scope detection
  - Budget cap behavior
  - Photo attachment flow

- `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts` (EXTEND)
  - 3 new routes auth-guarded
  - Schema validation negative tests

- `apps/api/src/__tests__/integration/kael-chat-real-supabase.test.ts` (NEW)
  - Full chat flow against staging Supabase
  - Session persistence
  - Confirm → job creation atomic

**Frontend tests**:

- `packages/shared/src/__tests__/kael-chat-contract.test.ts` (NEW)
  - Schema parity shared ↔ Edge domain
  - Estimate card payload shape

- Mobile component tests: skip unless React Testing Library setup đã ổn. Visual verification thay thế.

**Verification commands**:

```powershell
# Type-check
corepack pnpm --filter @home-services/api exec tsc --noEmit
corepack pnpm --filter @home-services/shared exec tsc --noEmit
corepack pnpm --filter @home-services/mobile type-check

# Tests
corepack pnpm test                     # all
corepack pnpm --filter @home-services/api test -- kael-chat

# Build
corepack pnpm build

# Mobile preview
corepack pnpm --filter @home-services/mobile dev
# Visual: open /(customer)/home → click service card → chat opens
```

### 8.8 Phase 1 Definition of Done

- [ ] Migration apply staging + dry-run prod OK.
- [ ] All Edge endpoint tests pass.
- [ ] Integration test full chat → confirm → job created → broadcasting passes against staging.
- [ ] Mobile type-check clean.
- [ ] HomeScreen visual: 3 service cards click → KaelChatSurface mở với serviceType context.
- [ ] KaelChatSurface: photo upload works, Anthropic vision returns valid response, estimate card render.
- [ ] Confirm in chat creates job + broadcasts (visible in DB).
- [ ] No raw AI output visible to user.
- [ ] Price disclaimer present in mọi estimate render.
- [ ] No hardcoded VND in code.
- [ ] No PII in logs (grep verify).
- [ ] client-price-check-flow.tsx deleted (after Tu approval).
- [ ] booking.tsx + kael.tsx REPURPOSED per §8.6 (KHÔNG delete, vẫn giữ tab).
- [ ] customer-surfaces.tsx broke down (god-file H3 partial).
- [ ] All Vietnamese user-facing copy.

---

## 9. Phase 2 — Notification Wire-Up

**Goal**: Worker thực sự nhận push notification trên phone khi có broadcast. Customer nhận push khi có thợ accept hoặc khi job state đổi.

**Dependencies**: Phase 1 done. Phase 0.2 (Expo Push spike) done.

**Estimated effort**: 2-3 ngày.

### 9.1 Edge — Expo Push helper

**File mới**: `supabase/functions/mobile-api/_shared/push.ts`

**API**:

```typescript
export async function sendPushToUser(
  client: DbClient,
  userId: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;  // safe metadata: job_id, broadcast_id, event_type
    sound?: 'default' | null;
    badge?: number;
  },
): Promise<{ delivered: number; failed: number; errors: string[] }>;

export async function sendPushToUsers(
  client: DbClient,
  userIds: string[],
  payload: PushPayload,
): Promise<BulkPushResult>;
```

**Implementation**:

1. Query `device_push_tokens` where user_id IN userIds AND enabled = true AND permission_status = 'granted'.
2. Batch tokens (Expo Push allows 100/request).
3. POST to `https://exp.host/--/api/v2/push/send` với array of messages.
4. Handle response: log success/failure per token.
5. On `DeviceNotRegistered` error → disable token in DB (last_seen_at updated, enabled = false).
6. Timeout 10s per batch.

**Rate limit**: max 5 push/user/minute để prevent spam.

**PII rule**: title/body MUST NOT contain phone, full address, CCCD. OK to mention service_type, district label, "Có yêu cầu mới gần bạn".

**Verification**:

- Unit test mock Expo Push API response.
- Integration test on staging: register device token (mocked) → trigger push → verify response.

### 9.2 Wire createBroadcasts → notification + push

**File**: `supabase/functions/mobile-api/_shared/services.ts` `createBroadcasts` function

**Cần thêm sau dòng `if (result.error) return DB_ERROR`** (line ~1680):

```typescript
// After job_broadcasts insert success:
// 1. Insert notification rows for each broadcasted worker
const notifPromises = eligible.map(worker =>
  client.rpc('insert_notification_atomic', {
    p_user_id: worker.id,
    p_job_id: jobId,
    p_event_type: 'broadcast_received',
    p_title: 'Có yêu cầu mới',
    p_body: `${serviceLabel(serviceType)} • Khu vực ${districtLabel(district)}`,
    p_safe_metadata: { broadcast_id: rows[0].id /* per-worker if needed */, expires_at },
  })
);
await Promise.allSettled(notifPromises);

// 2. Send push notification (fire-and-forget)
sendPushToUsers(
  client,
  eligible.map(w => w.id),
  {
    title: 'Có yêu cầu mới gần bạn',
    body: `${serviceLabel(serviceType)} • ${districtLabel(district)}`,
    data: {
      event_type: 'broadcast_received',
      job_id: jobId,
      deep_link: `/(worker)/jobs?broadcast_id=${rows[0].id}`,
    },
    sound: 'default',
  },
).catch(err => console.warn('push failed', { jobId, errorCode: err.code }));
```

**Notes**:

- Notification insert phải success — log if fail.
- Push delivery fire-and-forget — không block business path nếu Expo Push down.
- Mỗi worker có notification riêng (per-worker broadcast_id stored in metadata).

### 9.3 Wire worker accept → push customer

**File**: `services.ts` `acceptBroadcast` function (line ~625)

**Sau dòng `await logJobEvent(...'worker_accepted'...)` (line ~644)**:

```typescript
// Notify customer "Đã có thợ"
const customerLookup = await dbQuery<{ customer_id: string }>(
  client.from('jobs').select('customer_id').eq('id', jobId).single()
);
if (customerLookup.data?.customer_id) {
  await client.rpc('insert_notification_atomic', {
    p_user_id: customerLookup.data.customer_id,
    p_job_id: jobId,
    p_event_type: 'worker_matched',
    p_title: 'Đã có thợ nhận việc',
    p_body: 'Thợ đang chuẩn bị, bạn có thể theo dõi trong Hoạt động.',
    p_safe_metadata: { worker_id: ctx.user.id },
  });
  sendPushToUser(client, customerLookup.data.customer_id, {
    title: 'Đã có thợ nhận việc',
    body: 'Thợ đang chuẩn bị đến.',
    data: { event_type: 'worker_matched', job_id: jobId, deep_link: `/(customer)/history?job_id=${jobId}` },
    sound: 'default',
  }).catch(err => console.warn('push customer failed', { jobId, errorCode: err.code }));
}
```

**Tương tự cần thêm push cho**:

- `updateJobStatus`: worker_on_way, arrived, completed_by_worker → push customer
- `requestScopeChange`: → push customer (HIGH PRIORITY — đây là moment cần hard-stop, push BÁO ngay)
- `decideScopeChange`: → push worker
- Trong Phase 3: worker cancel + Kael re-match → push customer + new worker

### 9.4 Mobile — Expo Notifications client

**File mới**: `apps/mobile/lib/push-notifications.ts`

**API**:

```typescript
export async function setupPushNotifications(): Promise<{
  granted: boolean;
  token: string | null;
}>;

export function attachNotificationHandlers(router: ExpoRouter): () => void;
```

**Implementation**:

```typescript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { notificationService } from './services';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupPushNotifications() {
  if (!Device.isDevice) return { granted: false, token: null };
  
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') return { granted: false, token: null };
  
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  
  await notificationService.registerDeviceToken({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    push_token: tokenData.data,
    permission_status: 'granted',
    safe_metadata: {},
  });
  
  return { granted: true, token: tokenData.data };
}
```

**Permission ask timing**:

- Customer: sau khi đăng nhập thành công (trong AuthProvider effect).
- Worker: trước khi tap "Bật nhận việc" (availability toggle) — modal explain "Cần permission notification để nhận yêu cầu mới".

### 9.5 Mobile — Deep link from notification

**Setup**:

- `Notifications.addNotificationResponseReceivedListener` trong `_layout.tsx` root.
- Read `notification.request.content.data.deep_link`.
- Call `router.push(deepLink)`.

**Routes cần support deep link**:

- `/(worker)/jobs?broadcast_id=...` → open IncomingRequestSheet auto-focused
- `/(customer)/history?job_id=...` → open history with that job highlighted
- `/(customer)/history?scope_change=...` → open scope change hard-stop modal (Phase 4)

### 9.6 Phase 2 Tests

- Unit tests for `sendPushToUser` — mock Expo Push API.
- Integration test on staging: register fake token → trigger broadcast → assert Expo Push API was called.
- Mobile manual test: real device, real broadcast → push appears.

### 9.7 Phase 2 Definition of Done

- [ ] Expo Push helper unit tested.
- [ ] createBroadcasts wires notification + push.
- [ ] acceptBroadcast wires customer push.
- [ ] Mobile setupPushNotifications called on login.
- [ ] Deep links work for both worker and customer routes.
- [ ] Manual test: worker phone receives push when broadcast.
- [ ] Manual test: customer phone receives push when worker accepts.
- [ ] No PII in push payload (grep verify push.ts).
- [ ] Rate limit enforced (max 5 push/user/min).

---

## 10. Phase 3 — Auto Worker Cancellation + Geo Match

**Goal**: Worker hủy → Kael ngay lập tức tìm thợ thay thế nearest + most-specialized + push notification.

**Dependencies**: Phase 1, Phase 2 done. Phase 0.1 geo spike done.

**Estimated effort**: 3-4 ngày.

### 10.1 Migration — Geo + specialization fields

**File**: `supabase/migrations/YYYYMMDDHHMMSS_geo_and_specialization.sql`

```sql
-- Geo on jobs
alter table public.jobs
  add column if not exists address_lat double precision,
  add column if not exists address_lng double precision,
  add column if not exists geo_source text check (geo_source in ('google_maps', 'manual', 'fallback'));

-- Geo + specialization on worker_profiles
alter table public.worker_profiles
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision,
  add column if not exists service_radius_km int default 8 check (service_radius_km between 1 and 30),
  add column if not exists problem_specializations text[] not null default '{}'::text[];

-- Index cho geo query (sẽ dùng PostGIS hoặc cube — chốt sau spike)
-- Phase 0 fallback: simple haversine via SQL function

create or replace function public.distance_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 6371 * acos(
    cos(radians(lat1)) * cos(radians(lat2)) *
    cos(radians(lng2) - radians(lng1)) +
    sin(radians(lat1)) * sin(radians(lat2))
  );
$$;
```

**Notes**:

- lat/lng NULL allowed cho jobs cũ trước migration.
- `geo_source = 'fallback'` khi Maps API fail → fall back to district matching.
- `service_radius_km` default 8 (covers HCMC central districts).
- `problem_specializations` empty array = worker generalist; non-empty = focused.

### 10.2 Migration — Worker cancellation auto + rate limit (historical; penalty/suspend superseded)

**File**: `supabase/migrations/YYYYMMDDHHMMSS_worker_cancellation_auto.sql`

Update `request_worker_cancellation_atomic`:

```sql
-- New version:
-- 1. Verify worker owns job
-- 2. Check status valid (worker_matched..scope_change_pending)
-- 3. Check rate limit:
--    select count(*) from worker_cancellation_requests
--    where worker_id = p_worker_id and status = 'approved'
--      and created_at > now() - interval '24 hours' → must < 2
-- 4. Insert cancellation request với status = 'approved' (auto)
-- 5. Update jobs.status from current → 'broadcasting' (reset to find new worker)
--    Also clear jobs.worker_id, jobs.matched_at, jobs.arrived_at (etc.)
-- 6. Decrement worker rating by 0.1 (floor at 0)
-- 7. SUPERSEDED 2026-05-30: do not auto-suspend or apply rating penalty
--    without renewed Tu approval.
-- 8. Return previous worker_id + service_type + district + lat/lng + problem_slug
--    (cho Edge findNextBestWorker dùng)
```

**Atomicity là critical**: tất cả phải trong 1 transaction. Nếu fail giữa chừng → rollback hoàn toàn.

### 10.3 Edge — findNextBestWorker helper

**File**: `supabase/functions/mobile-api/_shared/matching.ts` (NEW)

**API**:

```typescript
export type MatchCriteria = {
  serviceType: ServiceType;
  problemSlug?: string;
  districtSlug?: DistrictSlug;
  addressLat?: number;
  addressLng?: number;
  excludeWorkerIds: string[];
  limit?: number;  // default 5
};

export type WorkerCandidate = {
  worker_id: string;
  rating: number;
  total_jobs: number;
  distance_km: number | null;
  specialization_match: boolean;
  score: number;  // composite ranking
};

export async function findNextBestWorker(
  client: DbClient,
  criteria: MatchCriteria,
): Promise<WorkerCandidate[]>;
```

**Algorithm**:

```
Step 1: Candidate pool query
  - is_approved = true
  - is_available = true
  - is_suspended = false
  - service_types contains serviceType
  - NOT IN excludeWorkerIds
  - districts contains districtSlug OR contains 'hcmc_all'

Step 2: Filter busy workers (same as queryEligibleWorkers)
  - Exclude workers with active jobs

Step 3: Compute scores
  - distance_km = NULL if no lat/lng, else public.distance_km(...)
  - specialization_match = problemSlug IN worker.problem_specializations
  - score = composite:
      base = rating * 10 (0-50)
      + specialization_match ? 20 : 0
      + (distance bonus: max 0 when in radius, penalty when over):
          if distance_km is null or <= service_radius_km: 0
          else: -(distance_km - service_radius_km) * 2
  - Sort score DESC, then rating DESC, then total_jobs DESC

Step 4: Return top N
```

**Fallback path**:

- Nếu address_lat/lng NULL (job cũ hoặc geo_source='fallback') → bỏ qua distance scoring, dùng district match only.
- Nếu problem_specializations empty cho all candidates → bỏ qua specialization scoring.

**Verification**:

- Unit tests: scoring function với mock candidates.
- Integration test: real workers with varying lat/lng → assert ranking đúng.

### 10.4 Edge — Wire auto re-match

**File**: `services.ts` `requestWorkerCancellation`

**Refactor**:

```
1. Call request_worker_cancellation_atomic RPC (now auto-approves)
   → Returns: cancellation_id, previous_worker_id, service_type, district, lat/lng, problem_slug
2. Call findNextBestWorker với excludeWorkerIds = [previous_worker_id]
3. If candidates.length === 0:
   - Log job_event 'no_replacement_worker_found'
   - Push customer: "Chưa tìm được thợ thay thế. Đội vận hành sẽ liên hệ."
   - Return success but with replacement_found=false
4. Else:
   - createBroadcasts(jobId, serviceType, district, { excludeWorkerIds, candidates: top 5 })
   - Push customer: "Đang tìm thợ thay thế."
   - Push new worker(s): broadcast notification
   - Return success with replacement_found=true, broadcast_count
5. Log all events to job_events table
```

**Remove**: admin decideWorkerCancellation endpoint deprecated (KHÔNG xóa code, mark deprecated trong comment + return 410 GONE để admin app cũ KHÔNG break). Migrate trong Phase 5.

### 10.5 Mobile — Address autocomplete

**File mới**: `apps/mobile/components/customer/address-autocomplete.tsx`

**Library**: `react-native-google-places-autocomplete` (decision sau spike).

**Behavior**:

- Customer typing → Google Places suggestions (HCMC bounding box).
- Tap suggestion → reverse geocode → lat/lng + structured address.
- Send to backend lat/lng + raw text + district detected.

**Usage**: trong KaelChatSurface, khi Kael ask address (1 turn cụ thể).

**Privacy**: lat/lng stored on jobs row, NEVER log, NEVER send to LLM. Customer profile có thể lưu home lat/lng cho convenience.

**Worker side**: trong WorkerVerificationForm thêm "Chọn khu vực phục vụ" — picker map với pin marker + radius slider.

### 10.6 Backend — Geocoding on job create

**File**: `kael-chat.ts` confirm handler

**Logic**:

- Khi confirm session → create job → geocode address text qua Google Maps Geocoding API server-side.
- Lưu lat/lng + geo_source='google_maps'.
- Nếu API fail / no result → geo_source='fallback', lat/lng NULL → matching falls back to district.

**Env var mới**: `GOOGLE_MAPS_API_KEY` (server-side only, KHÔNG bao giờ bundle vào Mobile).

### 10.7 Phase 3 Tests

- Unit: distance function correctness (compare with online calculator for HCMC pairs).
- Unit: findNextBestWorker scoring với edge cases (no lat/lng, no specializations, single candidate).
- Integration: full flow worker cancel → next match → broadcast → push.
- Rate limit test: worker cancel 3 lần trong 24h → third fails.
- Auto-suspend test: SUPERSEDED by P11; no autonomous suspension without admin review/Tu approval.

### 10.8 Phase 3 Definition of Done

- [ ] Geo migration applied staging + dry-run prod OK.
- [ ] findNextBestWorker tested with realistic data.
- [ ] Auto cancellation flow works end-to-end on staging.
- [ ] Worker rating decreases on cancel. SUPERSEDED by later Tu direction; do not implement without renewed approval.
- [ ] Rate limit enforced.
- [ ] Auto-suspend triggers correctly. SUPERSEDED by P11; no autonomous suspension.
- [ ] Customer + new worker receive correct push notifications.
- [ ] No PII in geo logs.
- [ ] Address autocomplete UI works.
- [ ] Google Maps API key in env, not bundled mobile.

---

## 11. Phase 4 — Critical Bug Fixes (Parallel)

**Mục tiêu**: Sửa các bug critical từ audit. Build PARALLEL với Phase 1-3, không block phases khác.

**Estimated effort**: 2 ngày toàn bộ.

### 11.1 C1 — A11 Scope change hard-stop modal

**File mới**: `apps/mobile/components/customer/scope-change-modal/scope-change-modal.tsx`

**Trigger**: 

- Khi customer mở app và current job có scope change pending → modal force-shown.
- Push notification deep link mở thẳng modal.

**Anatomy** (theo `STRUCTURES.md §A11` + `design.md §22`):

```
┌────────────────────────────────────┐
│ Bottom sheet (full-screen mobile)  │
│                                    │
│  ⚠ Thợ muốn thay đổi phạm vi      │
│                                    │
│  Phạm vi cũ                        │
│  ─────────────────                 │
│  Ổ cắm hỏng • 250-450k             │
│                                    │
│  Phạm vi mới                       │
│  ─────────────────                 │
│  {worker description}              │
│  {new price range}                 │
│                                    │
│  Lý do                             │
│  ─────────────────                 │
│  {worker reason}                   │
│                                    │
│  Kael giải thích                   │
│  ─────────────────                 │
│  {Kael analysis of why this is reasonable / not}
│                                    │
│  [Từ chối]      [Duyệt]            │
└────────────────────────────────────┘
```

**Behavior**:

- Bottom sheet không thể swipe dismiss — phải tap 1 trong 2 button.
- Tap "Từ chối" → confirm sub-modal "Hủy việc luôn?" (per migration 20260518181500 logic).
- Tap "Duyệt" → confirm sub-modal "Cho thợ tiếp tục với giá mới?".
- Loading state khi backend call.

**Backend side**:

- Add Kael explanation generation trong `request_scope_change_atomic` (Edge service):
  - Compare new vs old via Kael (single Anthropic call).
  - Save explanation trong scope_change_requests.kael_review JSONB.
- Frontend fetch explanation khi mở modal.

**Push trigger**: scope change request → push customer immediately (Phase 2 wire).

**Verification**:

- Manual: worker request scope change → customer phone push → tap → modal appears.
- Cannot bypass modal without decision.

### 11.2 C2 — Worker earnings paid_at bug

**File**: `supabase/functions/mobile-api/_shared/services.ts` `getWorkerEarnings` (line 1487-1543)

**Fix**:

```typescript
// Change query: SELECT additionally `paid_at`
let query = db(ctx)
  .from('jobs')
  .select('id, status, final_price, paid_at, created_at')
  // ... same filters

// In loop: use paid_at IS NOT NULL to determine actually-paid
for (const row of rows) {
  const price = nullableNumber(row.final_price) ?? 0;
  if (row.paid_at && row.status !== 'cancelled') {
    gross += price;
    paidCount++;
  } else if (
    row.status === 'confirmed_by_customer' ||
    row.status === 'payment_pending' ||
    row.status === 'reviewed'
  ) {
    pendingAmount += price;
    pendingCount++;
  }
}
```

**Test**: unit test `earnings.test.ts` cho case "reviewed after paid" → assert gross_earnings includes the price.

### 11.3 C6 — scope_change_reject migration to production

**Action**:

- Verify migration `20260518181500_scope_change_reject_cancels_job.sql` is in expected production pending chain.
- Follow `docs/ops/production-migration-checklist.md` procedure exactly.
- Apply only with Tu explicit approval + DB password + management token.
- Post-apply: run security advisors + RLS harness 29/29.

**KHÔNG bắt đầu Phase 1-3 prod migrations trước khi C6 done** — otherwise nested pending chain confusing.

### 11.4 M1 — Vietnamese copy consistency

**Action**: grep sweep + fix

```powershell
# Find "Worker" in Vietnamese error strings:
Select-String -Path "supabase/functions/**/*.ts","apps/mobile/**/*.tsx","apps/api/src/**/*.ts" -Pattern '"[^"]*\bWorker\b[^"]*"'

# Find English in user-facing toast/Alert calls:
Select-String -Path "apps/mobile/**/*.tsx" -Pattern 'Alert\.alert\("[A-Z][a-z]+ ?[A-Z][a-z]+"'
```

**Fix list (known so far)**:

- `services.ts:1163`: "Worker chưa nhập giá cuối cùng" → "Thợ chưa nhập giá cuối cùng"
- (Apply unmerged branch `codex/glass-motion-ui-enhancement` changes for this)

### 11.5 Phase 4 DoD

- [ ] Scope change modal hard-stop pattern works (Mobile + backend explanation).
- [ ] Worker earnings test "paid then reviewed" passes.
- [ ] Migration scope_change_reject applied prod (per checklist).
- [ ] Grep sweep VN copy returns 0 leak.
- [ ] All tests still pass.

---

## 12. Phase 5 — Supporting Work

**Goal**: Build các piece không block core workflow nhưng cần cho production-ready.

**Estimated effort**: 1-2 tuần.

### 12.1 Customer signup screen

**Files**:

- `apps/mobile/app/(auth)/signup.tsx` (NEW route)
- `apps/mobile/components/auth/signup-surface.tsx` (NEW)
- `apps/mobile/components/auth/auth-surfaces.tsx` (UPDATE Login → add "Đăng ký" link)

**Flow**:

1. Email + password + name + phone (optional Phase 0, required Phase 1 OTP).
2. Apartment profile: district picker + building name + unit + floor.
3. supabase.auth.signUp() → triggers `handle_new_user()` → role='customer' auto.
4. After signup → set address profile via INSERT customer_profiles.
5. Redirect to Home.

**Verification**: signup creates auth user + profiles + customer_profiles row.

### 12.2 Worker self-onboard (server-controlled role)

**Per `docs/ops/worker-onboarding.md` Option 2 (two-step)**:

**Migration**:

```sql
create table public.worker_signup_intents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles on delete cascade not null,
  status          text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected'
  )),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  admin_note      text,
  unique (user_id)
);
```

**Edge route mới**: `POST /workers/signup-intent`

- Authenticated customer click "Đăng ký làm thợ".
- Insert intent row.
- Admin reviews + approves (via Phase 5.3 admin panel).
- Admin approve → trigger function flips profiles.role = 'worker'.
- Worker now can submit verification form.

**Mobile**: ProfileSurface có "Đăng ký làm thợ" button cho customer role.

### 12.3 Backend chat customer↔worker

**Goal**: M5 — `chat_messages` table có nhưng chưa wire send/list.

**Edge routes mới**:

- `POST /jobs/:id/messages` (send)
- `GET /jobs/:id/messages` (list)

**RLS**: only customer + worker of job can read/write. Kael relay for system messages.

**Mobile**: integrate `WorkerChatContent` + customer side với real backend.

### 12.4 Phase 5 DoD

- [ ] Customer signup works end-to-end.
- [ ] Worker signup-intent → admin approve role flip (via Supabase Studio) → verification form works.
- [ ] Chat messages persist + relay (customer ↔ worker through Kael relay pattern).

**Note**: Admin actions trong Phase 5 (approve worker signup intent, view AI logs, edit baselines, view cancellation patterns) thực hiện DIRECT trên Supabase Studio. KHÔNG build admin web app. Tu locked decision 2026-05-20: defer admin panel hoàn toàn — không nằm trong scope plan này.

---

## 13. Phase 6 — Defer (sau khi core ổn)

KHÔNG build trong scope hiện tại. Document để future agent biết:

### 13.1 Kael Learning port to Edge

- Port `apps/api/src/lib/learning/` qua `supabase/functions/mobile-api/_shared/learning/`.
- Wire MarketMemory.observe() vào confirm completion path.
- Wire CaseReview.evaluate() vào review path.
- Apply learning rules trong `fetchBaseline` (Edge).
- Env flags `LEARNING_ENABLED`, `LEARNING_AUTOPROMOTE_ENABLED`.

### 13.2 Migration cleanup

- Move duplicate-named migrations vào archive folder.
- Document migration chain trong `docs/ops/`.
- KHÔNG edit applied migration history.

### 13.3 Split mobile god-files

- Continue split started in Phase 1: worker-surfaces.tsx (2192L) → workers-home, workers-jobs, workers-chat, etc.

### 13.4 Test rebalance

- Migrate test focus từ apps/api → Edge runtime.
- Goal: integration coverage Edge > unit coverage Next.js (currently inverted).

---

## 14. Cross-cutting Quality Gates

### 14.1 Every phase MUST pass these gates trước khi merge:

- [ ] Type-check all packages clean.
- [ ] All relevant tests pass.
- [ ] `corepack pnpm lint` clean.
- [ ] `corepack pnpm build` clean.
- [ ] `kael-review` protocol (`critical.md §8`) output present.
- [ ] No new `// TODO` or `// FIXME` without owner.
- [ ] No console.log left (use console.warn/error với safe metadata only).
- [ ] Vietnamese user-facing copy.
- [ ] No raw AI output to UI.
- [ ] No hardcoded VND.
- [ ] No PII in logs (grep verify phone, CCCD pattern).
- [ ] No secret in client bundle (grep verify env keys not in apps/mobile).
- [ ] No client-side AI provider call.

### 14.2 Rule references

Every change MUST comply with:

- `RULES.md #1` (secrets server-side only)
- `RULES.md #2` (centralized AI wrapper)
- `RULES.md #3` (validate AI output)
- `RULES.md #4` (price disclaimer)
- `RULES.md #5` (Vietnamese first)
- `RULES.md #6` (Kael scope điện/nước/vệ sinh)
- `RULES.md #7` (no autonomous money action without user confirm — **note**: D5 auto re-match KHÔNG vi phạm vì customer đã confirm initial booking; re-match là continuation, không phải new booking)
- `RULES.md #8` (no fake data / silent degrade)
- `RULES.md #9` (no PII in logs)
- `RULES.md #10` (timeout + retry on every network call)

---

## 15. Anti-Patterns to Avoid

KHÔNG được làm khi build plan này:

### 15.1 Scope creep
- KHÔNG mở rộng service categories beyond 3.
- KHÔNG add new features không liệt kê trong plan.
- KHÔNG refactor unrelated code "while you're there".

### 15.2 Architecture violations
- KHÔNG import provider SDK trực tiếp (Anthropic, Perplexity, DeepSeek) ở routes.
- KHÔNG call AI từ client.
- KHÔNG bypass `requireJobAccess` helper khi đụng job data.
- KHÔNG insert vào jobs table mà không qua state machine validation.
- KHÔNG xóa applied migration history.

### 15.3 Test theater
- KHÔNG add tests "just for coverage" mà không assert real behavior.
- KHÔNG mock real Edge runtime contracts (use integration tests against staging).
- KHÔNG claim "tests pass" khi build fail.

### 15.4 Silent degrade
- KHÔNG return fake estimate khi Kael providers all fail (use baseline fallback + mark fallbackUsed=true).
- KHÔNG hide push delivery failures from logs.
- KHÔNG mark job "success" khi any side-effect (notification, push) silently failed without log.

### 15.5 PII leak
- KHÔNG log phone, CCCD, full address, bank account.
- KHÔNG send raw user description to LLM without `scrubSensitiveForLLM`.
- KHÔNG include PII in push notification body (use generic title/body).

### 15.6 UI defaults
- KHÔNG dùng English copy user-facing.
- KHÔNG xài purple/blue AI SaaS gradients trong Kael chat.
- KHÔNG dùng glassmorphism cho repeated rows hoặc dense content (per `docs/design/production-glass-motion-contract.md`).
- KHÔNG add decorative auto-loop motion.
- KHÔNG fabricate worker info, prices, ratings, queue counts.

### 15.7 God-files
- KHÔNG để file mới > 800 lines.
- Mỗi file 1 responsibility chính.
- Split khi 3+ inner components.

---

## 16. Audit Checklist (cho Claude review sau khi Codex build)

Claude (tôi) sẽ chạy checklist này sau mỗi phase. Codex KHÔNG ngại check trước khi mark phase done.

### 16.1 Per-phase

**Phase 1 audit**:

- [ ] `kael_chat_sessions` + `kael_chat_turns` tables exist trong staging.
- [ ] RLS test: customer A không đọc được session của customer B.
- [ ] `POST /kael/chat` accepts text + media_refs, returns valid turn.
- [ ] Anthropic vision messages include image URL when media_refs present (grep `kael-chat.ts` cho image type).
- [ ] Session cost tracked accurately (test 1 chat → check kael_chat_sessions.total_cost_usd).
- [ ] `POST /kael/chat/:id/confirm` creates job atomically.
- [ ] HomeScreen show 3 service cards, không có search pill cũ.
- [ ] Click service card → KaelChatSurface mở với serviceType pre-set.
- [ ] KaelChatSurface: photo upload visible, sends to backend.
- [ ] EstimateCard render với đầy đủ disclaimer + advice slot + 2 buttons.
- [ ] Confirm button → loading → success → navigate to history.
- [ ] No raw AI output (grep test: any Kael bubble text passes schema validation).
- [ ] booking.tsx + client-price-check-flow.tsx deleted.
- [ ] customer-surfaces.tsx broken into sub-files.

**Phase 2 audit**:

- [ ] `sendPushToUser` exists trong push.ts, batches by 100.
- [ ] createBroadcasts inserts notification rows for each worker.
- [ ] createBroadcasts calls sendPushToUsers.
- [ ] acceptBroadcast calls sendPushToUser cho customer.
- [ ] Mobile registers device push token after login.
- [ ] Deep link `/worker/jobs?broadcast_id=...` works.
- [ ] Manual: real device receives push when broadcast (test on staging).

**Phase 3 audit**:

- [ ] Geo migration applied, lat/lng columns exist.
- [ ] distance_km() function returns correct values (test với HCMC coordinates).
- [ ] findNextBestWorker returns ranked candidates.
- [ ] requestWorkerCancellation auto-approves (no admin step).
- [ ] Worker rating decremented after cancel. SUPERSEDED by later Tu direction; do not implement without renewed approval.
- [ ] Rate limit: 3rd cancel in 24h returns INVALID_STATUS.
- [ ] Auto-suspend: SUPERSEDED by P11; admin review required before suspension.
- [ ] Re-broadcast push delivered to new worker + customer.
- [ ] Geocoding fallback: address with no Maps result → geo_source='fallback', match still works via district.

**Phase 4 audit**:

- [ ] Scope change modal renders với old vs new comparison + Kael explanation.
- [ ] Cannot dismiss modal without decision.
- [ ] Worker earnings test "paid then reviewed" passes.
- [ ] Migration scope_change_reject applied prod (advisors clean, harness 29/29).
- [ ] No "Worker" English in VN error strings.

**Phase 5 audit**: (cover sau khi build)

### 16.2 Final audit

Sau khi tất cả phase 1-4 done:

- [ ] End-to-end: customer fresh signup → home → click service → Kael chat → upload photo → estimate → confirm → broadcast → worker push → accept → arrived → repairing → complete → customer confirm → review.
- [ ] End-to-end: worker cancel mid-job → push customer → Kael picks new worker → new push → new worker accept → continue.
- [ ] Performance: chat first response < 5s, estimate generation < 15s, push delivery < 5s.
- [ ] Cost: session total typically < $0.15.
- [ ] Security: no PII leak grep, no secret in mobile bundle, RLS harness pass.
- [ ] Production migration history clean.
- [ ] All Phase 1-4 tests pass on staging + local.

---

## 17. Quality Improvement Estimate

Plan này giảm các issue audit:

| Issue category | Before | After plan | Improvement |
|---|---|---|---|
| C1-C6 critical bugs | 6 known | 5 fixed (C5 defer) | ✓ |
| H1 state machine divergence | 3 versions | 1 source (with documented mobile subset) | ✓ |
| H2 contract duplication | manual sync | tested parity | ✓ |
| H3 god-files (mobile) | 3 files > 2000L | 0 files > 800L | ✓ |
| H4 test coverage skew | 35 reference / 3 runtime | 35 reference / 15+ runtime | ✓ |
| H5 service-role ad-hoc | inline pattern | unified helper | ✓ |
| H6 migration chaos | 4 duplicate pairs | documented + cleanup deferred | ⚠ partial |
| H7 photos useless | text-only | Anthropic vision wired | ✓ |
| C3 dead Kael learning | not running | still defer Phase 6 | ⚠ planned |
| M1-M8 medium | mix | most addressed | ✓ |

Net effect: ngữ cảnh đúng (Tu's intent → workflow), quality code tăng (split god-files, eliminate dead paths, wire-up dead infrastructure, unify patterns).

---

## 18. Execution Notes for Codex

Codex agent thực hiện plan này:

1. Đọc Activation Protocol (§0) trước mỗi phase.
2. Hỏi Tu nếu phase có ambiguity. Plan đã cố gắng cover nhưng có thể gap.
3. Run Phase 0 SPIKE trước phase 1. Phase 0 output là decision document, không phải code.
4. Mỗi phase: kael-preflight → implement → kael-review → mark DoD.
5. Tu approve mỗi phase trước khi merge sang main.
6. Claude (audit role) sẽ check theo §16 sau mỗi phase.
7. Nếu gặp blocker: STOP, report. KHÔNG self-extend scope.
8. Commit messages theo project convention (xem git log).

---

## 19. Locked Decisions (Tu confirmed 2026-05-20)

Mọi quyết định dưới đây Tu đã lock — Codex KHÔNG hỏi lại, KHÔNG đổi:

1. **Geo API**: Google Maps Geocoding chính thức. Free tier $200/m cho Phase 0. Nếu vượt → tạm dừng + Tu approve trước khi bật paid.
2. **Push provider**: Expo Push Service chính thức.
3. **Tab layout customer**: GIỮ NGUYÊN 5 tabs hiện tại `Home/Book/Kael/History/Profile`. Repurpose Book + Kael per §8.6. KaelChatSurface là stack screen (ngoài tab bar), KHÔNG phải tab mới.
4. **Admin panel**: DEFER hoàn toàn — không build admin web app trong plan này. Admin actions dùng Supabase Studio direct. Khi nào core ổn + có user thật mới revisit.
5. **Phase ordering**: Phase 1 → 2 → 3 sequential. Phase 4 (critical bug fixes) PARALLEL với Phase 1-3. Phase 5 sau khi 1-4 done.
6. **Customer signup priority**: nằm trong Phase 5. KHÔNG nâng lên Phase 4 — bởi pre-revenue scale admin curate được. Khi launch thực sẽ cần, nhưng Phase 1-4 ưu tiên Kael-first flow + worker auto re-match.
7. **AGENTS.md unmerged**: merge `codex/glass-motion-ui-enhancement` branch vào main trước khi Codex bắt đầu Phase 0 spike. Sau merge → update §3 hierarchy thêm AGENTS.md vào ranking (đề xuất: ngay dưới design.md, trên STRUCTURES.md vì AGENTS.md về operating rules cụ thể hơn).

Nếu Codex phát hiện ambiguity trong plan, STOP và ask Tu — KHÔNG self-decide.

---

## 20. Closing

Plan này là execution contract. Mỗi item trong DoD phải verify thực sự (run command, check DB row, manual test) — KHÔNG mark done dựa trên "looks good".

Tu approve plan → Codex bắt đầu Phase 0 spikes → Claude audit progressively.

---

## 21. Bổ sung — Audit Log + Gap Tracker

Section này append sau mỗi pass implementation. KHÔNG edit §1-20 (Plan core là contract, audit log là addendum). Mỗi entry phải có ngày, mission rõ, evidence file:line.

---

### 21.1 — Audit 2026-05-21 (Codex PR#23 pass 1)

**Ngày**: 2026-05-21
**Auditor**: Claude (audit role)
**Builder**: Codex
**Source branch**: `codex/glass-motion-ui-enhancement`
**PR đã merge**: [#23 Enhance PR20 frontend Kael and worker surfaces](https://github.com/manhtu0407/HomeServices-/pull/23) → main commit `b1b86c0`
**Codex commits chính**: `778d622` (UI surface enhancement) + `ccc1d10` (memory + React Doctor fix)

**Mission audit**: Verify Plan §16 checklist Phase 0 → 4 trên main + tất cả branch push được. Báo cáo gap theo file path + line ref. KHÔNG edit code.

**Kết luận**: ❌ **Codex pass 1 CHƯA completed Plan.md**. PR#23 = UI cosmetic enhancement (scope KHÁC Plan.md), không phải Phase 1 execution.

---

#### 21.1.A — Cái Codex ĐÃ làm (PR#23 actual delivery)

4 files touched, +888/-144 lines:

| File | Δ | Nội dung |
|---|---|---|
| `apps/mobile/components/customer/customer-surfaces.tsx` | +640 | "Kael Command Home" + "Service Intake Assistant Hub" copy (VN+EN), 4 shortcut rows, KaelMascot variants. **God-file size: 2626L → ~3266L** |
| `apps/mobile/components/worker/worker-surfaces.tsx` | +314 | "JobRoom" concept rename worker chat, `WorkerReadinessPanel`, `WorkerJobsJobRoomEntry`, fix `workerChatDealKey` leak. **God-file size: 2192L → ~2506L** |
| `packages/shared/src/__tests__/mobile-wiring.test.ts` | +57 | Test markers cho UI mới (jobroom-kael-handoff, readiness-panel, kael-command-home) |
| `MEMORY.md` | +21 | Codex's own session notes về PR#23 |

Codex's MEMORY entry PR#23 (line 7) tự ghi:
> "Scope intentionally staged for PR #23: `customer-surfaces.tsx`, `worker-surfaces.tsx`, and `mobile-wiring.test.ts`. The workspace still contains many **unrelated dirty** API/Supabase/shared changes; do not revert them and do not stage them into frontend-only PRs unless Tu explicitly asks."

**Codex MEMORY KHÔNG nhắc đọc Plan.md** trước khi build (vi phạm §0 Activation Protocol).

---

#### 21.1.B — Gap Tracker per phase (chưa có)

##### Phase 0 — Research SPIKES

| Deliverable | Status | File path |
|---|---|---|
| Geo data spike | ❌ KHÔNG TỒN TẠI | `docs/foundation/geo-data-spike.md` |
| Expo Push spike | ❌ KHÔNG TỒN TẠI | `docs/foundation/expo-push-spike.md` |

Plan §6 cấm Phase 1-3 bắt đầu trước khi 2 spike có output. Codex bỏ qua.

##### Phase 1.0 — Pre-work

| Deliverable | Status |
|---|---|
| Sync shared ↔ Edge domain contracts (§7.1) | ❌ `domain.ts` + `constants.ts` không đổi |
| `packages/shared/src/__tests__/contracts-parity.test.ts` | ❌ KHÔNG TỒN TẠI |
| `supabase/functions/mobile-api/_shared/access.ts` (`requireJobAccess` helper, §7.2) | ❌ KHÔNG TỒN TẠI |
| State machine alignment comment + assertion test (§7.3) | ❌ `mobile-workflow.ts` không đổi phần này |

##### Phase 1 — Kael-First Workflow

| Deliverable | Status | Evidence |
|---|---|---|
| Migration `kael_chat_sessions` + `kael_chat_turns` + RLS + RPC `confirm_kael_chat_atomic` | ❌ | Migration mới nhất `20260519145538_fix_vietnamese_catalog_labels.sql`; KHÔNG có migration nào dated 2026-05-2x |
| `supabase/functions/mobile-api/_shared/kael-chat.ts` (multi-turn state machine) | ❌ | KHÔNG TỒN TẠI |
| `POST /kael/chat` + `GET /kael/chat/:id` + `POST /kael/chat/:id/confirm` trong router | ❌ | router.ts unchanged |
| Anthropic vision message format với image type (fix C3) | ❌ | `kael.ts:971-991` `buildVisionMessages` vẫn text-only — KHÔNG có `{ type: 'image', source: { type: 'url', url } }` |
| Mobile `HomeScreen` refactor (3 service cards click → KaelChatSurface) | ⚠️ | Codex thêm copy "Mở Kael" nhưng vẫn route `openBookingPath`; service cards CHƯA wire tới Kael chat |
| `apps/mobile/components/customer/kael-chat/` directory | ❌ | KHÔNG TỒN TẠI |
| `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` (NEW stack screen) | ❌ | KHÔNG TỒN TẠI |
| `apps/mobile/components/customer/kael-chat/chat-bubble.tsx` + `composer.tsx` + `estimate-card.tsx` + `photo-attach-button.tsx` | ❌ | KHÔNG TỒN TẠI |
| `apps/mobile/lib/kael-chat-service.ts` (API wrapper) | ❌ | KHÔNG TỒN TẠI |
| `apps/mobile/app/(customer)/kael-chat.tsx` (route file, stack screen) | ❌ | KHÔNG TỒN TẠI |
| DELETE `apps/mobile/components/client-price-check/client-price-check-flow.tsx` | ❌ | **VẪN TỒN TẠI** (2337L god-file vẫn còn) |
| Repurpose `booking.tsx` (Quick entry với 3 service cards) per §8.6 | ⚠️ | Copy đổi, nhưng vẫn dùng `ClientPriceCheckFlow` cũ |
| Repurpose `kael.tsx` (resume button + recent sessions) per §8.6 | ⚠️ | Chỉ thêm copy, không có recent sessions list, vẫn keyword classifier cũ |
| Tests `kael-chat-state-machine.test.ts`, `kael-chat-real-supabase.test.ts`, `kael-chat-contract.test.ts` | ❌ | KHÔNG TỒN TẠI |

##### Phase 2 — Notification Wire-Up

| Deliverable | Status |
|---|---|
| `supabase/functions/mobile-api/_shared/push.ts` (`sendPushToUser`, `sendPushToUsers`) | ❌ KHÔNG TỒN TẠI |
| `createBroadcasts` → wire `insert_notification_atomic` + `sendPushToUsers` | ❌ services.ts:1638-1688 unchanged |
| `acceptBroadcast` → push customer "Đã có thợ" | ❌ services.ts:625-662 unchanged |
| `updateJobStatus`, `requestScopeChange`, `decideScopeChange` → push triggers | ❌ |
| `apps/mobile/lib/push-notifications.ts` (Expo Notifications client) | ❌ KHÔNG TỒN TẠI |
| `setupPushNotifications` wire vào AuthProvider effect | ❌ auth-provider.tsx unchanged |
| Deep link handlers `/(worker)/jobs?broadcast_id=...`, `/(customer)/history?scope_change=...` | ❌ |

##### Phase 3 — Auto Worker Cancellation + Geo

| Deliverable | Status |
|---|---|
| Migration geo (`jobs.address_lat/lng`, `worker_profiles.home_lat/lng`, `service_radius_km`) | ❌ |
| Migration `problem_specializations text[]` | ❌ |
| SQL function `public.distance_km()` | ❌ |
| Update `request_worker_cancellation_atomic` → auto-approve + rate limit + return next candidates; auto-suspend remains superseded/deferred | ❌ |
| `supabase/functions/mobile-api/_shared/matching.ts` (`findNextBestWorker`) | ❌ KHÔNG TỒN TẠI |
| Wire auto re-broadcast trong `requestWorkerCancellation` service | ❌ |
| `apps/mobile/components/customer/address-autocomplete.tsx` | ❌ KHÔNG TỒN TẠI |
| Google Maps Geocoding API integration server-side | ❌ |
| Env var `GOOGLE_MAPS_API_KEY` server-side | ❌ Chưa thấy reference |
| Worker rating decrement on cancel | ❌ |

##### Phase 4 — Critical Bug Fixes (parallel)

| Bug | Status | Evidence |
|---|---|---|
| C1: A11 scope change hard-stop modal | ❌ | `apps/mobile/components/customer/scope-change-modal/` KHÔNG TỒN TẠI |
| C2: Worker earnings `paid_at` fix | ❌ | `supabase/functions/mobile-api/_shared/services.ts:1569` vẫn `gross += price;` — KHÔNG có check `row.paid_at IS NOT NULL` |
| C6: `scope_change_reject_cancels_job` migration to prod | ✅ | Đã apply trong session 2026-05-19 (migration `20260518181500`) — trước khi Plan.md tồn tại |
| M1: VN copy consistency sweep | ❌ | `supabase/functions/mobile-api/_shared/services.ts:1163` vẫn "Worker chưa nhập giá cuối cùng" |

Phase 4 progress: 1/4 (C6 legacy), 3/4 chưa.

---

#### 21.1.C — Vi phạm Plan.md cụ thể

1. **Plan §0 Activation Protocol** — Codex MEMORY PR#23 line 22 list các file cần đọc nhưng **KHÔNG có Plan.md**. Plan §0 yêu cầu agent đọc Plan.md trước khi đụng bất kỳ file nào.
2. **Plan §15.1 Scope creep ngược** — Codex add "JobRoom" + "Kael Command Home" concepts ngoài Plan, thay vì build Phase 1 đã spec.
3. **Plan §15.7 God-files** — Plan cấm file mới > 800L. Codex add +640L vào file 2626L (`customer-surfaces.tsx` thành 3266L). Đáng lẽ phải split.
4. **D11 (locked decision)** — Plan §8.6 yêu cầu KaelChatSurface là stack screen mới ngoài tab bar. Codex chỉ thay copy của Kael tab cũ.
5. **Plan §11 Phase 4 parallel** — C1, C2, M1 critical fixes phải parallel với Phase 1-3 → chưa làm.

---

#### 21.1.D — Files I CAN'T audit (uncommitted local)

Tu's screenshot 2026-05-21 cho thấy branch `codex/glass-motion-ui-enhancement` có **43 files uncommitted** trong local Codex IDE workspace.

- Tôi chỉ inspect được code đã push lên `origin`. 43 file local-only KHÔNG audit được.
- Codex's MEMORY entry tự classify đó là "unrelated dirty changes" — strong signal KHÔNG phải Plan implementation, nhưng chưa confirm.
- **Action cần Tu**: yêu cầu Codex push 43 file đó lên 1 branch (hoặc commit local rồi push) để Claude audit pass 2.

---

#### 21.1.E — Mission tiếp theo (Codex pass 2 hoặc next agent)

Thứ tự bắt buộc:

1. **Đọc Plan.md TRƯỚC** — Plan §0 Activation Protocol mandatory. Confirm trong commit message hoặc MEMORY.
2. **Push hoặc clarify 43 uncommitted files** — Cần biết content trước khi tiếp tục, để không lost work.
3. **Phase 0 SPIKES** — Output 2 file:
   - `docs/foundation/geo-data-spike.md` (Google Maps pricing, schema, distance algo, autocomplete UX lib)
   - `docs/foundation/expo-push-spike.md` (push helper signature, payload schema, deep link convention, permission UX timing)
4. **Phase 1.0 Pre-work** — Sync contracts + access.ts helper + state machine docs.
5. **Phase 1 thật** — Migration + Edge endpoint + Anthropic vision + KaelChatSurface stack screen + delete client-price-check-flow.
6. **Phase 2 → 3 → 4** theo Plan §13 ordering (Phase 4 parallel với 1-3).

Mỗi phase done → Codex commit + push → Claude audit per §16 checklist → entry mới §21.x trong audit log.

---

#### 21.1.F — Process note

- Plan §1-20 KHÔNG đổi mid-execution (per §0).
- Section §21 là audit log cumulative. Mỗi pass thêm 1 sub-section §21.X (X = 2, 3, ...).
- Format mỗi entry:
  - 21.X.A — Cái đã làm (PR# + commits + files)
  - 21.X.B — Gap tracker per phase
  - 21.X.C — Vi phạm Plan.md (nếu có)
  - 21.X.D — Files uncommitted CAN'T audit
  - 21.X.E — Mission tiếp theo
- Plan §16 checklist là nguồn duy nhất để mark "done". Codex tự claim "completed" KHÔNG đủ.

---

---

### 21.2 — Audit 2026-05-21 (Codex pass 2 + 3, PR#24 merged)

**Ngày**: 2026-05-21
**Auditor**: Claude
**Builder**: Codex
**Source branch**: `codex/glass-motion-ui-enhancement` → merged main qua [#24 Consolidate Plan workflow upgrade](https://github.com/manhtu0407/HomeServices-/pull/24) (commit `0f02641`)
**Stat**: 62 files changed, +6834 / -3243 lines

**Mission audit**: Verify Plan §16 checklist sau khi Codex hoàn tất 2 pass tiếp theo pass 1. Verify PR#24 merge intact.

**Kết luận**: ✅ **Plan §16 Phase 0, 1.0, 1, 2, 4 hoàn chỉnh. Phase 3 partial theo Tu chỉ đạo (xem §21.3). Phase 5 bonus chat customer↔worker giữ nguyên theo Tu**.

#### 21.2.A — Files merged trên main (đầy đủ Plan deliverable)

| File | Status | Lines |
|---|---|---|
| `docs/foundation/geo-data-spike.md` | ✅ NEW | 85 |
| `docs/foundation/expo-push-spike.md` | ✅ NEW | 84 |
| `supabase/migrations/20260520130514_kael_chat_sessions.sql` | ✅ NEW | 246 |
| `supabase/migrations/20260520141200_worker_cancellation_auto_reassign.sql` | ✅ NEW | 168 |
| `supabase/functions/mobile-api/_shared/access.ts` (requireJobAccess) | ✅ NEW | 121 |
| `supabase/functions/mobile-api/_shared/push.ts` (Expo Push helper) | ✅ NEW | 255 |
| `supabase/functions/mobile-api/_shared/kael.ts` (vision photo wiring) | ✅ MOD | +243 |
| `supabase/functions/mobile-api/_shared/router.ts` (4 chat routes) | ✅ MOD | +212 |
| `supabase/functions/mobile-api/_shared/services.ts` (chat + push wires + auto reassign) | ✅ MOD | +1469 |
| `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` (stack screen) | ✅ NEW | 554 |
| `apps/mobile/components/customer/kael-chat/styles.ts` | ✅ NEW | 265 |
| `apps/mobile/components/customer/kael-chat/pending-intake.ts` | ✅ NEW | 21 |
| `apps/mobile/app/(customer)/kael-chat.tsx` (route) | ✅ NEW | 5 |
| `apps/mobile/components/customer/scope-change-modal/scope-change-hard-stop-modal.tsx` | ✅ NEW | 311 |
| `apps/mobile/lib/push-notifications.ts` (Expo Notifications client) | ✅ NEW | 155 |
| `apps/mobile/lib/auth-provider.tsx` (setupPushNotifications wire) | ✅ MOD | +28 |
| `apps/mobile/components/client-price-check/client-price-check-flow.tsx` | ✅ DELETED | −2790 |
| `apps/mobile/package.json` (expo-notifications ~0.32.17) | ✅ MOD | +1 |
| `packages/shared/src/__tests__/contracts-parity.test.ts` | ✅ NEW | 56 |

#### 21.2.B — Critical bug fixes verified trên main

- **C1** A11 hard-stop modal: scope-change-modal/ tồn tại, render với deep-link param `scope_change`, non-dismissable, push trigger từ backend ✅
- **C2** Worker earnings paid_at: `services.ts:2134-2135` `if (nullableString(row.paid_at)) { gross += price; }` ✅
- **C3** Anthropic vision photos: `kael.ts:93,1107,1110,1126-1127` AIImageContent type + content array text+images ✅
- **M1** VN copy sweep: grep "Worker chưa" = 0 hits ✅

#### 21.2.C — Verified test additions

- `mobile-api-edge-runtime.test.ts` +1139L
- `mobile-api-edge-router.test.ts` +207L
- `earnings.test.ts` +33L
- `validation.test.ts` +96L
- `mobile-wiring.test.ts` +211L (markers cho kael-chat, scope-change-modal, push wire)
- `contracts-parity.test.ts` NEW (verify shared ↔ Edge domain sync)

#### 21.2.D — Mission tiếp theo (post-merge deploy)

KHÔNG phải gap audit — deploy/release steps:

1. Apply migrations staging (`npx supabase db push --linked` trên `xyylanuyflrjzbjzhqfl`).
2. Run RLS harness 29/29 + smoke test trên staging.
3. Deploy Edge function `mobile-api` (`npx supabase functions deploy mobile-api`).
4. Apply migrations production theo `docs/ops/production-migration-checklist.md` — Tu approve explicit.
5. EAS rebuild mobile (`expo-notifications` package cần native bundle).
6. TestFlight push delivery real-device test.

---

### 21.3 — 🔴 CRITICAL DEFERRED ITEMS — Phase 3 chưa hoàn tất

**Ngày note**: 2026-05-21
**Tu chỉ đạo**: defer 5 items dưới đây trong PR#24, sẽ revisit khi điều kiện trigger thoả mãn.

**ĐÂY LÀ CRITICAL PART**. Mọi agent (Codex hoặc Claude) tiếp tục plan này MUST đọc section này trước khi mark Phase 3 done. KHÔNG được claim "Plan hoàn chỉnh" nếu 5 items này chưa có hoặc chưa có Tu approve skip thêm lần nữa.

#### Phân cụm

| Cụm | Mục đích | Items | Phụ thuộc |
|---|---|---|---|
| **Cụm A** — Trust & Safety | Chống worker abuse cancel | #1 Rating penalty + #2 Auto-suspend (both superseded/deferred; admin review required) | Standalone, làm trước được |
| **Cụm B** — Geo Matching Upgrade | Chọn thợ gần nhất + chuyên môn nhất | #3 Geo schema + #4 distance_km + #5 Address autocomplete + Google geocoding | #4 và #5 phụ thuộc #3 |

Đề xuất ưu tiên khi revisit: Cụm A trước (đơn giản hơn, chỉ migration + Edge logic), Cụm B sau (cần Google Maps API + UI mới + schema migration lớn).

---

#### #1 — Worker rating penalty −0.1 mỗi cancel (superseded/deferred)

- **Plan ref**: D10 + §10.2 + §10.8
- **Status**: ⏸️ DEFERRED 2026-05-21 per Tu
- **Cluster**: A (Trust & Safety)
- **Spec đầy đủ**: Khi `request_worker_cancellation_atomic` được call thành công (status='approved'):
  - `UPDATE worker_profiles SET rating = GREATEST(0, rating - 0.1) WHERE id = p_worker_id;`
  - Trong cùng transaction với cancellation insert.
- **Evidence của deferral**: Migration `20260520141200_worker_cancellation_auto_reassign.sql` line 6 ghi rõ *"Rating penalties are intentionally omitted from this execution scope"*.
- **Impact production**: Worker có thể hủy việc thoải mái mà không bị phạt → có thể chọn việc dễ + bỏ việc khó. Pre-revenue scale chấp nhận được.
- **Trigger revisit**:
  - Khi platform có ≥10 worker active, hoặc
  - Khi Tu hoặc admin báo có 1 worker hủy bất thường, hoặc
  - Khi production rating system bắt đầu hiển thị cho customer (cần data thật).
- **Definition of done**:
  - Migration mới: update `request_worker_cancellation_atomic` thêm rating UPDATE.
  - Test: unit test verify rating giảm đúng 0.1, floor at 0.
  - Test: integration test trên staging với fake worker rating 4.5 → cancel → rating = 4.4.
  - Edge service: trả về `rating_after` trong response để client có thể display.

#### #2 — Auto-suspend khi worker hủy ≥5 lần / 7 ngày (superseded/deferred)

- **Plan ref**: D10 + §10.2 + §10.8
- **Status**: ⏸️ DEFERRED 2026-05-21 per Tu
- **Cluster**: A (Trust & Safety) — bundle với #1
- **Spec đầy đủ**: Trong `request_worker_cancellation_atomic`, sau khi insert cancellation:
  ```sql
  select count(*)::int into v_recent_count
    from public.worker_cancellation_requests
    where worker_id = p_worker_id
      and status = 'approved'
      and created_at >= v_now - interval '7 days';
  
  if v_recent_count >= 5 then
    update public.worker_profiles
      set is_suspended = true,
          is_available = false
      where id = p_worker_id;
    -- Optionally insert admin notification for review
  end if;
  ```
- **Evidence của deferral**: Migration hiện tại chỉ có rate limit 2/24h (chặn cancel mới khi đã có 2 approved trong 24h), **KHÔNG có** 7-day rolling auto-suspend.
- **Impact production**: 1 worker xấu có thể hủy job liên tục trong tuần mà không bị remove khỏi marketplace pool. Customer experience xấu, broadcast wasted, Kael phải re-match nhiều lần.
- **Trigger revisit**: Đi cùng với #1. Không có #2 mà có #1 thì rating có giảm nhưng worker vẫn nhận việc → ít hiệu quả.
- **Definition of done**:
  - SUPERSEDED by P11: do not add 7-day auto-suspend without renewed Tu approval and admin-review contract.
  - Edge service: thêm `notifyAdminWorkerSuspended` helper (tuỳ chọn — có thể defer admin notify).
  - Test: 5 cancels trong 7 ngày → 6th attempt → worker đã bị suspend (is_suspended=true).
  - Test: 4 cancels + 1 cancel cũ hơn 7 ngày → vẫn cho cancel (rolling window).
  - Mobile worker UI: WorkerHomeSurface phải hiển thị banner "Tài khoản tạm khoá, liên hệ hỗ trợ" khi `is_suspended=true`.

#### #3 — Geo schema (lat/lng + service_radius + problem_specializations)

- **Plan ref**: §10.1 + spike `docs/foundation/geo-data-spike.md`
- **Status**: ⏸️ DEFERRED 2026-05-21 per Tu
- **Cluster**: B (Geo Matching) — BASE, #4 và #5 phụ thuộc
- **Spec đầy đủ**:
  ```sql
  alter table public.jobs
    add column if not exists address_lat numeric(9,6),
    add column if not exists address_lng numeric(9,6),
    add column if not exists geo_source text check (geo_source in ('google_maps', 'manual', 'fallback'));
  
  alter table public.worker_profiles
    add column if not exists home_lat numeric(9,6),
    add column if not exists home_lng numeric(9,6),
    add column if not exists service_radius_km int default 8 check (service_radius_km between 1 and 30),
    add column if not exists problem_specializations text[] not null default '{}'::text[];
  ```
- **Evidence của deferral**: Spike line 7: *"Phase 0 matching continues to work with the existing canonical HCMC district slugs, so missing geocoding must not block job creation or worker matching"*. Spike line 21: *"Add coordinates only when the product is ready for geo-ranked matching"*.
- **Impact production**: Worker matching chỉ theo district slug (`q1`, `thu_duc`, `binh_thanh`...) + `service_types[]`. Không biết worker A ở Q1 cách customer ở Q1 bao xa thực sự (có thể 500m, có thể 5km).
- **Trigger revisit**:
  - Khi 1 district có ≥3 worker active đồng thời (cần ranking nearest), hoặc
  - Khi customer feedback "thợ đi xa quá lâu mới đến", hoặc
  - Khi pivot sang service mới cần specialization (ví dụ: cleaning sub-types).
- **Definition of done**:
  - Migration apply staging + prod theo checklist.
  - `database.types.ts` regenerate.
  - Backfill: jobs cũ có lat/lng NULL OK, worker cũ có default 0,0 cần backfill manual hoặc treat NULL.
  - Test: schema migration tests pass.

#### #4 — `distance_km()` SQL function + geo-ranked `findNextBestWorker`

- **Plan ref**: §10.1 (SQL function) + §10.3 (matching algorithm)
- **Status**: ⏸️ DEFERRED 2026-05-21 per Tu
- **Cluster**: B (Geo Matching) — phụ thuộc #3
- **Spec đầy đủ**:
  - SQL function:
    ```sql
    create or replace function public.distance_km(
      lat1 double precision, lng1 double precision,
      lat2 double precision, lng2 double precision
    ) returns double precision language sql immutable as $$
      select 6371 * acos(
        cos(radians(lat1)) * cos(radians(lat2)) *
        cos(radians(lng2) - radians(lng1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      );
    $$;
    ```
  - Update `queryEligibleWorkers` trong `services.ts`:
    - Add geo scoring: `score = rating*10 + (specialization_match ? 20 : 0) + distance_bonus`
    - Sort by score DESC
    - Fallback to district match khi job hoặc worker thiếu lat/lng
- **Evidence của deferral**: Hiện `queryEligibleWorkers` trong `services.ts` chỉ filter district + service_type + order by `rating DESC`.
- **Impact production**: Worker thắng broadcast vì rating cao hơn, không phải gần hơn. Customer chờ worker đi xa hơn (travel time). Worker bị giao việc xa nhà → có thể decline → re-broadcast.
- **Trigger revisit**: Sau khi #3 done.
- **Definition of done**:
  - Migration `distance_km()` apply staging + prod.
  - `services.ts queryEligibleWorkers` update với composite score.
  - Test: unit test distance function với HCMC coordinates known (vd Q1 → Q7 ≈ 7km).
  - Test: integration test 2 workers cùng rating, 1 gần 1 xa → gần thắng.
  - Test: 1 worker có lat/lng + 1 worker NULL → ranking fallback to rating-only cho NULL one.

#### #5 — Address autocomplete UI + Google Maps Geocoding server-side

- **Plan ref**: §10.5 (UI) + §10.6 (server geocoding) + spike
- **Status**: ⏸️ DEFERRED 2026-05-21 per Tu (code implementation chưa làm). **Infrastructure đã sẵn sàng 2026-05-21 pm** — xem block "Infra ready" bên dưới.
- **Cluster**: B (Geo Matching) — phụ thuộc #3
- **Spec đầy đủ**:
  - **Mobile**: `apps/mobile/components/customer/address-autocomplete.tsx` dùng `react-native-google-places-autocomplete` với:
    - HCMC bounding box: `{ northeast: 10.91, 106.85, southwest: 10.65, 106.55 }`
    - Language: `vi`
    - Components filter: `country:vn`
  - **Mobile**: integrate vào KaelChatSurface khi Kael ask address turn
  - **Backend**: server-side geocode trong `confirm_kael_chat_atomic` hoặc Edge wrapper:
    - Khi customer confirm session → trước khi insert jobs → call Google Maps Geocoding API với `building + district + Ho Chi Minh City + Vietnam`
    - Lưu lat/lng + `geo_source='google_maps'`
    - Nếu API fail → `geo_source='fallback'`, lat/lng NULL → matching fallback to district
  - **Worker side**: WorkerVerificationForm thêm "Chọn khu vực phục vụ" UI:
    - Map picker với pin marker cho home_lat/lng
    - Slider service_radius_km (1-30 km, default 8)
  - **Env var**: `GOOGLE_MAPS_API_KEY` server-side only — KHÔNG bundle vào mobile (RULES.md #1)

##### Infra ready (Tu setup 2026-05-21 pm)

Google Cloud Console resources đã provisioned và secret đã set. Codex KHÔNG tạo lại các resource dưới đây:

| Resource | Value / Config |
|---|---|
| **Provider** | Google Maps Platform (locked, không dùng GoongMap vì account chưa được Goong admin activate khi setup) |
| **GCP Project** | `stone-plating-497006-d4` ("My Project") |
| **Billing account** | "Home Services Billing" (linked) |
| **API Key name** | `Maps Platform API Key` (auto-tạo bởi onboarding) |
| **Key restrictions** | API restriction: **2 APIs** = Geocoding API + Places API (New). KHÔNG có IP/referer/bundle restriction (vì Edge IPs dynamic) |
| **APIs enabled** | Geocoding API + Places API (New) |
| **Quota Geocoding `v3 requests per day`** | **1,000 req/day** (cap potential cost ≤ $150/month nếu paid) |
| **Quota Places `AutocompletePlacesRequest per day`** | **500 req/day** (cap potential cost ≤ $42/month nếu paid) |
| **Combined potential max** | $192/month < $200 free credit → **ZERO charge expected** |
| **Budget alert** | "Home Services Maps Alert" — 25,000₫ (~$1)/month, email tại 50% / 90% / 100% threshold to billing admins + project owners (manhtu0407@gmail.com) |
| **Env var name (locked)** | `GOOGLE_MAPS_API_KEY` |
| **Secret status staging** (`xyylanuyflrjzbjzhqfl`) | ✅ Set 2026-05-21 pm |
| **Secret status production** (`iwevizmsedyqozxlawwl`) | Pending (Tu set khi sẵn sàng deploy prod) |

##### Codex pass implement #5 — phải dùng exactly:

- Edge code: `Deno.env.get("GOOGLE_MAPS_API_KEY")` — KHÔNG đổi env var name.
- Geocoding endpoint: `https://maps.googleapis.com/maps/api/geocode/json?address=<encoded>&region=vn&language=vi&key=<key>`
- Places autocomplete endpoint: `https://places.googleapis.com/v1/places:autocomplete` (Places New, KHÔNG dùng `https://maps.googleapis.com/maps/api/place/autocomplete/json` cũ vì Tu restrict key cho New only)
- Mobile autocomplete: nếu dùng `react-native-google-places-autocomplete`, version package phải support Places API (New) endpoint. Verify trước install.
- **KHÔNG bundle key vào mobile binary**: mobile autocomplete proxy qua Edge endpoint mới (vd `POST /places/autocomplete` trong `mobile-api`), KHÔNG gọi Google trực tiếp từ RN.

##### Hard limit warnings cho Codex:

- Nếu Geocoding test vượt 1000/day → API trả `RESOURCE_EXHAUSTED` 429. Code phải handle gracefully (fallback district).
- Nếu Places test vượt 500/day → API trả `RESOURCE_EXHAUSTED` 429. Code phải handle gracefully (skip autocomplete suggestion).
- Nếu cần tăng quota → Tu approve trong console + update Plan §21.3 #5 với value mới.

- **Evidence của deferral (code implementation)**: Spike đã chọn Google Maps + infrastructure đã set, nhưng chưa implement UI + chưa wire backend code.
- **Impact production**: Customer gõ address free-text → backend không geocode → lat/lng NULL → distance matching không hoạt động (cần #4 to be useful). Worker không khai báo radius/home → matching không xét coverage area.
- **Trigger revisit**: Sau khi #3 + #4 done.
- **Definition of done**:
  - ✅ `GOOGLE_MAPS_API_KEY` set trong Supabase Edge secrets staging (done 2026-05-21 pm).
  - [ ] `GOOGLE_MAPS_API_KEY` set trong production secrets.
  - [ ] `apps/mobile/components/customer/address-autocomplete.tsx` exists + integrated vào KaelChatSurface.
  - [ ] Edge endpoint proxy `POST /places/autocomplete` trong `mobile-api/_shared/router.ts` + `services.ts`.
  - [ ] Edge backend trong `confirm_kael_chat_atomic` hoặc wrapper geocode address before insert jobs.
  - [ ] WorkerVerificationForm có map picker + radius slider.
  - [ ] Test: geocoding fail → fallback district match still works.
  - [ ] Test: customer enter HCMC address → lat/lng populated trong DB.
  - [ ] Test: worker register với home_lat/lng + radius_km → query eligible workers tính theo radius.
  - [ ] Test: quota exhaustion (429) → fallback path không crash.

---

#### 21.3.X — Process notes cho Codex pass tới

- KHÔNG được mark "Plan §16 Phase 3 done" cho đến khi 5 items này có evidence on main OR Tu re-confirm defer thêm 1 lần nữa.
- 2 cụm có thể làm độc lập — không cần làm cả 5 cùng pass.
- Cluster A (#1, #2) **không cần dependency mới** (Google Maps, không UI mới) — có thể làm pass tiếp theo nếu Tu OK.
- Cluster B (#3, #4, #5) **cần Google Maps API key** + UI mới — chờ Tu approve trước.
- Mỗi item có spec đầy đủ + Definition of Done trong section trên. Codex KHÔNG cần đoán mò.
- Sau khi 1 item done → update §21 thêm sub-entry `§21.3.X.done` ghi PR + date + verification.

---

#### 21.3.1.done — Codex local implementation update — 2026-05-21

Scope completed in this local pass:
- #2 Auto-suspend: historical local update from 2026-05-21; SUPERSEDED by P11 / `docs/workflow/worker-cancellation.md`, which forbids autonomous suspension without admin review/Tu approval.
- #3 Geo schema: migration adds `jobs.address_lat/address_lng/geo_source` and worker `home_lat/home_lng/service_radius_km/problem_specializations`; shared/mobile API types were aligned.
- #4 Geo-ranked matching: Edge `queryEligibleWorkers` now loads job geo/problem keys, excludes suspended workers, scores rating + specialization + distance/radius fallback, and preserves district fallback when coordinates are missing.
- #5 Partial: Edge proxy `POST /places/autocomplete` uses Places API (New), server geocoding uses `GOOGLE_MAPS_API_KEY` only in Edge, Kael chat carries `address_label`/district into the service wrapper, and mobile has an Edge-backed `AddressAutocomplete`.
- React Doctor cleanup: Kael chat state moved to a reducer slice so the changed Kael surface scans clean.

Explicit non-completed / still-open items:
- #1 Worker rating penalty remains intentionally omitted per Tu direction. Do not re-add it without renewed approval.
- #5 is not fully done because production `GOOGLE_MAPS_API_KEY` is still pending, worker-side map picker/slider is not a true map UI yet, and DB-populated lat/lng was not verified against live Google/Supabase.
- Phase 3 must not be marked fully complete until the open #5 production/manual verification items are closed or Tu explicitly approves deferral.

Verification run locally:
- `tsc --noEmit` for `apps/api`, `apps/mobile`, `packages/shared`: pass.
- API targeted Vitest: router/runtime/schema, 132 tests pass.
- Shared/mobile targeted Vitest: validation/backend wiring/mobile wiring, 279 tests pass.
- React Doctor changed scan: API/mobile no issues found after reducer + CustomerHistorySurface extraction.
- `git diff --check`: pass with line-ending warnings only.

---

## 22. Audit Fix Plan — 2026-05-23 (Stop Bleeding → Trust Foundation → Section Rạch Ròi)

> Status: **Active addendum**. Khai sinh ngày 2026-05-23 từ audit toàn bộ workflow code (apps/mobile + supabase/functions/mobile-api + 46 migrations) sau khi PR #27 (commit `a87a955`) merge.
>
> Phụ thuộc: KHÔNG override §1-§21 (Plan core là contract). Đây là addendum tách biệt — fix các holes audit tìm thấy, không phải thay thế workflow enhancement plan §8-§13.
>
> Source plan file (local agent area): `C:\Users\Phan Manh Tu\.claude\plans\khoan-h-y-b-c-v-o-hazy-kitten.md` (single-source). §22 này là durable copy trong worktree để team reference.

---

### 22.0 — Plan Metadata & Decision Log

#### 22.0.A — Plan Metadata

| Field | Value |
|---|---|
| Plan created | 2026-05-23 |
| Plan owner | Tu (decisions) + AI co-founder (drafting + implementation) |
| Plan branch | `claude/cranky-shockley-57ad06` (worktree) |
| Source plan file | `C:\Users\Phan Manh Tu\.claude\plans\khoan-h-y-b-c-v-o-hazy-kitten.md` |
| Worktree mirror | `Plan.md §22` (this section) |
| Status | Draft — awaiting Tu sign-off + STRUCTURES.md edit approval |
| Expected start | After Tu approve + commit current dirty worktree state |
| Expected first PR | Phase 1 fixes (3 items, S-tier nhỏ) — same day after approval |
| Last update | 2026-05-23 |

#### 22.0.B — Decision Log

| Date | Decision | Owner | Reference |
|---|---|---|---|
| 2026-05-22 | PR #27 docs-only authority cleanup merged | Tu | commit `a87a955` |
| 2026-05-23 | Comprehensive workflow audit done — 14 findings verified trực tiếp trong code | AI + Tu | this addendum |
| 2026-05-23 | Confirm Tu's framing: workflow chain works nhưng thiếu chi tiết → micro + macro issues | Tu | conversation |
| 2026-05-23 | Tu chốt giữ 3 customer tab Home/Booking/Kael KHÁC NHAU thật sự (Booking = A2-A6 wizard, Kael = Q&A không tạo job) | Tu | AskUserQuestion answer |
| 2026-05-23 | Tu chốt admin `/(admin)/` separate route, gỡ bypass | Tu | AskUserQuestion answer |
| 2026-05-23 | Tu chốt S-tier fix round đầu luôn | Tu | AskUserQuestion answer |
| 2026-05-23 | **Tu chốt Kael OWNS final price authority — worker KHÔNG tự nhập `final_price` ở B7 / scope_change. Kael computes giá cuối based on original estimate + approved scope changes** | Tu | conversation 2026-05-23 |
| 2026-05-23 | Tu yêu cầu plan chi tiết với ngày tháng + lý do đầy đủ vào Plan.md | Tu | conversation |
| 2026-05-23 | Tu chọn "Append vào Plan.md hiện tại như §22 (Addendum 2026-05-23)" | Tu | AskUserQuestion answer |

---

### 22.1 — Context & Lý do Plan Tồn Tại

#### 22.1.A — Lý do plan này tồn tại

Tu nêu concern ngày 2026-05-23: "Workflow đã có chain logic nhưng chưa đủ chi tiết → micro issues (tap booking nhầm section, chức năng không đúng vai trò) + macro issues (vocabulary lệch, role overlap)". Audit verify Tu đúng — list 14 finding, gom thành 5 nhóm rủi ro.

Mục tiêu plan: chuyển product từ trạng thái **"chain logic chạy được nhưng customer A12 confirm blind + chat fake + PII rò rỉ"** sang trạng thái có thể có **first real transaction đáng tin cậy**. Mỗi fix phải trace về cụ thể nhóm rủi ro nào trong STRUCTURES.md + RULES.md.

Plan này KHÔNG:
- Mở scope ngoài electrical/plumbing/cleaning HCMC
- Implement payment rails (deferred until SMS + payment provider)
- Implement learning candidates (tables ready, wiring sau khi có evidence baseline)
- Multi-city / autonomous booking / multi-agent

#### 22.1.B — 5 Nhóm Rủi Ro (verified từ audit code)

```
NHÓM 1 — Khách mất tiền không biết
─────────────────────────────────────────
• A12 confirm UI mù (D14):
  customer-surfaces.tsx:1316 hardcode placeholder thay vì đọc deal.finalPrice;
  evidence tiles render label strings thay vì completion_photo_urls
• A11 có 2 UX song song (C5):
  hard-stop modal CÙNG inline Alert.alert có nút "Kiểm lại" cancel
• Worker B7 nhập thiếu (D5):
  chỉ có final_price; completion_notes/photo_urls hardcode rỗng

NHÓM 2 — Chat 2 phía giả
─────────────────────────────────────────
• Worker chat (D3): WorkerChatContent dùng useState local, KHÔNG gọi
  jobService.sendMessage. Backend đầy đủ (chat_messages + realtime +
  endpoints) nhưng UI 2 phía KHÔNG wire. Dispute trail = 0.

NHÓM 3 — PII rò rỉ qua LLM
─────────────────────────────────────────
• scrubSensitiveForLLM (M5):
  kael.ts:1260 chỉ strip phone/email/ID, KHÔNG strip tên chung cư /
  unit / tầng / ngân hàng. Customer chat đẩy nguyên văn lên Anthropic.

NHÓM 4 — User mù về trạng thái app
─────────────────────────────────────────
• Customer thiếu notification (D1a): estimate_ready, no_worker_found,
  review_requested chưa emit
• Worker thiếu notification (D1b): account_approved, customer_message,
  customer_confirmed_completion, broadcast_expired chưa emit
• 3 customer tab (Home/Booking/Kael) đều dẫn vào Kael chat — role overlap

NHÓM 5 — Dev/admin gây sự cố thật + vocabulary lệch
─────────────────────────────────────────
• Admin bypass (M9): role=admin được vào customer/worker shell + Edge
  cho admin chạy mọi route → admin nhấn nhầm = sự cố thật
• Status vocabulary 3-layer (M2):
  init migration cũ / Edge lifecycle mới / Mobile reducer fold —
  cùng 1 trạng thái có 3 tên gọi
```

---

### 22.2 — Workflow Decision 2026-05-23: Kael Owns Final Price (architectural change)

**Decision date:** 2026-05-23
**Decision owner:** Tu
**Status:** Locked — phải implement trong Phase 2.0 (mới)

#### 22.2.A — Old workflow (per STRUCTURES.md hiện tại)

```
A5  Kael estimate range
A7  customer confirm estimate
B6  worker reports scope change INCLUDING new price range proposal
B7  worker complete với worker-typed final_price
A12 customer confirms completion (currently UI blind — D14)
```

#### 22.2.B — New workflow (Tu decision 2026-05-23)

```
A5  Kael estimate range (unchanged)
A7  customer confirm estimate → estimate becomes LOCKED Kael baseline
B6  worker reports scope change description + reason + photos ONLY
    (no price proposal)
Edge Kael reviews worker's reported scope → Kael COMPUTES new estimate range
A11 customer sees Kael's new computed estimate → approve → Kael-locked
    new price OR reject → job cancelled
B7  worker submits completion notes + photos ONLY (no final_price)
A12 customer sees Kael-locked final price (= original estimate OR latest
    A11 approved Kael estimate) + worker evidence → confirm
Worker earnings tính từ Kael-locked price
```

#### 22.2.C — Lý do thay đổi

- Closes the "S-tier hole" (worker tự đẩy giá ở B7, customer không biết)
- Tăng cường RULES.md Rule #7 (no autonomous money actions) — worker KHÔNG có authority unilateral set price
- Customer A11 approval thực sự gắn với 1 con số cụ thể (Kael-computed), không phải ước lượng do thợ tự nhập
- A12 confirm có Kael-locked số rõ ràng → không còn blind
- Dispute trail: nếu giá thực tế khác Kael compute → admin có thể audit Kael's reasoning chain

#### 22.2.D — Implications kỹ thuật

- `jobs.final_price` source = Kael, không phải worker input
- `jobs.scope_change_price_min/max` source = Kael compute, không phải worker input
- `lifecycle.ts` `completed_by_worker` transition: worker payload KHÔNG có `final_price`
- Edge `updateJobStatus` reject `final_price` từ worker
- Edge `requestScopeChange` reject `new_price_min/max` từ worker — chỉ accept description + reason + photos
- Kael Edge thêm function `computeScopeChangeEstimate(originalContext, newScopeDescription, ...)` — sử dụng Anthropic + reuse pipeline elements
- **STRUCTURES.md §6 A11/B6/B7, §11 JobLifecycleModule, §15 Pricing PHẢI ĐƯỢC EDIT** — đây là locked doc, cần Tu explicit approval trong fix execution

---

### 22.3 — Authority Context Loading (BẮT BUỘC trước mỗi phase)

Mọi phase / fix item TRONG §22 này MUST tuân theo `critical.md` §0 Agent Activation Contract. Trước khi sửa code:

#### 22.3.A — Required Reading Order (theo CLAUDE.md authority stack)

```
1. critical.md                              — execution discipline + protocols
2. RULES.md                                 — non-negotiable product/security/AI/data
3. STRUCTURES.md                            — workflow truth + state machines + module contracts
4. design.md                                — UI/motion/glass/prototype contracts (khi fix touch UI)
5. AGENTS.md                                — workspace operating loop + glassmorphism + motion
6. docs/architecture/code-ownership-map.md  — code owner mapping (BẮT BUỘC cho mọi code edit)
7. skills.md hoặc invoke karpathy-guidelines — Karpathy-inspired skills
8. relevant docs/**/*.md                    — feature-specific contracts (Kael, push spike, geo)
9. README.md                                — progress log
10. MEMORY.md                               — CUỐI CÙNG, freshest session facts
```

Khi MEMORY.md mâu thuẫn với locked docs → dừng và hỏi Tu, KHÔNG silently override.

#### 22.3.B — Required Pre-Edit Status Block (per critical.md §0)

Trước mỗi file edit trong mỗi fix item, agent MUST output:

```
Asked task:        [Tu's literal request]
Real goal:         [the actual code change needed]
Task class:        [bugfix | feature | ui | enhancement | refactor | test | security | database | ai | docs]
Selected protocols: [kael-preflight + relevant primary + supporting]
Risk notes:        [scope creep, hidden assumption, security/PII risk]
Verification plan: [exact tests + manual + smoke]
```

Cho tasks nhỏ — block này có thể 1 dòng mỗi field. KHÔNG được skip kể cả khi task tiny.

#### 22.3.C — Kael Protocol Index (per critical.md §1, áp dụng cho §22 plan)

| Phase / Fix | Primary Protocol | Mandatory Supporting | Notes |
|---|---|---|---|
| **2.0 Kael Price Authority** | `kael-architecture-deepening` + `kael-ai-boundary` + `kael-supabase` | `kael-preflight` + `kael-tdd` + `kael-security-sweep` + `kael-review` + `kael-docs-execution` | Cross-cutting, edit locked STRUCTURES.md |
| 1.1 PII scrub | `kael-security-sweep` | `kael-preflight` + `kael-ai-boundary` + `kael-tdd` + `kael-review` | AI boundary + PII |
| 1.2 A12 evidence render | `kael-ui-rn-execution` | `kael-preflight` + `kael-code-enhancement` + `kael-review` | UI fix |
| 1.3 A11 dedup | `kael-ui-rn-execution` | `kael-preflight` + `kael-code-enhancement` + `kael-review` | UI structural removal |
| 2.1 Chat wire | `kael-ui-rn-execution` + `kael-architecture-deepening` | `kael-preflight` + `kael-tdd` + `kael-security-sweep` + `kael-review` | Multi-module |
| 2.2 Worker B7 form | `kael-ui-rn-execution` | `kael-preflight` + `kael-tdd` + `kael-review` | UI + media upload |
| 2.3/2.4 Notifications | `kael-supabase` + `kael-ai-boundary` if Kael | `kael-preflight` + `kael-tdd` + `kael-security-sweep` + `kael-review` | Edge + DB + push |
| 3.1 Booking wizard | `kael-architecture-deepening` + `kael-ui-rn-execution` | `kael-preflight` + `kael-tdd` + `kael-review` + `kael-prototype` | Large UI restructure |
| 3.2 Kael tab Q&A | `kael-architecture-deepening` + `kael-ui-rn-execution` | `kael-preflight` + `kael-ai-boundary` + `kael-tdd` + `kael-review` | Touches Kael behavior |
| 3.3 Home shortcuts | `kael-ui-rn-execution` + `kael-code-enhancement` | `kael-preflight` + `kael-review` | UI rename + routing |
| 4.1 Kael A7 summary | `kael-ui-rn-execution` + `kael-ai-boundary` | `kael-preflight` + `kael-review` | EstimateCard render |
| 4.2 Review tags+comment | `kael-ui-rn-execution` | `kael-preflight` + `kael-tdd` + `kael-review` | Form fields |
| 4.3 Push retry | `kael-supabase` | `kael-preflight` + `kael-tdd` + `kael-review` | Edge helper |
| 4.4 Copy canonical | `kael-docs-execution` + `kael-code-enhancement` | `kael-preflight` + `kael-review` | Refactor + doc |
| 5.1 Admin /(admin)/ | `kael-architecture-deepening` + `kael-supabase` + `kael-security-sweep` | `kael-preflight` + `kael-tdd` + `kael-review` | New shell + Edge route split |
| 5.2-5.6 Doc/cleanup | `kael-docs-execution` | `kael-preflight` + `kael-review` | Doc + naming |
| 5.7 Test gates | `kael-tdd` | `kael-preflight` + `kael-review` | Static assertions |
| 5.8-5.9 Format/mutable | `kael-code-enhancement` | `kael-preflight` + `kael-review` | Refactor |
| 5.10 A6 placeholder | `kael-ui-rn-execution` | `kael-preflight` + `kael-review` | UI honesty fix |
| 5.11 Realtime | `kael-architecture-deepening` + `kael-supabase` | `kael-preflight` + `kael-tdd` + `kael-review` | Subscription wiring |

#### 22.3.D — Karpathy Skill Application (per skills.md)

Mọi fix MUST apply 4 core skill from skills.md:

1. **Think Before Coding** — state goal + list assumptions + flag scope risk trước khi edit
2. **Simplicity First** — viết ít nhất có thể; no premature abstraction; reuse existing helpers
3. **Surgical Changes** — chỉ touch files liên quan task; không drive-by refactor; không reformat unrelated code
4. **Goal-Driven Execution** — define verification trước khi edit; report evidence không phải confidence

Anti-pattern cấm tuyệt đối (per skills.md):
- Hidden assumption (làm theo guess thay vì verify)
- Over-abstraction (interface for 1 caller)
- Speculative features (cache/validation/audit ngoài scope task)
- Drive-by refactor (sửa thứ ngoài scope cùng PR)
- Style drift (đổi quote/indent/import order tự động)
- Vague verification ("looks done")

#### 22.3.E — Workflow Rule Mapping (per RULES.md)

| Fix item | RULES.md rule áp dụng |
|---|---|
| 2.0 Kael Price Authority | Rule #2 (AI wrapper), Rule #3 (Validate AI), Rule #4 (Disclaimer), Rule #7 (No autonomous money), Rule #8 (No fake), Rule #10 (Timeout) |
| 1.1 PII scrub | Rule #9 (Logging Must Not Expose PII), §Security PII Handling, §Input Validation |
| 1.2 A12 evidence | Rule #8 (Data Honesty — No Fake Data), Rule #4 (Price Disclaimer if shown) |
| 1.3 A11 dedup | Rule #7 (No Autonomous Money Actions Without Confirmation) |
| 2.1 Chat wire | Rule #8 (No Fake Data), Rule #9 (PII relay), Rule #10 (Timeout/Retry) |
| 2.2 Worker B7 | Rule #7 (Confirmation), Rule #8 (No Fake Completion) |
| 2.3/2.4 Notifications | Rule #5 (Vietnamese copy), Rule #9 (PII in push body) |
| 3.x Section role | Rule #5 (Vietnamese copy consistency), Rule #6 (Kael scope) |
| 4.1 Kael A7 summary | Rule #4 (Disclaimer), Rule #3 (Validate AI Output) |
| 4.2 Review tags | Rule #5 (Vietnamese copy) |
| 4.3 Push retry | Rule #10 (Timeout + Bounded Retry) |
| 4.4 Copy canonical | Rule #5 (Vietnamese-First Product Copy) |
| 5.1 Admin shell | Rule #0 (Mobile Runtime Boundary), §Security Invariants |
| 5.7 Test gates | §Testing Blueprint enforcement |

#### 22.3.F — STRUCTURES.md Section Mapping

| Fix item | STRUCTURES.md section |
|---|---|
| 2.0 Kael Price Authority | §6 A7/A11/A12, §7 B6/B7, §9 Kael Workflow, §11 KaelPriceCheckModule + JobLifecycleModule + ScopeChangeModule, §15 Pricing |
| 1.1 PII scrub | §14 (Trust, Safety, Evidence — PII rules), §9 (Kael AI Provider Roles) |
| 1.2 A12 evidence | §6 A12 Completion Confirmation, §12 Job Status state machine |
| 1.3 A11 dedup | §6 A11 Scope Change, §12 Scope Change Status, §15 Scope Change |
| 2.1 Chat wire | §6 A10 Active Job, §14 Chat conduct, §11 ChatEvidenceModule |
| 2.2 Worker B7 | §7 B7 Complete Job, §11 JobLifecycleModule |
| 2.3/2.4 Notifications | §16 Notifications |
| 3.1 Booking wizard | §6 A2-A6 customer steps, §18 Frontend Build Contract |
| 3.2 Kael tab Q&A | §9 Kael Workflow, §1 Kael scope |
| 3.3 Home shortcuts | §6 A1 Customer Home, §18 Frontend Build Contract |
| 4.1 Kael A7 summary | §6 A7 Confirm, §15 Pricing Fees |
| 4.2 Review tags | §6 A14 Review |
| 4.3 Push retry | §16 Notifications, §17 Failure Recovery |
| 5.1 Admin shell | §3 Admin role, §8 Admin Workflow |
| 5.11 Realtime | §12 state machines, §16 Notifications |

#### 22.3.G — Design.md Application (khi fix touch UI)

Phases 1.2, 1.3, 2.0d, 2.1, 2.2, 3.x, 4.1, 4.2, 5.10 đều touch UI → BẮT BUỘC đọc `design.md` trước, apply:
- Glass material as accent layer only (no glass-on-every-row)
- Motion: opacity + small y-offset + spring timing; no animated blur
- Reduce Motion + Reduce Transparency respect
- Mint/cream/cyan token palette per `worker-production-contract.md` + `frontend-redesign-production-contract-20260521.md`
- Empty/loading/error/success states explicit cho mỗi screen
- Kael mascot variant per existing assets

#### 22.3.H — Code Ownership Map Application (BẮT BUỘC mọi code change)

Per AGENTS.md "Code Enhancement Checklist", trước mỗi fix:

```
[ ] Tôi đã đọc docs/architecture/code-ownership-map.md
[ ] Tôi biết workflow step / cross-cutting concern
[ ] Tôi đã mở owner files (route + UI surface + provider + runtime + shared contract)
[ ] Tôi đã tìm helper hiện có trước khi tạo helper mới
[ ] Tôi biết layer nào sở hữu change này
[ ] Tôi KHÔNG move workflow-sensitive writes ra khỏi Edge
[ ] Tôi biết narrowest test/static gate proves change
```

Nếu bất kỳ item nào false → dừng và gather context, KHÔNG edit.

#### 22.3.I — MEMORY.md Reconciliation Note

MEMORY.md có lịch sử PR #25 đề cập "rating penalty omitted per Tu's instruction" và "geo schema deferred", "production redesign accepted contract". Khi fix Phase 2.4 worker notification cho `account_approved` — phải verify admin approval workflow status hiện tại trước khi thêm trigger. Khi fix Phase 5.11 realtime — phải verify expo-notifications version chưa đụng (per MEMORY.md PR #25).

---

### 22.4 — Risk Ranking Summary

| Tier | Group | Issue | Impact | Effort |
|---|---|---|---|---|
| **S** | **NEW (Tu 2026-05-23)** | **Kael Final Price Authority (worker không nhập price)** | **Tiền + dispute** | **Lớn (cross-cutting)** |
| S | 3 | PII address strip (M5) | Compliance + legal | Nhỏ |
| S | 1 | A12 evidence render (D14) | Tiền | Nhỏ |
| S | 1 | A11 dual UX dedup (C5) | Tiền | Nhỏ |
| S | 2 | Chat 2 phía wire (D3) | Dispute trail | Lớn |
| S | 1 | Worker B7 completion form (notes + photos, no price) | Evidence | Trung |
| S | 4 | Customer notifications missing (D1a) | UX + retention | Trung |
| S | 4 | Worker notifications missing (D1b) | UX + retention | Trung |
| A | 4 | Section role 3 tab khác nhau (C1-C3) | UX foundation | Lớn |
| A | 1 | Kael A7 fee/cancellation summary (D6) | Trust signal | Nhỏ |
| A | 1 | Review tags + comment (C7) | Feedback quality | Nhỏ |
| A | 1 | Worker B6 scope full inputs (D4) | Dispute trail | Nhỏ |
| A | 4 | Copy canonical source (M6) | Maintainability | Trung |
| A | 4 | Push retry policy (D11) | Critical delivery | Nhỏ |
| B | 5 | Admin /(admin)/ separate route (M9) | Dev safety | Lớn |
| B | 5 | Status vocabulary unify (M2) | Debug speed | Trung |
| B | 5 | A2-A6 step boundaries (M3) | Aligns với Phase 3 | Trung |
| B | 5 | B6 dual flow doc (M4) | Doc only | Nhỏ |
| B | 5 | `confirmed_by_customer` payment skip path (M7) | State machine clarity | Nhỏ |
| B | 5 | activity/history naming (M8) | Naming | Nhỏ |
| B | 5 | Test hard-rule enforcement (M10) | Regression prevention | Nhỏ |
| B | 5 | VND formatter locale-aware (A.6) | EN mode honesty | Nhỏ |
| B | 5 | Module-level mutable cleanup (A.7) | Code hygiene | Nhỏ |
| B | 5 | A6 time UI honest "now only" placeholder (D2) | UX | Nhỏ |
| B | 5 | Realtime subscription wire (D9) | Reduce polling | Lớn |

---

### 22.5 — Phase Overview & Sequencing

```
Phase 1 — Stop the Bleeding         3 fix nhỏ, ngay lập tức
                                    (PII scrub, A12 render real evidence, A11 dedup)
Phase 2 — Trust Foundation          5 fix S-tier (4 cũ + 2.0 mới)
                                    (NEW 2.0 Kael price authority, chat wire,
                                     worker B7 form notes+photos, notifications)
Phase 3 — Section Rạch Ròi          Tu's main UX concern, restructure 3 tab
                                    (Booking wizard A2-A6, Kael Q&A, Home shortcuts)
Phase 4 — Communication Polish      A-tier minor + copy lock
                                    (Kael A7 fee summary, review tags+comment,
                                     push retry, copy canonical source)
Phase 5 — Long-term Hygiene         B-tier, dọn dẹp trước nhân sự khác đụng code
                                    (Admin /(admin)/, status vocab doc, naming,
                                     test gates, format helpers, realtime wire)
```

#### Phase Dependency Note

- Phase 2.0 (Kael Price Authority) là PREREQUISITE cho Phase 2.2 (Worker B7 form) — form layout phụ thuộc decision không có price input
- Phase 2.0 cũng cần Tu approve STRUCTURES.md edit trước khi implement (locked doc)
- Phase 3.1 (Booking wizard) tham chiếu STRUCTURES.md A2-A6 — nếu sửa wizard cần update doc, cần Tu approval cùng lúc
- Phase 5.3 (A2-A6 step contracts doc) khả thi parallel với Phase 3.1
- Phase 2.1 (chat wire) + 2.3/2.4 (notifications) có thể parallel sau khi Phase 2.0 land

---

### 22.6 — Phase 1: Stop the Bleeding

Scope: 3 fix nhỏ với S-tier risk. Mỗi fix nhỏ hơn 1 buổi. Trigger được ngay vì không phụ thuộc các phase sau.

#### 22.6.A — Phase 1 Preflight (BẮT BUỘC trước khi bắt đầu phase)

```
[ ] Read critical.md §5 kael-preflight + §15 kael-security-sweep + §16 kael-ui-rn-execution
[ ] Read RULES.md Rule #4, #7, #8, #9 (touch trong các fix)
[ ] Read STRUCTURES.md §6 A11/A12, §9 Kael, §14 PII
[ ] Read AGENTS.md (data honesty + PR safety sections)
[ ] Read design.md (cho 1.2 + 1.3 — A11 modal + History UI)
[ ] Read docs/architecture/code-ownership-map.md (customer history + Kael Edge rows)
[ ] Read skills.md (Think Before Coding + Surgical Changes principles)
[ ] Read relevant docs/foundation/ chỉ khi material
[ ] Read MEMORY.md LAST
[ ] Identify code-ownership-map.md owners cho 3 fix items
[ ] Confirm scope không slip sang Phase 2/3
```

#### 22.6.B — Fix 1.1: PII address strip (M5)

**Authority refs:**
- `critical.md` §15 `kael-security-sweep` + §12 `kael-ai-boundary` + §7 `kael-tdd`
- `RULES.md` Rule #9 + §Security/PII Handling + §Input Validation
- `STRUCTURES.md` §14 PII rules + §9 Kael AI Provider Roles
- `docs/architecture/code-ownership-map.md` Edge Runtime Ownership row "Kael provider pipeline"
- `skills.md` Skill 1 (Think Before Coding) + Skill 2 (Simplicity First)

**Pre-edit status (paste vào response trước khi edit):**

```
Asked task: Strip apartment building/unit/floor/bank từ text gửi lên LLM
Real goal: Reduce PII surface tới Anthropic/Perplexity/DeepSeek prompts + api_logs
Task class: security
Selected protocols: kael-preflight + kael-security-sweep + kael-ai-boundary + kael-tdd + kael-review
Risk notes: Regex too greedy may strip legitimate problem description content
Verification plan: Unit tests cover 8 positive + 4 negative samples; smoke test trên staging với sample customer chat
```

**Vấn đề:** Customer chat Kael "Tôi ở Vinhomes Central Park tầng 25 căn A.25.07" → đi nguyên văn lên Anthropic prompt + log api_logs.

**Fix:** Mở rộng `scrubSensitiveForLLM` ở `supabase/functions/mobile-api/_shared/kael.ts:1260` thêm regex strip:
- Tên chung cư phổ biến HCMC: Vinhomes, Masteri, Saigon, Sun, etc. + "căn", "tầng", "lầu", "block", "tòa" với số đi kèm
- Số tài khoản ngân hàng VN (8-15 số liên tiếp)
- Đường + số nhà (regex "{số} {tên đường}")

**Files thay đổi:**
- `supabase/functions/mobile-api/_shared/kael.ts` — function scrubSensitiveForLLM
- `packages/shared/src/__tests__/` — thêm test cho 5-8 input mẫu

**Verify:**
- Unit test cho từng pattern (phone, email, ID, address chung cư, đường, ngân hàng)
- Negative test: chuỗi không có PII không bị strip nhầm
- Test sample: "tôi ở Vinhomes Central Park tầng 25" → "tôi ở [building] [floor]"

**Risk:** thấp. Nếu regex sai có thể strip nhầm. Mitigate bằng test bao quát.

#### 22.6.C — Fix 1.2: A12 evidence render (D14)

**Authority refs:**
- `critical.md` §16 `kael-ui-rn-execution` + §9A `kael-code-enhancement`
- `RULES.md` Rule #8 (Data Honesty)
- `STRUCTURES.md` §6 A12 Completion Confirmation, §11 JobLifecycleModule
- `design.md` (UI render contract — empty/loading/error states cho evidence panel)
- `docs/architecture/code-ownership-map.md` row "A12 completion confirmation" → customer history surface owner
- `skills.md` Skill 3 (Surgical Changes)

**Pre-edit status:**

```
Asked task: A12 confirmation phải hiển thị final_price + completion_photo_urls + completion_notes thực
Real goal: Customer thấy bằng chứng trước khi tap confirm; remove fake placeholder labels
Task class: ui
Selected protocols: kael-preflight + kael-ui-rn-execution + kael-code-enhancement + kael-review
Risk notes: LocalDeal hiện không có completionNotes/completionPhotoUrls field — phải thêm vào shared/mobile-workflow.ts và hydrate map
Verification plan: Manual end-to-end completion path; wiring test assert UI binds deal.finalPrice; screenshot evidence
```

**Vấn đề:** `apps/mobile/components/customer/customer-surfaces.tsx:1316` hardcode `value={copy.history.waitingWorkerPrice}` thay vì đọc `deal.finalPrice`. Lines 1308-1313 evidence tiles render label string thay vì `completion_photo_urls`.

**Note source change (Tu 2026-05-23):** `deal.finalPrice` source = **Kael-locked value** (set at A7 confirm hoặc latest A11 approve), KHÔNG phải worker-typed value. Phase 2.0 update backend để jobs.final_price = Kael computed. UI Phase 1.2 chỉ cần đọc giá trị từ jobs.final_price qua snapshot — independent of source (worker vs Kael).

Implementation Phase 1.2 có thể land TRƯỚC Phase 2.0 vì:
- Phase 1.2 chỉ thay "hardcoded placeholder string" → "đọc deal.finalPrice"
- Phase 2.0 sau đó change "deal.finalPrice source" từ worker input → Kael compute
- UI binding `deal.finalPrice` không cần biết source — chỉ render giá trị

Tuy nhiên copy label nên cập nhật khi Phase 2.0 land: "Giá cuối (Kael xác định)" thay vì chỉ "Giá cuối".

**Fix:**
- Đọc `deal.finalPrice` từ `state.deal.finalPrice` (đã có trong LocalDeal type per `packages/shared/src/mobile-workflow.ts:91`)
- Format VND qua `formatVnd()` helper (đã tồn tại)
- Render `completion_photo_urls` array thành Image components — cần thêm field vào LocalDeal snapshot từ JobDetailResponse
- `confirmCompletionReceived` Alert.alert: thêm body string list final_price + photos count + completion_notes
- Tốt hơn: thay Alert bằng modal/sheet hiển thị evidence trước nút "Xác nhận đã nhận"

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx` — CustomerHistorySurface đoạn `showDoneTab && isCompletedHistory` block
- `packages/shared/src/mobile-workflow.ts` — LocalDeal thêm `completionPhotoUrls?: string[]`, `completionNotes?: string`
- `apps/mobile/lib/frontend-workflow-provider.tsx` — `jobDetailToSnapshot` map từ JobDetailResponse sang LocalDeal
- `apps/mobile/lib/api-types.ts` — verify JobDetailResponse có `final_price`, `completion_notes`, `completion_photo_urls`

**Verify:**
- Manual test: tạo job đến state `completed_by_worker`, vào History tab Done → thấy giá thật + ảnh + ghi chú
- Test wiring: assert UI renders `deal.finalPrice` value chứ không phải placeholder
- Negative: khi `final_price === null`, render label "Đang chờ giá" (current behavior là acceptable fallback)

**Risk:** thấp. Pure UI fix. Cần verify field tồn tại trong API response (đoán có vì lifecycle.ts có column).

#### 22.6.D — Fix 1.3: A11 dual UX dedup (C5)

**Authority refs:**
- `critical.md` §16 `kael-ui-rn-execution` + §9A `kael-code-enhancement`
- `RULES.md` Rule #7 (No Autonomous Money Actions Without Confirmation)
- `STRUCTURES.md` §6 A11 + §12 Scope Change Status + §15 Scope Change
- `design.md` (modal contract — hard-stop modal semantics)
- `docs/architecture/code-ownership-map.md` row "A11 scope change decision"
- `skills.md` Skill 3 (Surgical Changes — chỉ xóa inline path, không touch modal)

**Pre-edit status:**

```
Asked task: Xóa inline Approve/Reject + Alert.alert ra khỏi History, modal là source duy nhất
Real goal: A11 hard-stop guarantee không bị break bởi alternate path
Task class: ui (structural removal)
Selected protocols: kael-preflight + kael-ui-rn-execution + kael-code-enhancement + kael-review
Risk notes: Có thể có user/test depend on inline testID — verify trước khi xóa
Verification plan: Manual force scope_change pending, verify CHỈ modal hiện; wiring test scrub inline testID
```

**Vấn đề:** `apps/mobile/components/customer/customer-surfaces.tsx:1273-1297` có inline Approve/Reject buttons với `decideCurrentScopeChange` → Alert.alert có nút "Kiểm lại" cancel. Song song với hard-stop modal ở line 1207-1217.

**Fix:** Xóa inline buttons + `decideCurrentScopeChange` function. Modal hard-stop là source duy nhất cho A11 decision. Inline section chỉ render thông tin (description + reason + new price) làm reference, không có CTA.

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx`:
  - Xóa `decideCurrentScopeChange` (line 1179-1195)
  - Đoạn `(showRepairTab || showPriceTab)` scope-change block (line 1273-1297): bỏ workerActions + workerMetaRow + 2 buttons. Giữ TwoCol info.

**Verify:**
- Unit/wiring test: assert History surface không có testID `customer-scope-change-decision` (or rename it)
- Manual: trigger scope change pending → CHỈ modal hiện, không có path nào khác để decide

**Risk:** thấp. Modal đã cover toàn bộ logic.

---

### 22.7 — Phase 2: Trust Foundation

Scope: 5 fix S-tier (4 cũ + NEW 2.0 Kael Price Authority). Blocking first real transaction. Effort lớn hơn Phase 1.

#### 22.7.A — Phase 2 Preflight (BẮT BUỘC trước khi bắt đầu phase)

```
[ ] Read critical.md §16 kael-ui-rn-execution + §9 kael-architecture-deepening + §14 kael-supabase + §7 kael-tdd + §15 kael-security-sweep
[ ] Read RULES.md Rule #5, #7, #8, #9, #10 (Vietnamese, confirmation, honesty, PII, timeout)
[ ] Read STRUCTURES.md §6 A10/A11/A12, §7 B6/B7, §11 ChatEvidenceModule + JobLifecycleModule + NotificationModule, §16 Notifications
[ ] Read design.md (chat bubble contract, media upload UX, completion form layout)
[ ] Read AGENTS.md (data honesty + glass material caveat)
[ ] Read docs/architecture/code-ownership-map.md (chat owner row, media upload row, notification row)
[ ] Read docs/foundation/expo-push-spike.md, geo-data-spike.md
[ ] Read docs/ops/worker-onboarding.md (cho 2.4 account_approved)
[ ] Read skills.md (all 4 skills + decision protocol)
[ ] Read MEMORY.md LAST
[ ] Verify push token registration state (per MEMORY.md PR #25 caveat)
[ ] Confirm chat backend test gates exist (services.ts + router.ts)
```

#### 22.7.B — Fix 2.0: Kael Final Price Authority (NEW — Tu decision 2026-05-23)

**Authority refs:**
- `critical.md` §9 `kael-architecture-deepening` + §12 `kael-ai-boundary` + §14 `kael-supabase` + §7 `kael-tdd` + §15 `kael-security-sweep` + §20 `kael-docs-execution`
- `RULES.md` Rule #2 (AI wrapper), Rule #3 (Validate AI output), Rule #4 (Disclaimer), Rule #7 (No autonomous money actions), Rule #8 (No fake data), Rule #10 (Timeout/retry)
- `STRUCTURES.md` §6 A7/A11/A12, §7 B6/B7, §9 Kael Workflow, §11 KaelPriceCheckModule + JobLifecycleModule + ScopeChangeModule, §15 Pricing
- `design.md` (A11 modal layout cho new Kael-computed estimate)
- `docs/architecture/code-ownership-map.md` Edge Runtime rows
- `skills.md` (Skill 1 Think Before Coding mạnh nhất — architectural decision)

**Pre-edit status (paste TRƯỚC khi edit code hoặc doc):**

```
Asked task: Kael owns final price authority — worker không tự nhập final_price
Real goal: Closes worker overcharge hole; A11/A12 customer thấy giá Kael-computed; dispute auditable
Task class: feature (workflow architectural change, cross-cutting backend + UI)
Selected protocols: kael-preflight + kael-architecture-deepening + kael-ai-boundary + kael-supabase + kael-tdd + kael-security-sweep + kael-docs-execution + kael-review
Risk notes:
  - LOCKED doc edit (STRUCTURES.md §6 B7, §7 B6, §15 Pricing) — Tu MUST approve explicitly
  - Kael cost: thêm AI call cho mỗi B6 scope change. Verify cost cap không vượt limit.
  - Backward compat: jobs cũ có worker-typed final_price không bị mất (read-only legacy)
  - Edge contract change breaks mobile if release mismatch — phải coordinate deploy
Verification plan:
  - STRUCTURES.md edit approved by Tu
  - Lifecycle.ts schema test reject worker-typed final_price
  - Edge integration test: requestScopeChange với worker price field → 400 VALIDATION
  - Edge integration test: computeScopeChangeEstimate trả về structured Kael output
  - Mobile B7 form không có price input
  - Mobile A11 modal hiển thị Kael compute output
  - Mobile A12 displays jobs.final_price (Kael-locked source)
  - End-to-end smoke trên staging: full A0→A14 với 1 scope change → final price = Kael compute
```

##### 22.7.B.1 — Backend: Lifecycle + Edge contract update

Files thay đổi:
- `supabase/functions/mobile-api/_shared/lifecycle.ts` — `completed_by_worker` transition không còn trigger `final_price` requirement từ worker payload
- `supabase/functions/mobile-api/_shared/router.ts` workerStatusUpdateSchema function (router.ts:1131):
  - Xóa `final_price` từ schema accept
  - Xóa "Cần nhập giá cuối cùng khi hoàn thành" error
  - Schema chỉ accept `status`, `completion_notes`, `completion_photo_urls`
- `supabase/functions/mobile-api/_shared/router.ts` workerScopeChangeSchema:
  - Xóa `new_price_min`, `new_price_max` từ worker input
  - Chỉ accept `new_description`, `reason`, `photo_urls`
- `supabase/functions/mobile-api/_shared/services.ts` updateJobStatus (services.ts:1324):
  - Không apply `final_price` từ input
  - `final_price` source: từ jobs record (đã Kael-locked at A7 confirm hoặc A11 approve)
- `supabase/functions/mobile-api/_shared/services.ts` requestScopeChange (services.ts:1402):
  - Sau khi insert scope_change_requests, GỌI Kael compute new estimate
  - Lưu Kael-computed price_min/max vào scope_change_requests
  - Edge response trả về Kael compute result
- `supabase/functions/mobile-api/_shared/services.ts` decideScopeChange (services.ts:1820):
  - Khi approve: update `jobs.final_price = scope_change_requests.kael_computed_max` (hoặc median) atomically
  - Khi reject: cancel job (đã có per migration 20260518181500)
- `supabase/functions/mobile-api/_shared/services.ts` confirmSearch (services.ts:1009):
  - At A7 confirm, lock `jobs.final_price = kael_price_max` (hoặc median) — initial Kael-locked baseline
- New migration `supabase/migrations/2026MMDD_kael_final_price_authority.sql`:
  - Trigger ngăn worker direct DML set `jobs.final_price` (đã có lock từ migration 20260518032000 nhưng add comment for clarity)
  - Add columns `scope_change_requests.kael_computed_min/max` nếu chưa có (verify schema first)

##### 22.7.B.2 — Backend: Kael compute scope change estimate

Files:
- `supabase/functions/mobile-api/_shared/kael.ts`:
  - Add function `computeScopeChangeEstimate(originalJobContext, newScopeDescription, secrets)`:
    - Input: original problem identification + complexity + price range + new scope description from worker
    - Use Anthropic (claude-sonnet-4-6) với prompt: "Given original Kael analysis [X] và worker's new scope report [Y], compute updated estimate range. Output structured JSON."
    - Output: `{ problem_summary_delta, complexity_delta, price_min, price_max, confidence, advisory, disclaimer }`
    - Validate output schema (Rule #3)
    - Log api_logs (cost, latency)
    - Fallback: nếu Kael fail, return error → scope change request marked `KAEL_FAILED`, admin path required
  - Reuse `reviewScopeChange` (kael.ts:213) nếu phù hợp, hoặc fork

##### 22.7.B.3 — Mobile: Remove worker price input

Files:
- `apps/mobile/components/worker/worker-surfaces.tsx`:
  - IncomingRequestSheet (worker-surfaces.tsx:2024):
    - Xóa `finalPriceDraft` state
    - Xóa `Number.parseInt(finalPriceDraft...)` validation
    - Xóa `final_price: finalPrice` từ `actions.workerUpdateStatus` call payload
    - Xóa `TextInput accessibilityLabel={actionCopy.finalPrice}` (line 2220-2231)
    - Xóa `scopePriceDraft` + scope TextInput (line 2190-2198)
    - Form chỉ còn: scope description + reason (cho B6), notes + photos (cho B7)
- `apps/mobile/lib/services.ts`:
  - `jobService.updateStatus` signature: gỡ `final_price?: number` từ extras (line 88)
  - `jobService.requestScopeChange` input: gỡ price fields
- `apps/mobile/lib/api-types.ts`:
  - Verify type definitions không expose price input cho worker

##### 22.7.B.4 — Mobile: A11 modal display Kael compute

Files:
- `apps/mobile/components/customer/scope-change-modal/scope-change-hard-stop-modal.tsx`:
  - Verify `scopeChange.priceMin/priceMax` source = Kael compute (per backend update)
  - Copy update: "Ước tính mới do Kael tính lại dựa trên phạm vi thợ báo cáo"
  - Add Kael badge / icon để phân biệt với worker-typed

##### 22.7.B.5 — Mobile: A12 read Kael-locked final price

Liên kết với Phase 1.2 (D14): nay xác nhận source = `jobs.final_price` (Kael-locked, không phải worker input).

##### 22.7.B.6 — STRUCTURES.md edit (LOCKED DOC — Tu approval required)

Sections cần edit:
- **§6 A11 Scope Change Confirmation:** thay "old estimate vs new estimate" → "old Kael estimate vs new Kael-computed estimate based on worker's reported scope"
- **§6 A12 Completion Confirmation:** clarify "final price = Kael-locked value at A7 or latest A11 approval"
- **§7 B6 Scope Change Request:** worker input = description + reason + photos. KHÔNG còn `new_price_min/max`.
- **§7 B7 Complete Job:** worker input = completion notes + completion photos. KHÔNG còn `final_price`.
- **§11 KaelPriceCheckModule:** thêm responsibility "compute scope change estimate from worker's reported scope"
- **§11 ScopeChangeModule:** clarify Kael review = price re-compute, not worker price validation
- **§15 Pricing — Scope Change:** update flow để reflect Kael authority

Agent MUST stop và present Tu the exact diff trước khi edit STRUCTURES.md.

**Verify:**
- STRUCTURES.md edit approved
- Schema test: worker scope change request thiếu price field → no error (input now optional/removed)
- Schema test: worker complete với final_price → 400 VALIDATION
- Integration test: scope change → Kael `computeScopeChangeEstimate` trả structured output
- Integration test: A11 approve → `jobs.final_price` updated to Kael compute value
- Manual E2E staging: 1 job với 1 scope change → final price === Kael compute (verify in DB)

**Risk:** lớn — architectural change. Mitigate bằng:
- Migration không break old jobs (backward compat)
- Phase 2.0 deploy backend trước, mobile theo sau với feature flag nếu cần
- Smoke test staging với disposable user

#### 22.7.C — Fix 2.1: Customer-worker chat wire 2 phía (D3)

**Vấn đề:** `WorkerChatContent` (apps/mobile/components/worker/worker-surfaces.tsx:1036) dùng `useState<WorkerChatMessage[]>([])` local-only. `CustomerHistoryChatPanel` (apps/mobile/components/customer/customer-surfaces.tsx:1801) chỉ là card pointer.

**Fix:**

A. **Worker side:**
- Thay `useState<WorkerChatMessage[]>([])` bằng query `jobService.listMessages(jobId)` qua useEffect khi deal có jobId + đổi key
- `submitWorkerKaelLocalDraft` đổi tên thành `submitWorkerChatMessage`, gọi `await jobService.sendMessage(jobId, { content })`, sau đó refetch list (hoặc optimistic append với pending state)
- Thêm error UI nếu send fail

B. **Customer side:**
- Tạo CustomerChatPanel mới (hoặc rebuild CustomerHistoryChatPanel) render messages list + composer
- Render history qua `jobService.listMessages(jobId)`
- Composer gọi `jobService.sendMessage(jobId, ...)`

C. **Polling vs realtime:**
- Phase 2 dùng polling on focus + AppState (đã có pattern trong frontend-workflow-provider)
- Realtime subscription move sang Phase 5 B13 (D9)

D. **Sender bubble distinction:**
- Kael system messages (`sender_role='kael'`) visually distinct theo STRUCTURES.md §A10
- Customer/worker bubble theo `sender_id === auth.uid()`

**Files thay đổi:**
- `apps/mobile/components/worker/worker-surfaces.tsx` — WorkerChatContent
- `apps/mobile/components/customer/customer-surfaces.tsx` — CustomerHistoryChatPanel hoặc tạo subcomponent CustomerChatMessages
- `apps/mobile/lib/services.ts` — đã có `jobService.listMessages/sendMessage`, không thay đổi
- `apps/mobile/lib/api-types.ts` — verify JobMessageListResponse + JobMessageSendResponse shape
- `packages/shared/src/__tests__/mobile-wiring.test.ts` — assert WorkerChatContent gọi listMessages + sendMessage

**Verify:**
- Manual: 2 device test, worker gõ tin nhắn → customer thấy trong History
- Integration: dùng staging Edge, send message → query messages → assert content khớp
- Edge case: send khi không có quyền (worker chưa accept) → 403
- Empty state: no messages → composer + waiting copy

**Risk:** trung. UI rebuild non-trivial. Realtime delay = polling interval (chấp nhận Phase 2).

#### 22.7.D — Fix 2.2: Worker B7 completion form — notes + photos ONLY

**Lưu ý:** Cập nhật theo decision 2026-05-23 (Phase 2.0): worker KHÔNG nhập `final_price` ở B7. Worker chỉ submit notes + photos. Final price = Kael-locked (Phase 2.0).

**Authority refs:**
- `critical.md` §16 `kael-ui-rn-execution` + §7 `kael-tdd`
- `RULES.md` Rule #7 (Confirmation), Rule #8 (No fake), Rule #9 (PII trong notes)
- `STRUCTURES.md` §7 B7 Complete Job (đã được Phase 2.0 propose update)
- `design.md` (form layout cho completion notes textarea + photo grid)
- `docs/architecture/code-ownership-map.md` row "B7 completion evidence"
- `skills.md` Skill 3 (Surgical Changes)

**Pre-edit status:**

```
Asked task: Worker B7 form chỉ collect completion_notes + completion_photo_urls (không có price input per Phase 2.0)
Real goal: Evidence trail đầy đủ cho A12 customer confirm; Kael giữ price authority
Task class: ui
Selected protocols: kael-preflight + kael-ui-rn-execution + kael-tdd + kael-review
Risk notes: Validate notes length + photo count; tránh upload race; phụ thuộc Phase 2.0 land trước
Verification plan: Manual: worker complete → form 2 fields → submit thành công → A12 customer thấy notes + photos; Schema test: payload không có final_price; Edge test: status update accept thiếu final_price
```

**Vấn đề:** `IncomingRequestSheet` line 2056-2074 (apps/mobile/components/worker/worker-surfaces.tsx) hiện chỉ thu `finalPriceDraft`, hardcode `completion_photo_urls: []`, không có completion_notes input.

**Fix:**
- Xóa `finalPriceDraft` state + validation (Phase 2.0 đã làm backend; UI loại bỏ field này)
- Thêm `completionNotesDraft` state + TextInput multiline (min 10 chars khuyến nghị, không bắt buộc cứng)
- Thêm photo picker — reuse `media-upload.ts` `uploadJobMediaDrafts(jobId, drafts, stage: 'after')`
- Submit form validate:
  - `completion_notes` recommended >= 10 chars (warn nếu < 10, không block)
  - `completion_photo_urls` >= 1 ảnh (tối thiểu, block submit nếu 0)
- Upload photos qua `uploadJobMediaDrafts` trước, lấy `supabase://` URLs, sau đó gọi `workerUpdateStatus(completed_by_worker, { completion_photo_urls: uploadedUrls, completion_notes })`
- Show Kael-locked final price (read-only) trên form để worker biết số sẽ submit về (transparency)

**Files thay đổi:**
- `apps/mobile/components/worker/worker-surfaces.tsx` — IncomingRequestSheet
- `apps/mobile/lib/media-upload.ts` — verify support `stage='after'` (bucket completion-photos)
- Reuse existing `LocalMediaUploadDraft` type

**Verify:**
- Manual: worker complete job → form 2 fields (notes + photos) → submit thành công → customer thấy notes + photos
- Schema test: assert mobile payload KHÔNG có `final_price` field
- Edge test: Edge response không apply worker-typed price
- Edge case: photo upload fail → form không submit, show error

**Risk:** trung. Cần test upload flow trên device thật. Phụ thuộc Phase 2.0 backend land trước.

#### 22.7.E — Fix 2.2b: Worker B6 scope change form — description + reason + photos ONLY

**Lưu ý:** Cập nhật theo decision 2026-05-23 (Phase 2.0): worker KHÔNG nhập price range ở B6. Kael compute mới sau khi worker submit.

**Fix:**
- Xóa `scopePriceDraft` state + price TextInput (Phase 2.0 đã loại bỏ schema)
- Giữ `scopeDescriptionDraft` + thêm `scopeReasonDraft` riêng (không reuse description)
- Thêm photo picker với `stage='scope'` (bucket job-media)
- Validate description >= 10 chars, reason >= 10 chars, photos optional (recommended)
- Submit gọi `actions.requestScopeChange({ new_description, reason, photo_urls })` (không có price)

**Files thay đổi:**
- `apps/mobile/components/worker/worker-surfaces.tsx` — scope-change request section in IncomingRequestSheet
- `apps/mobile/lib/services.ts` — verify `requestScopeChange` signature không có price (Phase 2.0 update)
- `packages/shared/src/validation.ts` — `WorkerScopeChangeInput` schema không có price

**Verify:**
- Manual: worker request scope → form 3 fields (desc + reason + photos) → submit → Edge Kael compute → A11 modal hiện Kael compute
- Schema test: payload không có price field
- Integration test: `requestScopeChange` E2E → assert `scope_change_requests.kael_computed_max` set

#### 22.7.F — Fix 2.3: Customer missing notifications (D1a)

**Vấn đề:** Edge emit chỉ 5 customer event_type. Thiếu `estimate_ready`, `no_worker_found`, `review_requested`.

**Fix:** Thêm vào `supabase/functions/mobile-api/_shared/services.ts`:

A. `estimate_ready` — sau khi `runKaelPipeline` xong trong `createJob` (line 319+) hoặc `confirmKaelChat`:
```ts
await insertUserNotification(client, {
  userId: ctx.user.id,
  jobId,
  eventType: "estimate_ready",
  title: "Kael đã ước tính xong",
  body: "Vui lòng kiểm tra trong Hoạt động.",
  metadata: { service_type, price_min, price_max },
})
```

B. `no_worker_found` — trong `confirmSearch` (line 1009) nếu eligible workers = 0 hoặc batch hết:
```ts
await insertUserNotification(client, {
  userId: customerId,
  jobId,
  eventType: "no_worker_found",
  title: "Chưa có thợ phù hợp",
  body: "Kael sẽ tiếp tục theo dõi và báo lại khi có thợ.",
  metadata: {},
})
```

C. `review_requested` — sau `confirmCompletion` trong services.ts:
```ts
await insertUserNotification(...eventType: "review_requested", ...)
```

D. Push helper send qua `sendPushToUser` với deep_link `/(customer)/history?job_id=${jobId}`.

**Files thay đổi:**
- `supabase/functions/mobile-api/_shared/services.ts` — thêm 3 helper notify functions + call sites
- Mirror Next.js parity ở `apps/api/src/lib/notifications/` nếu reference parity được giữ

**Verify:**
- Integration test: tạo job → assert notification row `estimate_ready` exist
- Negative: nếu Kael pipeline fail, không emit `estimate_ready`
- Manual: smoke test trên staging — full flow

**Risk:** thấp. Pure additive Edge logic.

#### 22.7.G — Fix 2.4: Worker missing notifications (D1b)

**Vấn đề:** Worker thiếu `account_approved`, `customer_message_received`, `customer_confirmed_completion`, `broadcast_expired`, `earning_updated`.

**Fix:** Thêm vào services.ts tương tự 2.3:

A. `account_approved` — trigger trong admin path. Vì admin approval workflow chưa wire (Phase 5 M9), trước mắt thêm worker `verification_status` change trigger trong DB. Cần migration thêm trigger gọi `insert_notification_atomic` khi `worker_profiles.is_approved` đổi false → true.

B. `customer_message_received` — sau `sendJobMessage` (services.ts:1740), nếu `sender_role = 'customer'` và recipient = worker:
```ts
await insertUserNotification(... eventType: "customer_message_received" ...)
```
Ngược lại: `worker_message_received` cho customer.

C. `customer_confirmed_completion` — trong `confirmCompletion` (services.ts:1866) sau khi đổi state thành công, notify worker.

D. `broadcast_expired` — khi batch cycle cycle through và worker không respond trong 60s. Cần logic ở batch reassign code.

E. `earning_updated` — defer (payment chưa wire, không emit fake).

**Files thay đổi:**
- `supabase/functions/mobile-api/_shared/services.ts` — `sendJobMessage` + `confirmCompletion` + broadcast cycle
- `supabase/migrations/2026MMDD_worker_approved_notification_trigger.sql` — DB trigger cho A
- Mobile: handle deep_link `/(worker)/jobs?job_id=...` đã có trong push-notifications.ts

**Verify:**
- Integration test cho 4 path (A/B/C/D)
- Manual: register worker → admin approve trong supabase studio → device receive notification

**Risk:** trung. Migration mới + Edge update đồng bộ. Cần test trên staging trước production.

---

### 22.8 — Phase 3: Section Rạch Ròi (Tu's main UX concern)

Scope: Restructure 3 customer tab Home/Booking/Kael để mỗi tab có vai trò KHÁC NHAU thật sự (Tu chốt). Đây là phase lớn nhất về UI.

#### 22.8.A — Phase 3 Preflight (BẮT BUỘC trước khi bắt đầu phase)

```
[ ] Read critical.md §9 kael-architecture-deepening + §16 kael-ui-rn-execution + §9A kael-code-enhancement
[ ] Read RULES.md Rule #5 (Vietnamese), Rule #6 (Kael scope), Rule #7 (Confirmation), Rule #4 (Disclaimer)
[ ] Read STRUCTURES.md §6 A0-A14 customer steps, §18 Frontend Build Contract, §1 Kael scope
[ ] Read design.md FULLY (production glass contract + mint/cream/cyan tokens)
[ ] Read AGENTS.md (language rules + glass + motion + data honesty)
[ ] Read docs/architecture/code-ownership-map.md (booking row, kael row, home row, shared mobile state row)
[ ] Read docs/design/frontend-redesign-production-contract-20260521.md
[ ] Read docs/design/production-glass-motion-contract.md
[ ] Read skills.md (Skill 2 Simplicity First strongly, Skill 3 Surgical Changes — KHÔNG drive-by refactor)
[ ] Read MEMORY.md (PR #20-#25 design context)
[ ] Apply kael-prototype protocol khi cần test design quyết định trước production absorb
[ ] Verify visual references local recording + glassmorphism YouTube refs cho motion direction
```

Critical: Phase 3 là phase Tu prioritize cao nhất (section đúng vai trò). KHÔNG được skip preflight reading. Mỗi UI quyết định MUST trace về `design.md` token/layer rule.

#### 22.8.B — Fix 3.1: Booking tab — A2-A6 wizard step-by-step

**Vấn đề:** Hiện `CustomerBookingEntrySurface` giống Home (3 service cards + placeholder). Không có A3 description, A4 clarification, A5 estimate card, A6 time, A7 confirm steps.

**Fix:** Rebuild thành multi-step wizard:

```
Step A2 — Choose service (electrical/plumbing/cleaning)
Step A3 — Describe + photos upload + address picker
Step A4 — Kael clarification (0-2 questions, skip if context enough)
Step A5 — Estimate card với disclaimer
Step A6 — Time selection (hiện chỉ Now, label honest)
Step A7 — Summary screen với fee + cancellation note + Confirm CTA
```

**Implementation:**
- State machine local cho wizard (`useReducer` hoặc Zustand store mini)
- Mỗi step 1 component riêng trong `apps/mobile/components/customer/booking-wizard/`
- Backend: tái sử dụng `jobService.createJob` (sau A3) + `kaelChatService.sendTurn` (A4) + `jobService.confirmSearch` (A7)
- Nếu user tap back, state preserve cho phép edit step trước
- Wizard không dùng Kael chat surface — đó là độc lập

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx` — gut `CustomerBookingEntrySurface`, render `<BookingWizard />`
- `apps/mobile/components/customer/booking-wizard/` — folder mới với BookingWizard.tsx + Step{2,3,4,5,6,7}.tsx + state.ts
- `apps/mobile/components/customer/booking-wizard/contracts.md` — copy contract for each step (link sang phase 4 M6)

**Verify:**
- Manual end-to-end qua wizard
- Test wiring assert mỗi step có testID + state.ts handle back/forward
- Empty/loading/error states cho mỗi step

**Risk:** lớn. Đây là rebuild UI lớn. Có thể split thành 3.1a (skeleton + A2 + A3) → 3.1b (A4 + A5) → 3.1c (A6 + A7 summary).

#### 22.8.C — Fix 3.2: Kael tab — ask-anything, không tạo job

**Vấn đề:** Hiện `CustomerKaelSurface` có composer + 3 service cards → đẩy sang Kael chat → tạo job. Tu muốn Kael tab CHỈ là Q&A, không tạo job.

**Fix:**
- Kael tab render conversational chat surface (gần giống kael-chat.tsx nhưng KHÔNG có "Xác nhận tìm thợ" CTA)
- Backend dùng `kaelChatService.create` + `sendTurn` đã có. Session là throwaway — không qua `confirmKaelChat` → không tạo job.
- User muốn book → có nút "Đặt qua wizard" → push sang Booking tab (3.1)

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx` — `CustomerKaelSurface` rebuild
- Reuse `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` styles/components, fork variant `kael-qna-surface.tsx`
- Edge: `confirmKaelChat` chỉ available qua wizard, không qua Kael tab

**Verify:**
- Manual: trong Kael tab, không có path nào tạo job
- Wiring: assert `KaelChatSurface` không có CTA confirm

**Risk:** trung. Fork existing kael-chat component, cẩn thận không break.

#### 22.8.D — Fix 3.3: Home tab — active state + shortcuts, sửa naming

**Vấn đề:** Home shortcuts misnamed (Address → Profile, Trust → Kael).

**Fix:**
- "Address" shortcut → open address editor (modal hoặc redirect đúng nơi sửa address), KHÔNG sang Profile generic
- "Trust" shortcut → mở trust signals modal (worker rating average, completed jobs, platform fee transparency), KHÔNG sang Kael chat
- 3 service cards remain → push sang Booking wizard step 1 (chọn service), KHÔNG vào Kael chat
- "Quick active" shortcut → History tab với active job (OK)
- "Quick history" → History tab (OK)

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx` — `CustomerHomeSurface`, `homeShortcuts` array + service card handlers
- Có thể cần thêm `apps/mobile/components/customer/address-editor.tsx`, `trust-info-modal.tsx`

**Verify:**
- Manual: tap mỗi shortcut → arrive đúng surface với chức năng đúng tên
- Wiring: testID `customer-home-shortcut-address` → route đúng

**Risk:** thấp-trung. UI tweak + có thể thêm 2 component nhỏ.

#### 22.8.E — Fix 3.4: Booking tab visibility logic clean

**Vấn đề:** `tabBarStyle: { display: 'none' }` ở booking tab + dock không hiển thị trong wizard mode.

**Fix:**
- Wizard fullscreen mode (giấu dock khi đang trong step 2-7) — acceptable UX
- Hoặc giữ dock visible, wizard step content scrollable trong frame — clean hơn

Quyết định trong implementation. Document trong contract.

**Verify:** manual qua mỗi step.

**Risk:** thấp.

---

### 22.9 — Phase 4: Communication Polish

Scope: A-tier minor fixes. Mỗi item nhỏ, có thể parallel.

#### 22.9.A — Phase 4 Preflight

```
[ ] Read critical.md §16 kael-ui-rn-execution + §12 kael-ai-boundary + §14 kael-supabase + §20 kael-docs-execution
[ ] Read RULES.md Rule #3 (Validate AI Output), Rule #4 (Disclaimer), Rule #5 (Vietnamese), Rule #10 (Retry)
[ ] Read STRUCTURES.md §6 A7/A14, §15 Pricing Fees, §16 Notifications, §17 Failure Recovery
[ ] Read design.md (estimate card layout + review form layout)
[ ] Read docs/architecture/code-ownership-map.md
[ ] Read skills.md
[ ] Read MEMORY.md
```

#### 22.9.B — Fix 4.1: Kael A7 summary đầy đủ (D6)

**Vấn đề:** EstimateCard không có platform fee + cancellation note.

**Fix:**
- Thêm vào EstimateCard (kael-chat-surface.tsx:364):
  - Platform fee row: "Phí nền tảng: ~7.5%"
  - Cancellation note row: copy nói rõ chính sách hủy
  - Final breakdown row: "Tổng dự kiến: X - Y VND (đã bao gồm phí)"
- Reuse same component trong Booking wizard step 7 (A7 summary)

**Files thay đổi:**
- `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx` — EstimateCard
- Hoặc extract `EstimateSummary` thành component riêng

**Risk:** thấp.

#### 22.9.C — Fix 4.2: A14 review tags + comment (C7)

**Vấn đề:** `submitSelectedReview` (customer-surfaces.tsx:1175) gọi `actions.submitReview({ rating: reviewRating, tags: [] })`. UI không có chip picker, không có textarea.

**Fix:**
- Thêm chip selector cho 5 tags: "Đúng giờ", "Lịch sự", "Sạch sẽ", "Giải thích rõ", "Giá hợp lý"
- Thêm TextInput multiline cho comment (optional)
- Submit truyền `{ rating, tags: selectedTags, comment }`

**Files thay đổi:**
- `apps/mobile/components/customer/customer-surfaces.tsx` — review section trong `CustomerHistorySurface`
- Verify `ReviewInput` schema trong `shared/validation.ts` accept tags + comment (đã có)

**Risk:** thấp.

#### 22.9.D — Fix 4.3: Push retry policy (D11)

**Vấn đề:** `sendExpoBatch` single attempt, fail → drop.

**Fix:**
- Wrap `sendExpoBatch` với retry helper:
  - 2 retries
  - Exponential backoff 500ms → 2s → 8s (cap 10s)
  - Retry chỉ khi `EXPO_REQUEST_FAILED` hoặc HTTP 5xx
  - Không retry khi `DeviceNotRegistered` hoặc HTTP 4xx
- Critical event_type (`scope_change_requested`, `worker_matched`, `completed_by_worker`) ưu tiên retry; minor (status update, broadcast received) chỉ try 1 lần

**Files thay đổi:**
- `supabase/functions/mobile-api/_shared/push.ts` — `sendExpoBatch` + new helper

**Risk:** thấp. Pure server-side improvement.

#### 22.9.E — Fix 4.4: Copy canonical source (M6)

**Vấn đề:** Tất cả copy Việt nằm rải rác trong surface files. RULES.md chỉ lock 1 disclaimer.

**Fix:**
- Tạo `docs/copy/workflow-copy-vi.md` + `docs/copy/workflow-copy-en.md`
- Liệt kê copy theo step: A0, A1, A2, ..., A14, B0-B8, A11 modal, A12 confirmation, A14 review tags, error states, empty states
- Mỗi surface import từ generated TypeScript constants (sinh từ md file qua script đơn giản)
- Hoặc đơn giản hơn: file `apps/mobile/lib/copy/customer-copy.ts` + `worker-copy.ts` thành single source thay vì inline trong từng surface

**Files thay đổi:**
- `docs/copy/workflow-copy-{vi,en}.md` — new
- `apps/mobile/lib/copy/` — new folder
- Surface files import từ đây thay vì inline

**Risk:** trung. Refactor lớn nhưng pure rename + relocation.

---

### 22.10 — Phase 5: Long-term Hygiene

Scope: B-tier issues. Dọn dẹp trước khi nhân sự khác đụng code. Có thể parallelize.

#### 22.10.A — Phase 5 Preflight

```
[ ] Read critical.md §9 kael-architecture-deepening + §14 kael-supabase + §15 kael-security-sweep + §20 kael-docs-execution + §7 kael-tdd
[ ] Read RULES.md Rule #0 (Mobile Runtime Boundary) + §Security Invariants
[ ] Read STRUCTURES.md §3 roles, §8 Admin Workflow, §11 modules, §12 state machines, §16 Notifications
[ ] Read design.md
[ ] Read AGENTS.md (admin role notes)
[ ] Read docs/architecture/code-ownership-map.md (auth + admin rows)
[ ] Read skills.md (Skill 2 Simplicity First — KHÔNG over-engineer admin shell)
[ ] Read MEMORY.md (admin path historical decisions)
```

#### 22.10.B — Fix 5.1: Admin /(admin)/ separate route (M9)

**Vấn đề:** Admin bypass vào customer/worker shell + Edge cho admin chạy mọi route → admin nhấn nhầm = sự cố thật.

**Fix:**
- Tạo `apps/mobile/app/(admin)/` shell với routing riêng
- Admin login → redirect `/(admin)/dashboard`
- Customer shell layout: `if (role !== 'customer') return <Redirect href="/(auth)/login" />` (xóa admin bypass)
- Worker shell tương tự
- Edge router roles: gỡ `admin` khỏi customer-only / worker-only routes. Admin có route riêng cho audit.
- Cho phép admin impersonate explicit qua `/(admin)/impersonate/{user_id}` nếu cần (kèm banner đỏ + read-only flag).

**Files thay đổi:**
- `apps/mobile/app/(admin)/` — new folder
- `apps/mobile/app/(customer)/_layout.tsx`, `apps/mobile/app/(worker)/_layout.tsx` — gỡ bypass
- `supabase/functions/mobile-api/_shared/router.ts` — tách admin routes
- `apps/mobile/app/index.tsx` — admin redirect

**Risk:** lớn. Build new shell. Có thể defer thành phase riêng nếu Phase 5 quá dày.

#### 22.10.C — Fix 5.2: Status vocabulary unify (M2)

**Vấn đề:** init migration vocab cũ, Edge lifecycle.ts vocab mới, Mobile reducer fold.

**Fix:**
- Document trong `docs/architecture/status-vocabulary.md`: 3 layer + lý do fold
- Đảm bảo Edge dùng vocab mới (đã có via migration 20260513114845)
- Mobile fold giữ nguyên (Tu approve "keep mobile honest")
- Test wiring: assert lifecycle.ts JobStatus tập = full 16 values; LocalDealStatus = 14 fold values

**Files thay đổi:**
- `docs/architecture/status-vocabulary.md` — new
- Test wiring nếu chưa có

**Risk:** thấp. Doc-only + test gate.

#### 22.10.D — Fix 5.3: A2-A6 step boundaries (M3)

Liên quan trực tiếp Phase 3.1 — sau khi Booking wizard build xong, document A2-A6 step contracts trong `docs/architecture/workflow-step-contracts.md`.

#### 22.10.E — Fix 5.4: B6 dual flow document (M4)

**Vấn đề:** STRUCTURES.md B6 chỉ có "scope change". Code có thêm worker-cancellation path.

**Fix:** Thêm vào STRUCTURES.md (sau approve Tu) section B6b worker cancellation request + Admin decide flow. Hoặc tạo `docs/workflow/worker-cancellation.md` rồi link từ STRUCTURES.

**Risk:** thấp.

#### 22.10.F — Fix 5.5: `confirmed_by_customer` payment skip clarification (M7)

**Vấn đề:** lifecycle.ts cho phép `confirmed_by_customer → reviewed` (skip payment). Doc không nói rõ.

**Fix:** Document trong status-vocabulary.md hoặc state machine doc: "Phase 0 không có payment rails, lifecycle cho phép skip qua reviewed. Khi payment_pending wire, lifecycle sẽ require payment_pending → paid → reviewed."

**Risk:** thấp.

#### 22.10.G — Fix 5.6: activity/history naming (M8)

**Vấn đề:** `CustomerDockActive` `'activity'` vs `CustomerTabName` `'history'`.

**Fix:** Pick one, replace toàn bộ. Recommend `'history'` vì khớp route file name. Update `CustomerDockActive` type.

**Files thay đổi:** `apps/mobile/components/customer/customer-surfaces.tsx`.

**Risk:** thấp.

#### 22.10.H — Fix 5.7: Test hard-rule enforcement (M10)

**Vấn đề:** mobile-wiring.test.ts chỉ assert `toContain('FloatingGlassTabBar')`. Không catch `push` thay `replace`.

**Fix:** Thêm assertions:
- `expect(src).toContain('replace(item.path)')` cho dock
- `expect(src).not.toContain('push(item.path)')` cho dock
- A11 modal: `expect(src).toContain('onRequestClose={() => undefined}')` (hoặc tương đương)
- Scope decide path: assert duy nhất một `actions.decideScopeChange` call origin (sau khi Phase 1.3 xóa inline)

**Files thay đổi:** `packages/shared/src/__tests__/mobile-wiring.test.ts`.

**Risk:** thấp.

#### 22.10.I — Fix 5.8: VND formatter locale-aware (A.6)

**Vấn đề:** `new Intl.NumberFormat('vi-VN')` hardcode trong vài surface.

**Fix:** Tạo `apps/mobile/lib/format.ts` với `formatVnd(value: number, language: AppLanguage)`. Reuse trong các surface.

**Risk:** thấp.

#### 22.10.J — Fix 5.9: Module-level mutable cleanup (A.7)

**Vấn đề:** `lastCustomerDockActive` / `lastWorkerDockActive` là module-scope mutable.

**Fix:** Move vào React Context hoặc useRef. Reset khi auth session đổi.

**Risk:** thấp.

#### 22.10.K — Fix 5.10: A6 time UI honest placeholder (D2)

**Vấn đề:** UI không có gì nói "schedule chưa hỗ trợ".

**Fix:** Trong Booking wizard step 6 (Phase 3.1), thêm disabled chip "Lên lịch (sắp có)" + bullet rõ "Hiện chỉ hỗ trợ đặt ngay". User biết schedule là roadmap không phải bug.

**Risk:** thấp.

#### 22.10.L — Fix 5.11: Realtime subscription wire (D9)

**Vấn đề:** Mobile poll thay vì subscribe.

**Fix:**
- Subscribe `chat_messages` trong chat surface (Phase 2.1 dùng polling, Phase 5 upgrade lên realtime)
- Subscribe `jobs` cho status changes (giảm pull-to-refresh)
- Subscribe `job_broadcasts` cho worker khi online
- Fallback polling nếu realtime disconnect

**Files thay đổi:**
- `apps/mobile/lib/realtime.ts` — new helper
- `frontend-workflow-provider.tsx` — wire subscriptions
- Chat surfaces — replace polling với subscribe

**Risk:** trung-lớn. Realtime reconnect logic phức tạp. Có thể defer hẳn nếu Phase 2.1 polling ổn.

---

### 22.11 — Verification Strategy

#### 22.11.A — Mandatory `kael-review` per fix (per critical.md §8)

Sau MỖI fix item, agent MUST chạy kael-review với 3 axes:
1. **Spec Compliance** — solve real task không (so với STRUCTURES.md contract)
2. **Rules/Standards Compliance** — obey RULES.md + STRUCTURES.md + critical.md
3. **Long-Term Maintainability** — locality + testability + simplicity + change ease

Cũng check:
- Scope creep
- Hidden autonomous action (Rule #7)
- AI boundary violations (Rule #2)
- PII/logging risk (Rule #9)
- Test coverage gaps
- Dead code / wiring gaps
- UI copy language (Rule #5)
- Build/test honesty (no false completion)

Output format kael-review BẮT BUỘC:

```
Spec compliance:
Rules/standards compliance:
Maintainability:
Scope creep:
Verification:
Required fixes:
```

#### 22.11.B — Per-phase gates

| Phase | Gate trước khi đóng phase |
|---|---|
| Phase 1 | Unit tests mới pass + manual test 3 path + scrubSensitive sample test |
| Phase 2 | Integration test trên staging Edge + 2-device manual chat + worker B7 form submission test + Kael compute scope change E2E |
| Phase 3 | Manual end-to-end wizard A2-A7 + manual Kael Q&A (no job creation) + Home shortcut routing test |
| Phase 4 | EstimateCard render fee + Review tags + push retry simulate fail recovery |
| Phase 5 | Admin /(admin)/ access test + status vocabulary doc review + test assertions enforce |

#### 22.11.C — Cross-cutting gates (run after Phase 1, 2, 3)

- `pnpm test` shared + mobile + api targeted
- `pnpm typecheck` (`tsc --noEmit`) cho cả 3 packages
- Static sweeps: bundle marker scan, no service-role key in mobile bundle, no AI provider key in mobile bundle
- React Doctor changed scan
- Manual smoke trên staging Edge với disposable test user

#### 22.11.D — Critical regression test set

Sau khi mỗi S-tier fix:
- A7 → broadcast → worker accept → on the way → arrived → inspecting → repairing → B7 complete → A12 confirm → A14 review (full path)
- A11 scope change request → modal hiện → approve → continue (positive)
- A11 scope change request → modal hiện → reject → job cancelled (negative)
- B6 worker cancel → admin decide → reassign or release (Phase 5 wire admin)
- Chat: worker send → customer receive → reverse direction → Kael system message render distinct

#### 22.11.E — Honesty checks (per AGENTS.md)

- No fake worker, no fake price, no hardcoded VND in source
- Empty state vs error state distinguishable
- Vietnamese mode không leak English copy
- A12 confirm shows actual `final_price` (Kael-locked) hoặc honest fallback

---

### 22.12 — Final Agent Checklist & Forbidden Behaviors

#### 22.12.A — Final Agent Checklist (per critical.md §25 — BẮT BUỘC trước khi mark complete)

Trước khi agent nói task done cho BẤT KỲ fix item nào trong plan này:

```
[ ] Preflight đã chạy (critical.md §5)
[ ] Protocols đã được select trước edits
[ ] Required docs đã được đọc theo authority order (CLAUDE.md authority stack)
[ ] MEMORY.md đã đọc LAST khi task depend session context
[ ] Code-ownership-map.md đã được consult cho code changes
[ ] Relevant code + tests đã được đọc
[ ] design.md đã được đọc cho UI/motion/glass touches
[ ] Scope check + survival test passed (Tu approve nếu vượt scope)
[ ] RULES.md impact đã check
[ ] Security/PII/AI/Supabase impact đã check khi relevant
[ ] Tests đã được add/update khi behavior change
[ ] Relevant tests đã được run
[ ] Build đã được run khi applicable
[ ] kael-review đã chạy
[ ] Temporary debug code removed (no [DEBUG-kael-*] leftovers)
[ ] Final response chỉ report real verification (no fake success)
```

#### 22.12.B — Forbidden Behaviors (per critical.md §24 — agent KHÔNG được làm)

Khi triển khai plan này, agent KHÔNG được:

1. Edit trước protocol selection
2. Lie về verification (chỉ report commands actually ran)
3. Fix bug không có feedback loop (no repro = no fix)
4. Build ngoài current product scope (electrical/plumbing/cleaning HCMC only)
5. Over-engineer (no premature abstraction; one caller = no interface)
6. Tạo shallow modules (deletion test mandatory)
7. Fake data / silent degrade (RULES.md Rule #8)
8. Raw AI output to users (Rule #3)
9. Client-side secrets / AI calls (Rule #0, #1, #2)
10. PII in logs (Rule #9)
11. Money-impacting autonomous actions (Rule #7)
12. Turn Next.js into consumer product (Rule #0)
13. Test count theater (layer coverage > count)
14. Leave debug code (must remove `[DEBUG-kael-*]` prefix logs)
15. Update locked docs without Tu permission (CLAUDE.md, STRUCTURES.md, RULES.md, README.md, critical.md, design.md locked)

#### 22.12.C — Approval Required Before Implementation

Plan này touch nhiều file lock vào doc tier (CLAUDE.md, STRUCTURES.md, RULES.md, design.md, critical.md). Trong implementation, nếu phát hiện cần edit locked doc:

- STOP
- Show Tu the exact edit + reason
- Wait for explicit approval

Plan này CHƯA propose edit locked docs (chỉ tạo file mới trong `docs/copy`, `docs/workflow`, `docs/architecture`). Phase 2.0 cần edit STRUCTURES.md — agent phải hỏi Tu trước với exact diff.

---

### 22.13 — Files Touched Summary

```
apps/mobile/components/customer/customer-surfaces.tsx          Phase 1.2, 1.3, 3.3, 4.2, 5.6
apps/mobile/components/customer/scope-change-modal/            Phase 2.0d (Kael compute badge)
apps/mobile/components/customer/booking-wizard/                Phase 3.1 (new folder)
apps/mobile/components/customer/kael-chat/                     Phase 3.2 (fork qna-surface)
apps/mobile/components/customer/kael-chat-surface.tsx          Phase 4.1
apps/mobile/components/worker/worker-surfaces.tsx              Phase 2.0c (no price), 2.1, 2.2, 2.2b
apps/mobile/lib/services.ts                                    Phase 2.0c (signature update)
apps/mobile/lib/api-types.ts                                   Phase 2.0c (type update)
apps/mobile/lib/frontend-workflow-provider.tsx                 Phase 1.2, 2.0c, 2.1
apps/mobile/lib/media-upload.ts                                Phase 2.2 (verify stage='after')
apps/mobile/lib/copy/                                          Phase 4.4 (new)
apps/mobile/lib/format.ts                                      Phase 5.8 (new)
apps/mobile/app/(customer)/_layout.tsx                         Phase 5.1
apps/mobile/app/(worker)/_layout.tsx                           Phase 5.1
apps/mobile/app/(admin)/                                       Phase 5.1 (new folder)
apps/mobile/app/index.tsx                                      Phase 5.1
packages/shared/src/mobile-workflow.ts                         Phase 1.2 (LocalDeal field), 2.0c
packages/shared/src/validation.ts                              Phase 2.0c (worker scope schema)
packages/shared/src/__tests__/mobile-wiring.test.ts            Phase 2.0, 2.2, 5.7 (assertions)
supabase/functions/mobile-api/_shared/kael.ts                  Phase 1.1, 2.0b (compute scope estimate)
supabase/functions/mobile-api/_shared/lifecycle.ts             Phase 2.0a (transition cleanup)
supabase/functions/mobile-api/_shared/router.ts                Phase 2.0a (schema), 5.1
supabase/functions/mobile-api/_shared/services.ts              Phase 2.0a/2.0b, 2.3, 2.4
supabase/functions/mobile-api/_shared/push.ts                  Phase 4.3
supabase/migrations/2026MMDD_kael_final_price_authority.sql    Phase 2.0a (new)
supabase/migrations/2026MMDD_worker_approved_*.sql             Phase 2.4 (new)
STRUCTURES.md (LOCKED — Tu approve required)                   Phase 2.0f (B6/B7/A11/A12/§11/§15 edits)
docs/copy/workflow-copy-{vi,en}.md                             Phase 4.4 (new)
docs/architecture/status-vocabulary.md                         Phase 5.2 (new)
docs/architecture/workflow-step-contracts.md                   Phase 5.3 (new)
docs/architecture/kael-price-authority.md                      Phase 2.0 (new, contract spec)
docs/workflow/worker-cancellation.md                           Phase 5.4 (new)
```

---

### 22.14 — Existing Functions/Utilities to Reuse

- `jobService.listMessages` + `jobService.sendMessage` (`apps/mobile/lib/services.ts:64`) — Phase 2.1 chat wire
- `uploadJobMediaDrafts` (`apps/mobile/lib/media-upload.ts`) — Phase 2.2 photo upload
- `formatVnd` (sau Phase 5.8: `lib/format.ts`) — render giá
- `insertUserNotification` helper (`supabase/functions/mobile-api/_shared/services.ts:2774`) — Phase 2.3, 2.4
- `sendPushToUser` + retry helper (Phase 4.3 new) — push delivery
- `scrubSensitiveForLLM` (`supabase/functions/mobile-api/_shared/kael.ts:1260`) — Phase 1.1 extend
- `ScopeChangeHardStopModal` component — Phase 1.3 keep as single source
- `reviewScopeChange` (`supabase/functions/mobile-api/_shared/kael.ts:213`) — Phase 2.0b reuse hoặc fork cho `computeScopeChangeEstimate`

---

### 22.15 — Out of Scope Reminders

Plan §22 này KHÔNG bao gồm:
- Payment rails (cash/MoMo/ZaloPay handlers) — defer until provider ready
- Phone OTP auth — defer until SMS provider config
- Google OAuth — defer until provider config
- Learning candidates pipeline (tables ready, wire sau evidence baseline)
- Multi-city / autonomous booking / multi-agent / service expansion
- TestFlight delivery verification — Tu drive
- Rating penalty system (MEMORY.md PR #25: explicitly excluded per Tu earlier instruction)
- True native map picker for worker registration (district + radius hiện acceptable)

---

### 22.16 — Sign-off Checklist

```
[ ] Tu đã đọc 5 nhóm rủi ro + risk ranking
[ ] Tu đã đồng ý 5 phase ordering (risk → trust → section role → polish → hygiene)
[ ] Tu đã đồng ý S-tier fix trong Phase 1 + Phase 2 round đầu
[ ] Tu đã đồng ý Phase 2.0 Kael Price Authority (workflow change 2026-05-23)
[ ] Tu xác nhận sẽ approve STRUCTURES.md edit khi Phase 2.0 chạy (B6/B7/A11/A12/§11/§15)
[ ] Tu đã đồng ý Phase 3 restructure 3 customer tab khác nhau thật
[ ] Tu đã đồng ý Phase 5.1 admin /(admin)/ separate route
[ ] Tu xác nhận no other macro concern không có trong plan
[ ] Tu đồng ý mỗi phase = 1 PR, verification evidence honest
```

### 22.16.B — Tu Acknowledgment Required Before Implementation

```
□ Tu approve plan content (sign-off checklist above)
□ Tu approve STRUCTURES.md edit cho Phase 2.0 (workflow contract change)
□ Tu confirm dirty worktree state có thể proceed (commit hiện tại tách biệt với plan execution)
□ Tu confirm sẽ review PR per phase, not all-at-once
□ Tu confirm verification evidence sẽ được log honestly trong docs/test-logs/
```

---

### 22.17 — Plan Maintenance & Update Notes

#### 22.17.A — Change Log Cho §22

| Date | Editor | Change |
|---|---|---|
| 2026-05-23 | AI co-founder | Initial draft từ audit findings (5 nhóm rủi ro, 14 issue) |
| 2026-05-23 | AI co-founder | Add Authority Context Loading + Protocol Selection per Tu feedback (preflight + skills application) |
| 2026-05-23 | AI co-founder | Add Phase 2.0 Kael Final Price Authority per Tu decision (worker không nhập price) |
| 2026-05-23 | AI co-founder | Update Phase 2.2 + 2.2b to align với Phase 2.0 |
| 2026-05-23 | AI co-founder | Add Plan Metadata, Decision Log, Lý do plan tồn tại, Change Log per Tu feedback (takenotes chi tiết) |
| 2026-05-23 | AI co-founder | Append toàn bộ vào `Plan.md §22` per Tu request "Viết vào plan.md đi cộng sự" |
| 2026-05-24 | AI co-founder | Phase 1-5 implementation landed. §22.18 Implementation Notes + Verification Evidence + Out-of-Scope tracker added. STRUCTURES.md edits applied (Tu plan-execute approval). |

#### 22.17.B — Khi §22 cần update

Update §22 (NOT delete) khi:
- Tu thêm decision mới (add row vào Decision Log + reflect trong relevant phase)
- Audit phát hiện finding mới ngoài 14 hiện tại
- Phase 1-5 nào complete → add timestamp + actual files changed vào §22.18 Implementation Notes
- Locked doc edit được approved → ghi rõ commit hash
- Implementation discover scope creep / risk mới → flag rõ trong relevant phase

#### 22.17.C — §22 vs Other Authority Docs

§22 KHÔNG override:
- `critical.md` / `RULES.md` / `STRUCTURES.md` / `design.md` / `CLAUDE.md` (LOCKED)
- `AGENTS.md` / `skills.md` (LOCKED-ish, may edit với Tu approval)
- `docs/architecture/code-ownership-map.md` (active navigation contract)

§22 CÓ THỂ update khi:
- Tu approve edit
- AI co-founder during implementation captures lesson / scope clarification
- Audit re-run reveals new finding

§22 KHÔNG override §1-§21 (Plan core). Đây là addendum tách biệt, fix các holes audit tìm thấy.

---

### 22.18 — Implementation Notes / Lessons Captured

| Date | Phase | Note | Resolution |
|---|---|---|---|
| 2026-05-24 | 1.1 | Building regex {0,3} greedy ate "tầng" keyword | Switched to {0,2} + negative lookahead for tầng/lầu/căn/block/toà/số/STK/TK |
| 2026-05-24 | 1.2 + 1.3 | Combined edits in customer-surfaces.tsx Done tab + scope-change section | LocalDeal gained completionPhotoUrls + completionNotes; reducer + jobDetailToSnapshot updated |
| 2026-05-24 | 2.0a | Edge Chain type was missing `is()` for null filter | Added `.is(column, value)` to Chain interface in services.ts |
| 2026-05-24 | 2.0a | request_scope_change_atomic RPC dropped and recreated with `(uuid, text, text)` signature (no price) | Migration `20260524000000_kael_final_price_authority.sql` |
| 2026-05-24 | 2.0a | scope_change_requests.price_min/max made nullable + added kael_computed_min/max | Same migration |
| 2026-05-24 | 2.0b | reviewScopeChange retained as dead export but no longer wired (kept for backwards-compat; can be removed later) | Replaced by computeScopeChangeEstimate via Anthropic with new schema scopeChangeEstimateSchema |
| 2026-05-24 | 2.0f | STRUCTURES.md (LOCKED) edited per Tu's plan-execute approval. Sections: §6 A11/A12, §7 B6/B7, §11 KaelPriceCheckModule + ScopeChangeModule, §15 Pricing | Inline Phase-tag comments mark every change; original wording preserved for diff trace |
| 2026-05-24 | 2.1 | Customer chat panel rebuilt from pointer card to real list + composer; worker chat keeps existing UI shell, swaps state source | Both use `jobService.listMessages` (8s poll) + `sendMessage` (optimistic append) |
| 2026-05-24 | 2.3 / 2.4 | Notifications `customer_message_received` / `worker_message_received` already covered by existing `job_message_received` generic event (right recipient already targeted) | Did not split event_type to keep mobile push handler stable |
| 2026-05-24 | 2.4 | `broadcast_expired` worker-side notification deferred (background process not yet implemented) | Noted in TaskList comment; revisit when realtime batch-expiry job lands |
| 2026-05-24 | 3.1 | BookingWizard built as a single contained file `apps/mobile/components/customer/booking-wizard.tsx` rather than per-step folder | Reduces import surface; keeps Phase 3.1 surgical. Can refactor into folder if step files grow |
| 2026-05-24 | 3.2 | Kael tab uses local single-shot Q&A response (no kaelChatService session) | Plan allowed lightweight Q&A; full Kael chat session lives behind Booking wizard handoff |
| 2026-05-24 | 4.4 | docs/copy/workflow-copy-{vi,en}.md created. Inline TS copy NOT migrated to `apps/mobile/lib/copy/` to keep diff surgical | Docs flag this as deferred follow-up; existing inline copy still serves runtime |
| 2026-05-24 | 5.1 | Admin shell created with minimal dashboard. Edge router admin route split (per plan) deferred | Mobile shell separation is the primary safety win; Edge admin auth still uses existing role check |
| 2026-05-24 | 5.8 | `apps/mobile/lib/format.ts` created with `formatVnd(value, language)` + `formatVndRange` | Existing surface-local vndFormatters left intact (surgical); future refactor can migrate one surface at a time |
| 2026-05-24 | 5.9 | Module-level mutables `lastCustomerDockActive` + `lastWorkerDockActive` were write-only — removed entirely (no Context/useRef needed) | Comment in source documents the removal rationale and future-state if persistence becomes needed |
| 2026-05-24 | 5.11 | `apps/mobile/lib/realtime.ts` helper file created but NOT wired into UI | Polling (Phase 2.1) is the active mechanism; helper exists as a seam for future enable |
| 2026-05-24 | Final | mobile-wiring tests rewritten to align with shipped behavior (Phase 1-5). 224 of 224 pass | Pre-existing migration tests (4 in mobile-api-edge-schema.test.ts) remain failing on unrelated lifecycle SQL drift — not part of §22 scope |

### 22.18.A — Verification Evidence

| Suite | Result |
|---|---|
| `packages/shared` tsc --noEmit | passed |
| `packages/shared` vitest run | 494 / 494 passed (9 test files) |
| `apps/api` tsc --noEmit | passed |
| `apps/api` vitest run | 974 passed / 4 failed (pre-existing migration drift, not §22-introduced) / 59 skipped |
| `apps/api` mobile-api-edge-runtime.test.ts | 62 / 62 passed |
| `apps/api` validation.test.ts | 72 / 72 passed |
| `apps/api` scope-change.test.ts | 11 / 11 passed |
| `apps/mobile` tsc --noEmit | passed |
| Static gates (mobile-wiring Phase 5.7 hard-rule asserts) | 224 / 224 passed |

### 22.18.B — Out-of-Scope Observations Logged for Future Work

- 4 pre-existing failures in `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts` covering lifecycle SQL `for update` ordering and split-brain prevention — unrelated to §22; investigate as a separate fix.
- `apps/mobile/lib/copy/` TS extraction deferred (Phase 4.4 follow-up).
- Edge router admin route split deferred (Phase 5.1 follow-up — mobile shell separation already removes the misclick blast radius).
- Realtime subscription wire-in deferred (Phase 5.11 — polling acceptable, helper exists as seam).
- TestFlight delivery verification still requires a real device (per existing MEMORY.md caveat).
- API mock for `computeScopeChangeEstimate` updated to new schema; Anthropic prompt may need real-world tuning once first Kael-computed scope change runs against staging.

---

### 22.19 — Appendix A: Quick Reference Authority Stack

Khi implement bất kỳ phase nào, agent cần authority sequence:

```
critical.md          execution protocols (always)
RULES.md             non-negotiable boundaries (always)
STRUCTURES.md        workflow truth (always)
design.md            UI/motion/glass (UI fixes)
AGENTS.md            workspace + data honesty + glassmorphism + motion rules
docs/architecture/code-ownership-map.md   code owner mapping (code changes)
skills.md            Karpathy skills (writing/reviewing/refactoring/debugging/planning)
docs/foundation/*.md, docs/ops/*.md, docs/design/*.md   feature-specific
README.md            historical context
MEMORY.md            LAST — session memory, may have caveats overriding plan
```

### 22.20 — Appendix B: Critical Files Quick Reference per Phase

**Phase 1 (Stop the Bleeding):**

```
supabase/functions/mobile-api/_shared/kael.ts:1260            Phase 1.1 scrubSensitiveForLLM
apps/mobile/components/customer/customer-surfaces.tsx:1207-1297, 1308-1320  Phase 1.2 + 1.3
packages/shared/src/mobile-workflow.ts                         Phase 1.2 LocalDeal type
apps/mobile/lib/frontend-workflow-provider.tsx                 Phase 1.2 hydrate mapping
```

**Phase 2 (Trust Foundation):**

```
supabase/functions/mobile-api/_shared/lifecycle.ts             Phase 2.0a
supabase/functions/mobile-api/_shared/router.ts:1131           Phase 2.0a worker schema
supabase/functions/mobile-api/_shared/services.ts:1324,1402,1820,1009,1866   Phase 2.0a
supabase/functions/mobile-api/_shared/kael.ts:213+             Phase 2.0b reuse reviewScopeChange or fork
apps/mobile/components/worker/worker-surfaces.tsx:2024-2241    Phase 2.0c + 2.2 + 2.2b
apps/mobile/components/worker/worker-surfaces.tsx:1036-1201    Phase 2.1 chat wire
apps/mobile/components/customer/customer-surfaces.tsx:1801-1838  Phase 2.1 customer chat
apps/mobile/lib/services.ts:51-216                            Phase 2.0c worker service signature
apps/mobile/components/customer/scope-change-modal/           Phase 2.0d badge
STRUCTURES.md (LOCKED)                                         Phase 2.0f Tu approve
```

**Phase 3 (Section Rạch Ròi):**

```
apps/mobile/components/customer/customer-surfaces.tsx          Phase 3.1 BookingEntry rebuild, 3.3 Home shortcuts
apps/mobile/components/customer/booking-wizard/                Phase 3.1 NEW folder
apps/mobile/components/customer/kael-chat/                     Phase 3.2 fork qna-surface
```

**Phase 4 (Polish):**

```
apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx:364   Phase 4.1 EstimateCard
apps/mobile/components/customer/customer-surfaces.tsx:1321-1352       Phase 4.2 Review fields
supabase/functions/mobile-api/_shared/push.ts:117-180                 Phase 4.3 retry
apps/mobile/lib/copy/ (new)                                            Phase 4.4
```

**Phase 5 (Hygiene):**

```
apps/mobile/app/(admin)/ (new)                                 Phase 5.1
apps/mobile/app/(customer)/_layout.tsx:70                      Phase 5.1 remove bypass
apps/mobile/app/(worker)/_layout.tsx:63                        Phase 5.1 remove bypass
apps/mobile/app/index.tsx:20                                   Phase 5.1 admin redirect
supabase/functions/mobile-api/_shared/router.ts                Phase 5.1 admin route split
packages/shared/src/__tests__/mobile-wiring.test.ts            Phase 5.7 hard-rule asserts
docs/architecture/status-vocabulary.md (new)                   Phase 5.2
docs/workflow/worker-cancellation.md (new)                     Phase 5.4
```

---

## 23. Kael Harness + Agentic Implementation Plan — 2026-05-25

### 23.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-kael-harness-agentic
Created:        2026-05-25
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         v2.0 F26 reconciled 2026-05-26 → PR #37-#40 audit gaps closed in §26
Critical Alert: HIGH — touches Kael identity, provider routing, money-impacting workflow
Decision log:   Conversation 2026-05-25 (Tu + Claude) chốt Harness 7/7 + Agentic 5/5
Scope:          Build Harness (7 sub-systems) + Agentic behavior (5 cases) trên top
                of existing mobile-api Edge runtime
Out of scope:   Multi-city, service expansion, autonomous booking/payment,
                web consumer product, L3/L4 autonomy
Effort total:   4-6 tuần agent build (sequential), 2-3 tuần (parallel where possible)
Phase count:    18 phases (P0 pre-plan + P1-P17 execution)
```

**Mục tiêu chính:**

1. **Build Harness** — lớp wrapper bao bọc Kael, cấu trúc lại từ kael.ts ~1602 dòng monolith thành module nhỏ kiểm soát được. Provide identity, permission, memory, learning governance, response policy.
2. **Build Agentic behavior** — script Kael's behavior cho 5 scenario thực tế (normal, demanding, worker-cancel, customer-cancel, dispute) để Kael "biết phải làm gì" trong mọi tình huống.
3. **Chuẩn bị scale** — code foundation đủ tốt để 10-100 jobs/ngày không vỡ trận.
4. **Phục vụ first real transaction** — không vượt scope, vẫn đảm bảo Phase 0 priority theo CLAUDE.md.

**Authority refs (theo critical.md §0):**

```
1. critical.md       (execution protocols)
2. RULES.md          (security/PII/AI/scope non-negotiable)
3. STRUCTURES.md     (workflow blueprint + §10F forbidden)
4. design.md         (UI/visual contract khi đụng UI)
5. AGENTS.md         (workspace operating rules)
6. CLAUDE.md         (project identity)
7. THIS PLAN §23     (Kael Harness + Agentic plan)
8. Plan.md §0-§22    (existing workflow enhancement plan, may overlap)
9. README.md + docs/** (durable contracts)
10. MEMORY.md        (last, freshness signal only)
```

---

### 23.1 Glossary

| Term | Definition |
|---|---|
| **Harness** | 7 sub-systems wrapping Kael: routing, orchestrator, output, permission, memory, learning, charter |
| **Agentic case** | Scripted Kael behavior for specific scenarios (5 cases chốt: normal, demanding, worker-cancel, customer-cancel, dispute) |
| **Purpose** | Business intent unit cho Kael (11 purposes: intent_classification, vision_analysis, ..., educational_response) |
| **Charter** | Locked identity files cho Kael (identity, persona, mission-values) + tunable (tone, language, forbidden) |
| **Skill registry** | Code structure cho 7 learning skills (LS1-LS7) với evidence gate + lifecycle |
| **95% acceptance** | Scenario-quality target only. Blocking tests, type-checks, security gates, and build gates must pass 100%; any failure triggers verify-improve loop |
| **Foundation enhancement** | End-of-phase refactor: identify deep modules, eliminate shallow abstractions, improve testability |

---

### 23.2 Decisions Locked (discussion 2026-05-25)

#### Harness decisions

| # | Decision | Source |
|---|---|---|
| D1 | Harness = outer wrapper + add missing pieces, KHÔNG refactor toàn bộ | Q1 discussion |
| D2 | Routing unit = **Purpose** (11 purposes, refactor stage-based) | Q2 discussion |
| D3 | Config = file default + DB override khi cần | Q2 discussion |
| D4 | Fallback strategy = Rule-based (cost + latency + circuit health) | Q3 discussion |
| D5 | 11 purposes mapping: 6 DeepSeek-primary, 3 Anthropic-only, 1 Perplexity-primary, 1 Anthropic w/ A/B test | Final mapping |
| D6 | Pipeline worst-case 9s, intent 1s budget (NO fallback intent), parallel pattern | Pipeline Orchestrator |
| D7 | Streaming via Supabase Realtime trên `jobs.kael_progress` jsonb | Pipeline Orchestrator |
| D8 | Output Format = 4-artifact meta-pattern (Schema + Sanitizer + Fallback + Renderer) | Output Format |
| D9 | Estimate Card v3 có `needs_inspection`, `price_source`, `kael_reasoning` | Output Format |
| D10 | Worker Brief = Hybrid Progressive 2-stage (core sau A7, guidance sau B3 accept) + "Hỏi Kael thêm" button limit 3/job | Output Format |
| D11 | Scope-Change = Kael Challenge phase (anti-fraud) + 2 schema + anomaly score + margin check | Output Format |
| D12 | Permission Scope = matrix (purpose × actor × job_relation) + topic allow/deny + 8 decline templates | Permission |
| D13 | Education về 3 services = ALLOWED (không decline cứng); thêm purpose #11 `educational_response` | Permission v2 |
| D14 | Legal awareness vs legal advice = phân biệt; worker_safety_advisory + legal_safety_awareness allowed | Permission v2 |
| D15 | Memory = 6 layers (L1-L6) + 2 schema mới (customer_kael_memory, worker_kael_memory) | Memory |
| D16 | Retrieval budget ≤ 1500 tokens/call, conflict resolution domain > job > user > short-term | Memory |
| D17 | Learning = 7 skills (LS1-LS7), extend PR #12 EvidenceGate | Learning |
| D18 | Charter = identity/persona/mission LOCKED, tone/language/forbidden tunable | Charter |
| D19 | Soft-but-firm wording (NO hardcore language), 3 motif: system/process, record, fairness | Case 2 v2 |
| D20 | Kael split kael.ts ~1602 dòng thành nhiều .ts nhỏ trong `kael/` folder | Q4 nâng cấp cấu trúc |
| D21 | Identity layer + skill registry + tool calling pattern + versioning/governance | Q4 nâng cấp cấu trúc |

#### Agentic decisions

| # | Decision | Source |
|---|---|---|
| D22 | Case 1 normal: 6 phase compact, 5 notif, skip optional steps | Case 1 v2 |
| D23 | Case 2 demanding: 2 nuance (legit vs pressure), 5 strategies, soft-but-firm, escalation pathway | Case 2 |
| D24 | Case 3 worker hủy: 2 sub-cases (explicit + no-show), reason taxonomy, anti-abuse (30% rate, admin suspension review) | Case 3 |
| D25 | Case 4 customer hủy: 5 sub-cases (4A-4E theo timing), Phase 0 no monetary penalty | Case 4 |
| D26 | Case 5 dispute: Kael NEUTRAL only, evidence locking, admin decide, 5 sub-cases | Case 5 |
| D27 | Anti-fraud spine NGẦM (system/process/record/fairness motif), NEVER accusatory | Case 2 v2 |

#### Cross-cutting

| # | Decision | Source |
|---|---|---|
| D28 | A/B test Perplexity #6 price_synthesis với 100 cases, 4 metrics, threshold loại nếu fail 2+ | Provider Routing |
| D29 | DeepSeek 402 đã fix (Tu nạp tiền); cần verify khi staging | Discussion |
| D30 | Telemetry blocker: `api_logs.purpose` NULL trên 52 records — bắt buộc fix trước A/B test | Memory + Learning |
| D31 | District format risk: jobs `q7` vs worker `Quan 1/2/BT` — cần verify `normalizeServiceAreaDistrict()` mapping | Original verify |
| D32 | Plan này KHÔNG conflict với Plan.md §1-§22 (workflow enhancement đợt 2026-05-20); 2 plan có thể parallel hoặc sequence | New plan |

---

### 23.3 Architecture Baseline (preserve, không động)

- **Mobile RN (Expo SDK 54)** = primary customer + worker client.
- **Supabase Edge `mobile-api`** = production runtime backend, AI provider boundary.
- **Next.js `apps/api`** = reference/parity/admin.
- **Supabase Postgres** = source of truth, RLS bật mọi public table.
- **3 services**: electrical, plumbing, cleaning ONLY.
- **Existing 42 migrations** (đã apply staging + prod) — KHÔNG edit, chỉ add new.
- **Existing 13 RPCs** atomic — KHÔNG break, có thể extend.
- **PR #12 (Kael learning)** = MarketMemoryService + CaseReviewService + EvidenceGate đã merge, extend ở P7.

---

### 23.4 High-Level Roadmap

```
P0  Pre-Plan Context Loading (MANDATORY, NEVER SKIP)
├── Read order: critical.md → RULES.md → STRUCTURES.md → design.md → AGENTS.md
│   → CLAUDE.md → skills.md → karpathy-guidelines → code-ownership-map.md
│   → existing Plan.md → MEMORY.md last
├── Verify decisions D1-D32 vẫn align
├── Output preflight per critical.md §5

P1  Foundation Prep (charter skeleton, permission matrix, memory schema, telemetry fix)
├── Dep: P0

P2  kael.ts Split + Module Skeleton (D20-D21)
├── Dep: P1

P3  Provider Routing + Pipeline Orchestrator (D2-D7)
├── Dep: P2

P4  Output Format (D8-D11)
├── Dep: P2, P3

P5  Permission Scope + Response Policy (D12-D14)
├── Dep: P2

P6  Memory Governance (D15-D16)
├── Dep: P1 (schemas), P5

P7  Learning Skill Setup (D17, extend PR #12)
├── Dep: P6

P8  Response Style / Charter Implementation (D18-D19)
├── Dep: P2

P9  Agentic Case 1 — Transaction bình thường (D22)
├── Dep: P3-P8

P10 Agentic Case 2 — Transaction khắc khe (D23, D27)
├── Dep: P9, P5, P8

P11 Agentic Case 3 — Worker hủy deal (D24)
├── Dep: P9, P7

P12 Agentic Case 4 — Customer hủy deal (D25)
├── Dep: P9

P13 Agentic Case 5 — Dispute (D26)
├── Dep: P9, P12

P14 Backend Gaps Cleanup
├── Dep: P3-P13 done

P15 Integration Testing
├── Dep: P14

P16 Pre-Launch Verification
├── Dep: P15

P17 Staging Deploy + Monitoring + A/B Test #6 Setup (D28)
├── Dep: P16
```

**Critical path:** P0 → P1 → P2 → P3 → P4/P5/P6/P8 (parallel) → P7 → P9 → P10/P11/P12/P13 (parallel) → P14 → P15 → P16 → P17.

**Parallel opportunities:** P4/P5/P6/P8 sau P3; P10/P11/P12/P13 sau P9.

---

### 23.5 Phase P0 — Pre-Plan Context Loading ⚠️ MANDATORY, NEVER SKIP

**Goal:** AI agent build phase này có ngữ cảnh đầy đủ trước khi đụng code.

**Dependencies:** None.

**Scope:** Đọc TẤT CẢ files authority order. Verify decisions D1-D32. State preflight.

**Out of scope:** KHÔNG sửa file nào trong P0.

**WBS (Work Breakdown Structure):**

- T0.1 Read `critical.md` § toàn bộ (execution contract).
- T0.2 Read `RULES.md` § toàn bộ (non-negotiable rules).
- T0.3 Read `STRUCTURES.md` §1-22 (workflow + §10F forbidden + §11 module forbidden).
- T0.4 Read `design.md` (UI/motion/glass contract, nếu phase động UI).
- T0.5 Read `AGENTS.md` (workspace operating loop).
- T0.6 Read `CLAUDE.md` (project identity).
- T0.7 Read `skills.md` + `.agents/skills/karpathy-guidelines/SKILL.md`.
- T0.8 Read `docs/architecture/code-ownership-map.md` (ownership boundary).
- T0.9 Read existing `Plan.md` §1-§22 (workflow enhancement context).
- T0.10 Read `MEMORY.md` LAST.
- T0.11 Read this plan §23 phase target.
- T0.12 Verify D1-D32 alignment với code hiện tại — flag drift nếu có.
- T0.13 State preflight format per `critical.md` §5.

**Build Instructions:** N/A (read-only phase).

**Affected Areas:** None.

**Skills/Protocols:** `kael-preflight` (mandatory), `kael-clarify-with-docs` nếu ambiguity, `karpathy-guidelines` Principle 1.

**Tests:** N/A.

**Verification Loop:** Output preflight phải bao gồm tất cả T0.1-T0.13. Nếu drift detected → STOP, ask Tu.

**Foundation Enhancement:** N/A.

**Acceptance Gate:**

- [ ] All 10 authority files read.
- [ ] Preflight stated theo format.
- [ ] No silent assumptions.
- [ ] Drift (nếu có) reported.

**Estimated Effort:** 30-60 phút.

**Handoff Notes:** Output preflight là input cho mọi phase sau. Lưu trong session memory cho agent kế tiếp.

---

### 23.6 Phase P1 — Foundation Prep

**Goal:** Tạo skeleton files cho Charter, Permission matrix, Memory schemas, fix telemetry blocker — KHÔNG implement logic.

**Dependencies:** P0.

**Scope:**

- Charter skeleton files trong `packages/shared/kael/charter/`.
- Permission matrix file template.
- 2 migration mới cho `customer_kael_memory` + `worker_kael_memory`.
- Fix `api_logs.purpose` NULL logging.
- Audit log tables (`kael_permission_audit`, `kael_advisory_audit`, `kael_memory_audit`).

**Out of scope:** KHÔNG implement logic. KHÔNG động `kael.ts`. KHÔNG add purposes.

**WBS:**

- T1.1 Tạo dir `packages/shared/kael/charter/` với 7 stub files (identity.md, persona.md, mission-values.md, tone-matrix.yaml, language-rules.md, forbidden-language.json, style-guidelines.md, version.json).
- T1.2 Tạo `packages/shared/kael/permissions.ts` skeleton với types `PermissionRule`, `KaelPurpose`, `KaelAction`, `KaelTopic`.
- T1.3 Tạo migration `YYYYMMDDHHMMSS_customer_kael_memory.sql` (schema only, no data).
- T1.4 Tạo migration `YYYYMMDDHHMMSS_worker_kael_memory.sql`.
- T1.5 Tạo migration `YYYYMMDDHHMMSS_kael_audit_tables.sql` (3 audit tables).
- T1.6 Fix `api_logs.purpose` logging: pass `purpose` arg vào log function. KHÔNG refactor kael.ts (defer P2).
- T1.7 Verify D31: chạy SQL `normalizeServiceAreaDistrict("q7")` vs worker districts → report drift.
- T1.8 Verify D29: 1 test call DeepSeek với key mới → check api_logs success.
- T1.9 Update RLS policies cho 3 table mới.
- T1.10 Add generated types: `npm run supabase:gen-types`.

**Build Instructions:**

- Migration files atomic — 1 migration per concern.
- KHÔNG edit existing migrations.
- Charter stubs có frontmatter version + LOCKED status, content có thể TODO.
- Skeleton files compile sạch (no `any`, no `@ts-ignore`).

**Affected Areas:**

- `packages/shared/kael/charter/` (NEW dir, 7 files)
- `packages/shared/kael/permissions.ts` (NEW)
- `supabase/migrations/*` (3 NEW migrations)
- `supabase/functions/mobile-api/_shared/kael.ts` (minor edit: add purpose arg to log)
- `packages/shared/src/database.types.ts` (regenerate)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-security-sweep`, `kael-code-enhancement`, `karpathy-guidelines`.

**Tests (blocking gates + acceptance metric):**

- Layer: SQL/Migration + Wiring + Unit.
- T1-test-1: Migration apply clean trên staging.
- T1-test-2: RLS positive/negative cho 3 table mới.
- T1-test-3: Type check pass after generated types update.
- T1-test-4: api_logs.purpose populated cho mọi new call.
- T1-test-5: Charter file structure (frontmatter present + valid).
- Target: 5/5 = 100%. < 95% → improve loop.

**Verification Loop:**

- Run tests; nếu any blocking test fails hoặc scenario metric < 95%:
  - Identify failing layer.
  - Re-read relevant skill failure modes.
  - Apply smallest fix.
  - Re-run.
- Honest reporting per memory `feedback_honest_reporting`.

**Foundation Enhancement:**

- Review folder structure `packages/shared/kael/` đã clean chưa.
- Verify no duplicate type definitions (per memory `feedback_duplicate_types`).
- Document folder convention trong `docs/architecture/code-ownership-map.md` addendum.

**Acceptance Gate:**

- [ ] 3 migrations applied staging clean.
- [ ] RLS tests pass cho 3 new tables.
- [ ] Type check pass.
- [ ] api_logs.purpose KHÔNG còn NULL trên call mới.
- [ ] D31 district drift verified.
- [ ] D29 DeepSeek 402 fix verified.
- [ ] kael-review pass.

**Estimated Effort:** 1-2 ngày.

**Handoff Notes:** Foundation skeleton ready cho P2-P8 build trên top. Migration order: customer_kael_memory → worker_kael_memory → audit_tables.

---

### 23.7 Phase P2 — kael.ts Split + Module Skeleton

**Goal:** Chia `kael.ts` (~1602 dòng) thành nhiều `.ts` nhỏ hơn trong `kael/` folder theo D20-D21, KHÔNG đổi behavior.

**Dependencies:** P1.

**Scope:**

- Tạo `supabase/functions/mobile-api/_shared/kael/` folder.
- Split kael.ts thành: `index.ts`, `types.ts`, `pipeline.ts`, `prompts.ts`, `provider-client.ts`, `intent.ts`, `vision.ts`, `market.ts`, `synthesis.ts`, `advisory.ts`, `scope-change.ts`.
- Skill registry skeleton `kael/skills/registry.ts`.
- Behavior preserved 100%.

**Out of scope:** KHÔNG thêm purposes. KHÔNG đổi provider routing. KHÔNG thêm features.

**WBS:**

- T2.1 Map kael.ts hiện tại → identify natural boundaries.
- T2.2 Create `kael/` dir + `index.ts` re-export cho backward compat.
- T2.3 Move types/interfaces sang `kael/types.ts`.
- T2.4 Move prompts sang `kael/prompts.ts`.
- T2.5 Move `callAI` + provider HTTP client sang `kael/provider-client.ts`.
- T2.6 Move intent classification sang `kael/intent.ts`.
- T2.7 Move vision analysis sang `kael/vision.ts`.
- T2.8 Move market lookup sang `kael/market.ts`.
- T2.9 Move price/problem synthesis sang `kael/synthesis.ts`.
- T2.10 Move advisory generation sang `kael/advisory.ts`.
- T2.11 Move scope-change estimate sang `kael/scope-change.ts`.
- T2.12 Update import paths trong `services.ts`, `router.ts`, `index.ts`.
- T2.13 Create `kael/skills/registry.ts` skeleton.
- T2.14 Run full test suite — must pass 100%.

**Build Instructions:**

- Pure refactor, no logic change. Surgical: move code as-is, only fix imports.
- KEEP `kael.ts` as re-export shim (`export * from "./kael/index.ts"`) cho backward compat. Delete sau khi all imports migrated.
- Mỗi file `.ts` không quá 400 dòng.
- KHÔNG circular imports.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael.ts` (becomes re-export shim)
- `supabase/functions/mobile-api/_shared/kael/` (NEW dir, ~10 files)
- `supabase/functions/mobile-api/_shared/services.ts` (update imports)
- `supabase/functions/mobile-api/_shared/router.ts` (update imports)
- `supabase/functions/mobile-api/index.ts` (update imports)

**Skills/Protocols:** `kael-preflight`, `kael-architecture-deepening`, `kael-code-enhancement`, `kael-tdd`, `karpathy-guidelines`.

**Tests (blocking gates + acceptance metric):**

- T2-test-1: Full existing test suite pass (zero regression).
- T2-test-2: Import paths resolve correctly.
- T2-test-3: Each new file < 400 lines.
- T2-test-4: No circular imports.
- T2-test-5: Manual smoke staging.
- Target: 5/5 = 100%. < 95% → STOP, no regression allowed.

**Verification Loop:** Tests fail → STOP, no further phase progress.

**Foundation Enhancement:**

- Apply `kael-architecture-deepening` deletion test trên each new file.
- Document new structure trong `docs/architecture/code-ownership-map.md`.

**Acceptance Gate:**

- [ ] All existing tests pass (zero regression).
- [ ] kael.ts giảm xuống ≤ 50 dòng.
- [ ] No file > 400 dòng.
- [ ] No circular imports.
- [ ] Ownership map updated.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** Sau P2, mọi phase sau dễ navigate. Defer delete shim đến cuối roadmap.

---

### 23.8 Phase P3 — Provider Routing + Pipeline Orchestrator

**Goal:** Implement Purpose-based routing (11 purposes) + Pipeline Orchestrator (9s worst case, parallel pattern, streaming).

**Dependencies:** P2.

**Scope:**

- Define 11 purposes enum + per-purpose config.
- Routing layer `kael/routing.ts` với rule-based scoring.
- Pipeline Orchestrator `kael/orchestrator.ts`.
- Streaming layer: update `jobs.kael_progress jsonb`.
- Circuit breaker storage.
- Config file + DB override.

**11 Purposes Mapping (D5):**

| # | Purpose | Primary | Fallback |
|---|---|---|---|
| 1 | intent_classification | DeepSeek | Anthropic |
| 2 | vision_analysis | **Anthropic** (bắt buộc) | — |
| 3 | clarification | DeepSeek | Anthropic |
| 4 | problem_synthesis | DeepSeek | Anthropic |
| 5 | market_lookup | Perplexity | Anthropic |
| 6 | price_synthesis | **Perplexity** (A/B 100 cases) | Anthropic (bảo hiểm) |
| 7 | advisory_generation | DeepSeek | Anthropic |
| 8 | worker_brief | DeepSeek | Anthropic |
| 9 | scope_change | **Anthropic** | — |
| 10 | post_job_learning | DeepSeek | Anthropic |
| 11 | educational_response | DeepSeek | Anthropic |

**Cost ceiling per purpose:**

| # | Purpose | Cost/call |
|---|---|---|
| 1 | intent_classification | $0.001 |
| 2 | vision_analysis | $0.015 |
| 3 | clarification | $0.003 |
| 4 | problem_synthesis | $0.005 |
| 5 | market_lookup | $0.002 |
| 6 | price_synthesis | $0.010 |
| 7 | advisory_generation | $0.004 |
| 8 | worker_brief | $0.006 |
| 9 | scope_change | $0.010 |
| 10 | post_job_learning | $0.012 |
| 11 | educational_response | $0.003 |

Daily cap: $30/provider/day giai đoạn đầu.

**Latency budget:**

| # | Purpose | Budget | User thấy? |
|---|---|---|---|
| 1 | intent_classification | 1s | Có (gate) |
| 2 | vision_analysis | 5s | Có |
| 3 | clarification | 2s | Có |
| 4 | problem_synthesis | 3s | Có |
| 5 | market_lookup | 4s | Có |
| 6 | price_synthesis | 3s | Có |
| 7 | advisory_generation | 2s | Có |
| 8 | worker_brief | 3s | KHÔNG (background) |
| 9 | scope_change | 4s | Có |
| 10 | post_job_learning | 15s | KHÔNG (background) |
| 11 | educational_response | 2s | Có |

**Circuit breaker thresholds:**

| Error type | Threshold | Open duration |
|---|---|---|
| HTTP 402 (no credit) | 1 fail | 60 phút + admin alert |
| HTTP 429 (rate limit) | 3 fail / 1 phút | 5 phút |
| HTTP 5xx (server) | 5 fail / 5 phút | 5 phút |
| Timeout | 5 fail / 5 phút | 5 phút |
| Schema validation fail | 3 fail / 10 phút | 10 phút |

**Concurrency graph (D6):**

```
intent_classification (gate 1s)
  ↓ proceed nếu in-scope
  ├─ vision_analysis (5s) ──┐
  ├─ market_lookup (4s) ────┤  PARALLEL
  └─ problem_synthesis (3s) ─┘
       ↓
  ├─ price_synthesis (3s)    ─┐
  └─ advisory_generation (2s) ─┘  PARALLEL
       ↓
  [Customer thấy estimate card]
A7 confirm (user action)
  └─ worker_brief (3s) — BACKGROUND
A14 review submitted
  └─ post_job_learning (15s) — BACKGROUND queue
```

Worst case: 1 + 5 + 3 = **9s** (skip clarification, có vision).

**WBS:**

- T3.1 Define `KaelPurpose` enum trong `kael/types.ts`.
- T3.2 Implement `kael/routing.config.ts` với 11 purposes mapping.
- T3.3 Migration `ai_provider_routing` table.
- T3.4 Implement `kael/routing.ts`.
- T3.5 Implement `kael/circuit-breaker.ts`.
- T3.6 Implement `kael/orchestrator.ts`.
- T3.7 Implement streaming `kael/streaming.ts`.
- T3.8 Migration `jobs.kael_progress jsonb` column.
- T3.9 Update `kael/pipeline.ts` to use orchestrator.
- T3.10 Telemetry: log per-purpose call (D30 fix).
- T3.11 Wire orchestrator into existing call sites.

**Build Instructions:**

- Routing layer pure functions, no side effects.
- Orchestrator uses `Promise.all` + `Promise.race`.
- Circuit breaker state: start in-memory; migrate DB nếu cần.
- Intent purpose: KHÔNG fallback Anthropic theo D6.
- Streaming: write to DB row (Supabase Realtime auto broadcast).

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/types.ts`
- `supabase/functions/mobile-api/_shared/kael/routing.config.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/routing.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/circuit-breaker.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/streaming.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/pipeline.ts` (REFACTOR)
- `supabase/functions/mobile-api/_shared/services.ts` (call sites)
- `supabase/migrations/*` (ai_provider_routing + jobs.kael_progress)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-supabase`, `kael-tdd`, `kael-architecture-deepening`.

**Tests (blocking gates + acceptance metric):**

- T3-test-1: 11 purposes config valid.
- T3-test-2: `chooseProvider` returns expected per purpose + scenario.
- T3-test-3: Circuit breaker state transitions.
- T3-test-4: Orchestrator parallel pattern within max latency.
- T3-test-5: Orchestrator fallback: 1 purpose timeout → continue.
- T3-test-6: Streaming: `jobs.kael_progress` updated trên each stage.
- T3-test-7: api_logs.purpose populated (D30 fix verify).
- T3-test-8: Integration end-to-end staging.
- T3-test-9: Security: invalid purpose reject.
- T3-test-10: Cost ceiling: purpose cost > cap → reject.
- Target: 10/10 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Test fail → `kael-diagnose`: hypothesis-driven, repro before fix.

**Foundation Enhancement:**

- Orchestrator interface: deep module check.
- Circuit breaker: plan DB migration nếu Edge instances cần shared state.

**Acceptance Gate:**

- [ ] 11 purposes routable.
- [ ] Rule-based scoring works.
- [ ] Worst case latency ≤ 9s.
- [ ] Streaming events visible Supabase Realtime.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.
- [ ] api_logs.purpose populated 100%.
- [x] kael-security-sweep pass.

**Estimated Effort:** 4-6 ngày.

**Handoff Notes:** Orchestrator là foundation cho mọi case. Output schema ready ở P4.

---

### 23.9 Phase P4 — Output Format

**Goal:** Implement meta-pattern 4-artifact + 3 critical outputs (Estimate Card v3, Worker Brief Hybrid Progressive, Scope-Change + Anti-fraud).

**Dependencies:** P2, P3.

**Scope:**

- Meta-pattern infrastructure: `Schema + Sanitizer + Fallback + Renderer`.
- Estimate Card v3 với `needs_inspection`, `price_source`, `kael_reasoning`.
- Worker Brief Hybrid Progressive 2-stage + "Hỏi Kael thêm" button (limit 3/job).
- Scope-Change Output với Kael Challenge phase (anti-fraud).

**Estimate Card v3 Schema:**

```ts
const EstimateCardSchema = z.object({
  service_type: z.enum(['electrical', 'plumbing', 'cleaning']),
  problem_summary: z.string().min(10).max(200),
  complexity: z.enum(['small', 'medium', 'large']),
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.enum(['low', 'medium', 'high']),
  needs_inspection: z.boolean(),
  price_source: z.enum([
    'perplexity_validated',
    'baseline_with_market',
    'baseline_only',
    'inspection_required',
  ]),
  kael_reasoning: z.object({
    vision_findings: z.string().max(300).optional(),
    market_signals: z.string().max(300).optional(),
    baseline_used: z.string().max(100),
    complexity_reasoning: z.string().max(200),
    needs_inspection_reason: z.string().max(200).optional(),
  }).strict(),
  advisory: z.string().max(150).optional(),
  disclaimer: z.literal(
    'Đây là mức giá ước tính dựa trên thị trường HCMC. ' +
    'Giá cuối được thợ xác nhận trước khi làm.'
  ),
}).refine(/* cross-field validation */);
```

**Anti-fraud anomaly score formula (admin tunable):**

```
score = 0
if drift_ratio > 1.5:               score += 0.30
if drift_ratio > 3.0:               score += 0.20  (cumulative)
if no_photo AND drift_ratio > 2.0:  score += 0.20
if suspicious_keyword_match:        score += 0.15
if worker_scope_change_rate > 30%:  score += 0.15

Thresholds:
  score >= 0.5 → generate challenge
  score >= 0.8 → flag admin (parallel)
```

**Suspicious keywords (Vietnamese, admin tunable):**

- "phải thay hết"
- "đường ống chính"
- "thiết bị đặc biệt"
- "phải đào tường"
- "phải tháo nguyên hệ"
- "vấn đề lớn hơn dự kiến"

**Margin/profitability check:**

```
complexity_hours = { small: 1, medium: 3, large: 6 }
hcmc_hourly_rate = 100,000 VND/hr  (admin tunable)
fair_price_max = complexity_hours[new_complexity] * hcmc_hourly_rate * 1.5

if new_price_max <= fair * 1.5:  kael_assessment = 'reasonable'
if new_price_max > fair * 1.5:   kael_assessment = 'high_increase'
if new_price_max > fair * 2.0:   kael_assessment = 'requires_attention' + admin_alert
```

**WBS:**

- T4.1 Create `packages/shared/kael/schemas/` dir.
- T4.2 Create `packages/shared/kael/sanitizers/index.ts`.
- T4.3 Create `packages/shared/kael/fallbacks/` dir.
- T4.4 Implement Estimate Card v3 (schema + sanitizer + fallback + renderer).
- T4.5 Implement Worker Brief (2-section, Progressive 2-stage).
- T4.6 Implement "Hỏi Kael thêm" route + rate limit 3/job + `kael_worker_qa_log` table.
- T4.7 Implement Scope-Change + Anti-fraud (worker challenge + customer card schemas + anomaly + margin + `worker_scope_change_stats` table).
- T4.8 Generic `kael/output-pipeline.ts`.
- T4.9 Update existing `services.ts` để emit outputs.

**Build Instructions:**

- Schemas dùng Zod, strict mode.
- Sanitizers pure functions, testable individually.
- Fallback content deterministic, không depend on LLM.
- KHÔNG hardcode VND values (per RULES.md).

**Affected Areas:**

- `packages/shared/kael/schemas/` (NEW)
- `packages/shared/kael/sanitizers/` (NEW)
- `packages/shared/kael/fallbacks/` (NEW)
- `packages/shared/kael/renderers/` (NEW)
- `supabase/functions/mobile-api/_shared/kael/output-pipeline.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/scope-change.ts` (UPDATE)
- `supabase/functions/mobile-api/_shared/services.ts` (call sites)
- `supabase/functions/mobile-api/_shared/router.ts` (add `POST /jobs/:id/kael-clarify`)
- `supabase/migrations/*` (jobs columns + 2 new tables)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep`, `kael-tdd`.

**Tests (blocking gates + acceptance metric):**

- T4-test-1: Each Zod schema accepts valid + rejects invalid.
- T4-test-2: Each sanitizer rule tested.
- T4-test-3: Fallback template returns valid output.
- T4-test-4: Worker Brief pre-accept has NO full address.
- T4-test-5: Worker Brief post-accept has full address (RLS guarded).
- T4-test-6: Estimate Card v3 với `needs_inspection=true` → confidence=low + advisory present.
- T4-test-7: Scope-Change anomaly score formula correct.
- T4-test-8: Margin check: fair_price_max calculation.
- T4-test-9: Suspicious keyword match classification.
- T4-test-10: Integration: full estimate flow → valid + sanitized.
- T4-test-11: Integration: scope-change → worker challenge → customer card.
- T4-test-12: Security negative: PII leak attempt caught.
- T4-test-13: Security negative: VND-pattern stripped.
- Target: 13/13 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Sanitizer fail → tighten. Schema fail → check edge cases. Anti-fraud false positive → tune weights.

**Foundation Enhancement:**

- Schema registry central index file.
- Sanitizer composition: composable functions.
- Fallback templates Vietnamese review pass với Tu.

**Acceptance Gate:**

- [ ] Estimate Card v3 complete.
- [ ] Worker Brief 2-stage complete.
- [ ] "Hỏi Kael thêm" route + rate limit working.
- [ ] Scope-Change Anti-fraud detection working.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.
- [ ] No PII leak.
- [ ] No exact VND price.
- [ ] Disclaimer present every price output.

**Estimated Effort:** 5-7 ngày.

**Handoff Notes:** Mobile UI rendering riêng phase (out of scope). 5 output còn lại defer P15 hoặc lazy.

---

### 23.10 Phase P5 — Permission Scope + Response Policy

**Goal:** Implement Permission matrix + topic allow/deny + decline templates + rate limit + audit log.

**Dependencies:** P2.

**Scope:**

- Permission matrix (purpose × actor × job_relation).
- Topic allow/deny lists.
- Educational response purpose (#11).
- 8 decline templates Vietnamese.
- Rate limit + cost cap per actor.
- Advisory audit log.
- Worker safety patterns + legal awareness patterns.

**Topic allowed (6 groups):**

| Group | Topics |
|---|---|
| Service request | electrical_repair, plumbing_repair, home_cleaning |
| Educational về 3 services | electrical_safety_education, plumbing_self_diagnosis, cleaning_best_practices, service_pricing_general_info, worker_qualification_explain |
| Functional | price_estimate (own job), worker_brief, scope_change, job_status, app_usage_help, safety_advisory |
| Worker safety | worker_safety_advisory |
| Legal awareness | legal_safety_awareness |
| Redirect | support_redirect |

**Topic forbidden:**

| Forbidden | Lý do |
|---|---|
| medical_advice, legal_advice, financial_advice | Ngoài chuyên môn |
| other_workers_specific, other_jobs_specific | PII + privacy |
| market_prediction | Không phải Kael's job |
| political_opinion, social_opinion | Brand safety |
| exact_guaranteed_price, fear_based_upsell | STRUCTURES rule |
| out_of_scope_services_anything | Hard scope |

**8 Decline templates Vietnamese:**

```ts
const DeclineTemplates = {
  out_of_scope_service: "Hiện Kael chỉ hỗ trợ sửa điện, sửa nước và dọn dẹp tại các căn hộ HCMC. Bạn vui lòng quay lại khi chúng tôi mở thêm dịch vụ.",
  out_of_domain_question: "Câu hỏi này nằm ngoài phạm vi của Kael. Vui lòng liên hệ hỗ trợ khách hàng tại tab Profile để được giúp.",
  cannot_do_action: (alternative) => `Kael không có thẩm quyền thực hiện điều này. ${alternative}`,
  unsafe_or_sensitive: "Kael không thể trả lời câu hỏi này. Nếu bạn cần hỗ trợ khẩn cấp, vui lòng gọi số 113.",
  rate_limit_hit: "Bạn đã hỏi Kael quá nhiều lần trong thời gian ngắn. Vui lòng đợi {seconds} giây.",
  cost_cap_hit: "Bạn đã đạt giới hạn yêu cầu cho tháng này. Vui lòng liên hệ hỗ trợ.",
  legal_advice_redirect: "Câu hỏi này cần tư vấn pháp lý chuyên môn. Kael có thể cảnh báo về an toàn nhưng không tư vấn pháp lý. Vui lòng tham vấn luật sư.",
  emergency_redirect: "Tình huống này có vẻ khẩn cấp. Vui lòng gọi 113 (cứu hỏa/khẩn cấp) hoặc 115 (cấp cứu y tế) ngay lập tức.",
};
```

**Rate limit + cost cap:**

| Actor / Action | Per-minute | Per-day | Cost cap/month |
|---|---|---|---|
| Customer intent_classification | 30 | — | — |
| Customer full estimate request | 5 | 50 | $5 |
| Customer clarification | 10 | 100 | — |
| Customer scope_change | 3 per job | — | — |
| Worker brief clarification | 3 per job | — | — |
| Worker scope_change submit | 1 per job | — | — |
| Admin | unlimited | unlimited | unlimited |
| System (background learning) | — | — | $30/day |

**WBS:**

- T5.1 Implement `packages/shared/kael/permissions.ts` (Permission matrix data).
- T5.2 Implement `supabase/functions/mobile-api/_shared/kael/permission-gate.ts`.
- T5.3 Add purpose #11 `educational_response` to routing config.
- T5.4 Enhance intent_classification output schema với 6 intent categories.
- T5.5 Implement decline templates Vietnamese.
- T5.6 Implement rate limit `kael/rate-limit.ts`.
- T5.7 Migration `kael_advisory_audit` table.
- T5.8 Migration `worker_safety_patterns` table.
- T5.9 Migration `legal_awareness_patterns` table.
- T5.10 Seed initial safety + legal patterns.
- T5.11 Integrate permission gate vào orchestrator (P3 hook).

**Build Instructions:**

- Permission matrix: declarative data, not code logic.
- Decline templates: hardcode Vietnamese.
- Rate limit: start in-memory; migrate DB nếu cần.
- Audit log: append-only.

**Affected Areas:**

- `packages/shared/kael/permissions.ts`
- `packages/shared/kael/decline-templates.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/permission-gate.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/rate-limit.ts`
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (UPDATE: hook)
- `supabase/migrations/*` (3 new tables + seeds)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-security-sweep`, `kael-supabase`, `kael-tdd`.

**Tests (blocking gates + acceptance metric):**

- T5-test-1: Permission matrix coverage (11 × 4 × 4) compile + valid.
- T5-test-2: Educational query in-scope → respond, not decline.
- T5-test-3: AC service query → decline OOS.
- T5-test-4: Legal advice → decline.
- T5-test-5: Legal awareness query → respond cảnh báo.
- T5-test-6: Worker safety advisory triggered.
- T5-test-7: Rate limit hit → template, no LLM.
- T5-test-8: Cost cap hit → template + log.
- T5-test-9: Audit log row inserted.
- T5-test-10: Security: cross-customer access denied.
- T5-test-11: Security: worker pre-accept PII denied.
- T5-test-12: Decline templates Vietnamese only.
- Target: 12/12 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Permission deny không đúng → tune matrix. Template cần update → tune.

**Foundation Enhancement:** Permission matrix size → config file. Rate limit → DB nếu cần.

**Acceptance Gate:**

- [ ] Permission matrix complete.
- [ ] Educational query routes #11.
- [ ] 8 decline templates Vietnamese.
- [ ] Rate limit + cost cap enforced.
- [ ] Advisory audit working.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.
- [ ] No permission bypass.

**Estimated Effort:** 3-4 ngày.

**Handoff Notes:** Permission gate integrated vào orchestrator. Mọi purpose call qua check trước.

---

### 23.11 Phase P6 — Memory Governance

**Goal:** Implement 6-layer memory (L1-L6) + retrieval budget + privacy + audit.

**Dependencies:** P1 (schemas), P5.

**Memory taxonomy:**

| Layer | Storage | Lifetime | Access | Versioned |
|---|---|---|---|---|
| L1 Short-term context | Memory (Edge function) | Per-request | service-role | No |
| L2 Job memory | jobs.kael_* + kael_*_artifacts | 2 năm retention | RLS (own + admin) | Snapshot per write |
| L3 Customer memory (NEW) | customer_kael_memory | Indefinite, purge khi xóa account | RLS | Latest only |
| L4 Worker memory (NEW) | worker_kael_memory | Indefinite, archive sau suspended > 1 năm | RLS | Latest only |
| L5 Domain memory | learning_rules + learning_rule_versions | Indefinite | service-role + admin | Yes (PR #12) |
| L6 Conversational | chat_messages | 90 ngày | RLS | No |

**Retrieval budget per LLM call (tokens):**

| Layer | Customer call | Worker call | Background learning |
|---|---|---|---|
| L1 short-term | Full | Full | Full |
| L2 job memory | Full job context | Full job context | Full |
| L3 customer | Last 5 jobs + prefs (≤500) | **NEVER** (privacy) | Full |
| L4 worker | **NEVER** (privacy) | Own (≤500) | Full |
| L5 domain | Relevant rules (≤500) | Same | Full |
| L6 conversational | Last 10 messages (≤300) | Last 10 messages | Full |

**Total budget per LLM call: ≤ 1500 tokens context.**

**Conflict resolution:** L5 domain > L2 job > L3/L4 user > L1 short-term.

**Stale check:** Memory > 90 days → mark 'stale'. > 365 days → archive.

**WBS:**

- T6.1 Implement `kael/memory.ts` (KaelMemory class với getContext + per-layer fetchers).
- T6.2 L1 short-term context: per-request scratchpad.
- T6.3 L2 job memory fetcher.
- T6.4 L3 customer memory fetcher.
- T6.5 L4 worker memory fetcher.
- T6.6 L5 domain memory fetcher.
- T6.7 L6 conversational fetcher.
- T6.8 Token budget enforcement.
- T6.9 Conflict resolution.
- T6.10 PII filter `kael/memory-sanitizer.ts`.
- T6.11 Cascade delete trigger.
- T6.12 Audit log `kael_memory_audit`.
- T6.13 Endpoint `GET /me/kael-memory`.
- T6.14 Endpoint `GET /workers/me/kael-memory`.
- T6.15 Memory deletion endpoint `DELETE /me/kael-memory` (GDPR-ready).
- T6.16 Wire `KaelMemory.getContext()` vào orchestrator.
- T6.17 Stale check job.

**Build Instructions:**

- Token counting: tiktoken hoặc heuristic (4 chars ≈ 1 token).
- Retrieval per layer parallel (Promise.all).
- PII filter strict whitelist.
- Audit log append-only.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/memory.ts` (NEW, ~400-600 lines)
- `supabase/functions/mobile-api/_shared/kael/memory-sanitizer.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (UPDATE)
- `supabase/functions/mobile-api/_shared/router.ts` (3 new routes)
- `supabase/functions/mobile-api/_shared/services.ts` (3 new handlers)
- `supabase/migrations/*` (trigger cascade + archive table)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-security-sweep`, `kael-architecture-deepening`, `kael-tdd`.

**Tests (blocking gates + acceptance metric):**

- T6-test-1: `getContext` returns 6 layers correctly.
- T6-test-2: Token budget per layer enforced.
- T6-test-3: PII filter strips phone/CCCD/address.
- T6-test-4: Customer cannot read other customer's L3.
- T6-test-5: Worker cannot read other worker's L4.
- T6-test-6: Customer-facing call: L4 NOT included.
- T6-test-7: Worker-facing call: L3 detailed NOT included.
- T6-test-8: Conflict resolution priority.
- T6-test-9: Stale check.
- T6-test-10: Cascade delete: delete customer → L3 row gone.
- T6-test-11: Audit log 1 row per L3/L4/L5 read/write.
- T6-test-12: Self-view endpoint sanitized data.
- T6-test-13: Memory deletion endpoint: data gone + audit.
- Target: 13/13 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Token budget exceed → tune. PII leak → tighten filter. Cascade fail → fix FK + trigger.

**Foundation Enhancement:** KaelMemory class deep module check. Audit log partition strategy.

**Acceptance Gate:**

- [ ] 6 layers fetchable.
- [ ] Budget ≤ 1500 tokens/call enforced.
- [ ] PII filter security test pass.
- [ ] Cascade delete works.
- [ ] Self-view endpoints work.
- [ ] Audit log working.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.

**Estimated Effort:** 4-5 ngày.

**Handoff Notes:** Memory layer ready cho Learning Skill (P7) consume.

---

### 23.12 Phase P7 — Learning Skill Setup (extend PR #12)

**Goal:** Implement 7 learning skills (LS1-LS7) với skill registry, evidence gate, scope limits, lifecycle, monitoring, admin controls.

**Dependencies:** P6.

**7 Learning Skills:**

| # | Skill | Trigger | Status | Effect |
|---|---|---|---|---|
| LS1 | Price prior learning (MarketMemoryService) | post-A14 | ✅ PR #12 | Adjust baseline range |
| LS2 | Case review learning (CaseReviewService) | post-A14 | ✅ PR #12 | Detect missing questions, advisory, fraud |
| LS3 | Worker pattern learning | post-B6 + post-B7 | NEW | Update worker_kael_memory.red_flags |
| LS4 | Customer preference learning | post-A14 | NEW | Update customer_kael_memory |
| LS5 | Service knowledge learning | post-A14 + admin trigger | NEW | Update service_knowledge_boxes |
| LS6 | Safety pattern learning | post-A14 + admin tag | NEW | Extend worker_safety + legal_awareness patterns |
| LS7 | Decline reason learning | post-decline + customer feedback | NEW | Improve intent + decline templates |

**Skill Registry pattern:**

```ts
interface KaelLearningSkill {
  name: string;
  trigger: SkillTrigger;
  inputs_schema: ZodSchema;
  outputs_schema: ZodSchema;
  evidence_gate: {
    min_evidence_count: number;     // default 5 (PR #12)
    confidence_threshold: number;   // default 0.6 (PR #12)
    recency_window_days: number;    // default 90
    require_completed_transactions: true;
    quality_filter?: (evidence: any[]) => any[];
  };
  scope_limits: {
    forbidden_effects: KaelForbiddenEffect[];
    allowed_targets: ('analysis_prompt' | 'price_prior' | 'clarification' | 'advisory' | 'detection_pattern')[];
  };
  rollback: {
    available: boolean;
    auto_rollback_trigger?: {
      accuracy_drop_pct: number;     // default 10%
      satisfaction_drop_pts: number; // default 0.3
      monitor_window_days: number;   // default 30
    };
  };
  performance_metrics: ('applied_count' | 'override_count' | 'accuracy_delta' | 'satisfaction_delta')[];
  enabled: boolean;
  version: number;
}
```

**Forbidden effects (STRUCTURES §10F, code constant):**

- auto_charge_payment
- auto_confirm_booking
- auto_cancel_job
- auto_approve_worker
- auto_suspend_worker
- auto_change_final_price (without A11)
- auto_expand_service_scope
- hide_learning_changes_from_admin

**Allowed targets (code constant):**

- analysis_prompt
- price_prior
- clarification_pattern
- advisory_pattern
- detection_pattern
- intent_category

**Lifecycle:**

```
candidate → pending_evidence → evidence_gate_check
  → auto_promoted (if pass all) OR manual_review (if borderline)
  → active → monitoring
  → degraded (if accuracy/satisfaction drops) → rolled_back → archived
```

**3 NEW env flags:**

```
KAEL_LEARNING_KILL_SWITCH=false        # emergency disable all
KAEL_LEARNING_AB_PERCENTAGE=100        # A/B rollout %
KAEL_LEARNING_AUTO_ROLLBACK=true       # enable auto-degrade
```

(extends PR #12 existing `KAEL_LEARNING_READ_ENABLED` + `KAEL_LEARNING_WRITE_ENABLED`)

**WBS:**

- T7.1 Implement `kael/skills/registry.ts`.
- T7.2 Implement `kael/skills/LS1-market-memory.ts` (port PR #12).
- T7.3 Implement `kael/skills/LS2-case-review.ts` (port PR #12 + extend).
- T7.4 Implement `kael/skills/LS3-worker-pattern.ts`.
- T7.5 Implement `kael/skills/LS4-customer-preference.ts`.
- T7.6 Implement `kael/skills/LS5-service-knowledge.ts` (manual review required).
- T7.7 Implement `kael/skills/LS6-safety-pattern.ts` (manual review required).
- T7.8 Implement `kael/skills/LS7-decline-reason.ts` (manual review required).
- T7.9 Migration `kael_rule_application_log` table.
- T7.10 Migration `kael_rule_lifecycle_log` table.
- T7.11 Lifecycle state machine.
- T7.12 Scope limits runtime enforcement.
- T7.13 Performance monitoring.
- T7.14 3 env flags.
- T7.15 Wire skill triggers vào workflow events.

**Build Instructions:**

- Skills run background queue (NOT inline).
- Use existing `insert_notification_atomic` cho async.
- Forbidden effects + allowed targets trong code constant (KHÔNG configurable).
- Per-skill prompts versioned.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/skills/` (NEW dir, 7 skill files + registry)
- `supabase/functions/mobile-api/_shared/services.ts` (wire triggers)
- `supabase/migrations/*` (2 new tables + env flag docs)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep`, `kael-tdd`, `kael-architecture-deepening`.

**Tests (blocking gates + acceptance metric):**

- T7-test-1: Skill registry CRUD.
- T7-test-2: LS1-LS7 each trigger → output valid.
- T7-test-3: Evidence gate: count < min → no promote.
- T7-test-4: Evidence gate pass → auto-promote (auto skills) or queue (manual).
- T7-test-5: Scope limits: candidate forbidden_effect → reject + audit.
- T7-test-6: Lifecycle state transitions valid.
- T7-test-7: Performance monitoring tracking.
- T7-test-8: Auto-rollback: simulate accuracy drop → rule degraded.
- T7-test-9: Manual review queue: LS5/6/7 pending.
- T7-test-10: Kill switch: env true → no learning.
- T7-test-11: A/B percentage: 50% → only 50% trigger.
- T7-test-12: Security: skill attempts auto-charge → blocked.
- T7-test-13: Cross-skill: 1 job → multiple skills correctly.
- Target: 13/13 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Skill not triggering → check wiring. Auto-promote không đúng → tune gate.

**Foundation Enhancement:** Skill registry pattern docs. Learning rule version archive strategy.

**Acceptance Gate:**

- [ ] 7 skills registered.
- [ ] PR #12 LS1/LS2 integrated.
- [ ] LS3-LS7 new skills implemented.
- [ ] Evidence gate works.
- [ ] Scope limits enforced.
- [ ] Performance monitoring active.
- [ ] 3 env flags working.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.
- [ ] No autonomous money-impacting action possible.

**Estimated Effort:** 5-7 ngày (largest after P3).

**Handoff Notes:** Learning loop ready. Admin needs UI để view candidates + approve manual review skills.

---

### 23.13 Phase P8 — Response Style / Charter Implementation

**Goal:** Charter files đầy đủ + system prompt construction + self-check pipeline.

**Dependencies:** P2.

**Charter structure:**

```
packages/shared/kael/charter/
  identity.md              # LOCKED — Tu approve mới đổi
  persona.md               # LOCKED
  mission-values.md        # LOCKED
  tone-matrix.yaml         # admin tunable
  language-rules.md        # admin tunable (add only)
  forbidden-language.json  # admin tunable (add only)
  style-guidelines.md      # admin tunable
  version.json             # version tracking
```

**Identity (LOCKED):**

```md
Kael là trợ lý AI của Home Services, nền tảng dịch vụ sửa điện, sửa nước
và dọn dẹp cho căn hộ tại HCMC.

Kael KHÔNG phải: chatbot tổng quát, người quyết định booking, người trừng phạt thợ,
cố vấn pháp lý/y tế/tài chính, hệ thống bán hàng.

Kael LÀ: phân tích vấn đề từ ảnh và mô tả, ước tính giá thị trường minh bạch,
brief cho thợ trước khi đến, bảo vệ khách + thợ khỏi lừa đảo, học từ giao dịch hoàn tất.
```

**Persona traits (LOCKED):**

| Trait | Có | Không |
|---|---|---|
| Professional | Câu rõ ràng, dùng số liệu | Không slang, emoji default |
| Humble | Biết giới hạn, "cần khảo sát" khi thiếu info | Không ép giá chính xác |
| Transparent | Show price_source, kael_reasoning | Không giấu data từ admin |
| Customer-first | Đặt customer interest trước platform | Không upsell |
| Fair to workers | Đề xuất earning hợp lý | Không pressure |
| Has spine | Challenge thợ khi scope-change suspicious | Không bị dắt mũi |
| Direct | Nói thẳng, không vòng vo | Không politically correct excess |

**Mission + Values priority (LOCKED):**

```
1. Trust  — không lừa khách, không lừa thợ, không lừa platform
2. Safety — bảo vệ khách + thợ khỏi nguy hiểm vật lý/pháp lý
3. Transparency — show reasoning, không giấu data
4. Fairness — giá đúng, không upcharge, không lowball
5. Humility — biết khi nào không biết
```

**Forbidden language (admin tunable, add-only):**

```json
{
  "fear_language": ["nguy hiểm chết người", "cháy nổ tức thì", "tử vong", "không cứu kịp", "phá hủy hoàn toàn"],
  "absolute_claims": ["chắc chắn 100%", "không bao giờ", "tuyệt đối an toàn", "guaranteed", "đảm bảo không lỗi"],
  "ai_self_reference": ["As an AI", "Tôi là AI", "Tôi là chatbot", "Tôi không phải con người", "AI language model"],
  "casual_slang": ["ok đm", "vãi", "ờm", "à uh"],
  "buzzwords": ["synergy", "leverage", "paradigm shift", "revolutionary", "game-changing"],
  "accusatory_in_dispute": ["Bạn đang đe dọa", "Hành vi không chấp nhận", "Vui lòng dừng việc", "Kael phát hiện bạn đang", "Yêu cầu của bạn không hợp lý", "Bạn đang lừa Kael", "Không thể chấp nhận", "Bạn cần bình tĩnh"],
  "aggressive_response": ["Tôi sẽ không trả lời", "Đây là yêu cầu vô lý", "Bạn cần kiềm chế", "Tôi từ chối", "Hệ thống không cho phép điều đó", "Bạn đã sai"]
}
```

**Style guidelines (per actor):**

| Rule | Customer-facing | Worker-facing | Admin |
|---|---|---|---|
| Câu length | ≤ 20 từ/câu | ≤ 30 từ | unlimited |
| 1 response | 1 ý chính | 1-3 bullet | structured |
| Markdown | NO (sanitize) | Limited bullet | YES |
| Emoji | NO default | NO | YES |
| Code blocks | NO | NO | YES |
| Number format | Vietnamese | Vietnamese | English OK |

**System prompt construction:**

```ts
function buildSystemPrompt(purpose, actor, context): string {
  return [
    Charter.identity,                              // LOCKED
    Charter.persona,                               // LOCKED
    Charter.missionValues,                         // LOCKED
    Charter.toneMatrix.lookup({ purpose, actor }), // dynamic
    Charter.languageRules,                         // always
    Charter.forbiddenLanguage.toAvoidance(),       // always
    Charter.styleGuidelines.lookup(actor),         // dynamic
    PurposeSpecificGuidance.lookup(purpose),       // dynamic
    Permission.summarize({ actor, purpose }),       // from #4
    Context.summarize(context),                     // from #5 memory
  ].join('\n\n---\n\n');
}
```

Cap total prompt: 3000 system + 1500 memory = ~4500 tokens.

**Self-check pipeline:**

```
LLM raw output
  → Sanitizer (strip PII, AI self-ref, forbidden language, VI check, length cap)
  → Tone check (heuristic: formal markers vs casual)
  → If fail → regen 1 lần | fallback template
  → Persist + emit
```

**WBS:**

- T8.1 Fill `kael/charter/identity.md` (LOCKED, Vietnamese).
- T8.2 Fill `kael/charter/persona.md` (LOCKED).
- T8.3 Fill `kael/charter/mission-values.md` (LOCKED).
- T8.4 Fill `kael/charter/tone-matrix.yaml` (mọi purpose × actor, empathy v2, 3 motif).
- T8.5 Fill `kael/charter/language-rules.md`.
- T8.6 Fill `kael/charter/forbidden-language.json`.
- T8.7 Fill `kael/charter/style-guidelines.md`.
- T8.8 Implement `kael/system-prompt.ts`.
- T8.9 Implement `kael/self-check.ts`.
- T8.10 Charter governance (LOCKED vs tunable).
- T8.11 Versioning `kael/charter/version.json`.
- T8.12 Migration `kael_charter_audit` table.
- T8.13 Endpoint `GET /kael/charter` (public, sanitized).
- T8.14 Integrate self-check vào orchestrator output path.

**Build Instructions:**

- Charter Vietnamese.
- Frontmatter on every file: name, status, version, last_modified.
- System prompt: deterministic order.
- Self-check pure function.
- Tone heuristic: keyword count, no LLM call.

**Affected Areas:**

- `packages/shared/kael/charter/` (FILL 7 files)
- `supabase/functions/mobile-api/_shared/kael/system-prompt.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/self-check.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (UPDATE)
- `supabase/functions/mobile-api/_shared/router.ts` (1 new route)
- `supabase/migrations/*` (charter audit table)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-docs-execution`, `kael-tdd`.

**Tests (blocking gates + acceptance metric):**

- T8-test-1: Charter files valid (frontmatter + schema).
- T8-test-2: System prompt builder ≤ 3000 tokens.
- T8-test-3: Tone matrix lookup correct.
- T8-test-4: Self-check fear language → fail.
- T8-test-5: Self-check AI self-ref → fail.
- T8-test-6: Self-check exact VND → fail.
- T8-test-7: Self-check Vietnamese pass.
- T8-test-8: Self-check English mid-VI mode → fail.
- T8-test-9: Tone enforcement length ≤ 20 từ/câu customer.
- T8-test-10: Forbidden language Case 2 anti-accusation caught.
- T8-test-11: Charter endpoint sanitized.
- T8-test-12: Integration: full Kael invocation → prompt valid + response checked.
- T8-test-13: Security: LOCKED file edit via API → blocked.
- Target: 13/13 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** Tone wrong → tune matrix. Self-check false positive → adjust.

**Foundation Enhancement:** Charter source of truth. Future: visual Charter editor (out of scope).

**Acceptance Gate:**

- [ ] 7 charter files Vietnamese.
- [ ] System prompt builder works.
- [ ] Self-check catches violations.
- [ ] Tone matrix covers all (purpose × actor).
- [ ] Forbidden language complete.
- [ ] Charter endpoint public-safe.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.

**Estimated Effort:** 3-4 ngày.

**Handoff Notes:** Charter governs Kael personality. Any future change MUST update charter first.

---

### 23.14 Phase P9 — Agentic Case 1: Transaction bình thường

**Goal:** Wire full happy-path workflow theo Compact 6 phase (D22).

**Dependencies:** P3-P8 (all Harness done).

**Compact 6 phase:**

```
Phase 1 INTAKE (A2-A5, ~9s)
  - Pipeline run: intent → (vision ‖ market ‖ problem) → (price ‖ advisory)
  - Optional skip: A4 clarification (skip nếu ảnh + ≥50 char)
  - Notif: "Kael đã ước tính"

Phase 2 CONFIRM (A6-A7, user action)
  - Customer confirm A7
  - Eager gen worker_brief Stage 1 (core)
  - Optional skip "Đang tìm thợ" notif nếu match < 5s

Phase 3 MATCH (A8-B4, ~30s typical)
  - Backend broadcast → worker accept
  - brief Stage 2 background
  - Notif gộp: "Đã có thợ B. ETA: 15 phút"

Phase 4 EXECUTE (B5, ~45 min typical)
  - on_way → arrived → inspecting → repairing
  - Kael: SILENT
  - Notif chỉ 1: "Thợ đã đến" (skip on_way/inspecting/repairing)

Phase 5 COMPLETE (B7-A13, ~5 min)
  - Worker complete + customer confirm + payment
  - Validate completion_notes (LS5 input), show final_price = kael_price_max
  - Notif gộp: "Thợ báo hoàn thành. Xác nhận để thanh toán"

Phase 6 LEARN (A14, background)
  - Customer review
  - Realtime: LS1 MarketMemory, LS2 CaseReview
  - Background batch: LS3, LS4, LS5
  - Skip: LS6, LS7 (no signal)
  - Notif: "Cảm ơn đánh giá!"
```

**Optional skip rules:**

```
A4 clarification → SKIP nếu (ảnh) AND (description ≥ 50 char) AND (vision conf ≥ 0.7)
"Đang tìm thợ" notif → SKIP nếu worker match < 5s
B5 on_way notif → SKIP nếu booking 'now'
B5 inspecting/repairing notif → SKIP (silent observe)
LS6 safety learning → SKIP nếu không có incident
LS7 decline learning → SKIP nếu không có decline trong session
"Thợ báo hoàn thành" + "Xác nhận để thanh toán" → GỘP thành 1 notif với CTA
```

**Realtime vs Background memory updates:**

| Realtime (sync) | Background (queue) |
|---|---|
| L2 job memory writes | L3 customer preference update |
| L4 worker.rating (after review) | L4 worker.service_skill_proficiency |
| L5 LS1 evidence increment | L5 LS3/LS4/LS5 candidates |
| L3 customer.satisfaction | L5 LS2 case review analysis |

**WBS:**

- T9.1 Wire Phase 1 INTAKE: orchestrator parallel pipeline.
- T9.2 Wire Phase 2 CONFIRM: A7 → broadcast + gen worker_brief Stage 1.
- T9.3 Wire Phase 3 MATCH: brief Stage 2 background after B3.
- T9.4 Wire Phase 4 EXECUTE: silent observe, 1 notif arrived.
- T9.5 Wire Phase 5 COMPLETE: validate completion, show final_price.
- T9.6 Wire Phase 6 LEARN: trigger LS1+LS2+LS3+LS4+LS5 background.
- T9.7 Implement notification budget: 5 notif/transaction.
- T9.8 Implement optional skip rules.
- T9.9 Realtime vs background memory split.
- T9.10 Integration test end-to-end staging.

**Build Instructions:**

- Use orchestrator (P3), output format (P4), permission (P5), memory (P6), learning (P7), charter (P8).
- Wire by adding workflow hooks vào existing services.ts state transitions.
- Notification gộp: check trước insert.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/functions/mobile-api/_shared/lifecycle.ts`
- `supabase/functions/mobile-api/_shared/kael/agentic/case-1-normal.ts` (NEW)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-supabase`, `kael-tdd`, `kael-architecture-deepening`.

**Tests (blocking gates + acceptance metric):**

- T9-test-1: End-to-end happy path 1 plumbing job.
- T9-test-2: Notification count = 5 (or 4 nếu skip).
- T9-test-3: Memory updates L2/L3/L4/L5 verified.
- T9-test-4: Token cost $0.07-0.10/transaction.
- T9-test-5: Latency A2→A5 ≤ 9s.
- T9-test-6: LS1-LS5 triggered post-A14.
- T9-test-7: Repeat 10 times → 10/10 success; any failure triggers diagnose.
- T9-test-8: A4 clarification skipped với đủ context.
- T9-test-9: B5 silent: no Kael chat injection.
- T9-test-10: Final price = kael_price_max.
- Target: 10/10 blocking tests pass; scenario quality metric ≥ 95% where measured.

**Verification Loop:** E2E fail → `kael-diagnose` hypothesis-driven repro.

**Foundation Enhancement:** Case 1 = template. Document trong `docs/agent-lessons.md`.

**Acceptance Gate:**

- [ ] End-to-end Case 1 works staging.
- [ ] Notification budget 5 met.
- [ ] Memory + learning triggered.
- [ ] Latency ≤ 9s.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.

**Estimated Effort:** 3-4 ngày.

**Handoff Notes:** Case 1 = baseline. Cases 2-5 build trên template này.

---

### 23.15 Phase P10 — Agentic Case 2: Transaction khắc khe

**Goal:** Implement 2-nuance detection + 5 strategies + escalation pathway + defensive log (D23, D27).

**Dependencies:** P9.

**2 nuance:**

| Nuance | Behavior | Kael's response |
|---|---|---|
| **Detail-oriented** (legit) | Hỏi chi tiết, muốn hiểu | **Transparency**: show kael_reasoning, market source, worker credentials |
| **Pressure** (illegit) | Đòi giảm giá, đe dọa | **Spine NGẦM**: polite decline + log + escalate admin |

**Patterns Kael detect:**

```ts
const DemandingCustomerPatterns = {
  legitimate_concern: ['qa_loop_above_3', 'request_credentials', 'request_breakdown', 'request_alternatives'],
  pressure_signals: ['demand_discount', 'threat_complaint', 'demand_refund_no_reason', 'aggressive_language', 'multiple_cancel_pattern'],
  combined: { qa_count_threshold: 5, pressure_score_threshold: 0.5 }
};
```

**5 strategies:**

| # | Strategy | Khi nào | Action |
|---|---|---|---|
| 1 | Transparency expansion | Detail-oriented | Show kael_reasoning expanded, market source, credentials |
| 2 | Empathy + factual | Concern language | Acknowledge concern trước, sau factual |
| 3 | Soft escalation | Pressure signals | Flag admin background, vẫn handle polite |
| 4 | Hard escalation | Threat/aggressive | Stop AI loop, redirect admin queue |
| 5 | Defensive documentation | Always when khắc khe | Log every interaction vào L2 + audit |

**Empathy templates v2 (soft-but-firm motif):**

```ts
const EmpathyTemplatesV2 = {
  price_concern: "Kael hiểu bạn cần đảm bảo giá hợp lý. Đây là cơ sở Kael tính: {reasoning}. Mọi dữ liệu Kael dùng đều minh bạch.",
  worker_concern: "Kael hiểu bạn muốn yên tâm về thợ. Thợ {name} đã hoàn tất {n} việc với rating {r}/5. Mọi review đều được Kael ghi nhận và kiểm chứng.",
  wait_time_concern: "Xin lỗi vì thời gian chờ. Kael đã ghi nhận tiến trình thợ và sẽ cập nhật ngay.",
  service_quality_concern: "Kael ghi nhận mối lo của bạn. Mỗi tương tác được lưu lại đầy đủ. Nếu cần admin can thiệp, bạn có thể yêu cầu qua nút bên dưới.",
  complaint_threat_acknowledge: "Kael đã ghi nhận đầy đủ thông tin. Để vấn đề được giải quyết đúng cách, admin sẽ liên hệ bạn trong vòng 30 phút.",
  refund_demand: "Kael không có thẩm quyền quyết định hoàn tiền. Admin sẽ xem xét trường hợp của bạn dựa trên đầy đủ thông tin Kael đã ghi nhận từ giao dịch này.",
  pressure_acknowledge: "Kael ghi nhận yêu cầu của bạn. Quy trình của Kael minh bạch và mọi tương tác đều được lưu lại để đảm bảo công bằng cho cả khách và thợ.",
  repeated_demand: "Kael đã trả lời câu này. Nếu bạn vẫn cần giải thích thêm, admin có thể tham gia để giúp bạn hiểu rõ hơn.",
};
```

**Implicit-firmness pattern (3 motif):**

1. **System/Process motif:** "Quy trình Kael...", "Hệ thống ghi nhận..."
2. **Record motif:** "Mọi tương tác được lưu lại...", "Dữ liệu đầy đủ được giữ..."
3. **Fairness motif:** "Để đảm bảo công bằng cho cả khách và thợ...", "Quy tắc áp dụng như nhau..."

**Escalation pathway:**

```
SOFT ESCALATION: pressure score ≥ 0.5 → admin queue medium priority, continue polite

HARD ESCALATION: threat OR refund demand OR repeated complaint
  → Stop AI response loop
  → Show: "Kael đã ghi nhận đầy đủ. Để giải quyết tốt nhất, admin sẽ liên hệ bạn trong vòng 30 phút."
  → Insert admin queue high priority
  → Lock job state (no auto transitions)
  → Wait admin action
```

**WBS:**

- T10.1 Pattern detection `kael/agentic/demanding-customer-detect.ts`.
- T10.2 5 strategies implementation.
- T10.3 Empathy templates v2 trong `kael/decline-templates.ts` (extend P5).
- T10.4 Escalation: admin queue table + insert logic.
- T10.5 Defensive log: `kael_interaction_log` migration.
- T10.6 Hard escalation: stop AI loop + show admin contact wait.
- T10.7 Integration test với simulated demanding customer.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/agentic/case-2-demanding.ts` (NEW)
- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/migrations/*` (admin queue + interaction log)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`, `kael-security-sweep`.

**Tests (blocking gates + acceptance metric):** 8+ blocking tests covering pattern detection, strategy application, escalation, audit. All blocking tests must pass; scenario quality metric target ≥ 95%.

**Acceptance Gate:**

- [ ] Pattern detection ≥ 90% accuracy.
- [ ] Empathy templates Vietnamese soft-but-firm.
- [ ] NO accusatory wording (per D27).
- [ ] Escalation pathway working.
- [ ] Blocking tests pass; scenario quality metric ≥ 95% where measured.

**Estimated Effort:** 3-4 ngày.

---

### 23.16 Phase P11 — Agentic Case 3: Worker hủy deal

**Goal:** Implement 2 sub-cases (explicit + no-show) + reason taxonomy + anti-abuse + rebroadcast (D24).

**Dependencies:** P9, P7.

**2 sub-cases:**

| Sub-case | Detection | Reason |
|---|---|---|
| **3A** Worker explicit cancel | `worker_cancellation_requests` row | Worker submit lý do |
| **3B** Worker no-show | Backend timer detect: status stuck > 15 min hoặc ETA past + no on_way | Worker silent |

**Cancellation reason taxonomy (admin tunable):**

```ts
const CancellationReasons = {
  legit_auto_approve: ['medical_emergency_with_evidence', 'family_emergency_confirmed', 'vehicle_breakdown_with_photo'],
  legit_with_admin_review: ['job_more_complex_than_described', 'unsafe_conditions_on_site', 'customer_not_responding_at_site'],
  suspicious: ['higher_pay_elsewhere', 'changed_mind', 'unable_to_find_address'],
  no_reason: [],
};
```

**Anti-abuse rules:**

```ts
const WorkerAbuseRules = {
  cancellation_rate_threshold: 0.30,         // > 30% / 30 days
  consecutive_cancel_threshold: 3,
  no_reason_cancel_threshold: 2,
  cancel_after_arrival_threshold: 1,
  actions: {
    soft_flag: 'mark red_flag in L4',
    admin_notify: 'admin queue priority=medium',
    admin_suspend_review: 'create admin review item before any suspension',
  },
};
```

**Customer fallback options (Phase 5B):**

1. Đợi 15 phút Kael tìm tiếp
2. Reschedule sang slot khác
3. Cancel job (no charge Phase 0)

**WBS:**

- T11.1 Wire sub-case 3A: extend `request_worker_cancellation_atomic` RPC.
- T11.2 Implement sub-case 3B: backend timer.
- T11.3 Cancellation reason taxonomy DB table + seed.
- T11.4 Classification logic.
- T11.5 Auto-approve rules + manual review queue.
- T11.6 Rebroadcast logic (reuse existing).
- T11.7 Customer fallback options emit.
- T11.8 Anti-abuse: cancellation_rate computation, admin suspension review trigger.
- T11.9 L4 update: red_flags.
- T11.10 Integration tests.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/agentic/case-3-worker-cancel.ts` (NEW)
- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/migrations/*` (extend existing RPC, add taxonomy table)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`.

**Tests (blocking gates + acceptance metric):** 8+ blocking tests covering sub-cases, classification, anti-abuse, rebroadcast. All blocking tests must pass; scenario quality metric target ≥ 95%.

**Acceptance Gate:**

- [x] 2 sub-cases work.
- [x] Reason taxonomy admin tunable.
- [x] Anti-abuse thresholds enforced.
- [x] No autonomous suspension; admin action required.
- [x] Rebroadcast triggered.
- [x] Customer fallback options available.
- [x] Blocking tests pass; scenario quality metric ≥ 95% where measured.

**Execution evidence (2026-05-25, P11):**

- Local: API Vitest `51 files | 3 skipped`, `1083 passed | 59 skipped`; shared Vitest `13 files`, `520 passed`; API/shared/mobile `tsc --noEmit` passed.
- Staging `xyylanuyflrjzbjzhqfl`: migrations `20260525140826` and `20260525230054` applied; final dry-run reports remote database up to date; P11 taxonomy/signature/no-show smoke passed.
- Safety: no autonomous `is_suspended=true` or `verification_status='suspended'` in P11 migrations; anti-abuse opens L4 red flag/admin queue review only.

**Estimated Effort:** 3-4 ngày.

---

### 23.17 Phase P12 — Agentic Case 4: Customer hủy deal

**Goal:** Implement 5 sub-cases (4A-4E) + reason taxonomy + Phase 0 limitations + missing RPC (D25).

**Dependencies:** P9.

**5 sub-cases:**

| Sub-case | Khi nào | Backend impact | Complexity |
|---|---|---|---|
| **4A** Cancel trước A7 | Estimate chưa confirm | Simple archive draft | Low |
| **4B** Cancel sau A7 trước B3 | Đang broadcast, chưa worker accept | `cancel_job_before_accept_atomic` (existing) | Low |
| **4C** Cancel sau B3 worker accepted | Worker đã invest | **NEW RPC `cancel_job_after_accept_atomic`** | **High** |
| **4D** Cancel sau B7 completed | Reject completion = dispute | Trigger Case 5 dispute | **Highest** |
| **4E** Cancel scheduled job | Booking future hủy sớm | Tùy timing | Medium |

**Customer cancellation reason taxonomy:**

```ts
const CustomerCancellationReasons = {
  no_penalty_anytime: ['worker_late_significantly', 'worker_no_show', 'personal_emergency_with_note', 'service_issue_resolved_itself'],
  no_penalty_phase_0: ['changed_mind', 'found_alternative', 'wrong_service_selected'],
  needs_admin_review: ['worker_not_trustworthy_claim', 'address_inaccessible', 'pricing_disagreement_late'],
  flag_suspicious: ['repeat_cancel_same_day', 'multiple_cancel_after_accept', 'no_reason_provided'],
};
```

**Anti-abuse customer rules:**

```ts
const CustomerAbuseRules = {
  cancellation_rate_threshold: 0.30,
  cancel_after_accept_threshold: 3,
  same_day_cancel_threshold: 2,
  no_reason_cancel_threshold: 3,
  actions: {
    soft_flag: 'trust_signals.cancellation_abuser = true',
    require_reason: 'next booking phải chọn reason cụ thể',
    require_admin_verify: 'admin xác nhận trước khi book tiếp',
  },
};
```

**Phase 0 vs Future:**

| Aspect | Phase 0 | Phase future |
|---|---|---|
| Worker compensation 4C | None — chỉ goodwill | Platform credit 20-50k cho worker arrived |
| Customer late-cancel penalty 4E | Warning | Cancellation fee 10-20% |
| Customer abuse temp-block | No | 24h block sau 5 abuse signal |

**WBS:**

- T12.1 Migration NEW RPC `cancel_job_after_accept_atomic`.
- T12.2 Implement 4A logic.
- T12.3 Implement 4B logic (reuse existing RPC).
- T12.4 Implement 4C logic: NEW RPC + worker notification + goodwill record.
- T12.5 Implement 4D: trigger dispute flow (defer Case 5 P13).
- T12.6 Implement 4E: scheduled cancellation timing.
- T12.7 Customer cancellation reason taxonomy.
- T12.8 Anti-abuse logic.
- T12.9 Notifications gộp.
- T12.10 Integration tests.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/agentic/case-4-customer-cancel.ts` (NEW)
- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/functions/mobile-api/_shared/router.ts` (1 new route)
- `supabase/migrations/*` (NEW RPC + taxonomy)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`, `kael-security-sweep`.

**Tests (blocking gates + acceptance metric):** 10+ blocking tests covering 5 sub-cases, anti-abuse, notifications. All blocking tests must pass; scenario quality metric target ≥ 95%.

**Acceptance Gate:**

- [x] 5 sub-cases work.
- [x] NEW RPC `cancel_job_after_accept_atomic` atomic.
- [x] Anti-abuse rules enforced.
- [x] Worker goodwill recorded (no rating penalty 4C).
- [x] Phase 0 no monetary penalty.
- [x] Blocking tests pass; scenario quality metric >= 95% where measured.

**Execution evidence (2026-05-25, P12):**

- Local RED/GREEN: P12 unit/router/runtime/schema gates first failed on missing Case 4 module, migration/RPC/types, and route 404; after implementation they passed.
- Local final: API Vitest `52 files | 3 skipped`, `1095 passed | 59 skipped`; shared Vitest `13 files`, `520 passed`; API/shared/mobile `tsc --noEmit` passed; `git diff --check` passed with CRLF warnings only.
- Staging `xyylanuyflrjzbjzhqfl`: migrations `20260525231655`, `20260525233112`, and `20260525233322` applied. Production `iwevizmsedyqozxlawwl` was not migrated in this pass.
- Staging rollback smoke covered all 5 sub-cases: `4A before_a7`, `4B after_a7_before_worker_accept`, `4C after_worker_accept`, `4D after_worker_completed_trigger_dispute`, and `4E scheduled_job`; all returned `ok=true` and `phase0_no_monetary_penalty=true`. 4D kept `job_status=completed_by_worker` for P13 dispute handling; other cancellable paths returned `cancelled`.
- Staging advisors: performance advisor reports `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.
- Safety: P12 files contain no Supabase management token, no autonomous customer fee/block fields, and no new worker suspension mutation. Worker goodwill is an audit note only; no rating penalty or money promise is created.

**Estimated Effort:** 3-4 ngày.

---

### 23.18 Phase P13 — Agentic Case 5: Dispute

**Goal:** Implement dispute flow + Kael neutral rules + evidence locking + admin review (D26).

**Dependencies:** P9, P12.

**5 sub-cases:**

| Sub-case | Trigger | Phase 0 status |
|---|---|---|
| **5A** Completion rejected | Customer reject A12 | **Primary** spec đầy đủ |
| **5B** Damage claim | 24-48h sau A12 | **Primary** spec đầy đủ |
| **5C** Unpaid service | Worker mark customer didn't pay | **Defer** (no payment Phase 0) |
| **5D** Abusive behavior | Worker/customer complain | **Secondary** spec ngắn |
| **5E** Scope disagreement post-job | "Chưa fix hết" vs "Không trong scope" | **Secondary** spec ngắn |

**Kael's CRITICAL rules (không thể tune):**

```
1. Kael NEUTRAL — không bênh ai, kể cả khi data thiên về 1 bên
2. Kael CHỈ analyze + summarize, KHÔNG decide
3. Kael provide FACT-BASED summary, KHÔNG inject opinion
4. Kael KHÔNG communicate dispute outcome (admin only)
5. Kael KHÔNG suggest refund/penalty amount
6. Kael LOCK evidence ngay khi dispute opened, không cho edit
```

**Dispute schema:**

```ts
const DisputeSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  dispute_type: z.enum(['completion_rejected', 'damage_claim', 'unpaid_service', 'abusive_behavior_customer', 'abusive_behavior_worker', 'scope_disagreement_post_job', 'other']),
  initiated_by: z.enum(['customer', 'worker', 'admin']),
  initiator_statement: z.string().max(2000),
  counter_party_statement: z.string().max(2000).optional(),
  counter_party_response_deadline: z.string().datetime(),  // 24h
  evidence_locked_at: z.string().datetime(),
  evidence_snapshot: z.object({
    chat_message_ids: z.array(z.string().uuid()),
    photo_urls: z.array(z.string().url()),
    status_timeline: z.array(z.object({ status: z.string(), at: z.string().datetime() })),
    scope_changes: z.array(z.string().uuid()),
    kael_artifacts: z.array(z.string().uuid()),
  }),
  kael_neutral_summary: z.string().max(1000),
  admin_review: z.object({
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    assigned_admin_id: z.string().uuid().optional(),
    reviewed_at: z.string().datetime().optional(),
  }),
  admin_decision: z.object({
    outcome: z.enum(['customer_favor_full', 'customer_favor_partial', 'worker_favor', 'no_fault_both', 'mutual_warning']),
    refund_amount: z.number().int().optional(),
    worker_credit_amount: z.number().int().optional(),
    customer_trust_impact: z.enum(['none', 'minor_down', 'major_down', 'positive_resolved']),
    worker_action: z.enum(['none', 'warning', 'temp_suspend_7d', 'temp_suspend_30d', 'permanent_suspend']),
    reasoning: z.string().max(2000).min(50),
    admin_id: z.string().uuid(),
  }).optional(),
  resolved_at: z.string().datetime().optional(),
  status: z.enum(['open', 'awaiting_counter_party', 'admin_review', 'admin_decided', 'communicated', 'resolved', 'appealed']),
});
```

**Anti-abuse dispute rules:**

```ts
const DisputeAbuseRules = {
  customer_dispute_rate_threshold: 0.20,
  worker_dispute_rate_threshold: 0.15,
  frivolous_dispute_threshold: 3,
  same_party_repeat_threshold: 2,
};
```

**WBS:**

- T13.1 Migration: `disputes` table.
- T13.2 Migration: `evidence_snapshots` table (immutable).
- T13.3 NEW RPC `open_dispute_atomic`.
- T13.4 NEW RPC `submit_counter_statement_atomic`.
- T13.5 NEW RPC `admin_decide_dispute_atomic`.
- T13.6 Kael neutral summary generator.
- T13.7 Evidence snapshot trigger on dispute open.
- T13.8 Admin queue priority logic.
- T13.9 Communication: wrap admin reasoning Charter tone.
- T13.10 Anti-abuse: dispute_rate.
- T13.11 Integration tests cho 4 sub-cases.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/agentic/case-5-dispute.ts` (NEW)
- `supabase/functions/mobile-api/_shared/services.ts`
- `supabase/functions/mobile-api/_shared/router.ts` (3 new routes)
- `supabase/migrations/*` (2 new tables + 3 RPCs)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`, `kael-security-sweep`.

**Tests (blocking gates + acceptance metric):** 12+ blocking tests covering 4 sub-cases, neutral rules, evidence lock, admin decision. All blocking tests must pass; scenario quality metric target ≥ 95%.

**Acceptance Gate:**

- [x] 4 sub-cases work (5C deferred).
- [x] Kael NEUTRAL: no fault assignment.
- [x] Evidence locked immutable.
- [x] Admin decision outcomes enforce side effects.
- [x] Anti-abuse enforced.
- [x] Blocking tests pass; scenario quality metric >= 95% where measured.

**P13 Evidence (2026-05-26, staging `xyylanuyflrjzbjzhqfl`):**

- RED-first evidence: P13 helper test failed on missing `case-5-dispute`; schema/type tests failed on missing migration/types/contracts; router returned 404 for dispute endpoints; runtime service lacked `openDispute`.
- GREEN scope: added `case-5-dispute.ts`, neutral summary/guard, evidence snapshot payload builder, dispute anti-abuse helper, 3 Edge routes, 3 Edge services, mobile/shared contracts, DB types, and migration `20260525234746_kael_dispute_case_p13.sql`.
- DB scope: `evidence_snapshots` immutable table, `disputes` table, admin queue `dispute_review`, RPCs `open_dispute_atomic`, `submit_counter_statement_atomic`, `admin_decide_dispute_atomic`; admin decision can record optional admin-entered `refund_amount` / `worker_credit_amount`, but Kael never suggests amounts.
- Local verification: targeted P13/schema/router/runtime tests passed; API `tsc --noEmit` passed; shared `tsc --noEmit` passed; full API Vitest passed `53 files | 3 skipped`, `1107 passed | 59 skipped`; full shared Vitest passed `13 files`, `520 passed`; `git diff --check` passed with CRLF warnings only; token sweep found no repo matches.
- Staging verification: dry-run listed only P13 migration, migration applied, smoke returned `ok=true` for 5A completion rejected, 5B damage claim, 5D abusive behavior, 5E scope disagreement, and `DEFERRED_PHASE0` for 5C unpaid service. Smoke also proved immutable evidence update raises `evidence_snapshots are immutable once locked`, counter statement transitions to `admin_review`, and admin decision side effect suspended the worker profile when admin selected `temp_suspend_7d`.
- Staging cleanup/advisors: synthetic smoke users/snapshots cleanup returned `0` leftovers; performance advisor reports `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.

**Estimated Effort:** 5-6 ngày (most complex).

---

### 23.19 Phase P14 — Backend Gaps Cleanup

**Goal:** Close all flagged backend gaps.

**Dependencies:** P3-P13 done.

**Scope:**

- Telemetry: `api_logs.purpose` populated 100%.
- District normalization verify cho q1-q12 + diacritic variants.
- DeepSeek 402 recovery verify.
- Worker district data fix.
- Migration audit (Plan.md H6).
- Stale data cleanup (M2 orphan analyzing jobs).
- VN copy sweep (M1).

**WBS:**

- T14.1 Spot-check api_logs.purpose population trên 50+ records mới.
- T14.2 Test `normalizeServiceAreaDistrict` cho mọi q1-q12 variant.
- T14.3 Test DeepSeek call success.
- T14.4 Re-seed worker_profiles districts consistent với jobs.
- T14.5 Document migration chain trong `docs/architecture/migration-chain.md`.
- T14.6 Cron job cleanup orphan jobs > 24h stuck `analyzing`.
- T14.7 Grep VN copy English leak.

**Affected Areas:** Various existing files + 1-2 cleanup migrations.

**Skills/Protocols:** `kael-preflight`, `kael-diagnose`, `kael-supabase`.

**Tests (blocking gates + acceptance metric):** Spot-check per item. All blocking checks must pass; scenario quality metric target ≥ 95%.

**Acceptance Gate:**

- [x] api_logs.purpose 100% populated.
- [x] District normalization verified.
- [x] DeepSeek 402 recovered.
- [x] Worker district data consistent.
- [x] Migration chain documented.
- [x] Orphan jobs cleaned.
- [x] No English leak.

**P14 Evidence (2026-05-26, staging `xyylanuyflrjzbjzhqfl`):**

- Plan audit correction: active §23 has P0-P17 (18 phases) and five agentic cases P9-P13. P14 continued after P13 evidence.
- RED/GREEN: district test first failed because `Quan 2` returned `null`; schema test first failed because P14 migration/type/doc did not exist; P11 lint-fix test first failed because no follow-up migration existed. After implementation, targeted gates passed.
- Local verification: shared district Vitest `53/53` passed; schema Vitest `64/64` passed; DeepSeek 402 fallback/runtime gates passed `82/82`; API `tsc --noEmit` passed; shared `tsc --noEmit` passed; full API Vitest passed `53 files | 3 skipped`, `1109 passed | 59 skipped`; full shared Vitest passed `13 files`, `521 passed`.
- Staging migrations applied: `20260526002253_backend_gaps_cleanup_p14.sql` and follow-up `20260526003315_fix_worker_cancellation_reason_category_ambiguity_p14.sql`.
- Telemetry evidence: `api_logs` has `total_count=18`, `missing_purpose=0`; `purpose` is `NOT NULL` with `api_logs_purpose_non_empty`; 50 temporary P14 smoke log rows inserted with `missing_purpose=0` and then cleaned to `remaining=0`.
- District evidence: `normalizeServiceAreaDistrict` covers q1-q12 variants, mapping legacy q2/q9 to `thu_duc`; staging worker seed districts changed from `['q7','hcmc_all']` to `['q7']`; invalid/empty/hcmc_all worker counts are `0`; worker/job district mismatch count is `0`.
- DeepSeek 402 recovery evidence: local runtime test proves DeepSeek HTTP 402 falls back to Anthropic before local heuristic and succeeds.
- Orphan cleanup evidence: Supabase Cron job `kael-cleanup-orphan-analyzing-jobs` is active on `17 * * * *` and runs `select public.cleanup_orphan_analyzing_jobs();`; smoke job stuck `analyzing` >24h was moved to `cancelled` with `orphan_analyzing_cleanup` event; smoke auth/profile/job/log leftovers are `false/0`.
- Supabase verification: `db push --dry-run` showed only intended migrations before each push; `db lint --linked --fail-on error` returned `No schema errors found`; performance advisor returned `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.
- Safety sweeps: VN copy script found no forbidden English terms in `vi` copy string literals; exact Supabase token sweep found no repo matches; `git diff --check` passed with CRLF warnings only.

**Estimated Effort:** 2-3 ngày.

---

### 23.20 Phase P15 — Integration Testing

**Goal:** End-to-end testing 5 cases trên staging với real data.

**Dependencies:** P14.

**Scope:**

- E2E test scenarios cho mỗi case.
- Multi-actor scenarios.
- Realtime streaming verification.
- Performance benchmarks.
- Cost ceiling validation.

**WBS:**

- T15.1 Setup staging test data: 5 customer + 5 worker profiles.
- T15.2 E2E Case 1: 10 normal transactions, consistency.
- T15.3 E2E Case 2: 5 demanding customers, escalation verify.
- T15.4 E2E Case 3: 5 worker cancels each sub-case.
- T15.5 E2E Case 4: 5 customer cancels each sub-case.
- T15.6 E2E Case 5: 3 disputes, admin queue + decision.
- T15.7 Realtime: subscribe mobile to job.kael_progress.
- T15.8 Performance: p50/p95/p99 latency per phase.
- T15.9 Cost: $/transaction per case type.
- T15.10 Honest report per memory `feedback_honest_reporting`.

**Acceptance Gate:**

- [x] 5 cases E2E pass staging.
- [x] Multi-actor scenarios work.
- [x] Realtime streaming verified.
- [x] Performance: p95 < 12s end-to-end intake.
- [x] Cost: < $0.30/transaction worst case.
- [x] Test report logged per `/log` format.

**P15 Evidence (2026-05-26, staging `xyylanuyflrjzbjzhqfl`):**

- RED/GREEN: schema contract test first failed because `apps/api/scripts/kael-p15-staging-e2e.mjs` was missing; after adding the P15 harness, the contract test passed and `node --check` passed.
- Staging deployment: `mobile-api` redeployed to staging before the matrix run; production `iwevizmsedyqozxlawwl` was not deployed or migrated.
- Live run report: `docs/test-logs/2026-05-26_p15-staging-e2e.md`, run id `p15-1779757487092-397804`, status `passed`.
- Case matrix passed: Case 1 `10` normal transactions, Case 2 `5` demanding-customer escalations, Case 3 `10` worker cancellation scenarios (`5` explicit + `5` no-show timer rows), Case 4 `5` customer cancellation sub-cases (`before_a7`, `after_a7_before_worker_accept`, `after_worker_accept`, `after_worker_completed_trigger_dispute`, `scheduled_job`), Case 5 `3` disputes (`completion_rejected`, `damage_claim`, `abusive_behavior_customer`) with admin queue + admin decision.
- Multi-actor evidence: run created and used `5` customer auth users, `5` worker auth users, and `1` admin auth user. Workflow-sensitive actions went through Edge; direct DB was limited to fixtures, timer preconditions, realtime stimulus, metrics, and cleanup.
- Realtime evidence: authenticated customer subscription received `jobs.kael_progress` update on staging.
- Performance/cost evidence: intake latency `p50=6040ms`, `p95=6394ms`, `p99=9088ms`; cost `total=$0.008603`, `worst_transaction=$0.000482`, `provider_rows=60`, `jobs_with_logs=20`, below `$0.30` cap.
- Cleanup evidence: scoped P15 cleanup returned `0` rows for jobs, events, broadcasts, messages, reviews, api logs, admin queue, interaction logs, worker/customer cancellation records, disputes, evidence snapshots, and profiles; independent post-run query also returned `p15_jobs=0`, `p15_profiles=0`, `p15_queues=0`, `p15_evidence=0`.
- Local/static verification: P15 harness + schema gates passed `66/66`; API `tsc --noEmit` passed; `git diff --check` passed with CRLF warnings only; exact Supabase token sweep found no repo matches.
- Supabase verification: `db lint --linked --fail-on error` returned `No schema errors found` after one transient login-role retry; performance advisor returned `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.

**Estimated Effort:** 3-5 ngày.

---

### 23.21 Phase P16 — Pre-Launch Verification

**Goal:** Final audit before production deploy.

**Dependencies:** P15.

**Scope:**

- Charter audit (LOCKED files unchanged).
- Permission audit (no scope creep).
- Memory privacy audit (no PII leak).
- Performance benchmark.
- Cost ceiling validation.
- Security audit (per RULES.md + critical.md §15).
- Compliance check against STRUCTURES §10F + §11.
- Documentation completeness.

**WBS:** Run `kael-security-sweep` + `kael-review` toàn bộ change set + manual audit.

**Acceptance Gate:**

- [x] kael-security-sweep pass.
- [x] kael-review pass.
- [x] No autonomous money-impacting action.
- [x] All PII filters working.
- [x] Charter LOCKED files unchanged.
- [x] Permission scope honored.
- [x] No STRUCTURES §10F violation.

**P16 Evidence (2026-05-26, staging `xyylanuyflrjzbjzhqfl`):**

- Report: `docs/test-logs/2026-05-26_p16-prelaunch-verification.md`, status `passed`.
- Charter/locked-doc audit: `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, `CLAUDE.md`, `README.md`, and locked charter files had no P16 changes.
- Security sweep: exact Supabase access-token/JWT sweeps found no repo matches; key-name sweep found only `.env.example` names and fake `eyJ...` test-comment placeholders; no secret values were written to repo artifacts.
- PII audit: sanitizer and memory tests cover phone, email, CCCD, bank, unit/floor/address filtering; no console statement was found logging full phone, CCCD, bank, raw message, token, secret, or authorization values.
- STRUCTURES section 10F/11 audit: historical `20260521120000_geo_matching_and_worker_auto_suspend.sql` is superseded by active runtime; staging `request_worker_cancellation_atomic` contains no `is_suspended = true` and no `verification_status = 'suspended'`, while `admin_review_required` is present. P13 suspension remains explicit admin decision only.
- Permission/runtime audit: mobile workflow writes remain behind Edge `mobile-api`; AI provider calls and secrets remain server-side; learning forbidden effects still reject auto-charge, auto-confirm booking, auto-cancel job, auto-approve worker, auto-suspend worker, auto-change final price, auto-expand scope, and hidden learning changes.
- Performance/cost reused from live P15 matrix: p95 intake `6394ms` under `12000ms`; worst transaction `$0.000482` under `$0.30`.
- Verification gates: full API Vitest passed `54 files | 3 skipped`, `1111 passed | 59 skipped`; full shared Vitest passed `13 files`, `521 passed`; API/shared/mobile `tsc --noEmit` passed; `node --check apps/api/scripts/kael-p15-staging-e2e.mjs` passed; `git diff --check` passed with CRLF warnings only.
- Supabase verification: `db push --dry-run --linked` says remote database is up to date; `db lint --linked --fail-on error` returned `No schema errors found`; performance advisor returned `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.

**Estimated Effort:** 2-3 ngày.

---

### 23.22 Phase P17 — Staging Deploy + Monitoring + A/B Test Setup

**Goal:** Deploy staging, setup monitoring, kick off A/B test #6 (D28).

**Dependencies:** P16.

**Scope:**

- Staging deploy.
- Monitoring dashboards.
- A/B test framework Perplexity vs Anthropic cho purpose #6.
- 100-case collection plan.
- 4 metrics: schema rate, deviation Anthropic, deviation actual, fallback rate.
- Threshold decision.
- Production deploy plan (Tu approve manual).

**A/B test 4 metrics:**

| Metric | Cách đo | Threshold giữ |
|---|---|---|
| Schema validation rate | Perplexity output qua Zod lần đầu / tổng | ≥ 95% |
| Price range deviation vs Anthropic | abs(perp_max - anth_max) / anth_max | ≤ 25% |
| Price range deviation vs actual paid | abs(perp - final_price) / final_price | ≤ 30% |
| Fallback rate | Anthropic cứu / tổng | ≤ 10% |

Nếu 2+ metric fail → loại Perplexity #6, Anthropic làm main.

**Acceptance Gate:**

- [x] Staging deploy successful.
- [x] Monitoring dashboards live.
- [x] A/B test #6 running.
- [x] 100-case collection in progress.
- [x] Production deploy plan ready.

**P17 Evidence (2026-05-26, staging `xyylanuyflrjzbjzhqfl`):**

- Report: `docs/test-logs/2026-05-26_p17-staging-monitoring-ab.md`, status `passed`.
- Migration `20260526012712_kael_p17_monitoring_ab_setup.sql` created with Supabase CLI, dry-run listed only that migration, and it was pushed to staging. Final dry-run returned `Remote database is up to date`.
- `mobile-api` redeployed to staging `xyylanuyflrjzbjzhqfl`; unauth smoke for `/services` returned expected `401 AUTH_MISSING`, proving the deployed function is reachable and still auth-gated.
- Monitoring dashboards live: `kael_monitoring_provider_daily` and `kael_monitoring_ab_price_synthesis`, both `security_invoker` views. Provider dashboard smoke returned historical provider rows for `intent_classification`, `market_lookup`, and `vision_analysis`.
- A/B #6 running: experiment key `p17-price-synthesis-perplexity-vs-anthropic-2026-05-26`, status `running`, purpose `price_synthesis`, primary `perplexity`, comparison/fallback `anthropic`, sample target `100`, started `true`.
- 100-case collection honesty: dashboard shows `collected_cases=0`, `completed_cases=0`, `threshold_decision=collecting`. No fake A/B case rows were inserted.
- Production deploy plan ready in the P17 report, with Tu approval as the manual gate before touching production `iwevizmsedyqozxlawwl`.
- Verification gates: P17 schema tests plus P15/P16 schema gates passed `3 files`, `147 passed`; API/shared `tsc --noEmit` passed; Supabase `db lint --linked --fail-on error` passed after transient CLI login retry; performance advisor returned `No issues found`; security advisor still reports only existing `auth_leaked_password_protection`.

**Estimated Effort:** 2-3 ngày.

---

### 23.23 Cross-cutting Concerns

#### Skills Mapping Summary

| Skill (per critical.md) | Used in Phases |
|---|---|
| `kael-preflight` (mandatory) | ALL phases |
| `kael-ai-boundary` | P3, P4, P5, P7, P8, P9-P13 |
| `kael-supabase` | P1, P3, P5, P6, P7, P11, P12, P13, P14 |
| `kael-security-sweep` | P1, P4, P5, P6, P7, P12, P13, P16 |
| `kael-tdd` | ALL phases except P0 |
| `kael-architecture-deepening` | P2, P3, P6, P7 |
| `kael-code-enhancement` | P1, P2 |
| `kael-review` | ALL phases (acceptance gate) |
| `kael-diagnose` | P14, P15 (issue resolution) |
| `kael-docs-execution` | P8 (charter docs) |
| `karpathy-guidelines` (project local) | ALL phases |

#### Test Strategy (per critical.md §7 kael-tdd)

- **Layer minimum:** Mỗi phase ≥ 2 layers.
- **Negative tests:** Mandatory cho security changes (P5, P6, P7, P13, P16).
- **Test count:** KHÔNG là metric (per `feedback_mock_vs_real_tests`).
- **Real DB integration:** Per memory `feedback_integration_caught_bug`.
- **Honest reporting:** Per memory `feedback_honest_reporting`.
- **Save results:** Per memory `feedback_save_test_results` — log to README.md.

#### Documentation Updates (per phase)

- `docs/agent-lessons.md` — durable lessons learned.
- `docs/architecture/code-ownership-map.md` — new owners.
- `MEMORY.md` (per locked rules) — session continuation facts.
- README progress log (end of session per `kael-handoff`).

#### Risk Management

| Risk | Mitigation |
|---|---|
| Regression in kael.ts split | P2 zero-regression test policy |
| Anti-fraud false positive | Tune anomaly post-launch via L4 data |
| Permission scope too tight | Audit log + adjust per real customer queries |
| Memory privacy leak | P6 sanitizer + cascade delete + P16 audit |
| Cost ceiling exceed | P3 cost cap + circuit breaker; P15 real-world |
| Latency exceed 9s | P3 timeout + fallback; P15 benchmark |
| Learning rule promotes wrong | P7 evidence gate + auto-rollback + admin override |
| Dispute neutral rule broken | P13 strict tests + P16 audit |
| DeepSeek 402 recurring | P3 circuit breaker 60' + admin alert |

#### Approval Gates Summary

```
P0 → P1: Pre-plan output verified
P1 → P2: Foundation prep tests pass + drift verified
P2 → P3: Zero regression
P3 → P4-P8: Routing + orchestrator + streaming working
P4-P8 → P9: All Harness sub-systems pass blocking gates; scenario metrics ≥ 95%
P9 → P10-P13: Case 1 baseline working
P10-P13 → P14: All 5 cases pass blocking gates; scenario metrics ≥ 95%
P14 → P15: Gaps closed
P15 → P16: E2E pass staging
P16 → P17: Security + audit pass
P17 → Production: Tu approve (manual gate)
```

---

### 23.24 Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-05-25 | Tu + Claude (discussion 2026-05-25) | Initial draft based on Harness 7/7 + Agentic 5/5 discussion |
| 1.0 | 2026-05-25 | Tu approved | Approve toàn bộ, write vào Plan.md §23 |
| 2.0 | 2026-05-26 | Tu + Claude + Codex | Reconciled PR #37-#40 audit via Plan.md §26; production rollout, provider reruns, A/B #6 decision, and DB performance cleanup recorded without editing phase bodies |

---

### 23.25 Notes for Future Agents

**Khi resume work ở phase nào đó:**

1. Read this section §23 đầy đủ.
2. Check Change Log để biết version mới nhất.
3. Verify decisions D1-D32 vẫn align với code hiện tại (drift check).
4. Run preflight per `critical.md` §5.
5. Apply phase's selected protocols.
6. Honest report per memory feedback.

**Conflict resolution:**

- Nếu §23 có vẻ conflict với `Plan.md §1-§22` (workflow enhancement đợt 2026-05-20), treat as scope overlap first: §1-§22 spec workflow Kael chat + auto cancel; §23 spec Harness + Agentic governance layer. Có thể parallel hoặc sequence — Tu quyết.
- Plan này conflict với `RULES.md` hoặc `critical.md`: STOP, ask Tu.
- Plan này conflict với code đã merge: re-read code, code wins, update plan addendum.

**Plan immutable:**

- §23.0-§23.24 (decisions + phases + cross-cutting) KHÔNG được edit mid-execution.
- Nếu cần đổi → tạo §23 v2.0 + change log entry.
- Tu approve trước khi áp dụng.

---

## 24. Cost Optimization Plan — Anthropic Usage Reduction — 2026-05-25

### 24.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-cost-optimization-anthropic
Created:        2026-05-25
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         v2.0 F26 reconciled 2026-05-26 → PR #37-#40 audit gaps closed in §26
Critical Alert: MEDIUM — touches AI provider routing layer, quality measurable
Decision log:   Conversation 2026-05-25 sau khi chốt §23
Scope:          Implement 5 cost optimizations cho Anthropic usage, quality preserve 100%
                (Nhóm A safe subset): T1.1 prompt caching, T1.2 cap output,
                T2.1 market lookup cache, T3.1 batch learning, T5.2 Anthropic Batch API
Out of scope:   Nhóm B (Haiku 4.5, skip Anthropic fallback, etc.) — defer
                Nhóm C (memory compression, similar analysis cache, multi-purpose prompt) — defer
                Switching DeepSeek Flash → Normal (Tu chốt KHÔNG switch)
Effort total:   ~10-15 ngày agent build (sequential)
Phase count:    6 phases (Q0 pre-plan + Q1-Q5 execution)
Expected saving: ~65-75% Anthropic cost (estimated $40-80/tháng @ 1000 jobs → $10-20/tháng)
```

**Mục tiêu chính:**

1. **Giảm Anthropic token cost ~65-75%** mà KHÔNG ảnh hưởng quality user-facing.
2. **Preserve Kael behavior** — user thấy identical, backend operation transparent.
3. **Setup baseline measurement** để verify quality trước/sau optimization.
4. **Foundation cho scale 10K+ jobs/tháng** — không bị bottleneck cost khi tăng volume.

**Authority refs (theo critical.md §0):**

```
1. RULES.md          (security/PII/AI/scope non-negotiable)
2. critical.md       (execution protocols, §12 kael-ai-boundary)
3. STRUCTURES.md     (§9 AI Provider Roles)
4. Plan.md §23       (Kael Harness + Agentic — base layer §24 enhance lên)
5. AGENTS.md         (workspace operating rules)
6. THIS PLAN §24
7. CLAUDE.md         (project identity)
8. docs/**           (durable contracts)
9. MEMORY.md         (last)
```

---

### 24.1 Decisions Locked (discussion 2026-05-25)

| # | Decision | Source |
|---|---|---|
| C1 | Optimize Anthropic, KHÔNG động DeepSeek (Flash giữ nguyên) | Tu chốt |
| C2 | Quality preserve **100%** cho 5 options Nhóm A (zero impact) | Discussion |
| C3 | Nhóm B (5-10% quality risk edge cases) defer cho đến khi Nhóm A stable 2-4 tuần production | Discussion |
| C4 | Nhóm C (complex restructuring) defer cho đến scale > 5K jobs/tháng | Discussion |
| C5 | Implement order: T1.1 caching → T1.2 cap → T2.1 cache market → T3.1 batch learning → T5.2 Batch API | ROI-based |
| C6 | Baseline measurement bắt buộc trước changes — verify quality drop = 0% | C2 enforce |
| C7 | Rollback strategy per option: env flag để disable từng optimization độc lập | Safety |
| C8 | §24 là enhancement layer trên §23, KHÔNG thay thế. Codex hoàn thành §23 trước, rồi §24 | Sequencing |
| C9 | A/B comparison framework cần build trước Q2 (baseline + after) | Quality verify |
| C10 | Plan §24 immutable mid-execution như §23 | Plan integrity |

---

### 24.2 Quality Preservation Principle (Nhóm A/B/C)

Per discussion, options chia 3 nhóm theo quality risk:

#### Nhóm A — Zero quality impact (scope §24)

| Option | Saving | Tại sao zero impact |
|---|---|---|
| **T1.1 Prompt Caching** | 90% input cost cho cached portion | Cached prompt = identical model output. Anthropic chỉ giảm giá phần cached. |
| **T1.2 Cap Output Tokens** | 50-80% output cost | Cap calibrated đúng per purpose → cut nothing relevant. Cap quá chặt → drop quality. **Cần calibrate.** |
| **T2.1 DB Cache Market Lookup** | 50-70% Perplexity calls | Response identical từ DB hay Perplexity. Risk: stale data. Mitigation: 24h TTL + manual invalidate. |
| **T3.1 Batch Learning Hourly** | 95% learning call count | Learning logic identical, delay 1h. User-facing quality KHÔNG ảnh hưởng. |
| **T5.2 Anthropic Batch API** | 50% background cost | Cùng model, output. Delay 24h cho background only. User không thấy. |

#### Nhóm B — Small quality risk (defer §24, possibly future phase)

| Option | Risk |
|---|---|
| T1.4 Haiku 4.5 vision | Vision quality drop 10-15% trên ảnh phức tạp |
| T1.5 Haiku 4.5 fallback | Edge case detection drop |
| T4.4 Skip Perplexity khi baseline confident | Miss market drift ~5% |
| T4.6 Skip Anthropic fallback khi DeepSeek conf > 0.9 | DeepSeek overconfidence wrong ~5-10% |

#### Nhóm C — High quality risk (defer hoàn toàn)

| Option | Risk |
|---|---|
| T1.7 Memory compression | Hallucination |
| T2.4 Similar Kael analysis cache | Lose personalization |
| T5.1 Multi-purpose prompt batching | Loss modularity |
| T6.3 Customer tier routing | Complexity |

---

### 24.3 Phase Ordering

```
Q0  Pre-Plan Context Loading (MANDATORY)
├── Read order: critical.md → RULES.md → STRUCTURES.md → Plan.md §23 → Plan.md §24 → MEMORY.md
├── Verify §23 implementation status — Q1 chỉ start sau khi §23 P3 (Provider Routing) done

Q1  Baseline Measurement + Telemetry Setup
├── Dep: §23 P3 done

Q2  Quick Wins (T1.1 Prompt Caching + T1.2 Cap Output)
├── Dep: Q1

Q3  DB Caching Layer (T2.1 Market Lookup Cache)
├── Dep: Q2

Q4  Background Optimization (T3.1 Batch Learning + T5.2 Anthropic Batch API)
├── Dep: Q3

Q5  Validate + Compare + Production Rollout
├── Dep: Q4
```

**Critical path:** Q0 → Q1 → Q2 → Q3 → Q4 → Q5 (sequential).

**Estimated total effort:** 10-15 ngày.

---

### 24.4 Phase Q0 — Pre-Plan Context Loading ⚠️ MANDATORY

**Goal:** AI agent có ngữ cảnh đầy đủ trước khi đụng code, verify §23 status.

**Dependencies:** None.

**Scope:** Đọc authority files + verify §23 P3 (Provider Routing) đã build xong.

**Out of scope:** KHÔNG sửa file.

**WBS:**

- T0.1 Read `critical.md` § toàn bộ.
- T0.2 Read `RULES.md` § toàn bộ.
- T0.3 Read `STRUCTURES.md` §9 (AI Provider Roles).
- T0.4 Read `Plan.md §23` — verify P3 status.
- T0.5 Read `Plan.md §24` (this plan).
- T0.6 Read `MEMORY.md` last.
- T0.7 Verify §23 P3 done: routing.config.ts exists, orchestrator.ts exists, 11 purposes routed.
- T0.8 Verify api_logs.purpose populated 100% (Q1 baseline cần data này).
- T0.9 State preflight format per `critical.md` §5.

**Build Instructions:** N/A.

**Affected Areas:** None.

**Skills/Protocols:** `kael-preflight`, `kael-clarify-with-docs`.

**Tests:** N/A.

**Verification Loop:** Output preflight phải verify §23 P3 done + telemetry working.

**Foundation Enhancement:** N/A.

**Acceptance Gate:**

- [ ] §23 P3 verified done.
- [ ] api_logs.purpose populated 100% (D30 verify).
- [ ] Preflight stated.

**Estimated Effort:** 30-60 phút.

**Handoff Notes:** Nếu §23 P3 chưa done → STOP, ưu tiên §23 trước.

---

### 24.5 Phase Q1 — Baseline Measurement + Telemetry Setup

**Goal:** Measure current Anthropic cost + quality baseline trước khi optimize.

**Dependencies:** Q0, §23 P3 done.

**Scope:**

- Cost dashboard: per-day Anthropic + Perplexity + DeepSeek spending breakdown.
- Quality baseline: 50 jobs collect → measure schema validation, satisfaction, advisory accuracy.
- Comparison framework: before/after metric collection.
- A/B flag infrastructure (env flag per option).

**Out of scope:** KHÔNG implement optimization options.

**WBS:**

- T1.1 Cost dashboard query/view trên `api_logs`:
  - Per-day: total cost per provider, calls count, avg latency, fail rate.
  - Per-purpose: same metrics.
  - SQL view `kael_cost_daily_summary` (new migration).
- T1.2 Quality baseline measure (50 jobs from staging):
  - Schema validation rate per purpose.
  - Vietnamese tone score (heuristic).
  - Customer satisfaction proxy (review rating average).
  - Advisory accuracy (LS2 CaseReview data).
  - Persist to `kael_quality_baseline` table (new).
- T1.3 A/B flag infrastructure:
  - Env flags: `KAEL_OPT_PROMPT_CACHE_ENABLED`, `KAEL_OPT_CAP_OUTPUT_ENABLED`, `KAEL_OPT_MARKET_CACHE_ENABLED`, `KAEL_OPT_BATCH_LEARNING_ENABLED`, `KAEL_OPT_BATCH_API_ENABLED`.
  - Default all false (rollback-safe).
  - Per-option toggle independent.
- T1.4 Comparison metric collection helper:
  - `kael_optimization_metrics` table track per-call: option_active flags, cost_before_estimate, cost_actual, quality_pass_fail.
- T1.5 Cost projection calculator.

**Build Instructions:**

- Cost dashboard: SQL view + admin endpoint.
- Baseline measurement: SQL script chạy 50 sample jobs từ staging.
- A/B flags: env-based, NOT DB-based (faster rollback).
- Metric collection: append-only.

**Affected Areas:**

- `supabase/migrations/*` (3 new tables/views).
- `supabase/functions/mobile-api/_shared/kael/cost-tracking.ts` (NEW).
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (UPDATE: hook metric collection).
- `apps/api/src/admin/cost-dashboard.ts` (NEW endpoint, defer if no admin UI).

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-ai-boundary`, `kael-tdd`.

**Tests (95% threshold):**

- T1-Q1-test-1: Cost dashboard SQL view correct aggregates.
- T1-Q1-test-2: Baseline 50 jobs success.
- T1-Q1-test-3: A/B flag toggle independent per option.
- T1-Q1-test-4: Metric collection: 1 Kael call → 1 metric row.
- T1-Q1-test-5: Cost projection calculator math correct.
- Target: 5/5 = 100%.

**Verification Loop:** Baseline numbers vô lý → re-verify telemetry. Fix metric collection nếu thiếu data.

**Foundation Enhancement:**

- Verify api_logs schema complete (per D30 — purpose field populated).
- Document baseline numbers trong `docs/cost-baseline-2026-05.md`.

**Acceptance Gate:**

- [ ] Cost dashboard working.
- [ ] Baseline 50 jobs measured + persisted.
- [ ] A/B flags ready (default false).
- [ ] Metric collection working.
- [ ] Tests 5/5 pass.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** Baseline data là input cho Q5 validation. KHÔNG skip Q1.

---

### 24.6 Phase Q2 — Quick Wins (T1.1 Prompt Caching + T1.2 Cap Output Tokens)

**Goal:** Implement 2 quick wins lowest risk, biggest immediate saving.

**Dependencies:** Q1.

**Scope:**

- T1.1: Anthropic prompt caching cho static portion (charter + permission + memory static).
- T1.2: Cap output tokens per purpose (config-driven).

**Out of scope:** KHÔNG động Perplexity/DeepSeek. KHÔNG đụng learning/batch.

#### T1.1 Prompt Caching detail

**Anthropic API feature:** `cache_control: { type: "ephemeral" }` cho prompt blocks. Cached read = $0.30/M input ($3/M base, 10x cheaper).

**Cache strategy:**

```ts
messages: [
  {
    role: "system",
    content: [
      {
        type: "text",
        text: charter.identity + charter.persona + charter.missionValues,
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: permission.summary(actor, purpose),
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: memory.staticContext(jobId),
        cache_control: { type: "ephemeral" }
      },
      {
        type: "text",
        text: purpose.specificGuidance(purpose) + context.dynamic(),
      }
    ]
  },
  { role: "user", content: userInput }
]
```

**Cached portion estimate:**
- Charter: ~1500 tokens (static, locked).
- Permission summary: ~500 tokens.
- Memory static: ~500 tokens.
- Total cached: ~2500 tokens of ~4500 total (~55%).

**Cost per Anthropic call:**
- Before: 4500 × $3/M = $0.0135 input.
- After (cached hit): 2500 × $0.30/M + 2000 × $3/M = $0.00675 (~50% reduce).
- Cache miss (first call): 4500 × $3.75/M = $0.017 (~25% more first call).

**Cache hit rate estimate:** 70-80%.

**Net saving per call:** ~50% input cost average.

**WBS T1.1:**

- T1.1.1 Identify cacheable blocks.
- T1.1.2 Refactor `kael/system-prompt.ts` (P8) to emit cacheable structured prompt blocks.
- T1.1.3 Update `kael/provider-client.ts` to accept structured prompt với cache_control.
- T1.1.4 Add cache hit/miss tracking trong `api_logs.safe_metadata.cache_status`.
- T1.1.5 Verify cache TTL behavior (Anthropic 5-min ephemeral).
- T1.1.6 Toggle via env flag `KAEL_OPT_PROMPT_CACHE_ENABLED`.

#### T1.2 Cap Output Tokens detail

**Current:** Default 1024 tokens.

**Calibrated caps per purpose:**

| Purpose | Output cap | Rationale |
|---|---|---|
| intent_classification | 50 | JSON ngắn |
| vision_analysis | 400 | Structured findings + severity |
| clarification | 100 | 0-2 câu hỏi ngắn |
| problem_synthesis | 250 | problem_summary + complexity + reasoning |
| price_synthesis | 200 | min, max, confidence + brief reasoning |
| advisory_generation | 150 | Max 1 advisory ≤ 150 char |
| worker_brief | 600 | Core fields + reasoning |
| scope_change | 500 | Worker challenge + customer card |
| post_job_learning | 800 | Background analysis |
| educational_response | 500 | Educational content |

**Total token saving:** ~60% average (default 1024 → calibrated avg ~350).

**WBS T1.2:**

- T1.2.1 Add `max_tokens` config trong `routing.config.ts` per purpose.
- T1.2.2 Update `provider-client.ts` to pass `max_tokens` from config.
- T1.2.3 Track output token actual usage trong `api_logs.output_tokens`.
- T1.2.4 Monitor schema validation rate per purpose — nếu fail rate > 5%, increase cap.
- T1.2.5 Toggle via env flag `KAEL_OPT_CAP_OUTPUT_ENABLED`.

**Build Instructions:**

- Refactor system-prompt.ts emit structured blocks (T1.1.2).
- Wrap provider-client.ts to accept either structured (cache) or single string (legacy).
- All changes flag-gated.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/system-prompt.ts` (REFACTOR)
- `supabase/functions/mobile-api/_shared/kael/provider-client.ts` (UPDATE)
- `supabase/functions/mobile-api/_shared/kael/routing.config.ts` (ADD per-purpose max_tokens)
- `supabase/functions/mobile-api/_shared/kael/orchestrator.ts` (PASS through max_tokens)

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`, `karpathy-guidelines`.

**Tests (95% threshold):**

- T2-test-1: Prompt caching: cache miss → cache hit (check api_logs).
- T2-test-2: Cached call cost < uncached.
- T2-test-3: max_tokens config respected.
- T2-test-4: Schema validation rate post-cap ≥ baseline.
- T2-test-5: Env flag toggle revert.
- T2-test-6: Integration end-to-end pass.
- T2-test-7: Cost saving measurable trên 10 sample jobs.
- Target: ≥ 6.5/7 (93%).

**Verification Loop:**

- Schema fail rate tăng → increase max_tokens.
- Cache hit rate < 50% → investigate.
- Quality drop → rollback option.

**Foundation Enhancement:**

- Document caching strategy trong `docs/ai-cost-optimization.md`.
- Plan caching cho Anthropic Haiku khi sang Q phase tương lai.

**Acceptance Gate:**

- [ ] Prompt caching working (cache hit rate ≥ 60%).
- [ ] Output token cap calibrated.
- [ ] No quality drop (schema validation ≥ baseline).
- [ ] Cost saving ≥ 40% Anthropic input cost.
- [ ] Env flags toggle.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 3-4 ngày.

**Handoff Notes:** Caching ROI biggest. T1.2 cap cần tune sau initial deploy.

---

### 24.7 Phase Q3 — DB Caching Layer (T2.1 Market Lookup Cache)

**Goal:** Cache Perplexity market lookup per (district + service + problem) với 24h TTL → giảm 50-70% Perplexity calls.

**Dependencies:** Q2.

**Scope:**

- NEW table `kael_market_cache` với composite key.
- Cache read/write logic trong `kael/market.ts`.
- Manual invalidate endpoint cho admin.
- 24h TTL automatic expire.

**Schema:**

```sql
CREATE TABLE kael_market_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_code text NOT NULL,
  service_type service_type NOT NULL,
  problem_slug text NOT NULL,
  complexity complexity_level,
  market_range_min int NOT NULL,
  market_range_max int NOT NULL,
  confidence numeric NOT NULL,
  sources_summary text,
  perplexity_raw jsonb,
  hit_count int DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  invalidated_at timestamptz,
  UNIQUE (district_code, service_type, problem_slug, complexity)
);

CREATE INDEX kael_market_cache_lookup_idx
  ON kael_market_cache (district_code, service_type, problem_slug, complexity)
  WHERE invalidated_at IS NULL AND expires_at > now();
```

**Cache logic:**

```
Market lookup call:
  1. Check cache by (district_code, service_type, problem_slug, complexity) + active TTL.
  2. If hit: increment hit_count, return cached. Tag api_logs.safe_metadata.cache_status = 'hit'.
  3. If miss: call Perplexity, cache result (TTL 24h), return.
```

**WBS:**

- T3.1 Migration: `kael_market_cache` table + index.
- T3.2 Update `kael/market.ts`: cache check + write + hit/miss tracking.
- T3.3 Admin endpoint `POST /admin/market-cache/invalidate`.
- T3.4 Background job: clean expired cache rows (daily).
- T3.5 Toggle via env flag `KAEL_OPT_MARKET_CACHE_ENABLED`.

**Build Instructions:**

- Cache key normalize: district_code lowercase, problem_slug normalize whitespace.
- Cache write: atomic upsert.
- Stale check: cache age > 7 days → log warning.

**Affected Areas:**

- `supabase/migrations/*` (new table)
- `supabase/functions/mobile-api/_shared/kael/market.ts` (UPDATE)
- `supabase/functions/mobile-api/_shared/router.ts` (admin invalidate route)
- `supabase/functions/mobile-api/_shared/services.ts` (admin handler)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-ai-boundary`, `kael-tdd`.

**Tests (95% threshold):**

- T3-test-1: Cache miss → Perplexity call → cache write.
- T3-test-2: Cache hit → no Perplexity call, return identical.
- T3-test-3: Expired cache → cache miss → re-fetch.
- T3-test-4: Invalidated cache → cache miss → re-fetch.
- T3-test-5: Admin invalidate endpoint works.
- T3-test-6: Hit count tracked.
- T3-test-7: Background cleanup expired rows deleted.
- T3-test-8: Env flag disable revert.
- T3-test-9: Cost saving: 10 jobs same district+problem → 1 Perplexity call only.
- Target: ≥ 8.5/9 (94%).

**Verification Loop:**

- Cache hit rate < 30% → check key normalization.
- Stale data complaints → reduce TTL to 12h.

**Foundation Enhancement:**

- Document cache invalidation policy.
- Future: similar pattern cho baseline price lookups.

**Acceptance Gate:**

- [ ] Cache table created.
- [ ] Cache hit/miss logic working.
- [ ] Hit rate ≥ 30% sau 100 jobs.
- [ ] Admin invalidate endpoint works.
- [ ] Cost saving ≥ 30% Perplexity reduction.
- [ ] Env flag toggle.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** TTL 24h conservative. Tăng 48-72h sau monitoring stable.

---

### 24.8 Phase Q4 — Background Optimization (T3.1 Batch Learning + T5.2 Anthropic Batch API)

**Goal:** Batch background tasks để giảm 95% learning calls + 50% background cost via Anthropic Batch API.

**Dependencies:** Q3, §23 P7 (Learning Skill Setup) done.

**Scope:**

- T3.1: Batch learning skills hourly thay vì per-job.
- T5.2: Use Anthropic Batch API (50% off, 24h delay) cho post_job_learning + LS3-LS7 background.

#### T3.1 Batch Learning Hourly detail

**Current (after §23 P7):** Mỗi job trigger LS1+LS2+LS3+LS4+LS5 ngay sau A14.
- 100 jobs/day × 5 skills = 500 learning calls/day.

**Batch approach:**

```
1. Job completes A14 → INSERT row vào kael_learning_queue.
2. Cron job hourly: SELECT batches, group by skill, batch process.
3. Result: 24 batches/day × 5 skills = 120 calls/day (-76% reduction).
```

**Quality:** Learning logic identical. Delay max 1h cho rule promotion — acceptable (rules áp dụng jobs future).

#### T5.2 Anthropic Batch API detail

**Anthropic feature:** Submit batch of prompts, get results within 24h, **50% off**.

**Applicable purposes (background only):**
- post_job_learning (#10)
- LS3-LS7 learning skills

**NOT applicable:** User-facing purposes #1-#9, #11.

**Batch API flow:**

```
1. Background job builds batch request file (JSONL).
2. POST to Anthropic Batch API → batch_id.
3. Poll every hour for status.
4. When complete (within 24h): download results.
5. Process results → write learning candidates.
```

**WBS T3.1:**

- T4.1.1 Migration: `kael_learning_queue` table.
- T4.1.2 Refactor `services.ts` A14 trigger: INSERT to queue instead of immediate.
- T4.1.3 Implement cron job `kael/cron/process-learning-queue.ts` (hourly).
- T4.1.4 Update LS1-LS5 to accept batched input.
- T4.1.5 Toggle via env flag `KAEL_OPT_BATCH_LEARNING_ENABLED`.

**WBS T5.2:**

- T4.2.1 Implement Anthropic Batch API wrapper `kael/provider-batch.ts`.
- T4.2.2 Refactor post_job_learning to use batch endpoint when flag enabled.
- T4.2.3 Implement batch status polling cron (every hour).
- T4.2.4 Result processor: download + parse + write learning candidates.
- T4.2.5 Fallback realtime nếu batch fail > 48h.
- T4.2.6 Toggle via env flag `KAEL_OPT_BATCH_API_ENABLED`.

**Build Instructions:**

- Cron: use Supabase pg_cron extension.
- Batch queue: append-only, soft-delete after processed.
- Batch API: handle 24h timeout gracefully, fallback realtime.
- Quality verify: compare batch vs realtime trên 20 sample (must identical).

**Affected Areas:**

- `supabase/migrations/*` (kael_learning_queue + cron extension)
- `supabase/functions/mobile-api/_shared/kael/cron/process-learning-queue.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/cron/process-batch-results.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/provider-batch.ts` (NEW)
- `supabase/functions/mobile-api/_shared/kael/skills/LS1-LS7.ts` (UPDATE: batched input)
- `supabase/functions/mobile-api/_shared/services.ts` (UPDATE: queue instead immediate)

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-ai-boundary`, `kael-tdd`, `kael-architecture-deepening`.

**Tests (95% threshold):**

- T4-test-1: A14 trigger → row inserted queue (not immediate).
- T4-test-2: Cron job processes queue hourly.
- T4-test-3: Batched LS1-LS5 process multiple evidence in 1 LLM call.
- T4-test-4: Anthropic Batch API: submit → receive within 24h.
- T4-test-5: Batch result identical vs realtime trên 20 sample.
- T4-test-6: Cost saving: batched ≤ 50% realtime.
- T4-test-7: Fallback realtime nếu batch fail > 48h.
- T4-test-8: Env flag toggle revert immediate trigger.
- T4-test-9: Integration end-to-end với batch enabled.
- Target: ≥ 8.5/9 (94%).

**Verification Loop:**

- Batch differ realtime > 5% → investigate prompt drift.
- Cron stuck → check pg_cron status.
- Batch API delay > 24h → check Anthropic quota.

**Foundation Enhancement:**

- Document batch architecture trong `docs/ai-cost-optimization.md`.
- Future: similar batch pattern cho non-critical synthesis.

**Acceptance Gate:**

- [ ] Learning queue + hourly cron working.
- [ ] Batched LS1-LS5 outputs identical vs realtime.
- [ ] Anthropic Batch API integration working.
- [ ] Cost saving ≥ 70% learning + ≥ 40% background Anthropic.
- [ ] Fallback realtime works.
- [ ] Env flags toggle.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 4-5 ngày.

**Handoff Notes:** Background optimization compound saving với T1.1+T1.2+T2.1.

---

### 24.9 Phase Q5 — Validate + Compare + Production Rollout

**Goal:** Verify quality preserve 100% + cost saving measurable + gradual production rollout.

**Dependencies:** Q4.

**Scope:**

- A/B compare quality before/after 50 jobs.
- Cost dashboard reading post-optimization.
- Gradual rollout: 10% → 25% → 50% → 100%.
- Rollback plan per option.

**WBS:**

- T5.1 Run 50 sample jobs với all optimizations enabled (staging).
- T5.2 Compare quality vs baseline (Q1):
  - Schema validation rate per purpose: ≥ baseline.
  - Customer satisfaction proxy: ≥ baseline.
  - Advisory accuracy: ≥ baseline.
  - Latency: ≤ baseline (caching faster).
- T5.3 Compare cost:
  - Total Anthropic per 100 jobs: ≤ 35% baseline.
  - Perplexity calls per 100 jobs: ≤ 50% baseline.
  - Learning calls per day: ≤ 25% baseline.
- T5.4 Quality drop detected → rollback option, identify root cause, re-test.
- T5.5 Production rollout:
  - Day 1: 10% jobs (canary).
  - Day 3: 25% (no quality drop).
  - Day 7: 50%.
  - Day 14: 100%.
- T5.6 Monitoring alerts:
  - Schema validation rate drop > 5%.
  - Customer satisfaction drop > 0.3 stars.
  - Cost spike unexpected.
- T5.7 Document final state trong `docs/cost-optimization-2026-XX-results.md`.

**Build Instructions:**

- A/B comparison: same job inputs run twice (with vs without optimization).
- Rollout via env flag percentage gate.
- Monitoring alerts: cron daily, push admin.

**Affected Areas:**

- Test scripts + comparison framework.
- Monitoring infrastructure.
- Documentation.

**Skills/Protocols:** `kael-preflight`, `kael-diagnose`, `kael-review`, `kael-tdd`.

**Tests (95% threshold):**

- T5-test-1: A/B comparison: quality post ≥ baseline.
- T5-test-2: Cost saving ≥ 65%.
- T5-test-3: Latency improved or unchanged.
- T5-test-4: Rollout 10% canary 10 jobs success.
- T5-test-5: Rollback drill: disable 1 option, behavior reverts.
- T5-test-6: Monitoring alerts trigger.
- T5-test-7: Integration end-to-end all optimizations.
- Target: ≥ 6.5/7 (93%).

**Verification Loop:**

- Quality drop → rollback specific option, investigate root cause.
- Cost saving < expected → audit cache hit, output cap, batch process.

**Foundation Enhancement:**

- Document lessons learned trong `docs/agent-lessons.md`.
- Setup recurring quarterly review.

**Acceptance Gate:**

- [ ] A/B: quality preserve 100% (no drop).
- [ ] Cost saving ≥ 65% measured.
- [ ] Gradual rollout 100% completed.
- [ ] Monitoring alerts working.
- [ ] Rollback drill verified per option.
- [ ] Tests ≥ 95% pass.
- [ ] kael-review pass.

**Estimated Effort:** 3-5 ngày.

**Handoff Notes:** Q5 hoàn tất = §24 done. Cost optimization production-ready.

---

### 24.10 Cross-cutting Concerns

#### Quality preservation guarantee

Per C2: Nhóm A options chọn vì zero quality impact. Verify mỗi option:

| Option | Quality verification method |
|---|---|
| T1.1 Prompt caching | Compare 20 cached vs uncached outputs — byte-identical |
| T1.2 Cap output | Schema validation rate per purpose ≥ baseline |
| T2.1 Market cache | Compare cached vs fresh Perplexity — identical (same key) |
| T3.1 Batch learning | Batched LS1-LS5 outputs ≥ 95% match vs realtime |
| T5.2 Anthropic Batch API | Batched output identical vs realtime (Anthropic guarantee) |

#### Rollback strategy

Per C7: env flag per option:

```
KAEL_OPT_PROMPT_CACHE_ENABLED       # T1.1
KAEL_OPT_CAP_OUTPUT_ENABLED         # T1.2
KAEL_OPT_MARKET_CACHE_ENABLED       # T2.1
KAEL_OPT_BATCH_LEARNING_ENABLED     # T3.1
KAEL_OPT_BATCH_API_ENABLED          # T5.2
```

Default ALL false (rollback-safe). Enable progressively.

#### Cost saving compound projection

Baseline (estimated post-§23): $40-80/tháng @ 1000 jobs.

| Stage | Options enabled | Expected saving | Projected cost |
|---|---|---|---|
| Q2 done | T1.1 + T1.2 | 40-50% | $20-40 |
| Q3 done | + T2.1 | 50-60% | $16-32 |
| Q4 done | + T3.1 + T5.2 | 65-75% | $10-20 |
| Q5 stable | All | 70-80% | $8-16 |

At scale 10K jobs/tháng: $80-160 thay vì $400-800.

#### Skills Mapping Summary

| Skill | Used in Phases |
|---|---|
| `kael-preflight` (mandatory) | ALL phases |
| `kael-ai-boundary` | Q1, Q2, Q3, Q4 |
| `kael-supabase` | Q1, Q3, Q4 |
| `kael-tdd` | ALL phases except Q0 |
| `kael-architecture-deepening` | Q4 (batch architecture) |
| `kael-review` | ALL phases (acceptance gate) |
| `kael-diagnose` | Q5 (issue resolution) |
| `karpathy-guidelines` | ALL phases |

#### Approval Gates Summary

```
Q0 → Q1: §23 P3 verified done + pre-plan output
Q1 → Q2: Baseline measured + telemetry working
Q2 → Q3: Caching + cap quality preserve verified
Q3 → Q4: Market cache hit rate ≥ 30%
Q4 → Q5: All optimizations working + flags toggle verified
Q5 → Production: A/B verify quality preserve + cost saving ≥ 65% + Tu approve manual gate
```

---

### 24.11 Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-05-25 | Tu + Claude discussion | Initial draft based on Nhóm A 5 options |
| 1.0 | 2026-05-25 | Tu approved | Approve toàn bộ, write vào Plan.md §24 |
| 2.0 | 2026-05-26 | Tu + Claude + Codex | Reconciled PR #37-#40 audit via Plan.md §26; Q1-Q5 production rollout and quality/cost reruns recorded without editing phase bodies |

---

### 24.12 Notes for Future Agents

**Khi resume work §24:**

1. Read §24 đầy đủ.
2. Verify §23 implementation status — §24 dependency.
3. Check Change Log.
4. Verify decisions C1-C10 vẫn align.
5. Run preflight per `critical.md` §5.

**Conflict resolution:**

- §24 conflict với §23: §23 wins (base layer).
- §24 conflict với `RULES.md` hoặc `critical.md`: STOP, ask Tu.
- §24 conflict với code đã merge: re-read code, code wins, update plan addendum.

**Plan immutable:**

- §24.0-§24.11 KHÔNG được edit mid-execution per C10.
- Nếu cần đổi → §24 v2.0 + Tu approve.

**Quality monitoring post-deploy:**

- Weekly: review schema validation rate trends.
- Monthly: review cost dashboard, customer satisfaction.
- Quarterly: consider Nhóm B (Haiku 4.5, skip rules) nếu scale > 5K jobs/tháng.

---

## 25. Source Trust + Multi-LLM Orchestration + Passive Learning — 2026-05-25

### 25.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-source-trust-multi-llm
Created:        2026-05-25 (drafted), 2026-05-26 (written to Plan.md)
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         v2.0 F26 reconciled 2026-05-26 → PR #37-#40 audit gaps closed in §26
Critical Alert: MEDIUM-HIGH — touches AI price accuracy + customer trust
Decision log:   Conversation 2026-05-25 sau khi chốt §24; Perplexity API doc verified 2026-05-25
Scope:          Source trust enforcement (3-layer validation) + Multi-LLM blended synthesis
                + Passive learning loop (Kael học từ Perplexity searches)
                Phương án A: Baseline DB primary 70% + Perplexity supplementary 30%
Out of scope:   Phương án B (Perplexity primary) — defer
                Phương án C (loại Perplexity) — fallback only nếu A fail
                Multi-city, service expansion
Effort total:   ~12-18 ngày agent build (sequential)
Phase count:    9 phases (R0 pre-plan + R1-R8 execution)
Expected outcome: Customer thấy citations rõ ràng + Kael học từ market data over time
                  + admin xem được source trust evolution
```

**Mục tiêu chính:**

1. **Source uy tín đảm bảo** — Perplexity strict allowlist 20 Tier 1 Vietnamese domains.
2. **Citation transparency** — Estimate Card v3 + admin audit thấy nguồn cụ thể per price.
3. **Code-side validation** — không trust Perplexity blind, verify citations match whitelist.
4. **Passive learning** — Kael học baseline price từ Perplexity searches over time qua LS1 MarketMemory.
5. **Anti-poisoning** — outlier detection + source weighting + quarterly admin review.

**Authority refs:**

```
1. RULES.md          (§2 AI wrapper, §3 validate output, §4 disclaimer, §8 no fake data)
2. critical.md       (§12 kael-ai-boundary)
3. STRUCTURES.md     (§9 Perplexity = market lookup, §10 evidence gate)
4. Plan.md §23       (Harness P3 routing, P6 memory, P7 learning — base)
5. Plan.md §24       (Cost optimization Q3 market cache — share infra)
6. AGENTS.md
7. THIS PLAN §25
8. Perplexity API doc (verified 2026-05-25)
```

---

### 25.1 Decisions Locked

| # | Decision | Source |
|---|---|---|
| S1 | Phương án A: Baseline 70% + Perplexity 30% blend (NOT B, NOT C) | Tu chốt |
| S2 | Tier 1 trusted domains: max 20 (Perplexity API limit) | API doc |
| S3 | `search_domain_filter` allowlist mode (strict include only, KHÔNG denylist) | API doc verify |
| S4 | Code-side citation validation MANDATORY (Layer 2) | Trust enforcement |
| S5 | Passive learning via extend LS1 MarketMemory (outlier + source weighting) | Build on PR #12 |
| S6 | NEW `source_trust_registry` table — admin tunable, quarterly review | Maintenance |
| S7 | Extend `kael_market_artifacts.safe_metadata` schema với `citations[]` strict | Audit trail |
| S8 | Source trust score decay (recent sources weight more, > 90 days weight 0.5) | Freshness |
| S9 | Cold start fallback: admin baseline seed nếu không có Perplexity data | Survival |
| S10 | Admin dashboard cho trust evolution — defer Phase R7 (optional) | Scope |
| S11 | Validation MUST log per-call (admin audit) | Transparency |
| S12 | §25 immutable mid-execution | Plan integrity |

---

### 25.2 Architecture — 3-Layer Validation

```
┌──────────────────────────────────────────────────────────────┐
│ LAYER 1: Perplexity native filter                            │
│ ─ search_domain_filter = [tier_1_domains] (max 20)           │
│ ─ search_recency_filter = "month"                             │
│ ─ system_prompt = strict instruction                          │
│ ─ STRICT include-only (verified API doc)                      │
└────────────────────────┬─────────────────────────────────────┘
                         │ Perplexity response với citations[]
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 2: Code-side citation validator                         │
│ ─ Parse citations[] from response                             │
│ ─ Verify each URL match Tier 1 whitelist (defense in depth)  │
│ ─ Reject citation nếu domain outside whitelist                │
│ ─ Compute trust_score per citation                            │
│ ─ Log validation result vào api_logs                          │
└────────────────────────┬─────────────────────────────────────┘
                         │ Validated citations với trust_score
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 3: Source-weighted blend (price synthesis)              │
│ ─ Baseline DB: 70% weight (admin curated)                     │
│ ─ Perplexity: 30% weight (live market signal)                 │
│ ─ Each Perplexity citation weighted by trust_score            │
│ ─ Outlier detection (median ± 2σ)                             │
│ ─ Final price = weighted blend                                │
└────────────────────────┬─────────────────────────────────────┘
                         │ Final estimate + citations array
                         ▼
   Estimate Card v3 (citations[] visible to admin)
   + kael_market_artifacts persist (passive learning input)
                         │
                         ▼
   LS1 MarketMemory (hourly batch §24 Q4):
   Aggregate artifacts → outlier reject → weighted median
   → If evidence ≥ 5 + drift conf ≥ 0.6 → update baseline price_prior
```

---

### 25.3 Phase Ordering

```
R0  Pre-Plan Context Loading (MANDATORY)
├── Verify §23 P3+P6+P7 + §24 Q3 done

R1  Source Research Spike (verify Tier 1 domains accessibility)
├── Dep: R0

R2  Perplexity Configuration (allowlist + system prompt + recency)
├── Dep: R1

R3  Citation Persistence Schema (extend kael_market_artifacts)
├── Dep: R2

R4  Code-Side Citation Validator (Layer 2)
├── Dep: R3

R5  Source Trust Registry (per-domain trust_score, admin tunable)
├── Dep: R4

R6  LS1 MarketMemory Extend (outlier + weighted aggregation)
├── Dep: R5

R7  Admin Source Trust Dashboard (optional, can defer)
├── Dep: R6

R8  A/B Test + Production Rollout
├── Dep: R6 (R7 optional)
```

**Critical path:** R0 → R1 → R2 → R3 → R4 → R5 → R6 → R8. R7 optional parallel.

**Estimated total effort:** 12-18 ngày.

---

### 25.4 Phase R0 — Pre-Plan Context Loading ⚠️ MANDATORY

**Goal:** Verify §23 P3 + P6 + P7 + §24 Q3 done; load authority context.

**Dependencies:** None.

**Scope:** Read files; verify dependencies; state preflight.

**WBS:**

- T0.1 Read `critical.md` § toàn bộ.
- T0.2 Read `RULES.md` §2, §3, §4, §8 (AI wrapper, validate, disclaimer, no fake).
- T0.3 Read `STRUCTURES.md` §9 (Perplexity role), §10 (evidence gate).
- T0.4 Read `Plan.md §23` — verify P3 routing, P6 memory, P7 LS1 status.
- T0.5 Read `Plan.md §24` — verify Q3 market cache status.
- T0.6 Read `Plan.md §25` (this plan).
- T0.7 Read `MEMORY.md` last.
- T0.8 Verify §23 P3 done: routing.config.ts có purpose #5 market_lookup.
- T0.9 Verify §23 P6 done: kael_market_artifacts table exists, RLS clean.
- T0.10 Verify §23 P7 done: LS1 MarketMemory implemented (PR #12 extend).
- T0.11 Verify §24 Q3 done: kael_market_cache table exists.
- T0.12 State preflight per `critical.md` §5.

**Build Instructions:** N/A.

**Affected Areas:** None.

**Skills/Protocols:** `kael-preflight`, `kael-clarify-with-docs`.

**Tests:** N/A.

**Verification Loop:** Output preflight verify 4 dependencies.

**Foundation Enhancement:** N/A.

**Acceptance Gate:**

- [ ] §23 P3/P6/P7 verified done.
- [ ] §24 Q3 verified done.
- [ ] Preflight stated.

**Estimated Effort:** 30-60 phút.

**Handoff Notes:** Nếu dependencies chưa done → STOP, ưu tiên §23/§24 trước.

---

### 25.5 Phase R1 — Source Research Spike

**Goal:** Verify Tier 1 trusted Vietnamese domains accessibility via Perplexity test calls; document untrust list.

**Dependencies:** R0.

**Scope:**

- Test API call Perplexity với candidate Tier 1 domains.
- Verify accessibility, data quality, citation format.
- Document untrust sources to avoid.
- Output: `docs/foundation/source-trust-research.md`.

**Candidate Tier 1 domains (verify trong R1):**

| Domain | Loại | Trust hypothesis |
|---|---|---|
| btaskee.com | Competitor public price | High |
| jupviec.vn | Competitor | High |
| rada.com.vn | Competitor | High |
| anvui.com | Marketplace | Medium-high |
| 247shome.com | Competitor (verify exist) | Medium |
| service.vn | Yellow pages | Medium |
| tuoitre.vn | News | Medium (news bias) |
| vnexpress.net | News | Medium |
| thanhnien.vn | News | Medium |
| ... + 10 more (research) | | |

**Untrust list (document for code-side reject):**

- FB group URLs (graph.facebook.com)
- Personal blog hosts (blogspot.com, wordpress.com personal blogs)
- Aggregator không có địa chỉ doanh nghiệp
- Sites với "giá rẻ bất thường" pattern

**WBS:**

- T1.1 List candidate Tier 1 domains (20).
- T1.2 Test API Perplexity call cho 5 sample queries với each domain in allowlist:
  - "Giá sửa ống nước rò rỉ HCMC 2026"
  - "Giá thay ổ cắm điện apartment HCMC"
  - "Giá dọn nhà move-out HCMC 2026"
  - "Giá sửa van xả bồn cầu HCMC"
  - "Giá vệ sinh bếp gas dầu HCMC"
- T1.3 Measure: accessibility (Perplexity returns content?), citation accuracy, recency, data quality.
- T1.4 Document untrust patterns (sample queries → identify scam sites in unfiltered Perplexity output).
- T1.5 Recommend final Tier 1 list (20 domains).
- T1.6 Document `docs/foundation/source-trust-research.md`.

**Build Instructions:**

- Test queries Vietnamese.
- API call with each candidate domain in `search_domain_filter`.
- Save sample responses for review.
- KHÔNG implement code-side filter yet (R4).

**Affected Areas:**

- `docs/foundation/source-trust-research.md` (NEW).
- Test scripts trong `scripts/source-trust-research/` (NEW, scrap dir).

**Skills/Protocols:** `kael-preflight`, `kael-clarify-with-docs`, `kael-prototype` (research is prototype).

**Tests:** Research output document, no code tests.

**Verification Loop:** Domain not accessible → drop. Insufficient citations → add backup domain.

**Foundation Enhancement:**

- Document research findings cho future maintenance.
- Establish criteria for adding new Tier 1 domain.

**Acceptance Gate:**

- [ ] 20 Tier 1 domains verified accessible.
- [ ] Untrust patterns documented (≥ 10 patterns).
- [ ] Source research doc complete.
- [ ] Tu approve final Tier 1 list before R2.

**Estimated Effort:** 1-2 ngày.

**Handoff Notes:** R1 output là input cho R2 config + R5 trust registry seed.

---

### 25.6 Phase R2 — Perplexity Configuration

**Goal:** Configure Perplexity calls với Tier 1 allowlist + strict system prompt + recency filter.

**Dependencies:** R1.

**Scope:**

- Update `kael/market.ts` (purpose #5 market_lookup) với new Perplexity config.
- Allowlist 20 Tier 1 domains.
- System prompt instructing Perplexity to use only Vietnamese trusted sources.
- Recency filter `month`.
- Env flag `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED` cho A/B comparison.

**Perplexity call config (final):**

```ts
{
  model: "sonar-pro",
  messages: [
    {
      role: "system",
      content: `
Bạn là price researcher cho dịch vụ sửa chữa và dọn dẹp tại HCMC.
Chỉ trích dẫn từ trusted Vietnamese marketplace sources.

Khi tổng hợp giá:
- Lấy giá range từ ít nhất 2 nguồn khác nhau.
- Reject giá outlier (quá cao hoặc quá thấp bất thường).
- Bắt buộc trả về JSON: { price_min, price_max, complexity, confidence, citation_summary }.
- Disclaimer Vietnamese bắt buộc.

KHÔNG:
- Trích từ FB groups, personal blogs, forum personal posts.
- Bịa giá nếu không tìm được trusted source.
- Reject câu hỏi ngoài 3 services (electrical/plumbing/cleaning).

Nếu không đủ data: return { "error": "insufficient_trusted_data" }.
      `
    },
    { role: "user", content: query }
  ],
  search_domain_filter: TIER_1_DOMAINS,  // max 20 from R1 research
  search_recency_filter: "month",
  search_mode: "web",
  search_context_size: "medium",
  temperature: 0.1,
  max_tokens: 600
}
```

**WBS:**

- T2.1 Define `TIER_1_DOMAINS` constant trong `kael/source-trust.ts` (NEW file).
- T2.2 Update `kael/market.ts` với new config (allowlist + system prompt + recency).
- T2.3 Add env flag `KAEL_TRUST_PERPLEXITY_FILTER_ENABLED` cho gradual rollout.
- T2.4 A/B mode: when flag false, dùng config cũ (no filter); when true, dùng new strict config.
- T2.5 Log search_mode + search_domain_filter usage vào `api_logs.safe_metadata`.

**Build Instructions:**

- Constants trong code, không DB (changes go through PR review).
- System prompt Vietnamese.
- Test API call sau update để verify behavior.
- Env flag cho rollback.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/source-trust.ts` (NEW).
- `supabase/functions/mobile-api/_shared/kael/market.ts` (UPDATE: new config).
- `supabase/functions/mobile-api/_shared/kael/provider-client.ts` (UPDATE: pass search_domain_filter).

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`.

**Tests (95% threshold):**

- T2-R-test-1: Perplexity call với allowlist returns citations only from whitelist.
- T2-R-test-2: System prompt enforced (response refuses untrust sources).
- T2-R-test-3: Recency filter applied (no citation > 1 month old).
- T2-R-test-4: Env flag toggle: revert to old config.
- T2-R-test-5: Insufficient data case: return error gracefully.
- T2-R-test-6: Schema validation: response parse-able.
- T2-R-test-7: Integration: end-to-end market_lookup với new config.
- Target: ≥ 6.5/7 (93%).

**Verification Loop:**

- Citations leak outside whitelist → check Perplexity allowlist sync.
- Insufficient data > 50% jobs → expand Tier 1 cẩn thận.

**Foundation Enhancement:**

- Document Tier 1 selection criteria trong `docs/ai-source-trust.md`.

**Acceptance Gate:**

- [ ] Perplexity config updated với allowlist.
- [ ] System prompt Vietnamese strict.
- [ ] Recency filter active.
- [ ] Env flag toggle.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 1-2 ngày.

**Handoff Notes:** R2 only configures Perplexity. Code-side validation ở R4.

---

### 25.7 Phase R3 — Citation Persistence Schema

**Goal:** Extend `kael_market_artifacts.safe_metadata` với strict `citations[]` schema để track source per query.

**Dependencies:** R2.

**Scope:**

- Define citation Zod schema.
- Extend `kael_market_artifacts.safe_metadata` JSONB structure.
- Migration: thêm validation function (optional Postgres check) hoặc relying on code-side validation.
- Update `kael/market.ts` to persist citations[] structured.

**Citation schema:**

```ts
const CitationSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string().max(200).optional(),
  snippet: z.string().max(500).optional(),
  published_at: z.string().datetime().optional(),
  trust_score: z.number().min(0).max(1),
  tier: z.enum(['tier_1', 'tier_2', 'tier_3', 'unverified']),
  validated_at: z.string().datetime(),
});

const MarketArtifactMetadata = z.object({
  citations: z.array(CitationSchema).min(0).max(20),
  perplexity_query: z.string().max(500),
  perplexity_response_summary: z.string().max(1000),
  validation_log: z.object({
    total_citations: z.number(),
    accepted: z.number(),
    rejected: z.number(),
    reject_reasons: z.array(z.string()),
  }),
});
```

**WBS:**

- T3.1 Define `CitationSchema` trong `packages/shared/kael/schemas/citation.ts` (NEW).
- T3.2 Define `MarketArtifactMetadata` schema extending.
- T3.3 Migration: add optional check constraint `safe_metadata->'citations' IS NOT NULL` cho new rows.
- T3.4 Update `kael/market.ts` to populate citations[] structured.
- T3.5 Add domain extraction helper `extractDomain(url) → string`.

**Build Instructions:**

- Schema Zod strict.
- Domain extraction: handle www, subdomain, query params strip.
- Trust_score initial: assign based on tier (calculated từ source_trust_registry R5).
- For R3, set tier='unverified' + trust_score=0.5 (default). R5 will populate per registry.

**Affected Areas:**

- `packages/shared/kael/schemas/citation.ts` (NEW).
- `supabase/functions/mobile-api/_shared/kael/market.ts` (UPDATE).
- `supabase/migrations/*` (optional check constraint).

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`.

**Tests (95% threshold):**

- T3-R-test-1: CitationSchema accept valid + reject invalid.
- T3-R-test-2: extractDomain handle edge cases (www, subdomain, trailing slash).
- T3-R-test-3: Market lookup populates citations[] structured.
- T3-R-test-4: kael_market_artifacts row có citations[] persisted.
- T3-R-test-5: Schema validation: citations array max 20.
- Target: 5/5 = 100%.

**Verification Loop:** Schema fail → tune. Domain extraction edge case → fix.

**Foundation Enhancement:** Documentation citation schema usage.

**Acceptance Gate:**

- [ ] CitationSchema defined.
- [ ] kael_market_artifacts persists citations[].
- [ ] Tests 5/5 pass.

**Estimated Effort:** 1-2 ngày.

**Handoff Notes:** R3 schema ready. R4 validator will populate trust_score correctly.

---

### 25.8 Phase R4 — Code-Side Citation Validator (Layer 2)

**Goal:** Implement defense-in-depth citation validation: verify URLs match Tier 1 whitelist, reject + log nếu outside.

**Dependencies:** R3.

**Scope:**

- Validator function `validateCitations(citations[]) → ValidationResult`.
- Reject citations outside whitelist.
- Compute trust_score per citation.
- Log validation result vào api_logs + kael_market_artifacts.
- Defensive: even if Perplexity bypass allowlist (bug?), code catches.

**Validator logic:**

```ts
function validateCitations(rawCitations: string[]): ValidationResult {
  const validated = rawCitations.map(url => {
    const domain = extractDomain(url);
    const trust = lookupTrustScore(domain);

    if (trust.tier === 'unverified' || trust.tier === 'tier_3') {
      return { url, domain, accepted: false, reject_reason: 'untrust_domain', trust_score: 0 };
    }

    return {
      url, domain, accepted: true,
      tier: trust.tier,
      trust_score: trust.score,
      validated_at: new Date().toISOString(),
    };
  });

  const accepted = validated.filter(c => c.accepted);
  const rejected = validated.filter(c => !c.accepted);

  // Quorum check: ≥ 2 accepted citations để trust price
  if (accepted.length < 2) {
    return {
      result: 'insufficient_trusted_citations',
      accepted, rejected,
      action: 'fallback_baseline_only',
    };
  }

  return { result: 'valid', accepted, rejected, action: 'proceed_with_blend' };
}
```

**WBS:**

- T4.1 Implement `validateCitations` trong `kael/source-trust.ts`.
- T4.2 Implement `extractDomain` helper.
- T4.3 Implement `lookupTrustScore(domain)` stub (R5 will plug registry).
- T4.4 Integrate validator vào `kael/market.ts` post-Perplexity call.
- T4.5 Log validation result vào api_logs.safe_metadata.
- T4.6 Behavior khi insufficient_trusted_citations: fallback baseline only.

**Build Instructions:**

- Pure function (testable).
- Conservative: reject if doubt.
- Quorum ≥ 2 citations để trust price → reduce single-source bias.
- Log mọi reject.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/source-trust.ts` (UPDATE: add validator).
- `supabase/functions/mobile-api/_shared/kael/market.ts` (UPDATE: call validator).
- `supabase/functions/mobile-api/_shared/kael/synthesis.ts` (UPDATE: handle insufficient).

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-security-sweep`, `kael-tdd`.

**Tests (95% threshold):**

- T4-R-test-1: validator accepts Tier 1 URLs.
- T4-R-test-2: validator rejects Tier 3 URLs.
- T4-R-test-3: validator rejects unknown domains.
- T4-R-test-4: Quorum check: < 2 accepted → insufficient_trusted.
- T4-R-test-5: extractDomain handle edge cases.
- T4-R-test-6: Integration: full market_lookup → validator → blend.
- T4-R-test-7: Security: simulated poisoning attempt → caught.
- T4-R-test-8: Fallback path: insufficient_trusted → baseline_only.
- Target: ≥ 7.5/8 (94%).

**Verification Loop:** False rejection → tune. Missing trust score → fix R5.

**Foundation Enhancement:** Validator pattern document, reusable.

**Acceptance Gate:**

- [ ] Validator implements.
- [ ] Quorum check working.
- [ ] Fallback path working.
- [ ] Security negative test pass.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 1-2 ngày.

**Handoff Notes:** R4 = code-side defense. R5 plugs in trust score registry.

---

### 25.9 Phase R5 — Source Trust Registry

**Goal:** Implement `source_trust_registry` table cho per-domain trust score, admin tunable, quarterly review.

**Dependencies:** R4.

**Scope:**

- NEW table `source_trust_registry`.
- Seed initial 20 Tier 1 domains từ R1 research.
- Admin CRUD endpoint (defer if no admin UI).
- Periodic review workflow (quarterly).
- Trust score decay over time.

**Schema:**

```sql
CREATE TABLE source_trust_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  tier text NOT NULL CHECK (tier IN ('tier_1', 'tier_2', 'tier_3', 'blocked')),
  trust_score numeric NOT NULL CHECK (trust_score BETWEEN 0 AND 1),
  description text,
  added_by uuid REFERENCES profiles(id),
  added_at timestamptz DEFAULT now(),
  last_reviewed_at timestamptz,
  last_reviewer_id uuid REFERENCES profiles(id),
  review_notes text,
  is_active boolean DEFAULT true,
  effective_from timestamptz DEFAULT now(),
  effective_until timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX source_trust_registry_lookup_idx
  ON source_trust_registry (domain, is_active);

ALTER TABLE source_trust_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin write source trust"
  ON source_trust_registry FOR ALL
  TO authenticated
  USING (private.is_admin());
```

**Trust score decay:**

```ts
function effectiveTrustScore(registry: SourceTrustRegistry, now: Date): number {
  const baseScore = registry.trust_score;
  if (!registry.last_reviewed_at) return baseScore * 0.8;

  const daysSinceReview = (now - registry.last_reviewed_at) / 86400000;

  if (daysSinceReview < 90) return baseScore;
  if (daysSinceReview < 180) return baseScore * 0.9;
  if (daysSinceReview < 365) return baseScore * 0.7;
  return baseScore * 0.5;
}
```

**WBS:**

- T5.1 Migration: `source_trust_registry` table + index + RLS.
- T5.2 Seed initial 20 Tier 1 + 5-10 Tier 2 từ R1 research.
- T5.3 Implement `lookupTrustScore(domain) → TrustScore` (replace R4 stub).
- T5.4 Implement decay function `effectiveTrustScore`.
- T5.5 Admin endpoint `POST /admin/source-trust/upsert` (CRUD).
- T5.6 Admin endpoint `POST /admin/source-trust/review` (mark reviewed).
- T5.7 Background job: weekly check for stale registries → alert admin.

**Build Instructions:**

- Registry là source of truth cho trust_score.
- Decay applied at lookup time (no need cron update).
- Seed data require Tu/admin approval before deploy.

**Affected Areas:**

- `supabase/migrations/*` (new table + seed).
- `supabase/functions/mobile-api/_shared/kael/source-trust.ts` (UPDATE: registry lookup).
- `supabase/functions/mobile-api/_shared/router.ts` (admin endpoints).

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`, `kael-security-sweep`.

**Tests (95% threshold):**

- T5-R-test-1: lookupTrustScore returns correct tier + score.
- T5-R-test-2: Decay function: stale > 90 days → reduced score.
- T5-R-test-3: Admin upsert endpoint works.
- T5-R-test-4: RLS: customer/worker cannot modify registry.
- T5-R-test-5: Unknown domain → tier='blocked', score=0.
- T5-R-test-6: Background alert for stale registries.
- T5-R-test-7: Seed 20 Tier 1 domains active.
- Target: ≥ 6.5/7 (93%).

**Verification Loop:** Registry sync issue → check seed migration.

**Foundation Enhancement:** Document registry maintenance workflow trong `docs/source-trust-maintenance.md`.

**Acceptance Gate:**

- [ ] Registry table seeded.
- [ ] Lookup function working.
- [ ] Decay applied.
- [ ] Admin CRUD working.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** Registry ready. R6 will use trust scores for weighted aggregation.

---

### 25.10 Phase R6 — LS1 MarketMemory Extend (Outlier + Weighted Aggregation)

**Goal:** Extend LS1 MarketMemory (PR #12 + §23 P7) với outlier detection + source-weighted aggregation cho passive learning loop.

**Dependencies:** R5.

**Scope:**

- Read `kael_market_artifacts` với citations[] structured.
- Apply source trust_score per citation as weights.
- Outlier detection: reject prices outside median ± 2σ.
- Compute weighted median for baseline candidate.
- Update baseline price_prior nếu evidence + confidence threshold.
- Integrate với existing PR #12 LS1 (extend, không replace).

**Algorithm:**

```python
# Pseudocode for LS1 batch run
def update_baseline_for(service, district, problem, complexity):
  artifacts = read_artifacts(service, district, problem, complexity, days=90, min_evidence=5)

  if len(artifacts) < MIN_EVIDENCE:
    return None

  observations = []
  for artifact in artifacts:
    for citation in artifact.citations:
      if citation.trust_score == 0: continue
      effective_score = apply_decay(citation, now)
      observations.append({
        price: artifact.market_range_max,
        weight: effective_score,
        recency: days_old(citation.published_at),
      })

  # Recency boost: recent observations weight more
  for obs in observations:
    if obs.recency < 30: obs.weight *= 1.2
    elif obs.recency > 180: obs.weight *= 0.5

  # Outlier rejection: median ± 2σ
  prices = [o.price for o in observations]
  median_price = median(prices)
  stdev = std(prices)
  filtered = [o for o in observations if abs(o.price - median_price) <= 2 * stdev]

  if len(filtered) < MIN_EVIDENCE:
    return None

  # Weighted median
  filtered.sort(key=lambda o: o.price)
  total_weight = sum(o.weight for o in filtered)
  cumsum = 0
  for obs in filtered:
    cumsum += obs.weight
    if cumsum >= total_weight / 2:
      weighted_median = obs.price
      break

  current_baseline = read_baseline(service, problem, complexity, district)
  drift_pct = abs(weighted_median - current_baseline.median) / current_baseline.median

  if drift_pct < DRIFT_THRESHOLD:
    return None

  confidence = compute_confidence(filtered, total_weight, drift_pct)
  if confidence < CONFIDENCE_THRESHOLD:
    return None

  candidate = create_learning_candidate(
    type='price_prior_update',
    service, district, problem, complexity,
    suggested_min=percentile(filtered, 25),
    suggested_max=percentile(filtered, 75),
    confidence, evidence_count=len(filtered),
    audit_reason=f"Weighted median drift {drift_pct:.0%}",
  )

  if evidence_gate_pass(candidate):
    promote_to_active_baseline(candidate)
    log_to_learning_rule_versions(candidate)
```

**Constants:**

```ts
const MIN_EVIDENCE = 5;          // PR #12
const CONFIDENCE_THRESHOLD = 0.6; // PR #12
const DRIFT_THRESHOLD = 0.15;    // 15% drift to trigger update
const RECENCY_BOOST = 1.2;       // < 30 days
const RECENCY_PENALTY = 0.5;     // > 180 days
const OUTLIER_SIGMA = 2;         // ± 2σ
```

**WBS:**

- T6.1 Read existing LS1 implementation (PR #12 + §23 P7).
- T6.2 Extend LS1 với citation-aware aggregation.
- T6.3 Implement outlier detection function.
- T6.4 Implement weighted median computation.
- T6.5 Implement recency decay weighting.
- T6.6 Integrate với existing learning candidate creation (PR #12 maybePromote pattern).
- T6.7 Update audit_reason to include weighted median calculation summary.
- T6.8 Add unit tests cho aggregation logic.
- T6.9 Add integration test với 50 mock artifacts.

**Build Instructions:**

- Algorithm pure function (testable).
- Mathematical correctness verified với test fixtures.
- Outlier handling conservative (reject là an toàn hơn keep).
- Recency decay không quá aggressive.

**Affected Areas:**

- `supabase/functions/mobile-api/_shared/kael/skills/LS1-market-memory.ts` (UPDATE).
- `supabase/functions/mobile-api/_shared/kael/skills/LS1-aggregation.ts` (NEW: pure aggregation).

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`, `kael-architecture-deepening`.

**Tests (95% threshold):**

- T6-R-test-1: Outlier detection: artificial extreme value rejected.
- T6-R-test-2: Weighted median: matches manual calculation.
- T6-R-test-3: Recency decay: old artifacts weight less.
- T6-R-test-4: Insufficient evidence: returns None.
- T6-R-test-5: Drift below threshold: no update.
- T6-R-test-6: Confidence below threshold: no promote.
- T6-R-test-7: Integration: 50 mock artifacts → learning candidate generated.
- T6-R-test-8: Audit trail: learning_rule_versions populated.
- T6-R-test-9: Evidence gate integration: pass calls promote, fail keeps pending.
- T6-R-test-10: Backward compat: PR #12 LS1 tests still pass.
- Target: ≥ 9.5/10 (95%).

**Verification Loop:**

- Math wrong → fix algorithm với test fixtures.
- False positive promote → tune thresholds.
- False negative no promote → tune thresholds.

**Foundation Enhancement:**

- Document aggregation algorithm trong `docs/learning-aggregation.md`.

**Acceptance Gate:**

- [ ] Outlier detection working.
- [ ] Weighted median correct.
- [ ] Recency decay applied.
- [ ] Backward compat: PR #12 LS1 tests pass.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 3-4 ngày.

**Handoff Notes:** R6 = passive learning core. Kael now learning từ Perplexity over time.

---

### 25.11 Phase R7 — Admin Source Trust Dashboard (OPTIONAL)

**Goal:** Admin dashboard cho monitoring source trust evolution + baseline price drift.

**Dependencies:** R6.

**Scope (OPTIONAL):**

- Dashboard endpoint: per source domain, hit count over time, accept/reject rate.
- Baseline evolution timeline: how price_prior changed per (service, district, problem).
- Stale source alerts.
- Manual override for source trust score.

**Defer if no admin UI infrastructure.**

**WBS:**

- T7.1 Dashboard endpoint `GET /admin/source-trust/dashboard`.
- T7.2 Baseline evolution query.
- T7.3 Stale source alert cron.
- T7.4 Manual override endpoint.

**Tests:** Basic CRUD tests.

**Acceptance Gate:**

- [ ] Dashboard endpoint working (nếu admin UI có).
- [ ] Else: defer to future, document.

**Estimated Effort:** 2-3 ngày (skip nếu defer).

**Handoff Notes:** Optional. Skip không ảnh hưởng critical path.

---

### 25.12 Phase R8 — A/B Test + Production Rollout

**Goal:** Verify quality preserved, gradually rollout to production.

**Dependencies:** R6 (R7 optional).

**Scope:**

- A/B compare: với vs không source trust validation, sample 50 jobs.
- Measure: price accuracy, citation transparency, customer confidence proxy.
- Gradual rollout 10% → 25% → 50% → 100%.
- Monitoring alerts.

**WBS:**

- T8.1 Run 50 jobs với KAEL_TRUST_PERPLEXITY_FILTER_ENABLED=true.
- T8.2 Compare metrics vs baseline (flag false).
- T8.3 Customer satisfaction proxy (review rating delta).
- T8.4 Citation transparency: % jobs với ≥ 2 trusted citations.
- T8.5 Rollout 10% canary.
- T8.6 Progressive: 25% → 50% → 100%.
- T8.7 Monitoring alerts cho insufficient_trusted_citations rate spike.

**Acceptance Gate:**

- [ ] Quality preserved (no rating drop).
- [ ] Citation transparency ≥ 80% jobs có ≥ 2 trusted citations.
- [ ] Rollout 100% completed.
- [ ] Monitoring alerts working.
- [ ] Tests ≥ 95% pass.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** R8 hoàn tất = §25 done. Source trust production-ready.

---

### 25.13 Cross-cutting Concerns

#### Trust validation guarantee

```
Layer 1 (Perplexity native filter):  20 Tier 1 domains, strict allowlist.
Layer 2 (Code-side validator):       Defense-in-depth, reject outside whitelist.
Layer 3 (Source-weighted blend):     Baseline 70% + Perplexity 30% với trust scores.

Customer thấy: Estimate Card v3 với citations array, citations từ uy tín nguồn.
Admin thấy: per-job audit trail, baseline evolution, source distribution.
Kael học: passive update baseline price_prior over time via LS1.
```

#### Rollback strategy

Per option env flag:

```
KAEL_TRUST_PERPLEXITY_FILTER_ENABLED   # R2
KAEL_TRUST_CITATION_VALIDATOR_ENABLED  # R4
KAEL_TRUST_REGISTRY_LOOKUP_ENABLED     # R5
KAEL_TRUST_LS1_WEIGHTED_ENABLED        # R6
```

Default ALL false. Enable progressively after testing.

#### Skills Mapping Summary

| Skill | Used in Phases |
|---|---|
| `kael-preflight` (mandatory) | ALL phases |
| `kael-ai-boundary` | R2, R4, R6 |
| `kael-supabase` | R3, R5, R7 |
| `kael-security-sweep` | R4 (defense-in-depth) |
| `kael-tdd` | ALL except R0 |
| `kael-prototype` | R1 (research) |
| `kael-architecture-deepening` | R6 (aggregation deep module) |
| `kael-review` | ALL phases acceptance gate |
| `karpathy-guidelines` | ALL phases |

#### Approval Gates Summary

```
R0 → R1: dependencies §23 P3+P6+P7, §24 Q3 verified
R1 → R2: 20 Tier 1 domains researched + Tu approve final list
R2 → R3: Perplexity config working (allowlist enforced)
R3 → R4: Citation schema persisted
R4 → R5: Validator working với stub trust lookup
R5 → R6: Registry seeded + lookup working
R6 → R7/R8: LS1 weighted aggregation working
R7 → R8: Dashboard optional
R8 → Production: A/B verify quality + citation transparency + Tu approve
```

---

### 25.14 Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-05-25 | Tu + Claude discussion + Perplexity API verified | Initial draft based on Phương án A |
| 1.0 | 2026-05-26 | Tu approved | Approve toàn bộ, write vào Plan.md §25 |
| 2.0 | 2026-05-26 | Tu + Claude + Codex | Reconciled PR #37-#40 audit via Plan.md §26; source trust registry, citation quorum, LS1 aggregation, and production DB apply recorded without editing phase bodies |

---

### 25.15 Notes for Future Agents

**Khi resume work §25:**

1. Read §25 đầy đủ.
2. Verify §23 P3+P6+P7 + §24 Q3 done.
3. Check Change Log.
4. Verify decisions S1-S12 vẫn align.
5. Run preflight per `critical.md` §5.

**Conflict resolution:**

- §25 conflict với §23/§24: existing wins (base layer).
- §25 conflict với `RULES.md` hoặc `critical.md`: STOP, ask Tu.
- §25 conflict với code đã merge: re-read code, code wins.

**Plan immutable:**

- §25.0-§25.13 KHÔNG được edit mid-execution per S12.
- Nếu cần đổi → §25 v2.0 + Tu approve.

**Trust maintenance post-deploy:**

- Quarterly: admin review source_trust_registry, mark last_reviewed_at.
- Monthly: review insufficient_trusted_citations rate spike.
- Yearly: re-curate Tier 1 list (add new sources, remove stale).

---

## 26. Codex Gap Fixing Plan — Audit verify PR #37-#40 — 2026-05-26

### 26.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-codex-gap-fixing
Created:        2026-05-26
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         DRAFT v0.1 → Tu approved 2026-05-26 → write Plan.md §26
Critical Alert: HIGH — production rollout decision + locked docs edit
Trigger:        Audit verify PR #37 (P0-P17), #38 (P18 production fix), #39 (P19 + Q1),
                #40 (Q2/Q3/Q4/Q5 + §25 R1+R2) → 10 gaps identified
Scope:          Fix 10 gaps (5 verified + 5 newly found in deep verify) +
                tune locked docs (STRUCTURES.md, RULES.md) align với reality
Out of scope:   New features beyond fixing existing build
Effort total:   ~17-25 ngày agent build (sequential)
Phase count:    10 phases (F0 pre-read + F1-F9 fixes)
```

**Mục tiêu chính:**

1. **Close 10 gaps** từ audit verify giữa Codex's PR #37-#40 và Plan §23+§24+§25 spec.
2. **Align locked docs** (STRUCTURES.md §9, RULES.md §6) với reality (purposes mapping mới).
3. **Production rollout gate** — Tu approve trước khi promote Q1-Q5 + R1-R2 lên prod.
4. **Quality bar 95%+** mọi metric trước khi sign-off.

**Authority refs:**

```
1. RULES.md          (§6 service scope, §3 validate AI output)
2. critical.md       (§12 kael-ai-boundary, §15 kael-security-sweep)
3. STRUCTURES.md     (§9 AI Provider Roles — sẽ tune ở F1)
4. Plan.md §23-§25   (spec source of truth — sẽ bump version ở F8)
5. AGENTS.md
6. THIS PLAN §26
7. CLAUDE.md         (Lock Notice — Tu approved F1 lock doc edits via this plan)
8. docs/architecture/code-ownership-map.md
9. MEMORY.md         (last)
```

---

### 26.1 Gap Inventory (10 gaps verified)

| # | Gap | Evidence | Severity |
|---|---|---|---|
| 1 | Production deploy stuck | Prod Edge v10, 71 migrations vs staging v67, 74 migrations | **HIGH** |
| 2 | Q1.5 "11-purpose coverage" misleading | provider_logged=true cho 2/11 purposes only | MEDIUM |
| 3 | 15% provider failure Q3 rerun | Q1 baseline 1.0 → Q3 100-job 0.85 success | MEDIUM |
| 4 | §25 R3-R8 incomplete | R1+R2 done, R5 source_trust_registry table missing | MEDIUM |
| 5 | A/B Perplexity #6 chưa run | `kael_ab_experiments` 1 row, `kael_ab_price_synthesis_cases` 0 rows | MEDIUM |
| 6 | Tier 1 domains hardcoded | 20 domains trong source-trust.ts code, no DB table for admin tunable | MEDIUM |
| 7 | 14 unindexed FK + 35+ unused indexes | Supabase advisor INFO findings | LOW |
| 8 | Plan immutability violated | Codex added P18-P20, Q1.5 without v2.0 bump per spec §23.0/§24.0/§25.0 | LOW |
| 9 | STRUCTURES.md §9 conflict reality | Provider role descriptions outdated vs purposes mapping | MEDIUM (will tune F1) |
| 10 | RULES.md §6 wording slightly narrow | Educational/safety/legal topics broader than "service Q&A only" wording | LOW (will tune F1) |

---

### 26.2 High-Level Roadmap

```
F0 Pre-Read Mandatory (locked docs + plan + memory)
   ↓
F1 Locked Docs Tuning (STRUCTURES.md §9 + RULES.md §6 — Tu approved trong instruction)
   ↓
F2 Production Rollout Decision Gate (Tu manual approval)
   ↓
   ├─ F3 Extend Q1.5 Baseline 11 Purposes  ┐
   ├─ F4 Fix 15% Provider Failure           ├─ parallel
   └─ F5 Complete §25 R3-R7                 ┘
   ↓
F6 Run A/B Test Perplexity #6 (depend F3 baseline complete)
   ↓
   ├─ F7 DB Performance Cleanup             ┐
   └─ F8 Plan Version Bump + Change Log     ┴─ parallel
   ↓
F9 Final E2E + Sign-off
```

**Critical path:** F0 → F1 → F2 → F5 → F6 → F9. Longest: F5 (4-6 ngày).

**Parallel opportunities:** F3/F4/F5 sau F2; F7/F8 sau F6.

**Estimated total effort:** 17-25 ngày sequential, 12-18 ngày với parallelization.

---

### 26.3 Phase F0 — Pre-Read Mandatory ⚠️ NEVER SKIP

**Goal:** Codex agent có ngữ cảnh đầy đủ trước khi đụng code/docs.

**Dependencies:** None.

**Scope:** Read 8 authority files; state preflight per `critical.md §5`.

**Out of scope:** KHÔNG sửa file nào trong F0.

**Steps:**

- Step 0.1 Read `critical.md` toàn bộ.
- Step 0.2 Read `RULES.md` toàn bộ.
- Step 0.3 Read `STRUCTURES.md` §9 + §10F + §11.
- Step 0.4 Read `Plan.md §23 + §24 + §25` (base) + §26 (this plan).
- Step 0.5 Read `MEMORY.md` last.
- Step 0.6 Read `docs/architecture/code-ownership-map.md`.
- Step 0.7 Read `docs/agent-lessons.md`.
- Step 0.8 State preflight format per `critical.md §5`.

**Skills/Protocols:** `kael-preflight`, `kael-clarify-with-docs`.

**Acceptance Gate:**

- [ ] All 8 authority files read.
- [ ] Preflight stated.

**Estimated Effort:** 30-60 phút.

---

### 26.4 Phase F1 — Locked Docs Tuning (Gap 9 + 10)

**Goal:** Update STRUCTURES.md §9 + RULES.md §6 align với purposes mapping mới.

**Dependencies:** F0.

**Steps:**

- Step 1.1 Update STRUCTURES.md §9 DeepSeek bullet:
  Old: "DeepSeek: intent classification, simple FAQ, lightweight pre-screening"
  New: "DeepSeek: primary cho intent classification, clarification, problem synthesis, advisory generation, worker brief, post-job learning, educational response. Text-based default với Anthropic fallback per ai_provider_routing config."
- Step 1.2 Update STRUCTURES.md §9 Anthropic bullet:
  Old: "Anthropic: vision analysis, problem identification, price synthesis, customer-facing explanation, worker pre-brief when needed"
  New: "Anthropic: vision analysis (mandatory, no fallback), scope-change reasoning (Phase 2.0 final-price authority), and fallback cho DeepSeek/Perplexity failures per routing config."
- Step 1.3 Update STRUCTURES.md §9 Perplexity bullet:
  Old: "Perplexity: market price lookup only, HCMC repair price research"
  New: "Perplexity: market price lookup AND price synthesis (purpose #6 under A/B test per Plan §23 D28); restricted to allowlist 20 Tier 1 Vietnamese sources per Plan §25 R1 research."
- Step 1.4 Add effective date line cuối §9:
  "Provider role mapping is sourced from `ai_provider_routing` (DB) + `routing.config.ts` (code). Effective 2026-05-26 per Plan.md §23 P3 + §25 R2. Tu approval recorded in §26 F1."
- Step 1.5 Update RULES.md §6 wording:
  Old: "Hard rule: Kael answers concise, relevant, safe Home Services questions inside the three active categories only."
  New: "Hard rule: Kael answers Home Services questions (electrical, plumbing, cleaning) plus directly-tied educational responses, safety advisories, and legal-awareness warnings about the same three categories. Out-of-scope service requests get a polite decline."
- Step 1.6 Verify diff `git diff origin/main -- STRUCTURES.md RULES.md` ≤ 30 lines total.

**Build Instructions:**

- KHÔNG add/remove sections.
- Preserve LOCKED notice.
- Use Edit tool surgical.

**Affected Areas:** `STRUCTURES.md` + `RULES.md` (locked, Tu approved via §26).

**Skills/Protocols:** `kael-preflight`, `kael-docs-execution`, `karpathy-guidelines`.

**Tests:**

- Step 1-test-1: Diff STRUCTURES.md chỉ §9 changes.
- Step 1-test-2: Diff RULES.md chỉ §6 wording.
- Step 1-test-3: LOCKED notice preserved.
- Step 1-test-4: §9 mentions all 11 purposes / 3 providers.

**Acceptance Gate:**

- [ ] STRUCTURES.md §9 updated (3 bullets + effective date).
- [ ] RULES.md §6 wording updated.
- [ ] Total diff ≤ 30 lines.
- [ ] Tests 4/4 pass.

**Estimated Effort:** 1-1.5 ngày.

---

### 26.5 Phase F2 — Production Rollout Decision Gate (Gap 1)

**Goal:** Deploy Q1-Q5 + R1-R2 lên production stuck on staging.

**Dependencies:** F1.

**Steps:**

- Step 2.1 Risk assessment `docs/foundation/production-rollout-decision.md` (migrations safety, env flags default off, rollback plan, monitoring) (~1 ngày).
- Step 2.2 Tu approve risk assessment + rollout authorization (manual gate).
- Step 2.3 Apply migrations production (`iwevizmsedyqozxlawwl`) via `mcp__supabase__apply_migration` matching staging sequence (~0.5 ngày).
- Step 2.4 Deploy mobile-api Edge function production (match staging code) (~0.5 ngày).
- Step 2.5 Production smoke 5 real jobs với env flags OFF (~0.5 ngày).
- Step 2.6 Document rollout `docs/test-logs/YYYY-MM-DD_f26-production-rollout.md` (~0.5 ngày).

**Build Instructions:**

- All env flags default off → behavior identical to current.
- Smoke must pass with same staging metrics.
- Migrations via mcp tool (audit trail).

**Affected Areas:**

- Production Supabase: migrations + Edge function.
- `docs/foundation/production-rollout-decision.md` (NEW).
- `docs/test-logs/YYYY-MM-DD_f26-production-rollout.md` (NEW).

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-security-sweep`, `kael-review`.

**Tests:**

- Step 2-test-1: Production migration count = staging count.
- Step 2-test-2: Edge function version updated production.
- Step 2-test-3: 5 smoke jobs successful.
- Step 2-test-4: `api_logs.purpose` populated cho new calls.
- Step 2-test-5: No production errors.

**Acceptance Gate:**

- [ ] Risk assessment doc reviewed by Tu.
- [ ] Production migrations match staging.
- [ ] Edge function deployed.
- [ ] Smoke 5/5 pass.
- [ ] kael-security-sweep pass.

**Estimated Effort:** 2-3 ngày.

**Handoff Notes:** F2 hard gate — Tu manual approve Step 2.2.

---

### 26.6 Phase F3 — Extend Q1.5 Baseline cho 11 Purposes (Gap 2)

**Goal:** Q1.5 baseline thực sự cover 11 purposes với real data.

**Dependencies:** F2.

**Steps:**

- Step 3.1 Read existing `kael-q1-baseline.mjs` (~0.5 ngày).
- Step 3.2 Extend script: 50 jobs với photos (trigger vision), scope-change sim, A14 review (~1.5 ngày).
- Step 3.3 Run extended baseline staging 50 jobs (~0.5 ngày).
- Step 3.4 Verify `kael_quality_baseline` ≥ 8/11 provider_logged=true (~0.5 ngày).
- Step 3.5 Update `docs/cost-baseline-2026-05.md` (~0.5 ngày).

**Build Instructions:**

- Staging fixture cleanup per P19 pattern.
- Per-purpose cost/latency tracked.
- Skipped purposes annotated `skipped=true`.

**Affected Areas:**

- `apps/api/scripts/kael-q1-baseline.mjs` (UPDATE).
- `docs/cost-baseline-2026-05.md` (UPDATE).

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`.

**Tests:** 5 tests covering script run, ≥ 8/11 coverage, skipped annotation, cost breakdown, cleanup.

**Acceptance Gate:**

- [ ] ≥ 8/11 purposes real data.
- [ ] Cost baseline doc updated.
- [ ] Tests 5/5 pass.

**Estimated Effort:** 2-3 ngày.

---

### 26.7 Phase F4 — Investigate + Fix 15% Provider Failure (Gap 3)

**Goal:** Root cause + fix success rate 0.85 → ≥ 0.95.

**Dependencies:** F2.

**Steps:**

- Step 4.1 Query `api_logs` last 100 per provider × error_code (~0.5 ngày).
- Step 4.2 Read 5 sample failed calls (~0.5 ngày).
- Step 4.3 Document finding `docs/foundation/q3-failure-root-cause.md` (~0.5 ngày).
- Step 4.4 Apply fix per finding (~1 ngày).
- Step 4.5 Re-run 100-job staging baseline → success ≥ 0.95 (~0.5 ngày).

**Build Instructions:**

- Honest reporting per memory.
- Minimal fix per karpathy.

**Affected Areas:**

- `docs/foundation/q3-failure-root-cause.md` (NEW).
- Per finding: routing.ts / circuit-breaker.ts / provider-client.ts.

**Skills/Protocols:** `kael-preflight`, `kael-diagnose`, `kael-tdd`.

**Tests:** 4 tests: identify, fix minimal, re-run ≥ 0.95, no new failure.

**Acceptance Gate:**

- [ ] Root cause documented.
- [ ] Fix applied + tested.
- [ ] Success rate ≥ 0.95.

**Estimated Effort:** 2-3 ngày.

---

### 26.8 Phase F5 — Complete §25 R3-R7 (Gap 4 + 6)

**Goal:** Build R3-R7 source trust infrastructure.

**Dependencies:** F1.

**Steps:**

- Step 5.1 R5 — Migration `source_trust_registry` per Plan §25.9 (~1 ngày).
- Step 5.2 R5 — Seed 20 Tier 1 từ hardcoded list (~0.5 ngày).
- Step 5.3 R5 — Replace source-trust.ts hardcoded với DB lookup (5-min cache) (~0.5 ngày).
- Step 5.4 R5 — `lookupTrustScore` + decay function (~0.5 ngày).
- Step 5.5 R4 — `validateCitations` với quorum ≥ 2 (~1 ngày).
- Step 5.6 R4 — Wire validator vào market.ts post-Perplexity (~0.5 ngày).
- Step 5.7 R3 — Verify citations[] populated cho 5 test jobs (~0.5 ngày).
- Step 5.8 R6 — Extend LS1 với median ± 2σ outlier (~1 ngày).
- Step 5.9 R6 — Weighted median trong `LS1-aggregation.ts` NEW (~0.5 ngày).
- Step 5.10 R7 optional — Admin endpoints `/admin/source-trust/*` (~1 ngày).

**Build Instructions:**

- R5 cache via Map (5-min TTL).
- R6 pure functions.
- Backward compat: PR #12 LS1 tests pass.

**Affected Areas:**

- Migration: `source_trust_registry`.
- `kael/source-trust.ts` (UPDATE).
- `kael/market.ts` (UPDATE).
- `kael/skills/LS1-aggregation.ts` (NEW).
- `kael/skills/LS1-market-memory.ts` (UPDATE).
- `kael/router.ts` (R7 routes optional).

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-ai-boundary`, `kael-security-sweep`, `kael-tdd`, `kael-architecture-deepening`.

**Tests:** 10 tests covering registry seed, lookup, decay, validator quorum, citation persistence, outlier, weighted median, backward compat, RLS.

**Acceptance Gate:**

- [ ] R5 seeded + lookup working.
- [ ] R4 validator quorum working.
- [ ] R3 citations persisted (5 test jobs).
- [ ] R6 outlier + weighted median working.
- [ ] R7 admin (if approved).
- [ ] Tests ≥ 9/10.

**Estimated Effort:** 4-6 ngày.

---

### 26.9 Phase F6 — Run A/B Test Perplexity #6 (Gap 5)

**Goal:** Execute A/B test price_synthesis 100 cases per D28.

**Dependencies:** F3 + F5.

**Steps:**

- Step 6.1 Verify `kael_ab_experiments` config (~0.5 ngày).
- Step 6.2 Build A/B runner `apps/api/scripts/kael-ab-pricesynth.mjs` (~1 ngày).
- Step 6.3 Run 100 staging jobs split 50/50 (~1 ngày).
- Step 6.4 Compute 4 metrics: schema_rate ≥95%, deviation_anthropic ≤25%, deviation_actual ≤30%, fallback_rate ≤10% (~0.5 ngày).
- Step 6.5 Persist 100 case rows (~0.5 ngày).
- Step 6.6 Decision report `docs/test-logs/YYYY-MM-DD_f26-ab-pricesynth-decision.md` (~0.5 ngày).

**Build Instructions:**

- Deterministic seed-based split.
- Fixture cleanup.
- Honest reporting.

**Affected Areas:**

- `apps/api/scripts/kael-ab-pricesynth.mjs` (NEW).
- `kael_ab_price_synthesis_cases` (populate 100).
- Decision report (NEW).
- `routing.config.ts` (UPDATE nếu loại Perplexity #6).

**Skills/Protocols:** `kael-preflight`, `kael-ai-boundary`, `kael-tdd`, `kael-review`.

**Tests:** 6 tests covering 100 cases, balanced split, 4 metrics, math sample verify, decision committed, cleanup.

**Acceptance Gate:**

- [ ] 100 cases persisted.
- [ ] 4 metrics computed.
- [ ] Decision report committed.
- [ ] Tu approve direction.

**Estimated Effort:** 2-3 ngày.

---

### 26.10 Phase F7 — DB Performance Cleanup (Gap 7)

**Goal:** Fix 14 unindexed FK + drop 35+ unused indexes.

**Dependencies:** F6.

**Steps:**

- Step 7.1 Migration 14 FK indexes (~0.5 ngày).
- Step 7.2 Verify pg_stat_user_indexes 0 scans last 7 days (~0.5 ngày).
- Step 7.3 Migration drop unused (0 scans only) (~0.5 ngày).
- Step 7.4 Apply staging + production (~0.5 ngày).
- Step 7.5 Re-run advisor verify lints < 10 (~0.5 ngày).

**Build Instructions:**

- Migrations idempotent.
- Verify 0 scans STRICTLY.

**Affected Areas:** 2 new migrations.

**Skills/Protocols:** `kael-preflight`, `kael-supabase`, `kael-tdd`.

**Tests:** 4 tests covering FK indexes added, 0 scans verified, advisor reduce ≥ 30 lints, no query regression.

**Acceptance Gate:**

- [ ] 14 FK indexes added.
- [ ] ≥ 30 unused dropped.
- [ ] Advisor lints < 10.

**Estimated Effort:** 1-2 ngày.

---

### 26.11 Phase F8 — Plan Version Bump + Change Log (Gap 8)

**Goal:** Bump §23/§24/§25 to v2.0 với change log.

**Dependencies:** F7.

**Steps:**

- Step 8.1 Plan.md §23 Status v2.0 + §23.24 change log row (~0.5 ngày).
- Step 8.2 Plan.md §24 Status v2.0 + §24.11 row (~0.5 ngày).
- Step 8.3 Plan.md §25 Status v2.0 + §25.14 row (~0.5 ngày).

**Build Instructions:**

- Edit only metadata + change log.
- Preserve phase content immutable.
- Reference PR #37-#40 + date.

**Affected Areas:** Plan.md §23.0, §23.24, §24.0, §24.11, §25.0, §25.14.

**Skills/Protocols:** `kael-preflight`, `kael-docs-execution`.

**Tests:** 3 tests: v2.0 all plans, change log rows reference PRs, phase content unchanged.

**Acceptance Gate:**

- [ ] All 3 plans v2.0.
- [ ] Change log rows added.

**Estimated Effort:** 1 ngày.

---

### 26.12 Phase F9 — Final E2E + Sign-off

**Goal:** Re-verify full pipeline + Tu sign-off.

**Dependencies:** F1-F8.

**Steps:**

- Step 9.1 Re-run P15 E2E 5-case matrix staging (~0.5 ngày).
- Step 9.2 Production smoke 5 real jobs (~0.5 ngày).
- Step 9.3 Create `docs/test-logs/YYYY-MM-DD_f26-final-signoff.md` (~0.5 ngày).
- Step 9.4 Tu manual review + sign-off.

**Acceptance Gate:**

- [ ] Staging E2E 5/5 pass.
- [ ] Production smoke 5/5 pass.
- [ ] All 10 gaps verified closed.
- [ ] Tu sign-off recorded.

**Estimated Effort:** 1-2 ngày.

---

### 26.13 Cross-cutting Concerns

#### Skills Mapping Summary

| Skill | Phases |
|---|---|
| `kael-preflight` (mandatory) | ALL |
| `kael-docs-execution` | F1, F8 |
| `kael-supabase` | F2, F5, F7 |
| `kael-ai-boundary` | F3, F4, F5, F6 |
| `kael-security-sweep` | F2, F5 |
| `kael-tdd` | ALL except F0, F1 |
| `kael-architecture-deepening` | F5 (R6 aggregation) |
| `kael-diagnose` | F4 (root cause) |
| `kael-review` | ALL acceptance gates |
| `karpathy-guidelines` | ALL |

#### Approval Gates Summary

```
F0 → F1: Pre-read output verified
F1 → F2: Locked docs tuned
F2 → F3/F4/F5: Production rollout success + Tu manual approval
F3/F4/F5 → F6: Baseline + failure fix + R3-R7 complete
F6 → F7/F8: A/B decision committed
F7/F8 → F9: All fixes complete
F9 → Done: Tu sign-off
```

#### Risk Management

| Risk | Mitigation |
|---|---|
| F1 locked doc edit creep | Strict ≤ 30 lines diff, surgical only |
| F2 production rollout breaks | Default OFF flags, rollback ready |
| F4 failure root cause unclear | `kael-diagnose` protocol |
| F5 R6 aggregation math bug | Unit tests + backward compat |
| F6 A/B decision premature | Persist 100 cases trước decide |
| F7 drop wrong index | Verify pg_stat 0 scans STRICT |
| F8 plan content drift | Edit only metadata + change log |

---

### 26.14 Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-05-26 | Tu + Claude (audit verify PR #37-#40) | Initial fixing plan based on 10 gaps |
| 1.0 | 2026-05-26 | Tu approved | Approve toàn bộ, write Plan.md §26, Codex execute |

---

### 26.15 Notes for Future Agents

**Khi resume work §26:**

1. Read §26 đầy đủ.
2. Verify F0 pre-read done.
3. Check Change Log.
4. Run preflight per `critical.md §5`.

**Conflict resolution:**

- §26 conflict với §23/§24/§25: existing wins (base layer).
- §26 conflict với `RULES.md` hoặc `critical.md`: STOP, ask Tu.
- §26 conflict với code: re-read code, code wins.

**Plan immutable after Tu approval:**

- §26.0-§26.13 KHÔNG edit mid-execution.
- Nếu cần đổi → v2.0 + Tu approve.

**Phase dependency:**

```
F0 → F1 → F2 → {F3, F4, F5} → F6 → {F7, F8} → F9
```

F2 is HARD GATE — Tu manual approve required before F3-F9 begin.

---

## 27. Production Bug Audit Fix Plan — 2026-05-28

### 27.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-prod-bug-audit-20260528
Created:        2026-05-28
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         DRAFT v0.1 → Tu approved 2026-05-28 với điều kiện X0 robust → write Plan.md §27
Critical Alert: HIGH — 8 HIGH bugs + 5 MEDIUM/LOW; production matching layer hoàn toàn vỡ (F-09)
Trigger:        QA audit toàn diện 2026-05-28 với Expo Web runtime + Supabase MCP + curl direct
Scope:          Fix 13 findings, 8 HIGH ngăn ship + 5 MEDIUM/LOW bổ sung trust foundation
Out of scope:   Worker side full happy path (BLOCKED bởi F-09 cho đến khi prod data fixed)
Effort total:   ~14-20 ngày agent build (sequential), 9-13 ngày với parallelization
Phase count:    9 phases (X0 pre-read robust + X1-X7 fixes + X8 sign-off)
Skill mapping:  kael-preflight, kael-supabase, kael-ai-boundary, kael-security-sweep,
                kael-diagnose, kael-architecture-deepening, kael-review, kael-tdd
```

**Mục tiêu chính:**

1. **Unblock matching layer** — fix F-09 production data + F-14 parser → customer match worker.
2. **Close AI scope leak** — Kael politely decline AC repair / off-topic / prompt injection per RULES.md #6 + #8.
3. **Idempotency + rate limit** — F-04 + F-23 chặn dup jobs/spam waste.
4. **Frontend backend-as-truth** — F-17 customer resume từ backend sau refresh.
5. **PII scrub before persist** — F-22 không lưu raw phone/CCCD trong DB.
6. **Quality bar 95%** test pass + 0 fake-success trước sign-off.

**Authority refs (đọc theo thứ tự bắt buộc):**

```
1. critical.md                          (§5 preflight, §12 ai-boundary, §15 security-sweep, §14 supabase)
2. RULES.md                             (#6 scope, #3 validate AI, #7 confirmation, #8 fake data, #9 PII, #10 timeout)
3. STRUCTURES.md                        (§9 AI providers, §11 backend modules, §12 state machines, §15 pricing)
4. design.md                            (chỉ đọc khi phase chạm UI)
5. AGENTS.md
6. CLAUDE.md                            (lock notice — locked docs cấm edit trừ phi Tu approve explicit)
7. Plan.md §22 + §23 + §24 + §25 + §26  (precedent)
8. Plan.md §27                          (this plan)
9. docs/architecture/code-ownership-map.md
10. docs/agent-lessons.md
11. MEMORY.md                           (last — fresh session facts)
```

---

### 27.1 Finding Inventory — 13 findings (runtime evidence)

| ID | Severity | Title | Evidence ref |
|---|---|---|---|
| **F-04** | **HIGH** | POST /jobs + /kael/chat tạo dup row khi spam (no client_request_id) | 3 jobs tạo từ 3 parallel POST, 5 sessions từ 5 spam |
| **F-09** | **HIGH** | Prod `worker_profiles.districts` lưu label "Binh Thanh" thay vì slug | DB query: prod=["Binh Thanh","Quan 1","Quan 2"], staging=["q7"] |
| **F-14** | **HIGH** | `inferKaelChatDistrict` không parse substring district từ address có building prefix | Kael trả clarification 2 lần dù user đã type "Vinhomes Central Park, Bình Thạnh" |
| **F-17** | **HIGH** | Customer frontend KHÔNG hydrate active job từ backend sau refresh | Backend job=broadcasting, UI hiện "Chưa có yêu cầu" sau reload |
| **F-18** | **HIGH** | Kael trả estimate cho AC repair (out-of-scope per RULES.md #6) thay vì decline | POST /kael/chat message AC → estimate 210k-760k, cost $0.004102 |
| **F-19** | **HIGH** | Kael trả estimate cho off-topic prompt (recipe nấu phở) thay vì decline | Estimate 128k-298k với problem_summary "không liên quan" — fake price (#8 vi phạm) |
| **F-20** | **HIGH** | Prompt injection vẫn ra estimate_ready (system prompt OK nhưng workflow gate fail) | "Ignore all prior instructions..." → estimate 92k-172k cleaning |
| **F-21** | **HIGH** | service_type mismatch không reject (cleaning + electrical message → cleaning estimate) | AI nhận biết "vấn đề điện" nhưng vẫn estimate cleaning 92k-860k |
| **F-23** | **HIGH** | No rate limit /kael/chat POST endpoint → spam tạo dup AI cost | 5 parallel = 5 estimate_ready, không rate-limit response |
| **F-22** | MEDIUM | Raw phone/CCCD/address lưu `kael_chat_turns.text_content` (DB persist) | DB query thấy "Số điện thoại 0909123456, CCCD 001234567890" |
| **F-15** | MEDIUM | Kael pipeline thiếu context window cho multi-turn (AI dùng latest message only) | Turn 6 estimate ignores turn 1+3 customer description |
| **F-08** | MEDIUM | `normalizeDistrict` không strip diacritic cho label match (ASCII "Binh Thanh" fail) | normalize("Binh Thanh") → hcmc_all (DEFAULT) |
| **F-10** | MEDIUM | Worker thiếu `home_lat/lng` cho geo fallback khi district mismatch | worker_profiles.home_lat=null, no geo radius fallback |
| **F-16** | LOW | History "Xong" tab pre-refresh show active deal (filter dùng status thay vì isDone) | Click Xong tab thấy job broadcasting card; sau reload thì biến mất |
| **F-11** | LOW | `confirmKaelChat` ALREADY_CONFIRMED code path không hit (deploy lag hoặc RPC trả code khác) | Double confirm trả 409 INVALID_STATUS thay vì 200 current state |

---

### 27.2 High-Level Roadmap

```
X0 Pre-Read Mandatory + Workspace Context Bootstrap (always)
   ↓
X1 AI Boundary Enforcement (F-18, F-19, F-20, F-21)   ┐
   ↓                                                   │
X2 Idempotency + Rate Limit (F-04, F-23, F-11)        ├── X1 + X2 + X3 parallel
   ↓                                                   │   (different layers)
X3 Matching Unblock (F-09 + F-14 + F-08 + F-10)       ┘
   ↓
X4 Frontend Backend-as-Truth (F-17)
   ↓
X5 PII Hardening + Context Window (F-22, F-15)
   ↓
X6 UI Polish (F-16)
   ↓
X7 E2E Regression + Sign-off
```

**Critical path:** X0 → X3 → X4 → X7. Longest: X3 (data migration + integration test).

**Parallel:** X1 + X2 + X3 sau X0; X5 + X6 sau X4.

**Estimated total:** 14-20 ngày sequential, 9-13 ngày với parallelization.

---

### 27.3 Phase X0 — Pre-Read Mandatory + Workspace Context Bootstrap ⚠️ NEVER SKIP

**Goal:** Agent có đầy đủ ngữ cảnh authority + workspace state TRƯỚC khi sờ vào code/migration nào.

**Dependencies:** None.

**Out of scope:** KHÔNG sửa file nào trong X0. Chỉ đọc + state.

**Pre-Read Checklist (bắt buộc đọc đầy đủ, KHÔNG SKIP):**

- [ ] **Step 0.1** Đọc `critical.md` toàn bộ (~1600 lines). Note §5 kael-preflight, §12 kael-ai-boundary, §14 kael-supabase, §15 kael-security-sweep.
- [ ] **Step 0.2** Đọc `RULES.md` toàn bộ. Note Rule #6 service scope (electrical/plumbing/cleaning only), #8 no fake data, #9 PII rules, #10 timeout policy.
- [ ] **Step 0.3** Đọc `STRUCTURES.md` §9 (AI provider roles), §11 (backend modules + KaelPriceCheckModule), §12 (state machines), §15 (pricing + Kael final-price authority).
- [ ] **Step 0.4** Đọc `design.md` chỉ khi phase chạm UI (X4, X6).
- [ ] **Step 0.5** Đọc `AGENTS.md` (workspace operating loop).
- [ ] **Step 0.6** Đọc `CLAUDE.md` (lock notice + identity). Locked docs cấm edit trừ phi Tu explicit approve.
- [ ] **Step 0.7** Đọc Plan.md §22 (audit fix template), §23 (Kael harness), §26 (Codex gap fixing — format precedent), §27 (THIS PLAN).
- [ ] **Step 0.8** Đọc `docs/architecture/code-ownership-map.md` để map finding → owner files.
- [ ] **Step 0.9** Đọc `docs/agent-lessons.md` cho lessons từ session trước.
- [ ] **Step 0.10** Đọc `MEMORY.md` LAST (fresh session facts).

**Workspace Context Bootstrap:**

- [ ] **Step 0.11** Run `git status` + `git log --oneline -10` để confirm branch + uncommitted state.
- [ ] **Step 0.12** Run `git diff --name-only main...HEAD` để biết những file đã thay đổi trong session.
- [ ] **Step 0.13** Verify Supabase project context: `supabase projects list` hoặc check staging ref `xyylanuyflrjzbjzhqfl` + prod ref `iwevizmsedyqozxlawwl`.
- [ ] **Step 0.14** Verify Node + pnpm available (`node --version && pnpm --version`).
- [ ] **Step 0.15** Verify `.env.local` chỉ đến staging hoặc prod theo intent.

**State Preflight (per critical.md §5):**

```text
Asked task:
Real goal:
Task class:        bugfix / migration / ui / security / ai
Scope:             X1 hoặc X2 hoặc X3 (cụ thể phase)
Survival:          PASS — fix HIGH bugs đang block first transaction
Applicable rules:  RULES.md #6/#7/#8/#9 + STRUCTURES.md §9/§11/§12
Selected protocols: kael-preflight + [kael-ai-boundary | kael-supabase | ...]
Security/PII notes:
Verification plan: [tests + commands + acceptance gates]
```

**Skills/Protocols:** `kael-preflight` + `kael-clarify-with-docs` khi unclear.

**Acceptance Gate:**

- [ ] All 10 authority files read in order (1→11 of §27.0).
- [ ] Workspace bootstrap state captured.
- [ ] Preflight stated rõ task class + protocols.
- [ ] KHÔNG có file edit nào trong X0.

**Failure mode:** Skipping any pre-read step → forfeit context → mọi phase sau invalid → restart X0 từ đầu.

**Estimated Effort:** 60-90 phút (đầy đủ đọc + bootstrap).

---

### 27.4 Phase X1 — AI Boundary Enforcement (F-18, F-19, F-20, F-21)

**Goal:** Kael politely decline out-of-scope/off-topic/prompt-injection thay vì trả estimate (vi phạm RULES.md #6 + #8).

**Dependencies:** X0 complete.

**Scope:**

- Add `validateServiceScopeAlignment(message, service_type)` pre-pipeline check trong `advanceKaelChatEstimate`.
- Add prompt-injection sentinel detector (Ignore prior, system prompt, reveal env, sudo, jailbreak keywords).
- Add off-topic classifier: DeepSeek primary scope-check, escalate Anthropic. Trả `content_type=unsupported` thay vì pretend estimate.
- Return turn `content_type: "error"` + polite decline copy + skip downstream pipeline cost.
- Schema: extend `kael_chat_sessions.status` allow `unsupported` state (KHÔNG phải `active`).
- Update STRUCTURES.md §9 nếu provider role mapping cần điều chỉnh (Tu approve required).

**Owner files:**

- `supabase/functions/mobile-api/_shared/services.ts:advanceKaelChatEstimate`
- `supabase/functions/mobile-api/_shared/kael/permission-gate.ts` (extend)
- `supabase/functions/mobile-api/_shared/kael/output-pipeline.ts`
- `packages/shared/src/constants.ts` (scope validators)
- Migration: `2026XXXX_kael_chat_unsupported_status.sql`

**Skills:** `kael-ai-boundary` (primary), `kael-security-sweep`, `kael-tdd`.

**Tests required:**

- Unit (4 cases):
  - AC repair message + service_type=electrical → expect decline content_type=`error`
  - Recipe message + service_type=plumbing → expect decline
  - Prompt-injection message → expect decline (no estimate)
  - service_type=cleaning + electrical message → expect mismatch decline
- Integration: live POST /kael/chat 4 payloads → expect `next_action=unsupported`, no pipeline cost ($).
- Cost test: declined request cost ≤ $0.0001.

**Acceptance Gate:**

- [ ] 4 negative cases pass unit + integration.
- [ ] Cost per declined ≤ $0.0001.
- [ ] No `status=estimate_ready` cho out-of-scope.
- [ ] Polite Vietnamese decline copy + retry guidance.

**Estimated Effort:** 2-3 ngày.

---

### 27.5 Phase X2 — Idempotency + Rate Limit (F-04, F-23, F-11)

**Goal:** Chặn dup jobs, dup sessions, spam abuse.

**Dependencies:** X0 complete.

**Scope:**

- Add `client_request_id UUID NOT NULL` field cho `jobCreateSchema` + `kaelChatCreateSchema`.
- DB unique constraint `(customer_id, client_request_id, created_at_minute_floor)` 5-min TTL window.
- Mobile gen UUID v4 tại submit handler (booking-wizard + kael-chat).
- Per-user rate-limit middleware /kael/chat POST: max 5 sessions/minute, 20/hour (theo `AI_SESSION_LIMIT` pattern existing).
- Fix F-11: audit `confirm_kael_chat_atomic` RPC verify trả `ALREADY_CONFIRMED` code đúng → update RPC nếu không hit branch.

**Owner files:**

- `supabase/functions/mobile-api/_shared/domain.ts` (schema add `client_request_id`)
- `supabase/functions/mobile-api/_shared/services.ts:createJob` + `createKaelChat`
- `supabase/functions/mobile-api/_shared/rate-limit.ts` (extend existing helper)
- `supabase/migrations/2026XXXX_add_idempotency_keys.sql`
- `apps/mobile/lib/services.ts:jobService.createJob`
- `apps/mobile/components/customer/booking-wizard.tsx` (gen UUID)
- `apps/mobile/components/customer/kael-chat/kael-chat-surface.tsx`

**Skills:** `kael-supabase` (migration + RLS), `kael-architecture-deepening`, `kael-tdd`.

**Tests required:**

- Integration: 5x POST /jobs cùng `client_request_id` parallel → expect 1 job + 4× 409 hoặc 200 same id.
- Rate limit: 10 POST /kael/chat trong 60s → expect 5 OK + 5× 429 `RATE_LIMIT`.
- Idempotency confirm: double confirmKaelChat → 200 với current state (workflow đã chuyển sang broadcasting).

**Acceptance Gate:**

- [ ] 5x parallel POST cùng request_id → 1 job.
- [ ] 10x POST trong 60s → max 5 success.
- [ ] Double confirm Kael chat → 200 current state, không 409.

**Estimated Effort:** 2-3 ngày.

---

### 27.6 Phase X3 — Matching Unblock (F-09, F-14, F-08, F-10)

**Goal:** Customer confirm → broadcast tới worker đúng district (đang vỡ hoàn toàn trên prod).

**Dependencies:** X0 complete. **HARD GATE — Tu approve migration prod trước khi run.**

**Scope:**

- **X3.1** Migration normalize `worker_profiles.districts` prod data: UPDATE rows với label values về slug values. Dry-run staging + backup before apply.
- **X3.2** Fix `inferKaelChatDistrict` / `normalizeDistrict` parse substring district khỏi address có building prefix: split by `,` + try each piece + add NFD-stripped label match cho ASCII.
- **X3.3** Worker registration enforce slug input cho `districts` field (Zod schema reject label-form).
- **X3.4** (optional bonus) thêm geo fallback: nếu worker có home_lat/lng và customer district có centroid → distance match.

**Owner files:**

- `supabase/migrations/2026XXXX_normalize_worker_districts.sql`
- `supabase/functions/_shared/domain.ts:normalizeDistrict`
- `packages/shared/src/constants.ts:normalizeDistrict`
- `apps/mobile/components/customer/kael-chat/address-district.ts`
- `supabase/functions/mobile-api/_shared/domain.ts:workerRegisterSchema`
- `supabase/functions/mobile-api/_shared/match.ts` (broadcasting eligibility)

**Skills:** `kael-supabase` (primary, migration + RLS), `kael-tdd`, `kael-security-sweep` (no PII in migration logs).

**Tests required:**

- Migration dry-run trên staging trước.
- Unit: `normalizeDistrict("Vinhomes Central Park, Bình Thạnh")` → `binh_thanh`.
- Unit: `normalizeDistrict("Binh Thanh")` → `binh_thanh` (no diacritic).
- Unit: `normalizeDistrict("Quận Bình Thạnh, TP HCM")` → `binh_thanh`.
- Integration runtime: customer test account confirm Kael chat → worker `f78156b9-...` nhận broadcast.
- 10 address format variants (slug, label, ASCII, building+label, building+slug, multi-comma) đều parse đúng.

**Acceptance Gate:**

- [ ] Migration applied prod, no data loss (verify rowcount + sample 5 rows).
- [ ] Worker test account nhận broadcast khi customer district=`binh_thanh`.
- [ ] 10 address format variants pass parser.
- [ ] No regression worker matching trên staging.

**Estimated Effort:** 3-4 ngày.

---

### 27.7 Phase X4 — Frontend Backend-as-Truth (F-17)

**Goal:** Customer mobile resume active job sau refresh từ backend (vi phạm "backend là source of truth").

**Dependencies:** X3 complete (cần matching để verify end-to-end).

**Scope:**

- Thêm endpoint `GET /me/jobs?status=active` (filter `in.(broadcasting, awaiting_customer_confirm, ..., completed_by_worker)`).
- `frontend-workflow-provider.tsx`: thêm effect `useEffect(sessionUserId + role==='customer') → fetch active jobs → hydrate state.deal nếu có`.
- Polling interval (15s) khi state.deal có job đang broadcasting (currently có worker side polling, customer side thiếu).
- Realtime subscription option (Supabase realtime) — defer Phase 2.

**Owner files:**

- `supabase/functions/mobile-api/_shared/services.ts` (add `listCustomerActiveJobs`)
- `supabase/functions/mobile-api/_shared/router.ts` (route `me.jobs.active`)
- `apps/mobile/lib/services.ts` (jobService.listMyActive)
- `apps/mobile/lib/frontend-workflow-provider.tsx` (hydrate effect + polling)

**Skills:** `kael-architecture-deepening` (avoid useEffect chain pollution), `kael-tdd`.

**Tests required:**

- Integration: customer login → tạo job → close tab → reopen → GET `/me/jobs` returns active → UI hydrate.
- Unit: provider reducer test với hydrated job.
- E2E: refresh mid-broadcasting → UI hiển thị job + status đúng.

**Acceptance Gate:**

- [ ] Sau refresh, Home/History reflect active job từ backend.
- [ ] Polling stops khi phase=`reviewed` hoặc `cancelled`.
- [ ] No infinite useEffect loop.

**Estimated Effort:** 1-2 ngày.

---

### 27.8 Phase X5 — PII Hardening + Context Window (F-22, F-15)

**Goal:** KHÔNG persist raw PII; Kael nhận context multi-turn (giảm AI confusion).

**Dependencies:** X1 complete (AI gate phải done trước).

**Scope:**

- **X5.1** Apply `sanitizeForLLM` (hoặc tách `sanitizeForPersist`) trước khi INSERT vào `kael_chat_turns.text_content` — scrub phone, CCCD, full address.
- **X5.2** Migration: scrub historical rows một lần (one-time cleanup).
- **X5.3** Kael pipeline include previous 3-5 customer turns trong AI prompt (currently chỉ pass latest).
- **X5.4** Pipeline log telemetry để verify context window hit.

**Owner files:**

- `supabase/functions/mobile-api/_shared/kael/sanitizers.ts`
- `supabase/functions/mobile-api/_shared/services.ts:advanceKaelChatEstimate` (pass conversation history)
- `supabase/functions/mobile-api/_shared/kael/pipeline.ts`
- `supabase/migrations/2026XXXX_scrub_chat_turns_pii.sql`

**Skills:** `kael-security-sweep` (primary), `kael-ai-boundary`, `kael-supabase`.

**Tests required:**

- Unit: sanitize 10 PII variants (phone Vietnamese formats, CCCD 12-digit, address with số).
- Integration: insert turn với phone → DB row text_content KHÔNG có digit phone pattern.
- AI context: turn 1 = problem detailed, turn 5 = district → turn 6 estimate problem_summary chứa context turn 1 detail.

**Acceptance Gate:**

- [ ] grep DB rows `kael_chat_turns.text_content` không có 09xx... hoặc 12-digit CCCD.
- [ ] Multi-turn test: AI knows previous customer messages.
- [ ] Historical scrub migration applied prod.

**Estimated Effort:** 2-3 ngày.

---

### 27.9 Phase X6 — UI Polish (F-16)

**Goal:** History "Xong" tab chỉ show jobs với `workflow.isDone === true`.

**Dependencies:** X4 complete.

**Scope:**

- Replace filter logic dùng `selectors.currentStatus` bằng `workflow.isDone`.
- Add unit tests cho filter.

**Owner files:**

- `apps/mobile/components/customer/customer-surfaces.tsx` (CustomerHistorySurface filter)

**Skills:** `kael-ui-rn-execution`, `kael-tdd`.

**Tests required:**

- Unit: history filter với 5 status fixtures.

**Acceptance Gate:**

- [ ] Active broadcasting deal KHÔNG hiển thị trong Xong tab.

**Estimated Effort:** 0.5-1 ngày.

---

### 27.10 Phase X7 — E2E Regression + Sign-off

**Goal:** Full happy path + 9 adversarial cases pass runtime trước Tu approve ship.

**Dependencies:** X1-X6 all done.

**Scope:**

- Run Maestro E2E (theo QA report Section 4 proposal) trên staging.
- Manual regression checklist (login → Kael → estimate → confirm → worker broadcast → accept → status update → completion → review).
- Re-verify mọi F-XX không tái xuất hiện.
- Final security sweep.

**Skills:** `kael-review` (primary), `kael-security-sweep`, `kael-handoff`.

**Acceptance Gate:**

- [ ] 9 Maestro flows pass.
- [ ] Cost per happy path ≤ $0.002.
- [ ] Zero workflow-violation finding mới.
- [ ] Tu sign-off explicit.

**Estimated Effort:** 2-3 ngày.

---

### 27.11 Effort Summary

| Phase | Days | Critical? | Parallel? |
|---|---|---|---|
| X0 | 0.05-0.1 | YES | NO |
| X1 | 2-3 | YES | parallel X2, X3 |
| X2 | 2-3 | YES | parallel X1, X3 |
| X3 | 3-4 | YES (HARD GATE Tu) | parallel X1, X2 |
| X4 | 1-2 | YES | sau X3 |
| X5 | 2-3 | NO (med) | sau X1 |
| X6 | 0.5-1 | NO (low) | sau X4 |
| X7 | 2-3 | YES | NO (after all) |
| **Total** | **14-20 sequential** | | **9-13 parallel** |

---

### 27.12 Decision Log Template (fill khi execute)

```text
DL-X0: agent confirmed pre-read 10/10 docs + workspace bootstrap stated
DL-X1: Tu approve AI scope decline policy + reject behavior copy
DL-X2: Tu approve client_request_id schema + rate limit thresholds (5/min, 20/hr)
DL-X3: Tu approve migration normalize worker districts production (HARD GATE)
DL-X4: Tu approve customer-side polling interval + hydrate strategy
DL-X5: Tu approve PII scrub policy (scrub before persist; historical cleanup yes/no)
DL-X6: Tu approve filter switch isDone
DL-X7: Tu sign-off ship
```

---

### 27.13 Risks + Mitigation

| Risk | Mitigation |
|---|---|
| Migration F-09 prod data loss | dry-run staging + table backup before apply |
| Rate limit too strict → user complain | start permissive (5/min) + monitor + tune |
| AI gate too aggressive → reject real customers | test 10 valid-but-edge cases + soften thresholds |
| Hydrate effect cause infinite loop | dependency-array carefully + selectors memoized |
| Sanitize over-aggressive → strip "đèn" nhầm | regex-based với named groups + unit test fixtures |
| Phase X3 migration timing prod | run trong off-peak window + announcement |

---

### 27.14 Skills Mapping Summary

| Phase | Primary skill | Supporting |
|---|---|---|
| X0 | `kael-preflight` | `kael-clarify-with-docs` |
| X1 | `kael-ai-boundary` | `kael-tdd`, `kael-security-sweep` |
| X2 | `kael-supabase`, `kael-architecture-deepening` | `kael-tdd` |
| X3 | `kael-supabase` | `kael-diagnose`, `kael-security-sweep` |
| X4 | `kael-architecture-deepening` | `kael-tdd`, `kael-ui-rn-execution` |
| X5 | `kael-security-sweep` | `kael-ai-boundary`, `kael-supabase` |
| X6 | `kael-ui-rn-execution` | `kael-tdd` |
| X7 | `kael-review` | `kael-handoff`, `kael-security-sweep` |

---

### 27.15 Change Log

```text
v0.1 — 2026-05-28 — initial draft từ QA audit toàn diện (Expo Web + Supabase MCP runtime)
v0.2 — 2026-05-28 — Tu approve với điều kiện X0 robust hơn (đọc 11 docs + workspace bootstrap + state preflight format) → committed
v0.3 — 2026-05-28 — Deep audit PR #45 Orchestration UI/UX. Thêm 4 finding mới (F-25 LOW, F-26/F-27/F-28 HIGH). Phase X4 mở rộng để cover F-28 worker hydrate.
v0.4 — 2026-05-28 — Deep audit Worker side 5 tabs runtime. Thêm 2 finding mới (F-29 MEDIUM, F-30 HIGH). F-28 downgraded to intermittent (chỉ fail sau customer→worker session switch, fresh reload OK).
v0.5 — 2026-05-28 — Worker direct API deep audit (mutation endpoints + register schema + kael-memory + auth boundary). Thêm 2 finding mới (F-31 INFO field naming mismatch, F-32 MEDIUM kael-memory endpoints undeployed). Verified Phase 2.0 final-price runtime block, JWT/role boundary correct.
```

---

### 27.16 Deep Audit Addendum — PR #45 Orchestration UI/UX (2026-05-28 v0.3)

**Trigger:** Tu yêu cầu audit deep UI/UX PR #45 commit 411ca74 "add workflow orchestration layer". Audit không-bias dùng Expo Web preview + login real test users + Supabase MCP DB queries.

**Methodology:**
- Identify PR #45 scope: 35 files changed (4 shared workflow contracts mới, 1 mobile hook, 7 mobile UI files, 5 Edge files, 4 docs, 6 test files).
- Runtime test mỗi component PR build với screenshot + DOM eval + network trace + DB query.
- Không report nếu không quan sát được; mỗi finding kèm exact evidence ref.

**PR #45 contract verification (PASS):**

- ✅ `agentic-parts.tsx` `processStepCount(ticketMode)`: basic/partial → 1, loading → 2, else → 3. UI verified runtime với screenshot Kael chat session `d04aa942`: 3 steps "01 Đọc / 02 Hỏi / 03 Chờ" hiển thị khi phase `kael_explaining`/`ticket_review`.
- ✅ `kael-chat-surface.tsx` `useServiceWorkflow` wiring: `chatWorkflowStatus` ánh xạ session.status → JobStatus → workflow phase; `showProcess/showTrace/showBrief/showEstimate/canConfirmEstimate` đều phase-gated correct.
- ✅ `customer-surfaces.tsx` History tabs Sửa/Giá/Chat/Xong: 4 tab phase-gated runtime verified:
  - Tab Sửa: hiện "Chưa có thợ nhận" pill + timeline phases khi job broadcasting.
  - Tab Giá: "Không cam kết giá" pill + "Cần xác nhận" honest empty khi không có deal.
  - Tab Chat: "Chưa có trao đổi cho yêu cầu này" + "Luồng chat mở sau khi có phiếu thật" honest empty.
  - Tab Xong: "Chờ thợ hoàn tất" + explicit "Chi tiết hoàn tất chỉ hiện sau khi hệ thống xác nhận đúng bước" khi phase chưa `done`. **KHÔNG có Done badge premature**.
- ✅ `frontend-workflow-provider.tsx` reducer: hydrate from backend job detail OK; cancel idempotent; refresh polling 15s khi status active.
- ✅ Backend `workflow-orchestrator.ts` `validateWorkflowTransition`: 4 out-of-order case + 1 idempotency case reject đúng (8 case test pass).
- ✅ AI artifact schema `artifact-contract.ts`: `kaelArtifactProposalSchema` strict + `may_transition: literal(false)` + `FORBIDDEN_WORKFLOW_KEYS` block status/phase keys runtime.
- ✅ Theme switch Sáng/Tối: dark mode applied throughout Profile screen, all surfaces respect token.
- ✅ Language switch VI↔EN: full page re-render correct.

**Deep audit FAIL — 4 finding mới:**

| ID | Severity | Title | Evidence runtime |
|---|---|---|---|
| **F-25** | LOW | Bottom tab "Đặt" require 2 clicks lần đầu, first tap silent | Confirmed runtime: 1st click `[role="tab"][aria-label="Đặt dịch vụ"]` không navigate; 2nd click navigate /booking. Có thể Expo Web specific (full bundle reload trigger). |
| **F-26** | **HIGH UX** | Click service tile từ booking surface KHÔNG advance step, route về Home | Runtime: click `customer-shell-service-electrical` trên booking surface → chip update "Dịch vụ: Sửa điện" + URL changed back to `/home` + surface = `customer-home-surface`. BookingWizard interactive A2-A7 không reachable trên Expo Web preview. |
| **F-27** | **HIGH UX** | Sign out: localStorage clear + URL=/login NHƯNG UI stuck showing protected content | Runtime: click `[data-testid="customer-profile-sign-out"]` → localStorage cleared (verified eval) + URL=/login (verified eval) NHƯNG screenshot vẫn show customer Profile content. Phải `location.reload()` mới về role picker. AuthProvider không re-mount khi storage clear. |
| **F-28** | **HIGH** | Worker login KHÔNG fetch `/workers/me`; UI stuck "Chờ duyệt" + service cards "Chờ duyệt" dù backend approved | Runtime network log: 57 calls `/rest/v1/profiles?select=role&id=eq.f78156b9-...` (worker UUID), 0 calls `/functions/v1/mobile-api/workers/me`. UI render `worker-home-surface` với "Chờ duyệt" / "Bật nhận việc" toggle disabled. Backend curl verified `verification_status=approved, is_approved=true, is_available=true`. `workerRefresh` useEffect dependency hoặc role propagation issue prevent fetch. |

**Phase X4 scope mở rộng** để cover F-28 worker side hydrate (cùng pattern với F-17 customer side):

- X4 thêm `workerRefresh` effect trigger reliability: dependency-array fix + force initial fetch khi `sessionUserId && role==='worker'`.
- X4 cũng thêm test integration: post-login worker → GET /workers/me OK + UI render "Sẵn sàng nhận việc" với approved status.

**F-27 sign out** thêm vào X4 scope hoặc X6 polish:

- AuthProvider effect: subscribe to localStorage storage event hoặc explicit unmount surface khi signOut() called.
- Hoặc khi /login route active mà session.user vẫn cached → force re-evaluate.

**F-26 booking flow** propose handle ở X6 polish + needs Expo Web specific testing:

- Verify root cause là Expo Web double-mount stacking hay logic redirect.
- Possibly tab Đặt + Kael chat tab cùng dùng workflow_provider, click service tile từ Đặt push booking?serviceType=X nhưng activeDealRoute auto-redirect.
- Test trên native iOS simulator để loại trừ Expo Web specific bug.

**F-25 tab double-click**: rất khả năng Expo Web bundle reload artifact. Mark là Expo Web specific; not blocker for ship.

**Updated finding inventory (17 total):**

```
HIGH (10): F-04 dup, F-09 worker district prod, F-14 parser, F-17 customer refresh, F-18..21 AI scope (4),
           F-23 rate limit, F-26 booking route, F-27 sign out, F-28 worker hydrate
MEDIUM (4): F-08 normalize, F-10 worker geo, F-15 AI context, F-22 PII
LOW (3): F-11 idempotency, F-16 history filter, F-25 tab double-click
```

**Adjusted effort estimate:**

- Phase X4 effort 1-2 ngày → 2-3 ngày (thêm worker hydrate + sign out fix)
- Total sequential 14-20 → 16-22 ngày
- Total parallel 9-13 → 10-14 ngày

**Decision Log Addendum:**

```text
DL-X4.bis: Tu approve mở rộng X4 cover F-27 sign out + F-28 worker hydrate
DL-X6.bis: Tu approve F-26 booking route fix nằm trong X6 polish + may require native verification
DL-F25: defer (Expo Web specific, not blocker)
```

**Evidence Artifacts Deep Audit:**

- 50+ UI screenshots (light + dark mode + 4 history tabs + booking + worker home)
- Network trace logs (worker login session: 57 profile queries + 0 workers API calls — pattern confirmed F-28)
- DOM eval state snapshots (auth keys + surface testIDs + URL)
- ScopeChangeHardStopModal code review (Phase 2.0 Kael final-price authority badge verified contract-level; runtime test blocked by F-09 matching gap)

**Skill mapping additions:**

- X4 cần thêm `kael-architecture-deepening` cho effect dependency design (workerRefresh + customer hydrate).
- X6 cần `kael-ui-rn-execution` cho native verification F-26.

---

### 27.17 Worker Side Deep Audit Addendum (2026-05-28 v0.4)

**Trigger:** Tu yêu cầu audit worker section sâu hơn vì §27.16 chỉ test 1 screen (Worker Home) rồi BLOCKED bởi F-28. Audit complete 5 tabs + availability toggle + direct API verification.

**Methodology:** Fresh reload + clear localStorage + login worker → test mọi tab + sub-tab + toggle + direct API curl + DB cross-check.

**F-28 reproducibility update (intermittent):** Fresh reload + clear localStorage → worker login succeeded VÀ workerRefresh fired correctly (UI hydrate "Đã duyệt" + districts + service_radius_km + toggle ON). F-28 chỉ fail khi customer→worker session switch không full reload. Downgrade F-28 từ "HIGH stuck forever" → "HIGH intermittent (cần clear session)".

**Worker tab Nhà (Home) — PASS hydrate:**
- "Sẵn sàng nhận việc" + pill "Đã duyệt"
- Map illustration "Bạn: Bình Thạnh" + "Khu vực nhận việc: 8 km"
- Card "Đang nhận việc" + toggle ON + buttons "Tắt nhận việc" / "Chờ nhận"
- 3 service cards "Sửa điện / Sửa nước / Vệ sinh - Kỹ năng"
- "Chờ nhận", "Đã duyệt" cards visible

**Worker tab Việc (Jobs) — PASS phase-gated:**
- Sub-tabs: Chờ nhận | Đang làm | Cần xử lý (3 segments)
- "Đang làm" default: "Chưa nhận việc" + "Việc đã nhận và Phòng việc sẽ hiện tại đây."
- "Chờ nhận" sub-tab: "Chưa có yêu cầu mới" + "Yêu cầu mới sẽ hiện ở mục Chờ nhận."
- "Cần xử lý" sub-tab: "Phạm vi: Không có mục chặn" + "Ảnh nghiệm thu: Ghi chú và ảnh nghiệm thu sẽ hiện ở đây khi việc tới bước hoàn tất."
- ✓ All phase-gated honest empty

**Worker tab Nhắn (Chat) — F-29 finding:**

| Finding | Severity | Evidence |
|---|---|---|
| **F-29** | MEDIUM UX | Worker tab Nhắn empty hoàn toàn TRỐNG, KHÔNG có Vietnamese empty state copy. Customer Chat tab có "Chưa có trao đổi cho yêu cầu này" + "Luồng chat mở sau khi có phiếu thật". Worker missing UX guidance. |

**Worker tab Tiền (Earnings) — F-30 finding (HIGH):**

| Finding | Severity | Evidence |
|---|---|---|
| **F-30** | **HIGH FAKE DATA** | Worker tab Tiền hiển thị bar chart 7 cột (T2-T7+CN) với chiều cao biến thiên dù backend `total_jobs_paid=0, gross_earnings=0, net_earnings=0` (verified via curl GET /workers/me/earnings). Cards "Hôm nay/Tháng này: Chờ dữ liệu - Khi có đối soát" honest empty NHƯNG bar chart contradicts. **Vi phạm RULES.md #8**: "Forbidden: Fabricating worker info, ratings, queue counts, earnings, prices... fake counts, fake payouts". |

**Worker tab Hồ sơ — PASS hydrate (F-09 confirmed runtime):**
- Card "Hồ sơ thợ - Trạng thái và kỹ năng dịch vụ" + pill "Đã duyệt"
- "Xác minh danh tính: Đã duyệt"
- "Kỹ năng dịch vụ: Sửa điện · Sửa nước · Vệ ..."
- "Khu vực làm việc: **Bình Thạnh · Quận 1 · Th...**" ← **F-09 visual confirmed runtime UI**: districts hiển thị display labels có khoảng trắng, không phải slug `binh_thanh, q1, q2`.
- "Giao diện: Sáng", "Ngôn ngữ: Tiếng Việt"
- Đăng xuất button

**Worker availability toggle — PASS end-to-end:**
- Click `worker-availability-primary-action` → backend PATCH `/workers/me/availability` → response `{"worker_id":"f78156b9-...","is_available":true,"updated_at":"2026-05-28T12:10:22+00:00"}`
- UI sync immediate: pill changed "Đã duyệt" → "Tạm tắt", toggle OFF, button "Bật nhận việc" active
- Direct API verification: GET /workers/me confirms `is_available:false` after toggle off → reload confirms

**Worker direct API verification (curl direct):**

| Endpoint | Response | Pass? |
|---|---|---|
| GET /workers/me | 200 + full profile + `districts=["Binh Thanh","Quan 1","Quan 2"]` | PASS but F-09 visible |
| GET /workers/me/broadcasts | 200 + `{"broadcasts":[]}` | PASS empty (F-09 matching blocks) |
| GET /workers/me/jobs | 200 + `{"jobs":[]}` | PASS empty |
| GET /workers/me/earnings | 200 + all zero values | PASS data but contradicts F-30 UI bar chart |
| PATCH /workers/me/availability | 200 + `is_available=true` | PASS toggle works |

**Updated finding inventory (19 total):**

```
HIGH (12): F-04, F-09, F-14, F-17, F-18..21 (4), F-23, F-26, F-27, F-28 (intermittent), F-30
MEDIUM (5): F-08, F-10, F-15, F-22, F-29
LOW (3): F-11, F-16, F-25
```

**Adjusted Phase X impact:**

- Phase **X4** (Frontend Backend-as-Truth): cần thêm fix F-28 trigger reliability (force initial workerRefresh khi role propagation lag).
- Phase **X6** (UI Polish) extend với:
  - F-29: thêm Vietnamese empty state copy cho Worker tab Nhắn.
  - F-30 (HIGH): **REMOVE bar chart fake heights** khi `total_jobs_paid=0`. Replace bằng honest empty illustration hoặc dim chart with "Chưa có dữ liệu" overlay.

**X6 effort `0.5-1 ngày` → `1.5-2 ngày` (thêm 2 finding mới).**

**Total updated:** 16-22 sequential → **17-23 ngày sequential**, 10-14 parallel → **11-15 parallel**.

**Decision Log Addendum v0.4:**

```text
DL-X6.tris: Tu approve fix F-29 Worker Nhắn empty copy + F-30 Worker Earnings bar chart fake removal
DL-F28: confirmed intermittent — fix workerRefresh dependency-array trong X4
DL-F09-visual: confirmed runtime UI hiển thị label format — sẽ tự fix sau X3 migration normalize
```

**Anti-bias compliance v0.4:**
- 14 screenshots Worker UI deep audit (Home, Việc 3 sub-tabs, Nhắn empty, Tiền chart, Hồ sơ).
- Direct curl API verification 5 endpoints cross-check UI claims.
- F-28 intermittent classification dựa trên SECOND test attempt với fresh state → KHÔNG report stuck forever khi thực ra fresh reload thì hydrate OK.
- F-30 fake data verified bằng cách backend earnings=0 + UI chart varying — concrete contradiction, không speculation.
- F-29 verified bằng compare runtime: Customer Chat empty có copy, Worker Nhắn empty không có copy.

---

### 27.18 Worker Deep Audit v2 — Endpoint shape + Schema + Auth boundary (2026-05-28 v0.5)

**Trigger:** Tu yêu cầu audit Worker thêm một lần nữa thật deep. Đợt này focus vào direct API mutation endpoint shape validation, schema integrity, auth boundary, F-09 root cause analysis.

**Methodology:** 13 direct curl requests testing endpoint contract + 1 code review schema. KHÔNG seed database (theo QA charter "Do NOT change database data except through normal user/test actions unless explicitly instructed").

**Direct API endpoint shape verification (7 tests):**

| Test | Endpoint + Payload | Actual | Status |
|---|---|---|---|
| W-EP-1 | POST /jobs/00000.../accept | `{"code":"NOT_FOUND","error":"Yêu cầu này không dành cho bạn"}` HTTP 404 | PASS no info leak |
| W-EP-2 | POST /jobs/00000.../decline | Same | PASS |
| W-EP-3 | PATCH /jobs/.../status `{"status":"invented"}` | `{"code":"VALIDATION","error":"Dữ liệu không hợp lệ"}` HTTP 400 | PASS enum strict |
| W-EP-4 | PATCH /jobs/.../status với `final_price:999999` | `{"code":"VALIDATION","error":"Giá cuối do Kael xác định, thợ không được nhập"}` HTTP 400 | **PASS Phase 2.0 STRUCTURES §15 runtime block** |
| W-EP-5 | POST /jobs/.../scope-change wrong field name | VALIDATION 400 | PASS schema strict |
| W-EP-6 | POST /jobs/.../worker-cancellation customer field | VALIDATION 400 | PASS schema separated |
| W-EP-7 | POST /jobs/.../scope-change với `price_min/price_max` | VALIDATION 400 | PASS Phase 2.0 reject worker price |

**Worker register schema validation (5 tests):**

| Test | Payload | Result |
|---|---|---|
| W-REG-1 | Label districts (no CCCD URLs) | 400 VALIDATION |
| W-REG-2 | Invalid date_of_birth "not-a-date" | 400 VALIDATION |
| W-REG-3 | Empty districts array | 400 VALIDATION (min 1) |
| W-REG-4 | Future date_of_birth "2099-01-01" | 400 VALIDATION |
| W-REG-FULL-LABEL | Full valid + label districts | 409 ALREADY_FINALIZED (worker approved) |
| W-REG-FULL-SLUG | Full valid + slug districts | 409 ALREADY_FINALIZED |

**F-09 root cause confirmed via code review:**

```ts
// supabase/functions/_shared/domain.ts:308
districts: z.array(z.string().min(1).max(50)).min(1).max(20)
```

→ Schema accepts ANY string 1-50 chars cho `districts`. **KHÔNG enforce slug format**. Admin path or initial registration có thể submit either ["Bình Thạnh"] (label) hoặc ["binh_thanh"] (slug) — backend stores as-is. Đây là root cause F-09: schema thiếu validation.

**Auth + Role boundary verification (3 tests):**

| Test | Result |
|---|---|
| W-EXPIRED-JWT | Fake/expired JWT → 401 `{"code":"AUTH_MISSING","error":"Phiên đăng nhập hết hạn"}` |
| W-WRONG-ROLE | Customer JWT → /workers/me → 403 `{"code":"AUTH_FORBIDDEN","error":"Bạn không có quyền thực hiện hành động này"}` |
| W-PUSH | POST /notifications/device-token với fake token → 400 VALIDATION |

**Kael memory endpoint tests (3 tests):**

| Endpoint | Result | Severity |
|---|---|---|
| GET /me/kael-memory | **404 NOT_FOUND** | F-32 |
| DELETE /me/kael-memory | **404 NOT_FOUND** | F-32 |
| GET /workers/me/kael-memory | **404 NOT_FOUND** | F-32 |

**New findings v0.5:**

| ID | Severity | Title | Evidence |
|---|---|---|---|
| **F-31** | INFO | workerScopeChangeSchema field naming inconsistency | Request body field: `new_description` (line 328); Response body field: `requested_description` (router.ts JobDetailResponse). Possible mobile-api ↔ schema mismatch nếu mobile gửi `requested_description` từ frontend (cần verify code). |
| **F-32** | **MEDIUM** | Kael memory endpoints `404 NOT_FOUND` trên production | Router.ts defines `me.kaelMemory` GET/DELETE + `workers.kaelMemory` GET. Production trả 404 với mọi 3 paths. Customers/workers KHÔNG thể view hoặc delete Kael memory → privacy/GDPR-like concern (kết hợp F-22 lưu raw PII trong DB). Possible deployment lag với F-11 same root cause. |

**Verified PASS (10 contracts):**

1. ✅ Workflow transition shape: 404 cho non-existent job KHÔNG leak existence info
2. ✅ Status enum strict (reject "invented_status")
3. ✅ **Phase 2.0 STRUCTURES §15 final-price authority** — runtime block với explicit Vietnamese error
4. ✅ Phase 2.0 scope change reject worker-typed price_min/price_max
5. ✅ Worker register schema strict (CCCD URLs required, real date, min/max constraints)
6. ✅ Worker already-approved 409 ALREADY_FINALIZED idempotent
7. ✅ Expired JWT 401 + Vietnamese message
8. ✅ Cross-role 403 AUTH_FORBIDDEN
9. ✅ Push token schema validation
10. ✅ Worker schema distinct from customer cancellation schema (different field names)

**Anti-bias compliance v0.5:**

- KHÔNG seed database (theo QA charter strict instruction).
- Mọi finding kèm exact response body + HTTP code evidence.
- F-09 root cause traced từ runtime → schema code review để confirm.
- F-32 verified 3 paths khác nhau cùng 404 → consistent deployment gap.
- F-31 marked INFO vì cần verify mobile-side gửi field nào trước classify severity.

**Updated finding inventory (21 total):**

```
HIGH (12): F-04, F-09, F-14, F-17, F-18..21, F-23, F-26, F-27, F-28 (intermittent), F-30
MEDIUM (6): F-08, F-10, F-15, F-22, F-29, F-32
LOW (3): F-11, F-16, F-25
INFO (1): F-31 (field naming, requires mobile-side verification)
```

**Updated Phase impact v0.5:**

- **X3** (Matching Unblock): include **schema fix** cho `workerRegisterSchema.districts` — replace `z.array(z.string().min(1).max(50))` bằng `z.array(districtSlugSchema)`. Defense in depth — F-09 fix bao gồm both data migration + schema validation.
- **X2** (Idempotency + Rate Limit): include **F-32 deployment audit** — verify all router.ts routes deployed; kael-memory missing indicates deployment process incomplete.

**Decision Log Addendum v0.5:**

```text
DL-X3.quad: Tu approve adding districtSlugSchema to workerRegisterSchema.districts validation
DL-X2.quad: Tu approve audit kael-memory + scope-change ALREADY_CONFIRMED deployment gaps
DL-F31: defer pending mobile-side field name verification
```

**STILL UNTESTED runtime** (BLOCKED F-09 + worker.districts label data):

- Worker accept broadcast B3 → arrived/inspecting/repairing B5
- Worker scope change B6 with valid job
- Worker completion B7 với completion notes + photos
- Customer joint A11 scope hard-stop modal trigger
- A12 completion confirmation
- A14 review submission

**Recommend** Tu approve seed test broadcast OR temporary UPDATE worker.districts về slug để mở khóa runtime test 6 flows above. Theo QA charter, cần Tu explicit instruction trước khi modify DB.

---

## 28. AI Governance Upgrade — Discipline / Consistency / Focus — 2026-05-29

### 28.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-governance-upgrade-20260529
Created:        2026-05-29
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         APPROVED 2026-05-29 — Tu duyệt 5 mục + cấp quyền edit locked docs cho session upgrade này
Trigger:        Deep-dive anthropics/claude-plugins-official (frontend-design + claude-md-management)
                → đối chiếu craft skill chính chủ vs governance stack hiện tại
Scope:          5 cải tiến (G1-G5) giúp Claude Code + Codex build có discipline/consistency/focus
Out of scope:   Đổi nội dung hard-rules RULES.md, workflow STRUCTURES.md, design contract; cài plugin ngoài
Effort:         ~2-3 ngày agent (thao tác doc/skill; không có runtime test → verify bằng structural evidence)
Phase count:    7 (G0 pre-read/baseline + G1-G5 build + G6 verify/sign-off)
Skill mapping:  kael-preflight, kael-docs-execution, kael-architecture-deepening, kael-review
Locked override: Tu approved 2026-05-29 — G1/G3/G4 được sửa critical.md, RULES.md, CLAUDE.md
```

**Vấn đề (5 gap từ deep-dive 3 repo official):**

1. Stack dựa vào "agent tự nhớ đọc" critical.md mỗi task, không auto-trigger như skill chính chủ (description-based) → **consistency** rủi ro.
2. critical.md = monolith 1660 dòng nạp full mỗi session (gồm protocol hiếm dùng) → tốn context, hại **focus**.
3. Lifecycle/runtime/scope lặp gần nguyên văn nhiều doc (baseline: "bounded slice" 4 file, runtime block 3 file, scope ~7 doc) → sửa 1 chỗ drift chỗ khác (hại **consistency**).
4. Không có vòng audit phát hiện doc drift khỏi code → hại **effectiveness**.
5. AGENTS.md (Codex entry) thiếu gates/forbidden/protocol-index → Codex kỷ luật yếu hơn Claude Code (hại **consistency** cross-agent).

**Craft lessons áp dụng (Anthropic official):** `description` = cơ chế auto-trigger; progressive disclosure (SKILL ngắn + `references/` nạp khi cần); rubric chấm điểm để đo được; behavioral vs procedural chọn đúng loại.

⚠️ **Anti-pattern phải tránh:** KHÔNG bê `frontend-design` ("never converge, mỗi lần một aesthetic") vào app — ngược với brand consistency của Home Services. design.md enforce ONE system là đúng.

### 28.0.1 Authority refs (đọc theo thứ tự)

```
1. critical.md (§0 activation, §3 gates, §20 docs-execution, §24 forbidden, §25 checklist)
2. RULES.md (#0 runtime, #5 VN-first, #6 scope — engineering doc giữ English)
3. AGENTS.md (Codex entry — đối tượng G4)
4. CLAUDE.md (lock notice — G1/G3 override approved 2026-05-29)
5. skills.md + .agents/skills/karpathy-guidelines/SKILL.md (lifecycle source — đối tượng G3)
6. Plan.md §28 (this plan)
7. MEMORY.md (last)
```

### 28.0.2 Decision Log

- **D1** critical.md split: Tu approved 2026-05-29 (locked-doc edit authorized cho session này, ghi rõ phạm vi G1/G3/G4).
- **D2** Group protocols **theo task-class (8 file)** thay vì 1-file-mỗi-protocol (19 file) → cân bằng progressive disclosure vs file sprawl.
- **D3** `kael-preflight` + `kael-review` **giữ trong core** (dùng mọi task → defer không tiết kiệm gì).
- **D4** Skills **dual-location**: `.claude/skills/` (Claude Code auto-discover — bằng chứng: `supabase` skill hiện trong session list; `karpathy` ở `.agents/` KHÔNG hiện) + `.agents/skills/` (Codex). Single source = `protocols/`.
- **D5** G5 = **build skill nội bộ `kael-doc-audit`** (tailored cho stack có locked docs) thay vì cài plugin `claude-md-management` ngoài → kiểm soát + không thêm dependency.
- **D6** File protocol/skill mới = **technical English** (per RULES.md #5: engineering artifact English-first). Plan.md song ngữ như hiện hành.
- **D7** Thư mục mới: `protocols/` ở repo root (cùng cấp critical.md, đúng vai "execution contract extension").

### 28.1 Phase G0 — Pre-read + Baseline Snapshot ⚠️ NEVER SKIP

- **Goal:** Có ngữ cảnh authority + baseline số liệu để G6 đo hiệu quả.
- **Scope:** Đọc CLAUDE.md/critical.md/RULES.md/AGENTS.md/skills.md/karpathy; chụp baseline. KHÔNG edit.
- **Baseline (2026-05-29):** critical.md=1660, AGENTS.md=179, RULES.md=275, skills.md=257, CLAUDE.md=149 dòng. Dup: "bounded slice"=4 file, runtime block=3 file, "electrical repair"=7 doc governance (+ code refs hợp lệ).
- **Acceptance:** Authority đọc xong; baseline ghi nhận; không file edit.
- **Status:** ✅ DONE.

### 28.2 Phase G1 — Split critical.md → lean core + protocols/*.md

- **Goal:** Giảm always-loaded context; protocol nạp theo task-class.
- **Dependencies:** G0.
- **Scope:** Giữ trong **core critical.md**: intro+lock, §0 activation (cập nhật: "load protocol file đã chọn từ §1"), authority/conflict/protocol-load, pre-edit status, §1 index (trỏ file `protocols/`), §2 classification, §3 gates, §4 survival/scope/runtime, **kael-preflight (§5)**, **kael-review (§8)**, §24 forbidden, §25 checklist. Di chuyển nội dung nguyên văn sang:
  - `protocols/diagnose.md` (kael-diagnose)
  - `protocols/tdd.md` (kael-tdd)
  - `protocols/architecture.md` (architecture-deepening, code-enhancement, zoom-out)
  - `protocols/ai-data-security.md` (ai-boundary, supabase, security-sweep)
  - `protocols/ui.md` (ui-rn-execution)
  - `protocols/prototype-clarify.md` (prototype, clarify-with-docs)
  - `protocols/docs-workflow.md` (to-prd, issue-slicing, triage, docs-execution, handoff, compact-communication)
  - `protocols/dormant.md` (8 dormant §23)
- **Owner files:** `critical.md` (locked, approved), `protocols/*.md` (mới).
- **Skills:** kael-architecture-deepening (deletion test cho cấu trúc), kael-docs-execution.
- **Verify:** core ≤ ~750 dòng; mọi protocol cũ tồn tại đúng 1 nơi (grep tên không mất); §1 index link khớp file; nội dung protocol byte-giống bản cũ (di chuyển, không viết lại).
- **Acceptance:** core mỏng hẳn; 8 file protocols tạo; không protocol nào biến mất; cross-ref sống.
- **Effort:** ~1 ngày.

### 28.3 Phase G2 — 5 auto-trigger skills (.claude + .agents)

- **Goal:** Protocol hay dùng tự kích hoạt theo context, không phụ thuộc "agent nhớ".
- **Dependencies:** G1 (protocols tồn tại).
- **Scope:** Skill cho **kael-diagnose, kael-tdd, kael-ai-boundary, kael-supabase, kael-security-sweep**. Mỗi skill = wrapper mỏng: `description` (trigger sắc), output format inline, trỏ `protocols/*.md`. Đặt `.claude/skills/<name>/SKILL.md` + `.agents/skills/<name>/SKILL.md`. Reconcile: `.claude/commands/{review,security-audit,pre-flight,scope-check}` trỏ cùng protocol (tránh copy thứ 3).
- **Skills:** kael-docs-execution.
- **Verify:** skill hiện trong session skill list (Claude Code); `description` chứa trigger điều kiện; wrapper không lặp thân protocol.
- **Acceptance:** 5 skill × 2 location; auto-discoverable; single-source giữ ở protocols.
- **Effort:** ~0.5 ngày.

### 28.4 Phase G3 — Single-source dedup (lifecycle / runtime / scope)

- **Goal:** Mỗi khái niệm 1 nguồn chuẩn, chỗ khác link → hết drift.
- **Dependencies:** G1.
- **Scope:** Canonical: lifecycle Define→Ship → **critical.md §0**; runtime boundary → **RULES.md #0**; service scope → **RULES.md #6**. CLAUDE.md/AGENTS.md/skills.md/karpathy đổi bản restate dài thành tóm tắt 1 dòng + link canonical. Giữ code refs scope (chúng enforce, không phải prose).
- **Owner files:** CLAUDE.md (locked, approved), AGENTS.md, skills.md, karpathy SKILL.md.
- **Verify:** "bounded slice" full-block còn 1 nơi + link; runtime block còn 1; ý nghĩa không mất.
- **Acceptance:** dup giảm về 1 canonical mỗi khái niệm; link sống.
- **Effort:** ~0.5 ngày.

### 28.5 Phase G4 — AGENTS.md gate parity cho Codex

- **Goal:** Codex chạy cùng gates với Claude Code.
- **Dependencies:** G3 (biết canonical để link, không restate).
- **Scope:** Thêm vào AGENTS.md: pointer "trước khi sửa code, load critical.md core + protocol theo §1 index" + tóm tắt gates (No False Completion, Required Final Response, Git Rule, Forbidden Behaviors, Final Checklist) **link** critical.md làm source (không copy nội dung).
- **Owner files:** AGENTS.md (không locked).
- **Verify:** AGENTS.md trỏ đủ gates; không nhân bản nội dung critical.md.
- **Acceptance:** Codex entry có parity gate qua link.
- **Effort:** ~0.25 ngày.

### 28.6 Phase G5 — Governance audit skill (kael-doc-audit)

- **Goal:** Vòng audit phát hiện doc drift (path chết, scope lệch, protocol thừa, dup tái xuất, skill lệch protocol).
- **Dependencies:** G1-G4 (audit cấu trúc mới).
- **Scope:** Skill `kael-doc-audit` (.claude + .agents) phỏng claude-md-improver nhưng cho cả stack: rubric chấm điểm + red-flags Home-Services. `references/audit-rubric.md` chứa tiêu chí. Output báo cáo TRƯỚC, chỉ sửa sau khi Tu duyệt (giữ lock discipline).
- **Skills:** kael-docs-execution.
- **Verify:** chạy thử skill lên stack, ra báo cáo có điểm + issue cụ thể.
- **Acceptance:** skill chạy được, báo cáo trước khi sửa, tôn trọng lock.
- **Effort:** ~0.5 ngày.

### 28.7 Phase G6 — Verify + Sign-off + Change Log

- **Goal:** Chứng minh upgrade bằng evidence thật.
- **Dependencies:** G1-G5.
- **Scope:** Đo line-count core giảm; skills auto-discoverable; dup grep giảm; cross-ref không path chết; chạy kael-doc-audit. Cập nhật README progress log + MEMORY.md + change log §28.9.
- **Verify:** số liệu before/after; danh sách link kiểm tra sống.
- **Acceptance:** Changed/Verification/Risks/Next đầy đủ, chỉ report điều thật sự chạy.
- **Effort:** ~0.25 ngày.

### 28.8 Risks

- **R1** Split critical.md làm cross-ref hiện có (Plan.md §27 trỏ "critical.md §12 ai-boundary"…) thành stale. **Mitig:** giữ số §; thêm bảng map "§ cũ → protocols/file" trong core.
- **R2** Codex có thể không auto-load `.agents/skills` description giống Claude Code. **Mitig:** AGENTS.md trỏ tường minh; skill là bonus, không phải đường duy nhất.
- **R3** Dedup mạnh tay làm mất sắc thái 1 doc. **Mitig:** chỉ gộp khối trùng nguyên văn, giữ phần đặc thù; surgical diff.
- **R4** Governance không có test runtime → verify yếu hơn code. **Mitig:** structural evidence + kael-doc-audit + Tu review.

### 28.9 Change Log

- 2026-05-29 — Plan §28 tạo, APPROVED, G0 done.
- 2026-05-29 — G1 done: critical.md 1660→580, protocols/ (8 file, 1226 dòng), numstat 41/1124, kept sections byte-identical.
- 2026-05-29 — G2 done: 5 skill auto-trigger × (.claude + .agents); verified live trong session skill list.
- 2026-05-29 — G3 done: lifecycle single-sourced về critical.md §0; "bounded slice" 4→1 doc; runtime/scope giữ defense-in-depth.
- 2026-05-29 — G4 done: AGENTS.md "Execution Gates (parity)" trỏ critical.md.
- 2026-05-29 — G5 done: kael-doc-audit skill + references/audit-rubric.md (report-first).
- 2026-05-29 — G6 done: structural verify pass; chưa commit (Git Rule). Follow-up: mirror karpathy vào .claude/skills; chạy kael-doc-audit full report.
- 2026-05-30 — Follow-up fix: reconciled stale `.claude/commands/{pre-flight,scope-check,review,security-audit}.md`, clarified kael-doc-audit protocol-wrapper rubric, and marked known Plan drift as superseded instead of active truth.

---

## 29. Design + Context Upgrade — Modularize design.md + kael-motion + lean MEMORY — 2026-05-29

### 29.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-design-context-upgrade-20260529
Created:        2026-05-29
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         APPROVED 2026-05-29 — A + C built; B glass-liquid-signature later built in §29.8; signature tokens still need visual sign-off on Expo
Trigger:        Deep-dive 5 repo: taste-skill, design-motion-principles, claudedesignskills,
                claude-mem, claude-context → lấy principle, không bê infra/web code
Scope:          A (design.md split + kael-motion + anti-slop gate) + C (MEMORY.md progressive disclosure + /kael-mem)
Out of scope:   Historical at plan start: B glass-liquid-signature was deferred pending interview; see §29.8 for built spec/reference and remaining visual sign-off.
                claude-context vector code search; claude-mem worker service / Chroma install
Effort:         ~1-1.5 ngày agent (thao tác doc/skill; verify structural)
Phase count:    A1, A2, A3, C1, C2 + verify
Skill mapping:  kael-docs-execution, kael-architecture-deepening, kael-ui-rn-execution, kael-review
Locked override: Tu approved 2026-05-29 — design.md được sửa (như đợt critical.md §28)
```

**Mục tiêu:** đưa design.md về cùng pattern modular như critical.md (đỡ context, dễ audit) + thêm khung *motion create/audit + anti-slop* cho RN; làm gọn MEMORY.md theo progressive disclosure.

### 29.0.1 Authority refs

```
1. critical.md (§0, §3 gates, protocols/ui.md = kael-ui-rn-execution)
2. design.md (locked — A1 override approved 2026-05-29) + design/ refs sau split
3. RULES.md (#5 VN-first, #8 data honesty), STRUCTURES.md (workflow mapping)
4. MEMORY.md (đối tượng C1) + docs/memory/ (mới)
5. Plan.md §28 (governance precedent) + §29 (this plan)
```

### 29.0.2 Decision Log

- **D1** design.md split: Tu approved 2026-05-29 ("làm A") — locked-doc edit authorized.
- **D2** **B glass-liquid-signature initially DEFERRED, then BUILT in §29.8** — không tự design trước interview; sau interview Tu chốt direction, spec/reference/skill được tạo và vẫn chờ visual sign-off Expo trước khi tuyên bố 9/10.
- **D3** 4/5 repo là web (GSAP/Framer/CSS/WebGL) — HS lấy *principle*, port sang RN/Reanimated; không copy snippet.
- **D4** "Variance" (taste-skill, frontend-design) BỊ BỎ — HS là single-brand (mint/cream glass). Chỉ lấy *anti-slop* + *preflight*.
- **D5** claude-context (Milvus/Zilliz + embedding key) DEFERRED — chi phí + infra trái thuần-app/cost-conscious; `docs/architecture/code-ownership-map.md` thủ công đủ ở scale này.
- **D6** claude-mem install nặng (worker service + Chroma:37777) KHÔNG dùng — chỉ áp *progressive disclosure* + capture command.
- **D7** design/ refs nhóm theo "khi nào cần" (6 file); core giữ gate phổ quát (preflight/scoring/forbidden/checklist/RN rules).

### 29.1 A1 — Split design.md → core + design/ references

- **Core giữ:** intro, §0 authority, §1 identity, §2 goal, §4 surfaces, §5 preflight, §6 skill-adapt, §8 scoring rubric, §26 RN rules, §27 forbidden, §28 review checklist, §29 + reference index. Số mục giữ nguyên; mục moved thành redirect stub.
- **Tách:** `design/reference-method.md` (§3), `design/design-lab.md` (§7), `design/palette-typography.md` (§9-10), `design/decoration-mascot-icons.md` (§11,12,25), `design/motion.md` (§13), `design/screen-recipes.md` (§14-24).
- **Verify:** core ≤ ~400 dòng; nội dung moved byte-exact (sed từ git HEAD); cross-ref sống. Mục tiêu giảm ~60% always-loaded.

### 29.2 A2 — kael-motion skill (create/audit + anti-slop)

- Skill `kael-motion` (.claude + .agents) học design-motion-principles: mode **create** (chọn motion đúng moment) + **audit** (motion gap + anti-slop). RN/Reanimated. Anti-slop checklist map vào design `Motion Grammar` + RULES Performance Budget + Reduce Motion/Transparency. Thin wrapper trỏ `design/motion.md` (single source).

### 29.3 A3 — Anti-slop gate + audit coverage

- Thêm preflight "cái này có nên animate không?" + anti-slop gate vào `protocols/ui.md` (kael-ui-rn-execution).
- Mở rộng `kael-doc-audit` rubric: chấm design.md + design/ drift (stale ref, recipe thiếu state, forbidden default rò rỉ).

### 29.4 C1 — MEMORY.md progressive disclosure

- MEMORY.md → recall index gọn (1 dòng/entry + link), chi tiết move sang `docs/memory/2026-05.md`. Giữ "read last" semantics; byte-exact move, không mất info. Mục tiêu: MEMORY.md ~475 → index ngắn.

### 29.5 C2 — /kael-mem capture command

- Command `/kael-mem` (.claude/commands) capture cuối session theo format chuẩn (date/title/bullets/honest-gaps), giống `revise-claude-md` của Anthropic; ghi vào `docs/memory/<period>.md` + cập nhật index.

### 29.6 Verify

- design.md core line count; 6 design/ refs tồn tại; kael-motion + /kael-mem discoverable; MEMORY index link sống; chạy kael-doc-audit thử. Report Changed/Verification/Risks/Next.

### 29.7 Risks

- **R1** Split design.md làm cross-ref (docs/design/*, AGENTS.md "đọc design.md") thành stale → giữ số mục + reference index trong core.
- **R2** Dedup MEMORY.md mất ngữ cảnh nếu cắt sai → byte-exact move, index trỏ đủ.
- **R3** kael-motion lệch RULES motion rules → map 1-1, RULES là canonical.

### 29.8 B glass-liquid-signature (BUILT 2026-05-29)

Tu chốt direction qua interview: classic/minimal, OS-grade (Apple Liquid Glass + Material expressive motion), **neutral base + 1 mint accent**, dark mode phải nổi; "liquid" = đi nhẹ, nhô lên như bong bóng bể. Code audit thật tìm gap 7→9: motion `withTiming` thay vì spring (entrance 440ms), `colors.ts` chỉ light (thiếu dark tokens), edge highlight trắng-cứng dùng cả dark, ~18 màu. Built: `design/signature.md` (spec + token neutral+mint light/dark + spring/bubble + dark fix + checklist ≥9/10), skill `glass-liquid-signature` (apply+audit, .claude+.agents), gold reference `design/reference/signature-glass-dock.tsx` (reference-only, không compile trong app — không có root tsconfig). Token là đề xuất trong hướng Tu chọn — **chờ Tu duyệt mắt trên Expo** trước khi tuyên bố 9/10. Option 1 scope: không đổi component production.

### 29.9 Change Log

- 2026-05-29 — Plan §29 tạo, APPROVED (A+C). design.md đọc full (1036 dòng), baseline MEMORY.md 475. Bắt đầu A1.
- 2026-05-29 — A1 done: design.md 1036→384, 6 file design/ (byte-exact, numstat 35/687), reference index + stubs.
- 2026-05-29 — A2 done: kael-motion skill (.claude + .agents), create/audit + anti-slop, verified live.
- 2026-05-29 — A3 done: anti-slop gate vào protocols/ui.md; kael-doc-audit rubric + Design Stack Coverage (2 bản).
- 2026-05-29 — C1 done: MEMORY.md 475→45 index; docs/memory/2026-05.md archive 35 mục byte-exact.
- 2026-05-29 — C2 done: /kael-mem command; final verify pass (links resolve, skills/command live).
- 2026-05-29 — B done: design/signature.md + glass-liquid-signature skill + gold reference dock. Direction Tu: neutral+mint classic OS-grade. Token chờ visual sign-off Expo. Tu chốt: bàn B xong → tạo 1 commit mới gộp A+C+B.

---

## 30. Kael Smart Clarification + LLM-Assisted Intake Gates — 2026-06-04

### 30.0 Metadata + Mục tiêu

```text
Plan ID:        plan-kael-smart-clarification-20260604
Created:        2026-06-04
Owner:          Manh Tu (manhtu0407@gmail.com)
Status:         DONE — backend+frontend implemented + STAGING BEHAVIOR-VERIFIED 2026-06-04 (flag-gated). Staging xyylanuyflrjzbjzhqfl: v87 deployed + flag ON.
Trigger:        Tu — Kael "đã hoạt động nhưng chưa linh hoạt": input mơ hồ → không hiểu ngữ cảnh để hỏi lại
Scope:          Smart clarification (LLM-driven, A4) + LLM-assist 2 keyword gates (boundary + demanding) + multi-turn context (closes §27 F-15)
Out of scope:   Worker flows, payment, autonomy contract, service expansion; staging deploy (Tu go)
Effort:         ~1 session agent
Phase count:    3 (P1 backend, P2 frontend, P3 verify/docs)
```

**Vấn đề (verified in code):** Kael chat = estimate pipeline 1 lượt; "clarification" = 3 string cứng + heuristic `message.length<10` (vi phạm STRUCTURES.md A4 "never generic"); `intent.needs_clarification` tính nhưng không ai đọc; không có multi-turn context (F-15); 2 gate (boundary/demanding) keyword-thuần.

**Outcome:** Kael nhận input mơ hồ → hỏi **1 câu cụ thể theo ngữ cảnh** (A4) + nhớ context xuyên turn; gate boundary/demanding có LLM-assist với keyword fast-path + fallback. Server-side, schema-validated, autonomy/price boundary KHÔNG đổi.

### 30.0.1 Decision Log

- **D1** (Tu) Scope = "Clarification thông minh" (LLM-driven, consume needs_clarification+confidence, slot-filling, 3–5 turn context, contextual question A4).
- **D2** (Tu) Keyword gates = "Có, kèm fallback" (LLM-assist trên; keyword = fast-path + fallback).
- **D3** Ship **gated** sau `KAEL_OPT_LLM_CLARIFICATION_ENABLED` (OFF mặc định = zero behavior change).
- **D4** Tách `diagnoseIntake` riêng (KHÔNG mutate `classifyIntent`) → flag-off path byte-identical, zero regression.
- **D5** Demanding LLM-assist = one-turn-lag sentiment (gate `qaCount>=2`, **soft-only** — hard escalation vẫn 100% keyword). Lý do: diagnosis chạy trong pipeline, sau gate demanding.
- **D6** Edge diagnose dùng `maxTokens:320` raw (route intent cap quá chặt cho structured JSON).
- **D7** Frontend slot chips = informational hint (không phải nút answer); khách trả lời ở composer như cũ (backend chưa cấp answer-options).

### 30.0.2 Authority refs
critical.md (§0/§3/§5/§8/§24/§25) · RULES.md (#2/#3/#4/#6/#7/#8/#9/#10) · protocols/ai-data-security.md · STRUCTURES.md (A2–A6/A4, §9 Kael workflow+providers, §11 KaelPriceCheckModule, §12, §21) · design.md (§5/§27) + design/signature.md+motion.md · code-ownership-map.md · Plan.md §27 (F-15).

### 30.1 Phases (built + owner files)

**P1 — Backend core (Tasks #1–#4):**
- Intake-diagnosis: `kael/types.ts` + `apps/api/src/lib/kael/schemas.ts` (`intentResultSchema` +5 optional fields: missing_slots, clarification_question_vi, scope_signal, suggested_service, customer_sentiment); `kael/prompts.ts` (`buildIntakeDiagnosisMessages` + `KAEL_INTAKE_DIAGNOSIS_PROMPT_VERSION=2026-06-04.v1`); `kael/intent.ts` (`diagnoseIntake`, classifyIntent untouched). Both edge + apps/api parity.
- Pipeline short-circuit: `kael/pipeline.ts` (+ `apps/api` parity) — sau intent, trước vision/market: out_of_scope→UNSUPPORTED, service_mismatch→SERVICE_MISMATCH, needs_clarification && count<`CLARIFICATION_CAP`(2)→NEEDS_CLARIFICATION; surface `customerSentiment`.
- Chat wiring: `_shared/services.ts` `advanceKaelChatEstimate` — flag-gated; fetch turns→conversationContext + count; handle codes; **self-check câu hỏi qua `runKaelSelfCheckPipeline`** (Rule #3, no raw AI). Flag `KAEL_OPT_LLM_CLARIFICATION_ENABLED` in `kael/cost-tracking.ts` + `.env.example`.
- Demanding assist: `kael/agentic/demanding-customer-detect.ts` (+llmSentiment, soft-only, qaCount>=2); store/read `last_customer_sentiment` in session metadata (merge-safe).

**P2 — Frontend (Task #6):**
- `_shared/services.ts` `serializeKaelTurn` surface `clarification{question,missing_slots}`; `apps/mobile/lib/api-types.ts` `KaelChatTurn.clarification?`; `kael-chat/thread.tsx` `ChatTurn` render riêng (mint "Kael đang hỏi" + accent + light slot chips, no glass-heavy); design preflight + glass-liquid/kael-motion/kael-frontend-test.

**P3 — Verify/docs (Task #7):** deno check edge + full test sweep + this §30.

### 30.2 Skills mapping
kael-ai-boundary (primary) · kael-tdd · kael-security-sweep · kael-architecture-deepening · kael-review · karpathy-guidelines · (P2) glass-liquid-signature + kael-motion + kael-frontend-test. kael-supabase = verified no-migration.

### 30.3 Verification evidence (2026-06-04, real runs)
- **Edge `deno check supabase/functions/mobile-api/index.ts`: PASS** (full graph compiles — closes edge type-check gap).
- apps/api: `tsc` TC=0; vitest **1355 passed, 59 skipped (integration—no creds), 0 fail**.
- apps/mobile: `tsc` TC=0; jest kael-chat **21 pass** (4 new clarification render). Full jest 120 pass.
- packages/shared: 578 pass.
- **24 new tests** (intake-diagnosis 7, pipeline-clarification 5, flag 2, demanding-assist 6, clarification render 4).
- Flag OFF → behavior unchanged (tested).

### 30.4 Remaining + Known issues
- **Staging DB contract VERIFIED (2026-06-04, read-only via Supabase MCP, staging `xyylanuyflrjzbjzhqfl`):** `kael_chat_turns.content_type` CHECK includes `'clarification'`; `kael_chat_sessions.status` CHECK includes `'unsupported'`; role/cost_usd/latency_ms/text_content columns present → staging DB sẽ chấp nhận clarification + mismatch turns code ghi (no migration needed). mobile-api deployed = **v86** (OLD code, pre-clarification).
- **Staging behavioral smoke (flag-on): ✅ PASSED 2026-06-04** (Tu cấp access token → `supabase functions deploy mobile-api` v87 + `secrets set KAEL_OPT_LLM_CLARIFICATION_ENABLED=true` + disposable test customer auth → `/kael/chat`).
  - Turn 1 (vague "nhà bị hư cái đó rồi…"): `content_type=clarification`, câu hỏi **cụ thể** "Bạn có thể mô tả cụ thể hư hỏng gì không? Ví dụ: mất điện, đèn nhấp nháy, hay ổ cắm hỏng?" (≠ generic), `missing_slots=["symptom"]`, `next_action=await_input`.
  - Turn 2 (follow-up "cái cầu dao ấy, bật lên là nó nhảy lại liền"): Kael dùng **multi-turn context** → `breaker_trip` estimate 300k–700k, `next_action=estimate_ready`. F-15 closed end-to-end.
  - Test user cleaned up. **Staging state hiện tại: v87 deployed + flag ON** (revert: `secrets set KAEL_OPT_LLM_CLARIFICATION_ENABLED=false`).
- **Pre-existing failures (NOT this work, confirmed via git stash):** mobile-wiring.test.ts ×2 (worker-surfaces visual contract + create-job final_price extraction); worker-home-surface-test.tsx ×2 (WorkerChatSurface media picker + message submit). Files untouched bởi §30.

### 30.5 Change Log
```text
v1.0 — 2026-06-04 — P1–P3 implemented + verified (deno check + 24 new tests). Flag OFF default. Staging smoke pending Tu env.
```

---

## 31. Kael AI Core → 100% — Feedback/Eval · Knowledge/RAG · Agentic Orchestrator · Prompt/Guardrails — 2026-06-04

### 31.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-kael-ai-core-to-100-20260604
Created:        2026-06-04
Owner:          Manh Tu (manhtu0407@gmail.com)
Branch:         claude/distracted-babbage-eb8cf4 (worktree)
File location:  Plan.md §31 (durable) — single-source addendum
Status:         DECISIONS LOCKED v0.2 — Tu approved D-OPEN-1..5 + D6 (2026-06-04). Build tuần tự bằng Codex; Claude verify result. READY — execute K0→A→B→C→D→K-FINAL.
Trigger:        Audit 4 hạng mục AI core do Tu yêu cầu (2026-06-04, session distracted-babbage). Verdict: A=60%, B=25%, C=70%, D=85%.
Scope:          Nâng THẬT 4 hạng mục lên 100% — (A) Evaluation & Feedback Loop, (B) Knowledge Base (RAG) luật/tiêu chuẩn, (C) Agentic Orchestrator (full autonomy), (D) System Prompt & Guardrails.
Out of scope:   Mở rộng service ngoài electrical/plumbing/cleaning; đổi runtime boundary (Expo→Supabase Edge→DB); đổi model mặc định; tích hợp payment rail thật (Kael quyết payment outcome, nhưng money-movement provider tách riêng).
Effort total:   ~60.5 agent-day sequential (Tu D-OPEN-3: tuần tự, không song song). Xem §31.9.
Phase count:    26 — K0 (1) + Track A (6) + Track B (6) + Track C (6) + Track D (6) + K-FINAL (1).
Skill mapping:  karpathy-guidelines (mọi phase) + kael-ai-boundary, kael-supabase, kael-tdd, kael-security-sweep, kael-diagnose, kael-doc-audit, kael-frontend-test, kael-motion, glass-liquid-signature (xem §31.11).
```

**Mục tiêu chính (đo được, không tô hồng):**

1. **Track A → 100%:** Vòng feedback KHÉP KÍN end-to-end (job xong → candidate → gate → active rule trong `learning_rules` → pipeline đọc lại) + auto-rollback chạy thật + offline eval harness chặn regression.
2. **Track B → 100%:** Knowledge tan toàn/pháp lý/dịch vụ được Kael ĐỌC THẬT lúc runtime + nội dung thật (không phải 5 dòng seed) + retrieval (key-based trước, pgvector RAG sau khi corpus xứng đáng) + citation/audit.
3. **Track C → 100%:** Kael **tự chủ hoàn toàn** (full operational autonomy) — tự quyết scope/cancel/completion/payment/dispute/reassign KHÔNG cần người duyệt — qua `KaelAutonomyDecision` validated server-side. "Safety" = invariant gate deterministic + escalation hẹp, KHÔNG phải human-in-the-loop. (Tu D-OPEN-1: full autonomy, chỉ chặn vi phạm pháp luật + bất biến tài chính/an toàn.)
4. **Track D → 100%:** Charter single-source + mọi egress AI qua self-check + semantic guardrail (LLM-assist bounded) + red-team regression corpus + observability.

**Nguyên tắc xuyên suốt:** Mỗi hạng mục hiện "trông như đã build" nhưng có phần chạy hở (A loop hở, B bảng mồ côi). Plan này tồn tại để **đóng đúng các phần hở đó với bằng chứng**, không để lặp lại "cảm giác ảo". Xem §31.0.3.

---

### 31.0.1 Authority refs (đọc theo thứ tự bắt buộc trước khi execute)

```
1. critical.md                 (§0 lifecycle, §3 doubt-loop, §5 preflight, §8 verify, §12 ai-boundary, §14 supabase, §15 security)
2. RULES.md                    (#2 server-side AI, #3 validate AI output, #4 structured-output, #6 scope, #7 confirmation,
                                #8 no fake data, #9 PII, #10 timeout/retry, + autonomy/money-state boundary)
3. STRUCTURES.md               (§9 Kael workflow + AI providers, §11 KaelPriceCheckModule + backend modules,
                                §12 state machines, §15 pricing + Kael final-price authority, §21 learning, "do-not-build-now")
4. design.md (+ design/*)       (chỉ đọc khi phase chạm UI — A4 admin review, B4 admin CRUD)
5. AGENTS.md
6. CLAUDE.md                    (lock notice — locked docs cấm edit trừ Tu approve explicit; runtime boundary)
7. protocols/ai-data-security.md
8. Plan.md §22–§30             (precedent: §23 Harness+Agentic, §24 cost-opt, §25 source-trust, §26 codex-gaps, §30 clarification)
9. docs/architecture/code-ownership-map.md   (map mỗi phase → owner files TRƯỚC khi edit)
10. docs/architecture/status-vocabulary.md
11. MEMORY.md                  (last — fresh session facts)
```

---

### 31.0.2 Decision Log

- **D1** (Claude→Tu, 2026-06-04) Plan chia theo 4 **track song song** (A/B/C/D) thay vì trộn, để Tu duyệt/cắt từng track độc lập.
- **D2** (Claude) Track A là **ưu tiên #1**: loop hở khiến toàn bộ LS1–LS7 thành trang trí; đóng loop có ROI cao nhất cho "Kael biết học".
- **D3** (Claude) Track B chia 2 nhịp: **B1 (wire bảng có sẵn vào runtime) làm ngay** vì rủi ro an toàn thật; **B5 (pgvector RAG) hoãn** tới khi corpus đủ lớn (RAG cho 5 dòng = lãng phí, per audit).
- **D4** (Claude) Track C giữ **nguyên tắc bất biến**: raw LLM KHÔNG bao giờ tự đổi money-state; mọi "agency" chạy trong sandbox + 3 gate cứng (schema + state-machine + permission). Tuân thủ RULES.md.
- **D5** (Claude) Mọi behavior mới ship **flag-gated OFF mặc định** (precedent [[project_plan_kael_learning_pr12]] + §30 D3), để diff flag-off byte-identical → zero regression.
- **✅ D-OPEN-1 RESOLVED** (Tu, 2026-06-04): **Full autonomy (γ′)** — Kael tự quyết mọi outcome vận hành, KHÔNG cần người duyệt. Cơ chế an toàn = invariant gate deterministic (I1–I5) + escalation hẹp (legal-risk / evidence-chain vỡ / high-stakes low-confidence), KHÔNG phải human approval. Raw LLM vẫn không trực tiếp mutate money-state — đó là *cách thực thi* autonomy an toàn, không phải giới hạn. Xem §31.6 C2.
- **✅ D-OPEN-2 RESOLVED** (Tu, 2026-06-04): Claude **tự tìm nguồn** qua **Perplexity integration có sẵn** (`source-trust.ts` + sonar) — research → lọc/chấm nguồn → draft corpus có citation → Tu sign-off từng dòng an toàn/pháp lý. Xem §31.5 B3.
- **✅ D-OPEN-3 RESOLVED** (Tu, 2026-06-04): **Tuần tự** A→B→C→D, không song song. Xem §31.2.
- **✅ D-OPEN-4 RESOLVED** (Tu, 2026-06-04): **Không hoãn** phase nào — B5 pgvector RAG + C2 full autonomy đều in-scope.
- **✅ D-OPEN-5 RESOLVED** (Tu, 2026-06-04): Admin surface **cả hai** — `apps/api` (Next.js) + `apps/mobile` screen. Xem A4/B4.
- **✅ D6** (Tu, 2026-06-04): Build bằng **Codex**; **Claude verify result** (review + anti-illusion gate §31.0.3). Plan này là contract cho Codex.

---

### 31.0.3 Definition of Done — Anti-Illusion Gates (áp dụng MỌI phase)

Một phase chỉ "DONE" khi đạt **cả 4** gate sau. Unit test xanh KHÔNG đủ.

```text
G1 — Real path proof:   Bằng chứng end-to-end trên STAGING thật (row DB thật / cost thật / log thật),
                        không phải mock. (per [[feedback_mock_vs_real_tests]], [[feedback_integration_caught_bug]])
G2 — Closure proof:     Chứng minh OUTPUT của phase được CONSUMED ở downstream (vd: rule active → pipeline đọc;
                        knowledge row → có mặt trong prompt; decision → đổi state qua gate). Chống "bảng mồ côi / loop hở".
G3 — Negative proof:    Test đường thất bại + đường bị chặn (schema sai → quarantine; gate fail → đúng next_state;
                        flag OFF → no-op). Log mọi nhánh, KHÔNG silent (per [[feedback_no_operational_silence]]).
G4 — Honest report:     Report nêu rõ cái gì CHƯA test, cái gì skip, residual risk (per [[feedback_no_hiding_gaps]],
                        [[feedback_honest_reporting]]). Cập nhật README/test-log qua /log + /test-report.
```

Mỗi phase có dòng **"Anti-Illusion Gate"** cụ thể hoá G1–G4 cho phase đó.

---

### 31.1 Current-State Baseline (audit 2026-06-04, evidence-anchored)

| Track | Hạng mục | % | Đã có (evidence) | Phần CHẠY HỞ phải đóng |
|---|---|---|---|---|
| A | Evaluation & Feedback Loop | 60% | LS1–LS7 + evidence gate + lifecycle 11-state + rollback fn + flags (`skills/registry.ts`); trigger wired (`services.ts:2869/3041/4383`); queue→Batch API (`cron/process-learning-queue.ts` + `process-batch-results.ts`); read-side live (`learning.ts`, `pipeline.ts:260/354`) | `processBatchResults` KHÔNG promote: không parse output, không gọi `evaluateLearningEvidenceGate`, không ghi `learning_rules`. Không offline eval. manual_review không có admin path. |
| B | Knowledge Base (RAG) luật/tiêu chuẩn | 25% | Bảng `worker_safety_patterns` (3), `legal_awareness_patterns` (2), `service_knowledge_boxes` (3), `price_baselines`; KaelMemory L1–L6 (`memory.ts`) | Grep 3 bảng tri thức trong `supabase/functions` = **0 match** → runtime không đọc. Không pgvector/embedding. Nội dung = seed mỏng. legal redirect hardcode ở `permission-gate.ts` (dup nguồn). |
| C | Agentic Orchestrator | 70% | Provider router (`routing.ts`), stage orchestrator (`orchestrator.ts`), pipeline (`pipeline.ts`), 5 case (`agentic/*`), autonomy schema + gate (`artifact-contract.ts` + `workflow-orchestrator.ts`), 8 call-site (`services.ts`) | Logic rải khắp `services.ts`, không có orchestrator cấp cao + telemetry hợp nhất. Không có decision audit/replay. Autonomy = pure policy (chưa có LLM-propose-in-sandbox nếu Tu muốn). |
| D | System Prompt & Guardrails | 85% | Charter (`system-prompt.ts` + `packages/shared/kael/charter/*`), boundary-guard, permission-gate, self-check, artifact-contract, sanitizers, rate-limit, circuit-breaker | self-check = substring list ngắn (né bằng paraphrase); injection = regex (miss biến thể mới, code tự thừa nhận); charter code vs charter-files chưa single-source; egress self-check opt-in per-stage; chưa có red-team corpus. |

---

### 31.2 High-Level Roadmap (Tuần tự — Tu D-OPEN-3)

```
K0 → A1→A2→A3→A4→A5→A6 → B1→B2→B3→B4→B5→B6 → C1→C2→C3→C4→C5→C6 → D1→D2→D3→D4→D5→D6 → K-FINAL
```

Build **tuần tự**: mỗi phase phải đóng Anti-Illusion Gate (§31.0.3) TRƯỚC khi sang phase kế. Không bắt đầu phase N+1 khi phase N chưa có closure proof.

**Thứ tự có chủ đích (dependency thật vẫn được tôn trọng trong chuỗi):**
- **A trước:** đóng feedback loop + eval harness (A5) trước, vì B6 (retrieval eval) và C/D đều dùng A5 để chứng minh "tăng thật".
- **B trước C:** knowledge (B) nằm trong prompt mà orchestrator (C) điều phối + autonomy decision tham chiếu (safety/legal trước khi quyết).
- **C trước D:** full autonomy (C2) là bề mặt rủi ro lớn nhất → D3/D4/D5 (semantic guard + injection classifier + red-team) phủ adversarial lên chính autonomy vừa mở.

**🔒 Safety ordering (quan trọng — full autonomy build trước guardrail trong chuỗi tuần tự):**
C2 build behind flag `KAEL_AUTONOMY_FULL_ENABLED=OFF`. **Cờ này CHỈ bật ở production SAU khi D5 (red-team) + K-FINAL (E2E) pass.** Trong lúc đó C2 vẫn có invariant fuzz nội bộ (C2.4) làm proof. ⇒ Tuần tự + full autonomy + an toàn cùng đạt: code autonomy xong ở C, nhưng chỉ "sống" sau khi D phủ phòng thủ.

**Critical path:** K0 → A1 → A2 → A4 → A5 → B1 → B3 → C1 → C2 → D5 → K-FINAL.

---

### 31.3 Phase K0 — Pre-read + Baseline Snapshot + Instrumentation ⚠️ NEVER SKIP

**Goal:** Có đủ authority context + chụp baseline số liệu THẬT trước khi sửa, để sau này chứng minh "tăng thật" chứ không phải "cảm giác ảo".

**Dependencies:** None. **Out of scope:** không sửa file logic nào.

**Steps:**
- [ ] **K0.1** Đọc đủ authority refs §31.0.1 theo thứ tự; ghi pre-edit status block (critical.md §5).
- [ ] **K0.2** Map mỗi track → owner files qua `docs/architecture/code-ownership-map.md`; note file chưa có owner row → cần thêm.
- [ ] **K0.3** `git status` + `git log --oneline -10` + `git diff --name-only main...HEAD`; xác nhận branch sạch.
- [ ] **K0.4** Baseline số liệu staging (read-only Supabase MCP, `xyylanuyflrjzbjzhqfl`): đếm row `learning_rules` (status='active'), `learning_candidates`, `kael_rule_lifecycle_log`, `kael_learning_queue` theo state; row `worker_safety_patterns`/`legal_awareness_patterns`/`service_knowledge_boxes`. Lưu snapshot vào `docs/test-logs/2026-06-04_kael-core-baseline.md`.
- [ ] **K0.5** Confirm flags hiện tại (giá trị thật trên staging): `KAEL_LEARNING_READ_ENABLED`, `..._WRITE_ENABLED`, `..._KILL_SWITCH`, `..._AB_PERCENTAGE`, `..._AUTO_ROLLBACK`, `KAEL_OPT_BATCH_LEARNING_ENABLED`, `KAEL_OPT_BATCH_API_ENABLED`.
- [ ] **K0.6** Chạy full test sweep baseline (apps/api vitest + apps/mobile jest + packages/shared + `deno check` edge) → ghi pass/fail count làm mốc (per [[project_pr6_monorepo_tests]] honesty).
- [ ] **K0.7** Xác nhận portable Node/pnpm chạy được (per [[env_node_toolchain_access]]).

**Anti-Illusion Gate:** Baseline doc tồn tại với số liệu thật; mọi phase sau phải so với mốc này. **Effort:** 0.5 ngày.

---

### 31.4 Track A — Evaluation & Feedback Loop → 100%

> Hiện 60%. Đóng loop + eval + monitoring + admin path. Đây là ưu tiên #1 (D2).

#### A1 — Đóng promotion loop (batch result → gate → active rule)

**Goal:** Một candidate hợp lệ tự động (hoặc qua manual-review) trở thành row `active` trong `learning_rules` mà pipeline đọc lại được.
**Why-gap:** `process-batch-results.ts:106-117` chỉ ghi lifecycle_log + mark "processed"; không có đường ghi `learning_rules` ở runtime. Bảng `learning_candidates`/`learning_rule_versions` ĐÃ tồn tại (migration `20260513114845` L465/489/512) — thiếu code ghi.
**Steps:**
- [ ] **A1.1** Reconcile reference impl `apps/api/src/lib/learning/{case-review,market-memory,hook,types}.ts` vs edge runtime → chốt **1 module promotion canonical** cho edge (tránh duplicate per [[feedback_duplicate_types]]).
- [ ] **A1.2** Viết `parseBatchLearningResult(message)`: parse JSON output LLM bằng **brace-counting parser** (per [[feedback_safeParseJSON_regex]]), validate qua `learningSkillCandidateSchema`. Output sai → quarantine + audit, KHÔNG dùng.
- [ ] **A1.3** Viết RPC migration `promote_learning_candidate(...)` SECURITY DEFINER, **service_role only**: re-validate `forbidden_effects` + `allowed_targets` server-side (không tin LLM/client per RULES.md #3), ghi atomic `learning_candidates` → `learning_rules` (status='active', active_version++) → `learning_rule_versions` (per [[feedback_race_conditions]]).
- [ ] **A1.4** Trong `processBatchResults` success path: parse (A1.2) → aggregate evidence (A2) → `evaluateLearningEvidenceGate` → nếu promote && !manual_review_required → gọi RPC A1.3; nếu manual_review_required (LS5/6/7) → state `manual_review` + enqueue admin (A4), KHÔNG auto-active.
- [ ] **A1.5** Tôn trọng flag: chỉ ghi khi `KAEL_LEARNING_WRITE_ENABLED && !KILL_SWITCH`; tôn trọng `AB_PERCENTAGE` qua `shouldRunLearningForActor`.
- [ ] **A1.6** `transitionLearningLifecycle` cho mọi bước (candidate→pending_evidence→evidence_gate_check→auto_promoted|manual_review→active); reject transition sai (đã có fn, wire vào).
- [ ] **A1.7** Negative branches: gate fail → đúng `next_state` + `reason` vào lifecycle_log (no silent drop per [[feedback_no_operational_silence]]).

**Owner files:** `supabase/functions/mobile-api/_shared/kael/cron/process-batch-results.ts`, `.../skills/registry.ts` (export gate/lifecycle), `.../learning.ts`, migration mới `2026XXXX_promote_learning_candidate_rpc.sql`, `apps/api/src/lib/learning/*` (reconcile).
**Skills:** kael-supabase (primary), kael-tdd, kael-ai-boundary, kael-security-sweep, karpathy-guidelines.
**Tests + Anti-Illusion Gate:**
- **G1/G2:** Integration THẬT trên staging: seed ≥5 completed reviewed job cùng (service,problem,district) → chạy `processLearningQueue` → `processBatchResults` → ASSERT row `learning_rules` active MỚI xuất hiện (so baseline K0.4) → chạy `runKaelPipeline` cùng scope → ASSERT `applyLearnedPriceRule` trả đúng rule đó. In rule_id + before/after price band.
- **G3:** output schema-sai → quarantine (test); flag OFF → 0 row ghi (test); forbidden_effect trong candidate → RPC reject (test).
- **G4:** report nêu rõ batch latency, cost, % candidate promote vs reject.
**Effort:** 3 ngày.

#### A2 — Evidence aggregation engine (multi-job accumulation)

**Goal:** Candidate tích luỹ evidence qua NHIỀU completed transaction trong recency window trước khi qua gate (đúng tinh thần MIN_EVIDENCE=5, CONFIDENCE_THRESHOLD=0.6 per [[project_kael_evidence_gate]]).
**Why-gap:** `evaluateLearningEvidenceGate` nhận `LearningEvidenceSnapshot` nhưng chưa có engine tính snapshot từ dữ liệu thật; `skills/LS1-aggregation.ts` tồn tại nhưng chưa wire vào promotion.
**Steps:**
- [ ] **A2.1** Viết `aggregateCandidateEvidence(skillId, scopeKey, window)`: query completed+reviewed jobs liên quan → `evidence_count`, `completed_transaction_count`, `recent_contradiction_ratio`.
- [ ] **A2.2** Confidence = IQR/median trên phân phối (price prior) hoặc tỉ lệ đồng thuận (pattern) — per evidence-gate spec; clamp [0,1].
- [ ] **A2.3** Recency window 90 ngày (config); loại job ngoài window; `quality_filter` bỏ outlier/dispute.
- [ ] **A2.4** Wire `LS1-aggregation.ts` làm nguồn cho price_prior; LS2–LS7 dùng aggregation tương ứng.
- [ ] **A2.5** Cache snapshot per scope (tránh recompute mỗi batch item).

**Owner files:** `.../kael/skills/LS1-aggregation.ts`, `.../learning.ts`, `.../skills/registry.ts`.
**Skills:** kael-tdd, kael-supabase, karpathy-guidelines.
**Anti-Illusion Gate:** **G2** test với 4 evidence → gate trả `insufficient_evidence`; với 5 đủ chất lượng → `gate_passed`; với contradiction>0.2 → `manual_review`. **G1** chạy trên seed staging thật. **Effort:** 2 ngày.

#### A3 — Monitoring + auto-rollback (chạy thật)

**Goal:** Rule active được theo dõi accuracy/satisfaction thật; rule degrade tự rollback.
**Why-gap:** `recordLearningPerformanceSample` + `shouldAutoRollbackLearningRule` là pure fn chưa ai feed/gọi.
**Steps:**
- [ ] **A3.1** Sau mỗi job dùng rule (pipeline applied): ghi `applied_count`; nếu Kael bị override (final khác band) → `override_count`.
- [ ] **A3.2** `accuracy_delta` = so dự đoán band vs `final_price` thật; `satisfaction_delta` = từ review rating của job dùng rule.
- [ ] **A3.3** Migration bảng/cột performance sample nếu chưa đủ; ghi per rule_id + window.
- [ ] **A3.4** Cron `monitorLearningRules`: chạy `shouldAutoRollbackLearningRule` → rule vượt ngưỡng (accuracy_drop≥10% hoặc satisfaction_drop≥0.3 trong 30 ngày) → `transitionLearningLifecycle(active→monitoring→degraded→rolled_back→archived)` + audit + notify admin.
- [ ] **A3.5** Tôn trọng `KAEL_LEARNING_AUTO_ROLLBACK` flag.

**Owner files:** `.../kael/learning.ts`, `.../kael/cron/*` (cron mới), `.../pipeline.ts` (ghi applied), migration performance.
**Skills:** kael-supabase, kael-tdd, kael-diagnose.
**Anti-Illusion Gate:** **G2** seed rule "xấu" (accuracy drop giả lập) → cron rollback → ASSERT rule status='rolled_back' + pipeline KHÔNG còn áp dụng. **Effort:** 2 ngày.

#### A4 — Admin review surface cho manual_review candidates

**Goal:** Candidate `manual_review` (LS5/LS6/LS7 + low-confidence) có đường người duyệt; approve→promote, reject→archived. Không để dead-end (illusion thứ 2).
**Why-gap:** `notifyManualReviewIfConfigured` chỉ tạo notification; không có endpoint list/approve/reject. `kael_admin_queue` tồn tại nhưng chưa nối learning.
**Steps:**
- [ ] **A4.1** Endpoint (apps/api admin surface per CLAUDE.md) `GET /admin/kael/learning/candidates?state=manual_review` — list + payload + evidence snapshot.
- [ ] **A4.2** `POST /admin/kael/learning/candidates/:id/approve` → gọi RPC promote (A1.3) với `actor_role=admin`; `.../reject` → `rejected→archived` + lý do.
- [ ] **A4.3** Auth: admin-only (`private.is_admin()`), audit vào `kael_permission_audit`.
- [ ] **A4.4** UI admin **cả hai surface** (Tu D-OPEN-5): (a) `apps/api` Next.js admin; (b) `apps/mobile` admin screen — list + diff (giá cũ/mới, pattern) + Approve/Reject. design preflight + glass-liquid-signature + kael-motion + kael-frontend-test.
- [ ] **A4.5** SLA surfacing: candidate `manual_review` > N ngày → cảnh báo (chống "kẹt im lặng").

**Owner files:** `apps/api/src/...admin`, `apps/mobile` admin screen (required), `.../kael/learning.ts`, migration RLS `kael_admin_queue` ↔ learning.
**Skills:** kael-supabase, kael-security-sweep, kael-tdd, (UI) glass-liquid-signature + kael-frontend-test + kael-motion.
**Anti-Illusion Gate:** **G1** admin thật approve 1 candidate trên staging → ASSERT thành active rule + pipeline đọc. **G3** non-admin gọi → 403 + audit. **Effort:** 2.5 ngày.

#### A5 — Offline Evaluation Harness (golden dataset + regression + CI gate)

**Goal:** Đo CHẤT LƯỢNG Kael (diagnosis/price/decline) so ground-truth, chặn regression trước mỗi đổi prompt/route/model. Đây là "Evaluation" đúng nghĩa user hỏi, tách khỏi learning loop.
**Why-gap:** Hiện chỉ có cost-baseline (`kael-q1-baseline.mjs`) + A/B price; KHÔNG có golden eval.
**Steps:**
- [ ] **A5.1** Xây golden dataset ≥60 case (20 điện/20 nước/20 dọn + ≥15 OOS/injection/mismatch) — fixtures: input (desc/chips/ảnh) → expected (service_type, complexity band, price band, decline?).
- [ ] **A5.2** Runner `kael-eval.mjs`: 2 mode — (a) deterministic (provider mock) cho CI nhanh; (b) live (real provider) chạy định kỳ (per [[feedback_mock_vs_real_tests]]).
- [ ] **A5.3** Scoring: service accuracy, complexity accuracy, **price-band hit rate**, decline precision/recall (cho guardrail), latency, cost/case.
- [ ] **A5.4** Threshold gate + report `docs/test-logs/<date>_kael-eval.md`; lưu lịch sử để thấy xu hướng.
- [ ] **A5.5** Wire vào CI/preflight: đổi `prompts.ts`/`routing.config.ts`/model → bắt buộc chạy eval, regress quá ngưỡng → fail.

**Owner files:** `apps/api/scripts/kael-eval.mjs`, `apps/api/src/__tests__/fixtures/kael-golden/*`, `apps/api/src/__tests__/schema/` (gate), docs/test-logs.
**Skills:** kael-tdd, kael-ai-boundary, kael-diagnose, karpathy-guidelines.
**Anti-Illusion Gate:** **G1** chạy live mode 1 lần, lưu điểm thật. **G2** cố tình làm hỏng 1 prompt → eval gate FAIL (chứng minh gate có răng). **Effort:** 3 ngày.

#### A6 — Loop observability + honesty surface

**Goal:** Nhìn được sức khoẻ loop bằng số; tự lộ dead-end.
**Steps:**
- [ ] **A6.1** Query/view: candidate created/promoted/rejected/rolled_back per skill per tuần; applied/override; eval-score trend.
- [ ] **A6.2** "Loop health" report (mở rộng `/log` hoặc command mới): liệt kê candidate kẹt manual_review > N ngày, queue failed, batch error.
- [ ] **A6.3** Alert ngưỡng (promote rate=0 trong X ngày dù có completed jobs → cảnh báo loop có thể hở lại).

**Owner files:** migration view, `.claude/commands/` (report), docs.
**Skills:** kael-supabase, kael-doc-audit. **Anti-Illusion Gate:** **G2** report hiển thị đúng số so K0 baseline. **Effort:** 1.5 ngày.

---

### 31.5 Track B — Knowledge Base (RAG) luật/tiêu chuẩn → 100%

> Hiện 25%. Wire bảng có sẵn → nội dung thật → retrieval → RAG (sau) → citation.

#### B1 — Wire knowledge tables vào runtime retrieval + prompt

**Goal:** Kael ĐỌC THẬT `worker_safety_patterns` + `legal_awareness_patterns` + `service_knowledge_boxes` và bơm vào đúng prompt (worker brief, advisory, educational, decline).
**Why-gap:** Grep = 0 match trong `supabase/functions` → 3 bảng mồ côi.
**Steps:**
- [ ] **B1.1** Viết `retrieveServiceKnowledge(serviceType, problemSlug)`, `retrieveSafetyPatterns(serviceType, topic)`, `retrieveLegalAwareness(topic)` — query theo index có sẵn (`worker_safety_patterns_lookup_idx`, `legal_awareness_patterns_lookup_idx`), filter `is_enabled`.
- [ ] **B1.2** Inject vào prompt builder: `buildAdvisory` + worker-brief stage + `buildKaelSystemPrompt` (mục "Knowledge summary" mới, sanitized).
- [ ] **B1.3** Token budget hoá (theo `memory.ts` pattern) — knowledge chiếm ngân sách có giới hạn, ưu tiên severity 'urgent'>'warning'>'advisory'.
- [ ] **B1.4** Wire vào memory L5 "domain memory" như nguồn thứ 2 cạnh `learning_rules` (hiện L5 chỉ đọc learning_rules limit 5).
- [ ] **B1.5** Flag `KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED` (OFF mặc định, D5 precedent).
- [ ] **B1.6** Self-check vẫn chạy trên output (Rule #3) — knowledge không bypass guardrail.

**Owner files:** `.../kael/advisory.ts`, `.../kael/system-prompt.ts`, `.../kael/memory.ts`, `.../kael/prompts.ts`, new `.../kael/knowledge.ts`, `.../kael/cost-tracking.ts` (flag).
**Skills:** kael-ai-boundary (primary), kael-supabase, kael-tdd, kael-security-sweep.
**Anti-Illusion Gate:** **G2** test live staging: job điện → worker-brief CHỨA guidance từ `electrical_lockout_before_repair`; câu hỏi pháp lý → decline dùng `professional_legal_advice_redirect`. In ra prompt thật (sanitized) có knowledge. **G3** flag OFF → prompt byte-identical. **Effort:** 2 ngày.

#### B2 — Single-source legal/safety boundaries vào guardrail

**Goal:** Xoá dup: legal redirect hardcode ở `permission-gate.ts` → đọc từ `legal_awareness_patterns`.
**Steps:**
- [ ] **B2.1** Map `forbiddenTopicDecision(legal_advice)` → `legal_awareness_patterns(boundary_type='redirect_required')` content.
- [ ] **B2.2** `emergency_redirect` ↔ pattern `boundary_type='emergency_redirect'`.
- [ ] **B2.3** Fallback an toàn nếu DB unavailable (giữ copy cứng làm fallback, log dùng fallback — no silent).
- [ ] **B2.4** Test parity: copy DB == copy cũ (no behavior change ngoài nguồn).

**Owner files:** `.../kael/permission-gate.ts`, `.../kael/knowledge.ts`.
**Skills:** kael-ai-boundary, kael-security-sweep, kael-tdd.
**Anti-Illusion Gate:** **G2** đổi 1 row DB → response đổi theo (chứng minh đọc DB thật, không hardcode). **Effort:** 1 ngày.

#### B3 — Nội dung corpus thật via Perplexity-sourced research (Tu D-OPEN-2)

**Goal:** Thay 5 dòng seed bằng corpus thật, phủ electrical/plumbing/cleaning + ranh giới pháp lý/tiêu dùng HCMC apartment. **Claude tự tìm nguồn qua Perplexity** (integration có sẵn), Tu sign-off.
**Why-gap:** 3 safety + 2 legal = seed, không phải knowledge base.
**Steps:**
- [ ] **B3.1** Research qua **Perplexity/sonar có sẵn** (`source-trust.ts` + `market.ts` pattern) hoặc skill `deep-research`: truy TCVN/QCVN điện hạ áp, quy chuẩn cấp/thoát nước, ranh giới tư vấn pháp lý/tiêu dùng VN. Dùng **source-trust scoring** để lọc; mỗi claim giữ URL/nguồn. KHÔNG bịa (RULES.md #8).
- [ ] **B3.2** Soạn safety patterns/service (mỗi service ≥8–12 pattern thật: cảnh báo, bước an toàn, khi nào dừng/đẩy admin) — mỗi row gắn `source` + `confidence` từ source-trust.
- [ ] **B3.3** Soạn legal_awareness đủ ca: deposit/refund/dispute boundary, không kết luận trách nhiệm, redirect luật sư/115/113.
- [ ] **B3.4** `service_knowledge_boxes` nâng taxonomy-pointer → diagnosis hint per problem_slug (gắn `service_problems`).
- [ ] **B3.5** Migration seed idempotent (on conflict update) + version/`source` metadata. **Tu sign-off từng dòng an toàn/pháp lý (BLOCKING gate)** — Claude trình draft + citation, Tu duyệt.

**Owner files:** migration `2026XXXX_kael_knowledge_corpus.sql`, docs `docs/foundation/kael-knowledge-corpus.md` (nguồn + citation + lý do), `.../kael/source-trust.ts` (reuse).
**Skills:** kael-ai-boundary, kael-supabase, kael-doc-audit, deep-research.
**Anti-Illusion Gate:** **G4** mỗi row có `source` URL thật + source-trust score; Tu sign-off (BLOCKING). **G1** corpus load staging → B1 retrieval trả nội dung mới. **Effort:** 4 ngày (research + duyệt).

#### B4 — Knowledge governance (admin CRUD + versioning + review) — nối LS5/LS6

**Goal:** Knowledge sửa được an toàn: admin CRUD + version + review; LS5 (service knowledge) / LS6 (safety) candidate đổ vào đúng đây.
**Steps:**
- [ ] **B4.1** Admin CRUD knowledge (dùng chung surface A4 — cả `apps/api` + `apps/mobile`): create/update/disable + version history.
- [ ] **B4.2** LS5/LS6 candidate (manual_review) → khi admin approve → ghi `service_knowledge_boxes`/`worker_safety_patterns` (đóng nhánh LS5/LS6 hiện chỉ phát signal).
- [ ] **B4.3** Versioning + rollback knowledge row; audit mọi thay đổi.
- [ ] **B4.4** RLS: chỉ service_role ghi qua RPC; admin review; authenticated read active.

**Owner files:** apps/api admin, migration governance, `.../kael/skills/LS5-*.ts`/`LS6-*.ts` (nối promote).
**Skills:** kael-supabase, kael-security-sweep, kael-tdd.
**Anti-Illusion Gate:** **G2** LS6 candidate → admin approve → row safety mới → B1 retrieval dùng được (đóng end-to-end LS6). **Effort:** 2.5 ngày.

#### B5 — True RAG upgrade (pgvector embeddings + semantic retrieval + citation)

**Goal:** Nâng key-lookup → semantic RAG trên corpus B3. (Tu D-OPEN-4: không hoãn — chạy ngay sau B3/B4 đã dựng corpus thật.)
**Note thực thi:** Vì tuần tự, B5 đứng sau B3/B4 nên corpus đã sẵn. Nếu B3 ra ít chunk vẫn build pgvector nhưng B6 đo độ lợi honest (không "RAG cho oai").
**Steps:**
- [ ] **B5.1** `create extension vector`; thêm cột `embedding vector(N)` + index (ivfflat/hnsw) cho knowledge tables.
- [ ] **B5.2** Pipeline embed (server-side, qua callAI provider embedding) khi insert/update knowledge; backfill corpus.
- [ ] **B5.3** `retrieveKnowledgeSemantic(queryText, k)` — embed query → similarity search → top-k + threshold; hybrid với key-filter (service_type).
- [ ] **B5.4** Citation: trả `knowledge_id` + score; log "đã dùng knowledge X cho turn Y" (audit + cho B6 eval).
- [ ] **B5.5** Cost/latency budget cho embedding; cache; fallback key-lookup khi vector lỗi.

**Owner files:** migration pgvector, `.../kael/knowledge.ts`, provider embedding client.
**Skills:** kael-supabase, supabase-postgres-best-practices, kael-ai-boundary, kael-tdd.
**Anti-Illusion Gate:** **G1** truy vấn ngữ nghĩa (không trùng keyword) vẫn trả đúng knowledge; **G2** citation_id log ra. **Effort:** 4 ngày.

#### B6 — Retrieval eval (knowledge có cải thiện output không?) — dùng A5

**Goal:** Chứng minh knowledge nâng chất lượng, không phải thêm cho có.
**Steps:**
- [ ] **B6.1** Mở rộng golden set (A5) với case cần safety/legal đúng.
- [ ] **B6.2** A/B: knowledge ON vs OFF → so decline precision, safety-mention rate, không tăng cost/latency quá ngân sách.
- [ ] **B6.3** Nếu OFF tốt ngang ON → báo cáo trung thực + cân nhắc rollback (chống illusion "RAG cho oai").

**Owner files:** `apps/api/scripts/kael-eval.mjs` (extend), fixtures.
**Skills:** kael-tdd, kael-ai-boundary. **Anti-Illusion Gate:** **G4** report ON-vs-OFF số thật. **Effort:** 1.5 ngày.

---

### 31.6 Track C — Agentic Orchestrator → 100%

> Hiện 70%. Hợp nhất orchestrator + **full autonomy (γ′)** (Kael tự quyết, invariant gate I1–I5) + audit/replay + escalation. Autonomy flag bật prod chỉ sau D5 + K-FINAL.

#### C1 — Top-level orchestrator hợp nhất + telemetry

**Goal:** Một entrypoint orchestrator điều phối pipeline + case + autonomy, thay vì logic rải khắp `services.ts` (8+ call-site).
**Steps:**
- [ ] **C1.1** Viết `KaelOrchestrator` facade: nhận event/context → chọn case (1–5) → chạy stage → tạo decision → gate → trả kết quả + telemetry, dùng lại `runKaelPurposeStage`/`runKaelParallel` (không viết lại).
- [ ] **C1.2** Chuyển call-site `services.ts` sang facade dần (surgical, giữ behavior); flag để so sánh.
- [ ] **C1.3** Telemetry hợp nhất: mỗi run log purpose, provider, latency, cost, fallback, gate result (1 schema).
- [ ] **C1.4** Không đổi state-machine/permission (chỉ tổ chức lại lời gọi).

**Owner files:** new `.../kael/orchestrator-facade.ts`, `.../services.ts` (refactor call-site), `.../kael/streaming.ts`.
**Skills:** kael-diagnose, kael-tdd, karpathy-guidelines (Surgical Changes — đây là refactor, dễ regress).
**Anti-Illusion Gate:** **G1** trước/sau refactor: cùng input → output + state-transition identical (golden snapshot); **G3** flag so sánh path cũ/mới. **Effort:** 2.5 ngày.

#### C2 — Full Autonomy via Validated Decision Objects + Invariant Gate (Tu D-OPEN-1: γ′)

**Goal:** Kael **tự quyết mọi outcome vận hành** (confirm_ticket, start_matching, scope_change, completion, payment, dispute, cancellation, reassign) **không cần người duyệt**. An toàn = LLM đề xuất `KaelAutonomyDecision`, một **invariant gate deterministic** validate trước khi áp; gate chỉ ALLOW / REJECT (bắt Kael quyết lại) / ESCALATE (hẹp). KHÔNG human approval trong happy path.

**Nguyên tắc bất biến — KHÔNG bao giờ xảy ra bất kể LLM "muốn" gì (ranh giới "không vi phạm pháp luật"):**
- **I1** Không charge/release payment nếu thiếu chuỗi bằng chứng completion + confirmation hợp lệ (anti-fraud, luật tài chính).
- **I2** Không bịa dữ liệu (RULES.md #8); decision phải có `evidence[]` trỏ artifact/job-event THẬT.
- **I3** Không hành động ngoài scope điện/nước/dọn; không tư vấn pháp lý/y tế/tài chính (redirect).
- **I4** Không lộ PII; decision payload sanitized.
- **I5** Chuỗi LLM KHÔNG trực tiếp mutate DB — luôn qua decision object validated server-side. (Đây là *cách thực thi* autonomy an toàn, KHÔNG giới hạn quyền quyết của Kael.)

**Escalation hẹp (giữ autonomy tối đa — chỉ đẩy admin khi thật cần):**
- High-stakes (payment lớn / dispute) **và** confidence < ngưỡng → escalate. Low-stakes thì Kael tự quyết kể cả confidence vừa.
- Evidence-chain vỡ (I1/I2) → xin thêm bằng chứng hoặc escalate, KHÔNG bịa.
- Topic legal-risk → redirect (per `legal_awareness_patterns` B2).

**Steps:**
- [ ] **C2.1** Prompt + structured-output schema để LLM **đề xuất** `KaelAutonomyDecision` cho cả 7 action (Rule #4), kèm evidence + confidence + reversible/appealable.
- [ ] **C2.2** `gateAutonomyDecision()` deterministic (thứ tự): `kaelAutonomyDecisionSchema` → `validateKaelAutonomyTransition` (state-machine) → `evaluateKaelPermissionGate` (authority) → **invariant check I1–I5** → evidence-sufficiency theo action → ALLOW | REJECT (re-decide + feedback) | ESCALATE (`kael_admin_queue`).
- [ ] **C2.3** RPC apply server-side (service_role): chỉ áp decision đã ALLOW; mọi mutate money-state đi qua đây (siết I5). Atomic + status-check (per [[feedback_race_conditions]]).
- [ ] **C2.4** **Invariant fuzz (core proof):** ≥1000 proposal độc hại/ngẫu nhiên (gồm cố vượt I1–I5, prompt-injection–đẻ-decision) → ASSERT 0 phá invariant; mọi reject/escalate có audit.
- [ ] **C2.5** Confidence calibration: ngưỡng escalation theo stakes; log cho A3/A5 tinh chỉnh.
- [ ] **C2.6** Ship sau flag `KAEL_AUTONOMY_FULL_ENABLED` (OFF). **Cờ chỉ BẬT production SAU khi D5 red-team + K-FINAL pass** (§31.2 safety ordering) — build ở C, bật sau D.

**Owner files:** `.../kael/prompts.ts`, `.../kael/artifact-contract.ts`, `.../workflow-orchestrator.ts`, `.../kael/orchestrator-facade.ts`, `.../services.ts`, migration RPC apply-decision.
**Skills:** kael-ai-boundary (primary), kael-security-sweep, kael-tdd, kael-diagnose, karpathy-guidelines.
**Anti-Illusion Gate:** **G3 TRỌNG TÂM** — invariant fuzz ≥1000 chứng minh không phá I1–I5; **G1** live staging Kael tự chạy 1 giao dịch đủ vòng (confirm→match→complete→payment) KHÔNG người chạm; **G4** report rõ ca escalate + lý do. **Effort:** 5 ngày (invariant gate + fuzz).

#### C3 — Decision audit trail + replay

**Steps:**
- [ ] **C3.1** Mỗi decision (policy hoặc LLM-proposed) log: input context (sanitized), evidence, confidence, gate result, resulting_event → bảng audit.
- [ ] **C3.2** Replay tool: tái dựng quyết định từ log để debug (per [[feedback_honest_reporting]] — truy vết được).
- [ ] **C3.3** Link với `kael_interaction_log` hiện có.

**Owner files:** migration decision-audit, `.../kael/*`. **Skills:** kael-supabase, kael-diagnose. **Anti-Illusion Gate:** **G2** replay 1 quyết định thật cho ra cùng gate result. **Effort:** 2 ngày.

#### C4 — Escalation + degradation paths

**Steps:**
- [ ] **C4.1** confidence < threshold hoặc evidence thiếu → escalate `kael_admin_queue` thay vì fallback im lặng.
- [ ] **C4.2** Provider all-fail → degradation mode rõ ràng (decline lịch sự + log), không fake success (#8).
- [ ] **C4.3** Notify admin + SLA cho item escalated.

**Owner files:** `.../kael/orchestrator-facade.ts`, `.../services.ts`, `kael_admin_queue` wiring. **Skills:** kael-ai-boundary, kael-supabase. **Anti-Illusion Gate:** **G3** ép low-confidence → có row admin_queue thật. **Effort:** 2 ngày.

#### C5 — Orchestrator resilience (retry/timeout/circuit hợp nhất)

**Steps:**
- [ ] **C5.1** Chuẩn hoá retry bounded + timeout per stage (đã có `withDbTimeout`, circuit-breaker) vào 1 policy.
- [ ] **C5.2** Test chaos: provider timeout/500/circuit-open → fallback đúng, cost bounded (per [[feedback_race_conditions]] + Rule #10).
- [ ] **C5.3** Cost ceiling per request enforce (đã có `costCeilingUsd` — verify mọi path).

**Owner files:** `.../kael/orchestrator.ts`, `routing.ts`, `circuit-breaker.ts`, `rate-limit.ts`. **Skills:** kael-diagnose, kael-security-sweep, kael-tdd. **Anti-Illusion Gate:** **G1/G3** chaos test thật. **Effort:** 1.5 ngày.

#### C6 — Agentic scenario test harness (5 case E2E + autonomy conformance)

**Steps:**
- [ ] **C6.1** E2E mỗi case (normal/demanding/worker-cancel/customer-cancel/dispute) từ event → decision → state thật.
- [ ] **C6.2** Conformance: mọi `KAEL_AUTONOMY_ACTION_EVENTS` mapping được test + state-machine không có transition mồ côi.
- [ ] **C6.3** Wire vào CI + A5 eval.

**Owner files:** `apps/api/src/__tests__/`, fixtures. **Skills:** kael-tdd, kael-ai-boundary. **Anti-Illusion Gate:** **G1** 5 case chạy staging có evidence. **Effort:** 2.5 ngày.

---

### 31.7 Track D — System Prompt & Guardrails → 100%

> Hiện 85%. Single-source charter + egress coverage + semantic guard + injection classifier + red-team + observability.

#### D1 — Charter single-source + versioning + conformance test

**Goal:** Charter trong code (`system-prompt.ts`) và file (`packages/shared/kael/charter/*`) là 1 nguồn; output tuân charter có test.
**Steps:**
- [ ] **D1.1** Audit: `system-prompt.ts` hardcode identity/persona/mission vs `charter/{tone-matrix.yaml,language-rules.md,forbidden-language.json}` — xác định nguồn thật đang dùng.
- [ ] **D1.2** Single-source: charter-files là nguồn, `system-prompt.ts` load (hoặc generate test so khớp); bump `KAEL_CHARTER_VERSION`.
- [ ] **D1.3** Conformance test: forbidden categories trong prompt == `forbidden-language.json`; mission/persona khớp.

**Owner files:** `.../kael/system-prompt.ts`, `packages/shared/kael/charter/*`, tests. **Skills:** kael-ai-boundary, kael-doc-audit, kael-tdd. **Anti-Illusion Gate:** **G2** đổi `forbidden-language.json` → prompt + self-check đổi theo (chứng minh single-source). **Effort:** 1.5 ngày.

#### D2 — Egress audit: mọi AI output qua self-check

**Goal:** Không có đường output AI nào tới user mà bỏ qua `runKaelSelfCheckPipeline`.
**Steps:**
- [ ] **D2.1** Liệt kê MỌI egress AI→user (chat turn, advisory, worker-brief, decline, clarification, scope-change).
- [ ] **D2.2** Xác nhận từng cái qua self-check; cái nào opt-in/thiếu → wire vào (orchestrator self-check hiện per-stage opt-in).
- [ ] **D2.3** Test coverage: mỗi egress có negative test (forbidden phrase → fallback).

**Owner files:** `.../kael/output-pipeline.ts`, `.../kael/orchestrator.ts`, `.../services.ts`, `.../kael/self-check.ts`. **Skills:** kael-ai-boundary, kael-security-sweep, kael-tdd. **Anti-Illusion Gate:** **G2** inject câu cấm vào từng egress (test) → đều bị chặn. **Effort:** 1.5 ngày.

#### D3 — Semantic guardrail layer (LLM-assist, bounded cost)

**Goal:** Nâng self-check từ substring → semantic, giữ list cứng làm fast-path + fallback.
**Steps:**
- [ ] **D3.1** Classifier rẻ (haiku) chấm output: fear/accusatory/absolute/AI-self-ref/exact-price — chỉ chạy khi qua fast-path nghi ngờ (bounded cost).
- [ ] **D3.2** Fail → regenerate→fallback (pipeline có sẵn).
- [ ] **D3.3** Cost cap + flag-gated; fallback về substring khi classifier lỗi (no silent).
- [ ] **D3.4** Eval (A5) decline/guardrail precision-recall trước/sau.

**Owner files:** `.../kael/self-check.ts`, `routing.config.ts`, `cost-tracking.ts`. **Skills:** kael-ai-boundary, kael-tdd, kael-diagnose. **Anti-Illusion Gate:** **G1** paraphrase né-substring bị semantic bắt (test thật). **Effort:** 3 ngày.

#### D4 — AI injection classifier layered on boundary-guard

**Goal:** Bổ sung lớp AI cho injection (code `boundary-guard.ts:9` tự thừa nhận hoãn).
**Steps:**
- [ ] **D4.1** Sau regex fast-path (giữ, cost 0), nếu nghi ngờ → classifier injection.
- [ ] **D4.2** Giữ "decline = cost 0" cho case regex bắt được; chỉ tốn cho biên.
- [ ] **D4.3** Red-team injection corpus (nối D5).

**Owner files:** `.../kael/boundary-guard.ts`, `routing.config.ts`. **Skills:** kael-security-sweep, kael-ai-boundary, kael-tdd. **Anti-Illusion Gate:** **G3** biến thể injection mới (không match regex) bị classifier chặn. **Effort:** 2.5 ngày.

#### D5 — Red-team regression corpus

**Goal:** 1 bộ adversarial chạy CI: injection, jailbreak, scope-evasion, price-extraction, PII-extraction, fear-bait.
**Steps:**
- [ ] **D5.1** Soạn ≥40 adversarial case (gồm biến thể tiếng Việt không dấu).
- [ ] **D5.2** Runner + threshold (0 bypass cho money/PII/scope); report.
- [ ] **D5.3** Wire CI: đổi guardrail/prompt → chạy red-team.

**Owner files:** `apps/api/src/__tests__/security/kael-redteam/*`, runner. **Skills:** kael-security-sweep, kael-ai-boundary, kael-tdd. **Anti-Illusion Gate:** **G3** corpus phải có case ĐANG bypass được hôm nay (nếu có) → ghi nhận trung thực, fix, rồi xanh. **Effort:** 2.5 ngày.

#### D6 — Guardrail observability + feed feedback loop

**Steps:**
- [ ] **D6.1** Log mọi guardrail-trip (rule nào, input class) → bảng/analytics.
- [ ] **D6.2** Feed sang Track A (LS7 decline-reason) + red-team (case mới từ trip thật).
- [ ] **D6.3** Dashboard trip-rate theo loại.

**Owner files:** `.../kael/*` audit, migration, docs. **Skills:** kael-supabase, kael-doc-audit. **Anti-Illusion Gate:** **G2** trip thật xuất hiện trong analytics + sinh case red-team. **Effort:** 1.5 ngày.

---

### 31.8 Phase K-FINAL — Cross-track Integration + E2E + Honesty Sign-off

**Goal:** 4 track hoạt động cùng nhau, chứng minh 100% bằng E2E thật, report trung thực.
**Steps:**
- [ ] **KF.1** E2E full: 1 giao dịch thật staging → Kael dùng knowledge (B) trong prompt → decision qua orchestrator+gate (C) → output qua guardrail (D) → job xong → candidate (A) → promote → pipeline đọc rule mới. 1 đường dây xuyên 4 track.
- [ ] **KF.2** Chạy toàn bộ: A5 eval + D5 red-team + C6 scenario + full test sweep → so K0 baseline.
- [ ] **KF.3** Cập nhật `% mỗi track` với BẰNG CHỨNG (không tự phong 100%); cái nào chưa 100% → ghi rõ còn thiếu gì (per [[feedback_no_hiding_gaps]]).
- [ ] **KF.4** `/log` + `/test-report` + README; cập nhật `code-ownership-map.md` cho file mới.
- [ ] **KF.5** Tu sign-off từng track.

**Anti-Illusion Gate:** **G1–G4 toàn phần.** Không track nào được tuyên 100% nếu thiếu closure proof. **Effort:** 2 ngày.

---

### 31.9 Effort Summary

```text
K0                         0.5
Track A (A1..A6)           3 + 2 + 2 + 3 + 3 + 1.5     = 14.5
Track B (B1..B6)           2 + 1 + 4 + 3 + 4 + 1.5     = 15.5
Track C (C1..C6)           2.5 + 5 + 2 + 2 + 1.5 + 2.5 = 15.5
Track D (D1..D6)           1.5 + 1.5 + 3 + 2.5 + 2.5 + 1.5 = 12.5
K-FINAL                    2.0
------------------------------------------------------------
Sequential total           ~60.5 agent-day (Tu D-OPEN-3: tuần tự, không song song)
```

**Lưu ý:** C2 (full autonomy + invariant fuzz ≥1000), B3 (Perplexity sourcing + Tu sign-off), B5 (pgvector) là 3 phase nặng/rủi ro nhất. Autonomy flag chỉ BẬT production sau D5 + K-FINAL (§31.2 safety ordering).

---

### 31.10 Risks + Mitigation

| Risk | Track | Mitigation |
|---|---|---|
| Đóng loop sai → rule rác tự active hại giá | A | RPC re-validate forbidden_effects server-side; evidence gate 5+conf0.6; auto-rollback A3; flag-gated AB nhỏ |
| Promote không atomic → race (per [[feedback_race_conditions]]) | A | RPC SECURITY DEFINER 1 transaction; status-check |
| Nội dung pháp lý/an toàn bịa (RULES.md #8) | B | D-OPEN-2 nguồn thật + Tu sign-off từng dòng + `source` truy vết |
| pgvector over-engineer cho corpus nhỏ | B | B5 chạy sau B3/B4 (corpus đã sẵn); B6 đo độ lợi honest (ON vs OFF); B1 key-lookup nền |
| Full autonomy nới quyền money-state (RULES.md) | C | Invariant gate I1–I5 + state-machine + permission; fuzz ≥1000; flag BẬT prod chỉ sau D5+K-FINAL |
| Autonomy (C) build trước guardrail (D) trong chuỗi tuần tự | C/D | C2 ship flag OFF; cờ bật prod chỉ sau D5 red-team + K-FINAL; C2 tự có invariant fuzz nội bộ |
| Refactor orchestrator regress | C | golden snapshot before/after; flag so path; Surgical Changes |
| Semantic guard tăng cost/latency | D | chỉ chạy khi fast-path nghi ngờ; cost cap; flag; eval A5 |
| "Cảm giác ảo" tái diễn | ALL | Anti-Illusion Gate G1–G4 mọi phase; closure proof bắt buộc |

---

### 31.11 Skills Mapping Summary

`karpathy-guidelines` (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven) áp dụng **mọi phase**. Primary skill theo track:
- **A:** kael-supabase + kael-tdd + kael-ai-boundary + kael-security-sweep
- **B:** kael-ai-boundary + kael-supabase + kael-doc-audit (+ supabase-postgres-best-practices cho B5)
- **C:** kael-ai-boundary + kael-diagnose + kael-security-sweep + kael-tdd
- **D:** kael-ai-boundary + kael-security-sweep + kael-tdd + kael-doc-audit
- **UI (A4/B4):** glass-liquid-signature + kael-motion + kael-frontend-test
Mỗi phase mở đầu bằng pre-flight (critical.md §5) + đọc `code-ownership-map.md` row liên quan.

---

### 31.12 Decisions — RESOLVED (Tu, 2026-06-04)

- [x] **D-OPEN-1:** Full autonomy (γ′) — Kael tự quyết, an toàn bằng invariant gate I1–I5, KHÔNG human-in-loop. → §31.6 C2.
- [x] **D-OPEN-2:** Claude tự tìm nguồn qua Perplexity + source-trust; Tu sign-off. → §31.5 B3.
- [x] **D-OPEN-3:** Tuần tự A→B→C→D. → §31.2.
- [x] **D-OPEN-4:** Không hoãn phase nào — B5 pgvector + C2 full autonomy in-scope.
- [x] **D-OPEN-5:** Admin cả `apps/api` + `apps/mobile`. → A4/B4.
- [x] **D6:** Codex build, Claude verify result (review + anti-illusion gate).

---

### 31.13 Change Log

```text
v0.1 — 2026-06-04 — Claude draft đầu tiên. 26 phase, 4 track. Audit baseline A60/B25/C70/D85.
                    Chờ Tu review + chốt D-OPEN-1..5. CHƯA execute.
v0.2 — 2026-06-04 — Tu chốt D-OPEN-1..5 + D6. C2 → full autonomy (γ′) + invariant gate I1–I5 + fuzz≥1000;
                    B3 → Perplexity sourcing; roadmap tuần tự; admin api+mobile; không hoãn (B5/C2 in-scope).
                    Effort ~60.5d seq. Autonomy flag bật prod chỉ sau D5+K-FINAL. Codex build, Claude verify. READY.
```

---

## 32. Kael Perceived Performance + Worker Parity + B2C Anti-Disintermediation + Interaction Design — 2026-06-04

### 32.0 Plan Metadata + Mục tiêu

```text
Plan ID:        plan-kael-perceived-perf-worker-parity-antileak-20260604
Created:        2026-06-04
Owner:          Manh Tu (manhtu0407@gmail.com)
Branch:         claude/adoring-leavitt-5d0ad6 (worktree)
File location:  Plan.md §32 (durable, canonical) + 2 companion docs (xem dưới)
Status:         DESIGN LOCKED v0.8 — Tu chốt D1–D14. CHƯA execute. Codex build, Claude verify. Build sau §31.
Trigger:        Tu yêu cầu fix perceived-performance cho Kael (streaming/thinking-state/TTFT) →
                mở rộng thành parity worker + B2C anti-disintermediation + interaction-design (session adoring-leavitt).
Scope:          (Part A) perceived-perf customer chat A4/A5; (Part B) worker Kael chat felt-parity + perceived-perf;
                (§32.6) B2C anti-disintermediation & retention; (§32.7) apartment access app-only;
                (§32.8) flexible-not-slop interaction principle cho 4 scenario + worker chatbot.
Out of scope:   Đổi runtime boundary (Expo→Edge→DB giữ nguyên); payment rail thật (defer); building/tower integration
                (B2C thuần — KHÔNG xin được toà); learning/post-job paths; admin Kael monitoring.
Companion docs: docs/design/kael-perceived-performance-streaming-20260604.md   (per-step File/Action/Acceptance đầy đủ)
                docs/architecture/kael-worker-functional-audit-20260604.md     (functional audit + parity matrix + reuse)
Effort:         Chưa ước lượng agent-day (chốt ở Phase 0/WBF.0). Part A trước, Part B sau, §32.6–8 đan vào B-FUNC.
Skill mapping:  karpathy-guidelines (mọi phase) + kael-ai-boundary, kael-motion, glass-liquid-signature,
                kael-frontend-test, kael-supabase, kael-tdd, kael-security-sweep (xem §32.11).
```

**Mục tiêu chính (đo được, không tô hồng):**

1. **Perceived-perf THẬT, không ảo thuật rỗng:** thinking-state nối với stage backend THẬT (không phải label đoán client-side); TTFT-thinking-state < 800ms; token-streaming cho text hội thoại; mọi phase frontend có **recording app thật** (D6).
2. **Worker Kael chat đạt felt-parity với customer**, điều chỉnh theo vai trò (job-assist/advisory, KHÔNG price-intake), reuse pattern customer, **giữ customer chat nguyên vẹn** (sibling, zero regression).
3. **Giảm rủi ro mất khách (disintermediation) trong B2C thuần** bằng moat giá-trị/tiện-lợi/kiểm-soát-liên-hệ — KHÔNG phụ thuộc toà.
4. **Kael xử 4 scenario căng "linh hoạt mà không slop":** deterministic spine + bounded LLM ở rìa + guards.

**Nguyên tắc xuyên suốt:** Tiền/scope/outcome **luôn trên gạch structured** (scope-change + `buildKaelAutonomyDecision`); LLM đề xuất trong rào, không bao giờ tự mutate money-state (tuân RULES.md #2/#3/#8). Perceived-perf là **frontend outcome có bằng chứng**, không phải metric backend. Stage-streaming trước token-streaming.

---

### 32.0.1 Authority refs (đọc theo thứ tự bắt buộc trước khi execute)

```
1. critical.md          (§0 lifecycle, §8 verify, §12 ai-boundary, §14 supabase, §15 security)
2. RULES.md             (#2 server-side AI, #3 validate output, #6 scope, #8 no fake data, #9 PII, #10 timeout/retry, autonomy/money boundary)
3. STRUCTURES.md        (§9 Kael workflow + providers, §12 state machines, §15 final-price authority; nếu pin /kael/chat contract → §32.9 flag)
4. design.md (+ design/*)(motion/loading contract — mọi motion phase phải tuân; glass-liquid-signature)
5. docs/architecture/code-ownership-map.md  (map phase → owner files TRƯỚC khi edit)
6. docs/design/kael-perceived-performance-streaming-20260604.md   (companion — per-step detail)
7. docs/architecture/kael-worker-functional-audit-20260604.md     (companion — audit/parity/reuse)
8. CLAUDE.md            (lock notice; runtime boundary)
9. MEMORY.md            (last)
```

---

### 32.0.2 Decision Log (Tu chốt 2026-06-04 trừ khi ghi khác)

- **D1** — Lưu progress theo shape `kael_progress` trên `kael_chat_sessions` (customer); sibling cho worker (xem D12).
- **D2** — Tier-1 live channel = **scoped fast-poll** (~800ms, dừng on terminal), KHÔNG đảo quyết định defer Realtime.
- **D3** — Đi tới **Tier-2 SSE** thật (Edge `Deno.serve` hỗ trợ ReadableStream; mobile `expo/fetch` reader).
- **D4** — Token-stream BẬT cho field **chỉ khi** là một `callAI` text completion streamable — khảo sát từng call (Phase 0.4), không hardcode. Giá ước tính (synthesizePrice thuần) KHÔNG bao giờ stream.
- **D5** — **Codex build, Claude verify** result (mỗi step có dòng Verify).
- **D6** — Mọi phase frontend **không DONE** nếu thiếu recording app thật (VISIBLE DONE).
- **D7** — Thinking-state dùng pattern **"Thought for {n}s"**: stepper collapse thành disclosure tap-mở-lại, `{n}` đo THẬT, copy "phân tích" không "suy nghĩ" (pipeline ≠ chain-of-thought).
- **D8** — (SUPERSEDED 2026-06-04) Trước: "không thêm section Plan.md". Tu override → **consolidate hết vào Plan.md §32** (section này). Companion docs giữ per-step detail.
- **D9** — Phủ **CẢ hai actor** (customer + worker), không customer-only.
- **D10** — Worker Kael = **bounded advisory chatbot** (real callAI, zero quyền tiền/scope), KHÔNG negotiator có quyền tiền (reject option 3, vi phạm RULES).
- **D11** — **Parity principle:** cái gì customer chatbot có thì worker cũng có, điều chỉnh theo vai trò. (Audit: workflow/lifecycle ĐÃ parity; chatbot/capability CHƯA.)
- **D12** — **Core felt-parity (option 1)** + **sibling tables** `kael_worker_chat_sessions`/`turns` (reuse DESIGN/patterns customer, KHÔNG role-flag bảng customer-bound). Endpoint nhỏ (feedback/consent/memory-delete) = fast-follow WBF.7.
- **D13** — **B2C anti-disintermediation = moat giá-trị/tiện-lợi/kiểm-soát-liên-hệ, KHÔNG access-control toà** (B2C thuần không xin được toà). Tier 1 (chat-guard + risk memory) làm ngay (cưỡi B-FUNC); Tier 2 (re-book, guarantee) phần phụ thuộc payment → defer. Chấp nhận một sàn leak; KHÔNG đốt niềm tin worker.
- **D14** — **Kael interaction = flexible-not-slop**: deterministic spine (escalate/approve/penalty/who-decides/evidence-lock — không bao giờ LLM) + bounded LLM ở rìa (detection nuance + phrasing) + guards (self-check, neutrality assertion, stopAiLoop, fallback-template, admin-decides). Chi phối B-FUNC + 4 scenario.

---

### 32.0.3 Definition of Done — Gates (áp dụng MỌI phase)

```text
G1 — Real path proof:    Bằng chứng end-to-end trên staging/DB thật (row/cost/log thật), không mock.
G2 — Closure proof:      Output phase được CONSUMED downstream (progress row → mobile đọc & render; turn → session;
                         decision → state qua gate). Chống "bảng mồ côi / loop hở".
G3 — VISIBLE DONE (D6):  Phase frontend có recording app thật (light/dark/reduced-motion) chứng minh thấy được ở UI.
G4 — Honesty gate:       Không fake stage/label; stage fail→copy trung thực; không lộ provider name; không PII trong row/log.
G5 — Money-state gate:   (Part B/§32.6/§32.8) Không có path nào để LLM/UI tự đổi giá/scope/status/money. Negative test bắt buộc.
```

---

### 32.1 Audit Findings (consolidated, evidence-cited)

**32.1.1 Perceived-perf gap.** Luồng chat đồng bộ: `api.ts:74` `await response.text()` buffer hết; Edge `services.ts:1763` `await runKaelPipeline` block tới hết pipeline. Budget (`routing.config.ts:36-41`): intent 2.5s → ∥(vision 4.5s, market 4s) → synth 3s ⇒ 4–10s. ⇒ TTFT-estimate < 800ms **bất khả thi** đồng bộ. "Streaming" hiện tại = typewriter cosmetic SAU full response (`thread.tsx:395`).

**32.1.2 Thinking-state đứt 3 chỗ.** Backend ghi stage thật vào `jobs.kael_progress` (`streaming.ts`, gọi trong `pipeline.ts`) nhưng: (1) chat handler KHÔNG truyền `progressJobId` (`services.ts:1763`, chat `job_id:null`) → early-return; (2) mobile không đọc; (3) Realtime defer, chat poll 8s (`realtime.ts`). Live-activity label là đoán client-side (`thread.tsx:434`).

**32.1.3 Worker-Kael functional reality.** MỌI `callAI` trong Kael = customer estimate (intent×2/vision/market/price-synth) + **scope-change×2**. Worker LLM = scope-change ONLY. Dispatch/brief/autonomy/protection đều **deterministic** (brief `buildWorkerBriefOutput` sync no-await; autonomy `buildKaelAutonomyDecision` 28+ site → validate → atomic RPC). "Worker Kael chatbot" = stub: `askKaelForWorker`→`buildWorkerKaelAnswer` template, 3×/job, no LLM; relay chat = human↔customer.

**32.1.4 Parity.** Workflow/lifecycle ĐÃ parity (`workflow-phase-context.ts` role-aware `customer|worker|shared`; shared `useServiceWorkflow`). Chatbot/capability CHƯA: customer có `kaelChatService` (create/list/get/sendTurn/confirm) + feedback + training-consent + memory-delete; worker chỉ có `kael-clarify` 3×/job. (Memory read+delete worker ĐÃ có: `DELETE /me/kael-memory` role-aware → `worker_kael_memory`; gap thật = feedback + training-consent + chat session.)

**32.1.5 Reuse.** `kael_chat_sessions` (mig 20260520130514) `customer_id`/`service_type` NOT NULL + customer RLS + turn role `customer|kael|system` → KHÔNG role-flag an toàn. Handlers booking-coupled (`runKaelPipeline`) nhưng pattern-rich (idempotency, rate-limit RPC `check_kael_chat_rate` 5/min·20/hr, turn lifecycle, cost, self-check). Mobile `kael-chat/` nửa reuse (thread/thinking-state/progressive-text/composer/glass dùng lại; estimate/booking không). ⇒ **sibling table** reuse design.

**32.1.6 Interaction scenarios.** 5 file `agentic/`: case-1 normal (happy-path choreography, notification budget max 5 + silent statuses), + 4 scenario căng: case-2 demanding (keyword→`renderEmpathyTemplateV2`+stopAiLoop+admin), case-3 worker-cancel (classify→auto-approve/admin+abuse), case-4 customer-cancel (classify→category+sub-case+Phase0 no-penalty), case-5 dispute (route→**neutral fact-summary** "does not decide outcome"+`assertNeutralDisputeLanguage` guard+evidence-lock→admin). Gần như KHÔNG LLM (1 soft `llmSentiment` assist không tự bấm hard).

**32.1.7 Anti-disintermediation reality.** Relay chat (`sendJobMessage:4250`) lưu tin worker NGUYÊN VĂN; lớp quét duy nhất `maybeHandleDemandingCustomerJobChat:4293` **chỉ chạy cho customer** → tin worker không bị giám sát. Regex ẩn SĐT/email ĐÃ có (`utils.ts`, `memory-sanitizer.ts`, agentic case 2/3/4/5) nhưng KHÔNG áp lên relay chat sống. **Tin tốt:** worker KHÔNG được cấp SĐT khách (`JOB_DETAIL_SELECT` không có phone; relay dùng `sender_id`) → kênh liên hệ đã in-app-only. Đã có: address privacy gate (trước accept), scope-change anti-fraud, cancel abuse/no-show, `worker_kael_memory.red_flags`, `kael_admin_queue`. CHƯA có: arrival geofence (nút `arrived` thủ công), access coordination, re-book-same-worker-in-app.

---

### 32.2 Reframes (3 pivot chiến lược)

1. **Stage-streaming > token-streaming.** Kael price-check là pipeline đa-stage trả JSON estimate, không phải chat 1-LLM long-form. Đòn giá trị nhất = stream tiến trình stage THẬT (backend đã tính sẵn). Token-streaming chỉ đáng cho text hội thoại (clarification/advisory/worker-assist). Tách TTFT: **TTF-thinking-state < 800ms (khả thi)** vs TTF-estimate 4–10s (pipeline-bound).
2. **B2C moat = value/convenience/contact, KHÔNG access-control.** B2C thuần không kiểm soát được cửa/toà. Kênh liên hệ đã in-app-only → khoá nốt + nâng giá trị ở lại. Không chặn được 100% (gặp ngoài đời); mục tiêu = chặn leak lười + bỏ ma sát ở lại + nâng giá trị ở lại + phí công bằng.
3. **Flexible-not-slop.** Rủi ro hiện tại KHÔNG phải AI-slop (gần như không có AI) mà là **rigidity** (keyword giòn + template chết). Sửa = bounded LLM ở rìa giữ deterministic spine + guards (D14). Đừng nhét LLM ngây thơ vào money/dispute.

---

### 32.3 Part A — Customer Perceived-Performance

Phases (per-step detail ở companion doc §3):
- **P0 Pre-plan** (read-only): đọc governance stack + restate rule/reframe/3-breaks; **0.4 inventory mọi `callAI`** → phân loại structured vs streamable (resolve D4).
- **P1 Tier-1 backend:** migration `kael_progress jsonb` vào `kael_chat_sessions` + RLS; generalize `updateKaelProgress` target `{table,id}` (`streaming.ts:37`); chat handler truyền session progress target; route `GET /kael/chat/:id/progress`.
- **P2 Tier-1 frontend (visible):** `kaelChatProgressService` + fast-poll while sending (~800ms, cleanup); stage→copy map (§32.5); feed stage THẬT vào `KaelLiveActivityIndicator` (local guess chỉ là fallback trước first event); honesty (fail→neutral, ẩn vision khi skip); a11y live-region.
- **P2M Thinking-state motion (visible):** instant ack + first-paint <800ms; **stage stepper tick dần** (mint check + dim); avatar micro-motion; **"Thought for {n}s" collapse** (D7) tap mở lại; Reduce Motion/Transparency; perf budget.
- **P3 Tier-2 SSE backend:** spike Edge wall-clock; `sse.ts` (text/event-stream + heartbeat); streaming variant `/kael/chat/:id/stream` emit stage/token/result/error; token chỉ field streamable (D4); JSON fallback giữ nguyên.
- **P4 Tier-2 frontend (visible):** `kael-stream.ts` (`expo/fetch` reader + SSE parse), tách khỏi `api.ts` buffered; reconnect: drop → re-fetch final session qua JSON `GET /kael/chat/:id` (idempotent), **KHÔNG token-replay v1** (cần `id:` event + per-turn buffer → defer); render stage + token incremental; **đo TTFT thật**; degrade về poll/JSON.
- **P4M Streaming-text motion (visible):** caret `▍` mép stream; token-driven reveal (thay timer 110ms cứng); auto-scroll follow; completion settle glass-liquid.
- **P5 Cross-cutting:** contrast; Reduce Motion/Transparency full; honesty+security audit; TTFT acceptance; test log.

---

### 32.4 Part B — Worker Kael Chat at Felt-Parity (D9–D12)

Guardrail toàn Part B (RULES #2/#3/#6/#8, `kael-ai-boundary`): **advisory-only, zero quyền tiền/scope**; tiền/scope redirect về scope-change + autonomy rails. Mọi turn Zod + self-check; fallback template khi AI fail. **G5 money-state gate bắt buộc.**

**B-FUNC — build worker chat session felt-parity (sibling, reuse pattern):**
- **WBF.0** (design, no code): đọc kael-ai-boundary + charter + self-check + customer chat stack + `askKaelForWorker`; ra boundary spec + reuse/adaptation map. **Tu sign-off.**
- **WBF.1** schema sibling: `kael_worker_chat_sessions` (job-scoped, `worker_id NOT NULL`, worker statuses, idempotency/cost) + `kael_worker_chat_turns` (role `worker|kael|system`; content-type text/clarification/guidance/photo_request/photo_attached/error — no estimate; **`media_refs text[]`** cho ảnh bằng-chứng-tại-chỗ để WBF.5 attach có chỗ lưu) mirror customer design + indexes; worker RLS (`worker_id=auth.uid()`, read-only client, service-role write) + worker rate-limit RPC.
- **WBF.2** routing: thêm `worker_assist` purpose (cheap primary, Anthropic fallback, budget/ceiling/maxTokens/cap).
- **WBF.3** backend: `kael/worker-assist.ts` advisory engine (callAI + Zod + self-check + cost + fallback, zero autonomy) + handlers `create/send/get/list WorkerKaelChat` mirror customer (idempotency, rate-limit, lifecycle) nhưng job-scoped advisory (no runKaelPipeline); routes `/workers/me/kael/chat` (+`/:id`).
- **WBF.4** safety suite (**money-state gate, trước UI**): refuse set price/scope/status → redirect scope-change; prompt-injection; out-of-scope; no provider name; PII-safe; RLS isolation worker A≠B.
- **WBF.5** mobile: extract shared chat primitives từ `kael-chat/` (thread/thinking-state/progressive-text/composer/glass) → worker chat surface (job-assist + history), **distinct với relay chat**, conform `worker-production-contract.md`; **parity UX:** đính ảnh (bằng chứng tại chỗ — giá trị cao), mic, clarification affordances.
- **WBF.6** wiring: `workerKaelChatService` mirror `kaelChatService`; route + nav.
- **WBF.7** fast-follow capability parity: `/workers/me/kael-feedback` + `/workers/me/kael-training-consent` (get/set) + UI tối thiểu. (Memory-delete worker ĐÃ có qua `DELETE /me/kael-memory` role-aware — KHÔNG thêm endpoint trùng.)

**B-PERF — perceived-perf trên worker (sau B-FUNC, reuse Part A + §2A motion):**
- **WBP.1** scope-change thinking-state: emit 2-step progress (`reviewing`→`estimating`) qua generalized `updateKaelProgress` → scope-change-scoped target; mobile thay static `'Kael đang xét'` (`worker-surfaces.tsx:460`) bằng state thật + honesty copy.
- **WBP.2** advisory chat thinking-state + **token streaming** (worker_assist là single callAI completion → đây là chỗ beat-4 token-stream phát huy đầy đủ); reuse P3/P4 contract + caret/settle.
- **WBP.2M** worker motion (stepper scope-change; caret/settle advisory; "Thought for {n}s") conform worker contract + glass-liquid + kael-motion.
- **WBP.close** Phase-5 gates scope worker.

---

### 32.5 Stage → Copy Contract + SSE Event Contract + Reference Choreography

**Reference choreography (Claude/ChatGPT turn, 5 beat — acceptance cho motion phase):** (1) instant ack; (2) fast thinking paint <800ms; (3) discrete steps tick off (1 dòng active nhấn, dòng xong dim); (4) token stream + caret; (5) clean settle (collapse "Thought for Xs"). Stage Kael map 1:1 vào step-row.

**Stage→copy (VI primary, EN switch; phản ánh stage THẬT, fail→neutral, no provider name, district HCMC):**

| stage/status | VI | EN |
|---|---|---|
| intent_classification running | 🧭 Đang đọc và phân loại yêu cầu… | Reading and classifying… |
| vision_analysis running (chỉ khi có ảnh) | 🖼️ Đang phân tích mô tả và hình ảnh… | Analyzing description & photos… |
| market_lookup running | 🔍 Đang tra cứu giá thị trường khu {district}… | Checking market rates in {district}… |
| problem_synthesis running | 📚 Đang đối chiếu khung giá chuẩn… | Matching standard price bands… |
| price_synthesis running | 🧠 Đang tổng hợp ước tính và rủi ro… | Synthesizing estimate & risks… |
| any failed/fallback | ⚙️ Đang dùng dữ liệu nội bộ của Kael… | Using Kael's internal data… |

**SSE event contract (Tier-2):**
```
event: stage   data: {"stage":"market_lookup","status":"running","progress":0.32,"district":"Quận 7"}
event: token   data: {"field":"clarification","delta":"…"}   // chỉ field streamable (D4)
event: result  data: { <full Zod-validated session> }
event: error   data: {"code":"AI_FAILED","message":"<friendly VI>"}
: heartbeat   // ~10s
```

**Reconnect v1:** contract KHÔNG có `id:` → KHÔNG token-replay. Drop → client re-fetch turn đã persist qua `GET /kael/chat/:id` (idempotent, xem P4). Replay token-level cần thêm `id:` mọi event + per-turn buffer keyed by `Last-Event-ID` → defer.

---

### 32.6 B2C Anti-Disintermediation & Retention (D13 — 4 trụ, không phụ thuộc toà)

**Trụ 1 — Làm chủ kênh liên hệ (đã có, khoá nốt):** liên hệ chỉ in-app (đã đúng, không lộ phone). **Chat-guard:** áp regex SĐT/email có sẵn + keyword VN solicitation ("gọi em", "số riêng", "tiền mặt", "khỏi qua app", "trực tiếp", "zalo") cho **CẢ 2 chiều** (vá lỗ customer-only ở `sendJobMessage`). Worker→khách: ẩn liên hệ + Kael nudge + tăng điểm rủi ro. (Sau) số ẩn/proxy nếu cần voice. → **Tier 1, cưỡi B-FUNC** (Kael nudge dùng worker advisory engine).
**Trụ 2 — Ở lại tiện hơn rời đi:** **re-book-same-worker IN-APP 1 chạm** (giết lý do xin số); lưu **hồ sơ tiếp cận căn hộ** in-app (re-book tức thì); loyalty worker (chuỗi on-platform → ưu tiên/bậc phí thấp). → phần re-book phụ thuộc UX customer, Tier 2.
**Trụ 3 — Rời đi đắt với KHÁCH (moat thật):** bảo hành on-platform (hỏng X ngày → sửa free/hoàn); bảo vệ thanh toán (khi có rails — defer); hoà giải + thợ thẩm định + rating history chỉ on-platform; Kael cho khách **CẢM** được lớp bảo vệ. → phụ thuộc payment, Tier 2/defer.
**Trụ 4 — Phí công bằng:** phí thấp + bảo vệ thật → đi ngoài không bõ. Phí cao mới đẻ động cơ né.
**Risk memory:** điểm rủi ro leak trong `worker_kael_memory.red_flags` (solicitation, cancel-after-match trùng khách-không-quay-lại, "khách không phản hồi" lặp) → de-prioritize matching + `kael_admin_queue`. → **Tier 1.**
**Honesty/tension:** không chặn 100% (gặp ngoài đời); cưỡng chế **gated bằng bằng chứng** (autonomy + admin queue), KHÔNG nuke worker khan hiếm vì tín hiệu yếu. Tier 1 (chat-guard + risk memory) ngay; Tier 2 (re-book + guarantee) khi có volume/payment.

---

### 32.7 Apartment Access — "Last 50 Meters" (app-only, B2C thuần)

Reframe: địa chỉ+map đưa thợ TỚI TOÀ; cái đưa tới CỬA là bắt tay tiếp cận do nền tảng điều phối. **Pure B2C ⇒ KHÔNG dựa lễ tân/pass-toà.** Chỉ app-only:
- **Hồ sơ tiếp cận nhà của khách** (intake hỏi 1 lần/địa chỉ: vào kiểu gì, gửi xe, cách báo) — reuse `kael_chat_pre_intake_memory`.
- **Thả thông tin 3 nấc:** khu (trước accept, đã có) → toà + hướng dẫn (sau accept) → **chính xác căn hộ khi check-in tại sảnh**, time-boxed (giảm tích luỹ địa chỉ dùng lại).
- **Check-in xác minh vị trí** (nâng nút `arrived` thủ công `lifecycle.ts:16`): geofence quanh toà → báo khách "thợ đã tới sảnh, cho lên?" → khách duyệt → mở căn hộ. Gắn no-show detection. **Caveat:** GPS chung cư HCMC kém → fallback bấm tay + ảnh sảnh.
- **Bắt tay cho phép vào:** khách "Cho thợ lên"; job nhạy cảm/lần đầu → tuỳ chọn **"Gặp ở sảnh"** (không lộ căn hộ).
- **Xác minh danh tính 2 chiều tại cửa** (job in-app + badge + ảnh; khách xác nhận "đúng thợ").
- **DEFER (cần toà hợp tác, B2C thuần không có):** visitor pass/QR lễ tân chấp nhận. KHÔNG chặn giao dịch đầu vì nó.

Vai trò: app-only access = tiện-ích-vận-hành + tín hiệu no-show, **không phải access-control moat**. Moat thật ở §32.6 trụ 2/3.

---

### 32.8 Kael Interaction Design — Flexible-Not-Slop (D14, chi phối 4 scenario + worker chatbot)

**Xương sống deterministic — KHÔNG bao giờ LLM:** quyết định chính sách (escalate? auto-approve? admin? ai quyết? penalty? evidence-lock?). Dispute → Kael **không phán kết quả** (admin). Nền chống-slop.
**LLM ở RÌA, có rào:** (a) **detection** — thay keyword giòn bằng LLM classifier xuất ĐÚNG signal có cấu trúc (escalation level/reason code/concern type) → nuance tốt hơn, nuôi cùng policy deterministic (mở rộng pattern `llmSentiment` soft: LLM nuance, KHÔNG tự bấm hard); (b) **phrasing** — LLM sinh câu trong strategy đã chọn (strategy+escalation vẫn deterministic), self-check, fallback template.
**Guards (phổ cập hoá cái đã có):** self-check trước mọi egress; neutrality assertion (`assertNeutralDisputeLanguage`) mở rộng sang scenario cảm tính; `stopAiLoop` khi hard-escalation; structured output + Zod + fallback; "Kael đề xuất trong rào, không quyết tiền/scope/outcome".

| Scenario | LLM ĐƯỢC | LLM KHÔNG BAO GIỜ |
|---|---|---|
| Demanding (case-2) | hiểu nuance + phrasing empathy | tự quyết escalation; editorial |
| Worker/Customer cancel (case-3/4) | hiểu narrative lý do | quyết penalty/approval (luật + Phase 0) |
| Dispute (case-5) | tóm tắt **sự thật trung lập** | phán lỗi/kết quả (admin only) |
| Worker advisory (B-FUNC) | tư vấn/giải thích/phrasing | chạm tiền/scope (structured rails) |

Cùng nguyên tắc bảo perceived-perf không thành slop: không label stage giả, không Kael lảm nhảm (§32.0.3 G4).

---

### 32.9 Risks + Locked-Doc Impact

- **RN streaming:** global `fetch` không có readable body → `expo/fetch`; transport mới, device-verified, JSON fallback. (Expo ~54.0.33, RN 0.81.5; chưa cài lib SSE.)
- **Edge wall-clock (P3.0 spike):** SSE mở 4–10s; verify tier limit trước Tier-2. Tier-1 không vướng.
- **Cost:** zero provider call thêm (progress là telemetry sẵn; SSE forward việc đã làm); worker advisory thêm callAI có budget/cap riêng.
- **GPS chung cư:** geofence cần fallback.
- **Locked-doc (cần Tu approve, KHÔNG tự sửa):** `STRUCTURES.md` nếu pin `/kael/chat` response contract → cần note streaming variant + worker chat routes; `design.md` → stage-streaming loading pattern + "Thought for {n}s". `code-ownership-map.md` (không lock) → mở `streaming.ts` note job→job/session/scope-scoped + thêm worker chat owner.

---

### 32.10 Sequencing / Build Order

```
Part A (customer): P0 → P1 → P2 → P2M → P3 → P4 → P4M → P5   [chứng minh cơ chế progress/SSE/motion]
   ↓ reuse cơ chế
Part B (worker):   WBF.0 → WBF.1 → WBF.2 → WBF.3 → WBF.4(gate) → WBF.5 → WBF.6 → WBF.7
                   → WBP.1 → WBP.2 → WBP.2M → WBP.close
Đan vào B-FUNC:    §32.6 Tier-1 (chat-guard + risk memory) — dùng worker advisory engine
                   §32.7 app-only access (intake profile + arrival check-in) — phối hợp lifecycle
Xuyên suốt:        §32.8 flexible-not-slop chi phối worker chatbot + bất kỳ LLM nào thêm vào 4 scenario
Defer:             §32.6 Tier-2 (re-book/guarantee, phụ thuộc payment); §32.7 visitor-pass (cần toà)
```
Build sau §31 (Kael AI core). Codex build read-only trước (P0 + WBF.0), Claude verify trước khi động code.

---

### 32.11 Skills Mapping + Verification

```
karpathy-guidelines     mọi phase (surgical diff, assumptions explicit)
kael-ai-boundary        WBF.2/3/4, §32.8 (callAI, structured output, self-check, no money-state)
kael-supabase           P1, WBF.1, §32.6 risk-memory (migration + RLS + regen types + RLS tests)
kael-motion             P2M, P4M, WBP.2M (Reanimated, Reduce Motion, perf budget)
glass-liquid-signature  mọi motion surface (conform design.md)
kael-frontend-test      P2/P4, WBF.5, WBP.* (RNTL + recording = G3 VISIBLE DONE)
kael-tdd                mọi backend phase (failing test first, ≥2 layer)
kael-security-sweep     WBF.4 (money-state gate), §32.6 (no PII, no provider name), §32.7 (privacy gate)
```
Verification: mỗi phase có G1–G5 (§32.0.3) + dòng "Verify (Claude)" ở companion doc. Frontend phase bắt buộc recording app thật.

---

### 32.12 Change Log

```text
v0.8 — 2026-06-04 — Consolidate session adoring-leavitt vào Plan.md §32 (Tu override D8). Gồm: perceived-perf
                    Part A (P0–P5+2M/4M), worker felt-parity Part B (B-FUNC WBF.0–7 + B-PERF WBP.*),
                    B2C anti-disintermediation 4 trụ (§32.6), apartment access app-only (§32.7),
                    flexible-not-slop interaction (§32.8). Decisions D1–D14 locked. Companion docs giữ per-step detail.
                    CHƯA execute — Codex build sau §31, Claude verify.
v0.9 — 2026-06-07 — EXECUTED by Codex (PR #61/#62/#63 merged→main) + VERIFIED by Claude (6-agent adversarial
                    workflow + code-read; tests NOT run in-env — no Deno/node). Implementation materially real
                    (~70%); §32.7 apartment-access partial/BROKEN, §32.8 partial/over-claimed, deploy-order risk
                    live (7 migrations). See §32.13 for verdict + remaining-gap build plan.
```

---

### 32.13 Verification Verdict + Remaining-Gap Build Plan (Claude, 2026-06-07)

**Method + honesty.** Verified the merged build (`origin/main` @ `08d887e8`, PR #63) by adversarial code-reading (6 parallel verifier agents + lead synthesis) against §32 + companion docs. Every claim below is grounded in `file:line` of the merged tree. **Tests were NOT run** (this env has no Deno/node toolchain per [[env_node_toolchain_access]]) — "tested: real_tests" means a real test FILE with real assertions exists, not that it was executed here. Nothing in this section is asserted without reading the actual code. Do **not** mark §32 complete (Codex's own audit `docs/test-logs/2026-06-05_kael-section32-completion-audit.md` agrees: G1 staging + G3 native proof open).

**Verdict by area:**

| Area | Status | Evidence headline |
|---|---|---|
| §32.6 anti-disintermediation | ✅ complete, real tests | bidirectional chat guard before role branch (`services.ts:5294`), redaction + role nudge + worker risk write (`:5362-5442`), 2 runtime tests (`mobile-api-edge-runtime.test.ts:1409-1631`) |
| §32.3 Part A customer UI | ✅ complete, real tests | real-progress poll 800ms (`kael-chat-surface.tsx:368-402`), stepper + "Thought for {n}s" real elapsed (`thread.tsx:376-479`), SSE consume + caret (`kael-stream.ts:86-167`, `thread.tsx:481-530`), RNTL tests (`agentic-parts-test.tsx:959-1078`) |
| §32.8 flexible-not-slop | 🟡 partial / over-claimed | spine deterministic + detection-LLM real + egress guards blocking (`case-2:104`, dispute `services.ts:3258`); but phrasing-LLM NOT built (templates only), self-check not on case-2 egress |
| §32.7 apartment access | 🔴 partial / BROKEN | data model + staged disclosure real (`services.ts:8689-8731`); geofence has NO distance check, customer authorize handshake MISSING, worker UI never sends check-in |
| Deploy order | ⚠️ live risk | **7** migrations must apply before Edge deploy — see `docs/ops/section32-deploy-order.md` |

**Built + VERIFIED by Claude (branch `claude/section32-supplements`; provisioned the temp Node/pnpm toolchain and ran apps/api Vitest single-fork):**
0. **Independent verification of the merged build** — ran Codex's §32 backend tests: **apps/api 1492 passed / 0 failed / 59 skipped** (single-fork; the multi-fork run shows 1 spurious fail from a Windows vitest forks-pool `kill EPERM` teardown, the same flake Codex pinned mobile Jest to `maxWorkers:1` for). Codex's "real_tests" are real + green.
1. `docs/ops/section32-deploy-order.md` — the 7-migration must-apply-before-deploy checklist + failure modes (prevents the live prod-breakage landmine).
2. `services.ts` §32.6 — **attempted the contact+demanding additive fix, then REVERTED it (net change = none).** Running the test caught a PII leak (email → `kael_interaction_log`); Codex review (PR #64) then found a second problem: off-app PAYMENT phrases (`trả tiền`/`tiền mặt`) are classed as `demand_refund` pressure, so a payment/contact-leak message got a spurious "demanding" escalation + an unrelated pressure reply. Disambiguating that belongs in the detector (`demanding-customer-detect.ts`) and is scope-creep for a LOW gap, so the original mutually-exclusive short-circuit is the correct, protective behaviour (the contact guard already redacts + nudges + records disintermediation risk). Lesson: running the test + the review prevented shipping a net-negative change.
3. `services.ts` §32.8 — `runKaelSelfCheckPipeline` on both case-2 demanding egress points (chat-session + job-relay), so "self-check before every egress" is literally true for case-2, not only worker-assist. Templates pass unchanged. Verified green.

**FOR CODEX to build + test** (Claude did NOT build these — they are security-critical, core-logic, or mobile-dependency; building them blind without a test run would violate "no fabrication"). Prioritized; each grounded in verification `file:line` + a concrete fix:

- **[HIGH · §32.7] Geofence distance gate.** Today `buildUnitReleaseAccessState` (`services.ts:8781`) + `parseWorkerAccessCheckIn` (`router.ts:2276-2324`) range-check lat/lng only (−90..90) and release the exact unit from anywhere — "geofence" is a label with no geometry. Fix: geocode the building (reuse coords from `geocodeJobAddressForMatching`) and gate release on `distanceKmBetween` (`services.ts:7791`) within a configurable radius (`ACCESS_GEOFENCE_RADIUS_M`, default ~150m for HCMC GPS drift); reject out-of-radius with a VALIDATION error. Test: out-of-radius rejected, in-radius releases.
- **[HIGH · §32.7] Customer authorization handshake ("Cho thợ lên").** MISSING entirely — the unit releases on the worker's self-reported `arrived`+check-in alone; `customer_handoff_required:true` is written (`services.ts:8752`) but nothing consumes it. Fix: add a customer-only route `POST /jobs/:id/access/authorize` (RLS `customer_id=auth.uid()`) that flips `customer_authorized` in `apartment_access_state`; split release into "check-in pending authorization" → final "unit_released" gated on BOTH worker check-in AND customer authorize; add the customer UI button. Positive/negative tests. (This is the core "last 50 meters" safety mechanism the plan §32.7 designed; without it the feature inverts its own intent.)
- **[HIGH · §32.7] Wire worker UI to send `access_check_in`.** `worker-surfaces.tsx:1985,5440` call `workerUpdateStatus('arrived')` with NO check-in extras, so the whole check-in/unit-release path is dead in the real app. Fix: on `worker_mark_arrived`, capture GPS via `expo-location` (geofence mode) or prompt a lobby photo (manual_photo fallback), then `workerUpdateStatus('arrived', { access_check_in: {...} })`. Adds `expo-location` dep + permission handling. RNTL test.
- **[MEDIUM · §32.6] Consume risk score in matching (de-prioritize half).** `worker_kael_memory.red_flags.disintermediation_risk_count` is written (`services.ts:5399-5409`) but never read; `findEligibleWorkers`/`rankEligibleWorkers` (`:7660-7724`) query `worker_profiles` only. Plan §32.6 deliverable is "→ de-prioritize matching + admin queue" — only the queue half exists. Fix: batch-load `red_flags` for candidates in the ranking path and apply a SOFT ranking penalty when `disintermediation_risk_count >= threshold (2-3, evidence-gated)` — penalty, not exclusion (plan: "không nuke worker khan hiếm vì tín hiệu yếu"). Test: high-risk worker ranks below an equal-rating clean worker.
- **[DONE · §32.8] Self-check on the case-2 demanding egress** — BUILT + verified by Claude (see "Built + VERIFIED" above); no longer a gap.
- **[MEDIUM · §32.3] First-turn perceived-perf.** On the session-create turn, neither the progress poll nor SSE runs (`progressSessionId` is null at `kael-chat-surface.tsx:486`; create() is non-streaming at `:336/:592`), so the real stepper + streaming caret + post-turn "Thought for {n}s" only appear from turn 2. Fix: route the first turn through a streaming create, or start a short progress poll keyed on the returned session id once create() resolves. RNTL test on the create path.
- **[MEDIUM · §32.8 + §32.6 + deploy] Behavioral / regression tests.** Several guards are CI-verified only by source-string grep (`mobile-api-edge-schema.test.ts:1119`): (a) case-2 egress fallback on a money-leaking `responseText`; (b) dispute path returns the neutrality guard on a non-neutral summary; (c) worker-turn insert supplies `job_id` (NOT NULL since `20260605005000`); (d) the contact-guard `queue_type:'disintermediation_risk'` literal is a member of the `kael_admin_queue` CHECK list. Add real behavioral assertions so a rename/drop fails CI.
- **[LOW · §32.7] Meeting-point ("Gặp ở sảnh") + no-show wiring.** No `meeting_point` field in `apartmentAccessProfileSchema` (`validation.ts:7-11`); no-show not tied to check-in. Add the schema field (suppress unit release when set) + structured no-show event on un-authorized check-in timeout.
- **[LOW · §32.3] Copy drift.** Implemented stage/disclosure copy ("Kael analyzed in {n}s", fuller stage sentences) differs from the §32.5/§32.3 locked contract ("Thought for {n}s", terse + emoji). Reconcile to the contract OR have Tu ratify the current wording, then update tests.

**Operational gaps (Tu/Codex must run — NOT code, NOT buildable here):**
- Apply the 7 §32 migrations to staging in order, deploy `mobile-api`, run `kael-section32-staging-smoke.mjs` (`SECTION32_RUN_LIVE=1`) → close **G1**. (Deploy order: `docs/ops/section32-deploy-order.md`.)
- Run `scripts/section32-android-native-recording.ps1` (`SECTION32_NATIVE_RUN=1`) with staging creds → capture authenticated native recordings of the §32 flows → close **G3**.
- Run the test suites (`apps/api` Vitest, mobile Jest, Deno edge) on a real toolchain to confirm the cited tests pass on the merged tree (Claude read them statically only).
- Field-tune the §32.7 geofence radius on a real HCMC tower (GPS drift) once the gate is built.

**Honest bottom line.** §32 is materially implemented and largely correct (§32.6 + Part A are genuinely done with real tests), but it is **not "complete"**: §32.7's customer-gated, location-verified release — the actual "last 50 meters" moat — is partial and broken; §32.8's phrasing-LLM/universal-self-check are not built (acceptable but should not be implied done); and the 7-migration deploy-order is an unmitigated live prod risk until applied. The merge of a PR titled "Complete … production proof" overstates the real state.
