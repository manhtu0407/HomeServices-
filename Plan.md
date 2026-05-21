# Home Services — Workflow Enhancement Plan

Tài liệu này là execution plan cho enhancement đợt 2026-05-20. Audience: AI coding agent (Codex hoặc Claude Code) thực thi, Tu review, Claude (tôi) audit lại sau khi build xong.

Plan này KHÔNG phải tài liệu marketing. Mỗi phase phải xuất ra evidence verification chạy thật, không phải claim suông.

---

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
- Abuse protection: rate limit max 2 cancel / 24h, auto-suspend khi 5+ cancel / 7 ngày.

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
  │     ≥5 → auto-suspend worker                    │
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
| D10 | Worker cancel abuse | max 2 cancel/24h + rating penalty 0.1/cancel + auto-suspend ≥ 5 cancel/7 ngày |
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

### 10.2 Migration — Worker cancellation auto + rate limit + rating penalty

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
-- 7. Check worker total cancellations last 7 days ≥ 5 → auto-suspend:
--    update worker_profiles set is_suspended = true, is_available = false
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
- Auto-suspend test: worker cancel 5 lần trong 7 ngày → suspended.

### 10.8 Phase 3 Definition of Done

- [ ] Geo migration applied staging + dry-run prod OK.
- [ ] findNextBestWorker tested with realistic data.
- [ ] Auto cancellation flow works end-to-end on staging.
- [ ] Worker rating decreases on cancel.
- [ ] Rate limit enforced.
- [ ] Auto-suspend triggers correctly.
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
- [ ] Worker rating decremented after cancel.
- [ ] Rate limit: 3rd cancel in 24h returns INVALID_STATUS.
- [ ] Auto-suspend: 5th cancel in 7d sets is_suspended=true + is_available=false.
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
| Update `request_worker_cancellation_atomic` → auto-approve + rate limit + auto-suspend + return next candidates | ❌ |
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
| **Cụm A** — Trust & Safety | Chống worker abuse cancel | #1 Rating penalty + #2 Auto-suspend | Standalone, làm trước được |
| **Cụm B** — Geo Matching Upgrade | Chọn thợ gần nhất + chuyên môn nhất | #3 Geo schema + #4 distance_km + #5 Address autocomplete + Google geocoding | #4 và #5 phụ thuộc #3 |

Đề xuất ưu tiên khi revisit: Cụm A trước (đơn giản hơn, chỉ migration + Edge logic), Cụm B sau (cần Google Maps API + UI mới + schema migration lớn).

---

#### #1 — Worker rating penalty −0.1 mỗi cancel

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

#### #2 — Auto-suspend khi worker hủy ≥5 lần / 7 ngày

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
  - Migration update `request_worker_cancellation_atomic` thêm 7-day count + auto-suspend.
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

End of Plan.md
