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

End of Plan.md
