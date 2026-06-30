# Full-Codebase Audit Dossier — 2026-06-11 (companion của Plan.md §38)

```text
Auditor:   Claude (3 vòng: Edge runtime → Kael AI core/SQL/RLS → tests/apps-api/agentic)
Branch:    claude/sleepy-easley-924d74 @ 1ca2c0d5 ("#66 Fixing")
Method:    đọc tĩnh toàn bộ + grep đối chiếu schema + chạy test thật (toolchain portable Node 22.18.0 + pnpm 10.16.1)
Baseline:  shared 586P/1F · api 1510P/1F/59skip · mobile 145P · tsc sạch ×3 (đo 2026-06-11)
Mục đích:  WHERE + WHY từng finding, đủ chi tiết để Codex viết failing test đúng mà không cần
           tự suy lại. Fix direction + acceptance ở Plan.md §38.4 — file này KHÔNG lặp lại phần đó.
Quy ước:   mọi line number theo commit 1ca2c0d5. "services.ts" = supabase/functions/mobile-api/_shared/services.ts.
```

---

## 1. HIGH

### H1 — Quận 10/11/12 bị gán nhầm "Quận 1" khi tạo job

- **WHERE:**
  - Hàm lỗi: `packages/shared/src/mobile-workflow.ts:803-816` — `extractKnownDistrictLabel`.
  - Caller gửi lên API: `apps/mobile/lib/frontend-workflow-provider.tsx:269` (derive) → `:279` (`address_district: districtLabel` trong `JobCreateInput`); thêm `:1177-1178`.
  - Caller UI: `apps/mobile/components/customer/address-autocomplete.tsx:95,101` (mỗi lần gõ/chọn suggestion đều derive district bằng hàm lỗi).
  - Parser ĐÚNG đã tồn tại (không được dùng ở booking path): `packages/shared/src/constants.ts:259-274` — `extractDistrictFromAddressLabel` (so khớp exact từng mảnh qua `normalizeDistrict`).
- **WHY (cơ chế):** Hàm duyệt `Object.entries(HCMC_DISTRICTS)` theo insertion order (`q1` đứng trước `q10/q11/q12`) và so khớp bằng **substring**: `normalized.includes(normalizeSearchText(label))`. Chuỗi đã strip dấu `"quan 10"` **chứa** `"quan 1"` → return `"Quận 1"` ngay vòng lặp đầu. Regex số (`/\b(?:quan|q|district|dist)\s*\.?\s*(1[0-2]|\d)\b/` — xử lý đúng 2 chữ số) nằm **sau** vòng lặp nên không bao giờ chạy tới với input chứa "quan 1x".
- **Trigger:** khách nhập/chọn địa chỉ chứa "Quận 10", "Quận 11", "Quận 12" (kể cả picker đưa label chuẩn "Quận 10").
- **Impact:** `address_district` sai từ client → backend `normalizeDistrict("Quận 1")` match exact → job lưu `q1` → `createBroadcasts` tìm thợ Quận 1 trong khi khách ở Quận 10. 3/22 quận dispatch sai — thợ nhận việc rồi phát hiện sai khu vực = giết trust ở giao dịch đầu.
- **Evidence:** mô phỏng logic từng bước trên source; `packages/shared/src/__tests__/district.test.ts` chỉ test `normalizeDistrict` (hàm đúng), KHÔNG test `extractKnownDistrictLabel`; 2 wiring test chỉ check hàm "được import" (`toContain('extractKnownDistrictLabel')`), không test hành vi. Đường Kael-chat dùng parser đúng (`address-district.ts:7-10` → `extractDistrictFromAddressLabel`) — chỉ booking/autocomplete path dính.

### H2 — Retry check-in xoá ngầm authorization "Cho thợ lên" + stale-release inheritance

- **WHERE:**
  - `services.ts:9060-9090` — `buildCheckInAccessState`: set cứng `release_stage:"building_released"`, `exact_unit_released:false`, `customer_authorization_required:true` **vô điều kiện** (spread `...asRecord(previous)` trước, rồi overwrite).
  - `services.ts:3588-3598` — same-status check-in path (`arrived→arrived`, §32.7 hỗ trợ chủ đích cho retry/check-in muộn) đi thẳng vào hàm trên tại `:3649-3655`.
  - `services.ts:8957-9013` — `authorizeApartmentAccess`: read state → build → update chỉ `.eq("id", jobId)`, **không optimistic lock** trên state.
  - `services.ts:8840-8855` — `projectAddressAccess`: `exactUnitReleased = state.exact_unit_released === true` → stage `unit_released` **không kiểm tra release thuộc về worker nào** (fix Codex PR #66 ở `:8857-8865` chỉ bind cờ `worker_checked_in`, không bind release stage).
  - `services.ts:5043-5056` — reset `apartment_access_state: {}` sau worker-cancellation: **fail-open** (lỗi chỉ `console.warn` rồi vẫn tiếp tục `createBroadcasts`).
- **WHY (cơ chế):** ba writer cùng ghi đè một JSONB không version-guard (guard `.eq("status", job.status)` vô dụng vì status không đổi ở same-status path). Sequence lỗi #1: thợ check-in → khách bấm "Cho thợ lên" (`exact_unit_released:true`) → client thợ retry check-in (mất response/bấm lại) → `buildCheckInAccessState` đè về `building_released` → **authorization của khách bị thu hồi ngầm**, state tự mâu thuẫn (`customer_authorized:true` được spread giữ lại nhưng `exact_unit_released:false`). Sequence lỗi #2: khách authorize cho thợ A → A cancel → RPC reassign đưa job về broadcasting (KHÔNG đụng access state) → reset Edge-side fail (fail-open) → thợ B accept → `projectAddressAccess` thấy `exact_unit_released:true` → **B thấy số căn hộ mà khách chưa từng cho phép B**. Comment tại `:5041` claim "per-worker check-in binding tự bảo vệ" — claim này SAI cho address projection (chỉ đúng cho endpoint authorize).
- **Trigger #1:** mạng chập chờn lúc check-in (client retry) hoặc thợ skip rồi check-in muộn, sau khi khách đã authorize. **Trigger #2:** worker cancel sau khi đã được authorize + 1 lỗi DB transient ở update reset.
- **Impact:** #1 = khách phải authorize lại, UX gãy đúng moment trust §32.7 vừa ship. #2 = privacy leak số căn hộ cho thợ thay thế — vi phạm chính contract §32.7.
- **Evidence:** đọc trace cả 3 hàm; `ACTIVE_WORKER_JOB_STATUSES` (`:207-215`) xác nhận authorize hợp lệ ở `arrived`; không có test nào cover retry-after-authorize (sweep test xác nhận).

### H3 — Rate limit 20-req/giờ Kael chat thực tế không tồn tại

- **WHERE:** `supabase/functions/mobile-api/_shared/rate-limit.ts` — `cleanup()` `:100-108` (xoá entry có `lastRefill < now - 300_000`); refill logic `:77-85` (`lastRefill` CHỈ được update khi `refills > 0`); hour bucket config `:31-35` (`refillIntervalMs: 3_600_000`). Bản copy cùng bệnh: `apps/api/src/lib/rate-limit.ts:11-17` + `:54-58`.
- **WHY (cơ chế):** với hour bucket, `refills > 0` đòi `elapsed >= 3_600_000` → trong suốt giờ đầu `lastRefill` đứng yên ở thời điểm tạo entry. `cleanup()` chạy mỗi ≥60s (trigger bởi bất kỳ `checkRateLimit` nào, mọi key) và xoá entry có `lastRefill` quá 300s tuổi → **hour bucket chắc chắn bị xoá sau ~5-6 phút tồn tại, kể cả user đang spam liên tục** → request kế tiếp tạo entry mới với đủ 20 token. Minute bucket không sao (refill đầy mỗi 60s nên `lastRefill` luôn tươi).
- **Trigger:** bất kỳ user nào dùng Kael chat quá 5 phút.
- **Impact:** hạn mức Plan §27.5 (F-23) 20/giờ → thực tế ≈ 20 mỗi ~5 phút (≈240/giờ), chỉ còn 5/phút giữ. Đây là cơ chế kiểm soát **chi phí AI** = lỗ hổng đốt tiền thật. Kết hợp M10 (per-isolate) càng yếu.
- **Evidence:** trace từng dòng; KHÔNG có test nào cho hour-bucket survival qua cleanup (`apps/api/src/__tests__/unit/rate-limit.test.ts` không đụng cleanup theo thời gian dài).

### H4 — `decideScopeChange` query bảng ma `scope_changes`

- **WHERE:** `services.ts:5635-5642` — `.from("scope_changes").select("job_id").eq("id", scopeChangeId)`. Bảng thật: `scope_change_requests` (`supabase/migrations/20260513114845_align_structures_workflow.sql:423`). Test pin tên SAI: `apps/api/src/__tests__/unit/mobile-api-edge-runtime.test.ts:4803` (`expect(client.calls[0].table).toBe('scope_changes')`).
- **WHY (cơ chế):** PostgREST trả lỗi "relation does not exist"; code chỉ đọc `scopeRow.data?.job_id` (không check `.error`) → `scopeJobId = null` **mọi lần**. Mutation thật vẫn đúng (RPC `decide_scope_change_atomic` tự lookup, atomic) nên không ai thấy lỗi ở hành vi — nhưng `runPolicyAutonomyGate` chạy với `jobId: null` → bản ghi `kael_autonomy_decision_audit.job_id = null` cho **mọi** quyết định scope của khách (route `POST /scope-changes/:id/decide`, money path re-lock `final_price`). Mock client trong unit test nhận mọi tên bảng → test "hợp pháp hoá" typo thành spec.
- **Trigger:** mọi lần khách bấm duyệt/từ chối đổi phạm vi.
- **Impact:** audit/appeal trail của quyết định autonomy ảnh hưởng tiền bị đứt khỏi job — vi phạm yêu cầu audit của RULES cho `KaelAutonomyDecision`; + 1 DB roundtrip lỗi vô ích mỗi call.
- **Evidence:** sweep cạn toàn Edge: trích mọi literal `.from("X")` + `.rpc("Y")` đối chiếu migrations → **`scope_changes` là phantom DUY NHẤT, 100% RPC tồn tại**. apps/api không dính (không có lookup tương tự).

### H5 — Detector "khách khó tính": hard-escalation oan + sticky brick session

- **WHERE:** `supabase/functions/mobile-api/_shared/kael/agentic/demanding-customer-detect.ts` — pressure patterns `:72-96` (đặc biệt `"lua"` `:90`, `"tra tien"` `:86`, `"hoan tien"` `:86`); matcher `:145-154` (`normalized.includes(normalize(pattern))` — **substring, không word-boundary**); escalation `:167-182` (`aggressive_language`/`demand_refund_no_reason`/`threat_complaint` → `"hard"` ngay lập tức); normalize strip dấu `:188-195`. Sticky: `services.ts:2098-2117` (`alreadyHardStopped` từ metadata → mọi turn sau bị ép `hard`). Mâu thuẫn nội bộ: `"lua chon"` nằm trong LEGITIMATE `request_alternatives` `:60`.
- **WHY (cơ chế):** strip dấu biến nhiều từ vô hại thành chuỗi chứa keyword: "**lựa** chọn"→`lua` (lừa) → `aggressive_language` → **hard**; "tôi **trả tiền** thế nào?"→`tra tien` → `demand_refund_no_reason` → **hard**. Các keyword 1 âm tiết khác over-match phía legitimate: `"cho"` (chờ) match "chọn/chỗ/cho tôi", `"lo"` match "lò/lỗi/lớn", `"tre"` match "trên/trẻ" — nhiễu nuance. Sau lần hard đầu, `services.ts:2109-2117` ép `effectiveDetection` = hard **vĩnh viễn theo session** (metadata flag không có đường gỡ).
- **Trigger:** khách hỏi phương án khác hoặc hỏi cách thanh toán — các câu phổ biến nhất của khách thật.
- **Impact:** session Kael bị brick vào canned-response + insert `kael_admin_queue` (spam admin) — đúng nhóm khách đang nghiêm túc muốn chốt giao dịch.
- **Evidence:** mô phỏng normalize từng ký tự; `apps/api/src/__tests__/unit/kael-demanding-llm-assist.test.ts` chỉ có happy-path + LLM-assist, **không có test false-positive nào** → fix không vỡ test hiện hữu.

### H6 — Blend giá Market 60/Baseline 40, trái quyết định LOCK §25 S1

- **WHERE:** `supabase/functions/mobile-api/_shared/kael/synthesis.ts:73-79` (`market*0.6 + baseline*0.4`); parity `apps/api/src/lib/kael/pricing.ts:82-83` (`MARKET_WEIGHT=0.6 / BASELINE_WEIGHT=0.4`). Quyết định bị trái: `Plan.md:7004` ("Phương án A: Baseline 70% + Perplexity 30% (NOT B, NOT C) | Tu chốt") + `Plan.md:7883` ("Layer 3: Baseline 70% + Perplexity 30% với trust scores").
- **WHY:** grep toàn repo: **không tồn tại** blend 70/30 ở bất kỳ đâu — quyết định S1 chưa bao giờ được implement; cả 2 bề mặt cùng giữ blend cũ nghiêng market. Không có test pin trọng số → drift sống sót mọi đợt verify. (Ghi chú trung thực: báo cáo vòng 2 của Claude từng ghi nhầm mục này là "SẠCH" — đã đính chính.)
- **Trigger:** mọi estimate có market data.
- **Impact:** money path — giá khách thấy lệch khỏi chính sách đã chốt; market data (kèm rủi ro M12 bịa) chiếm đa số trọng số thay vì baseline.
- **Evidence:** grep `0\.7|0\.3|BASELINE_WEIGHT|MARKET_WEIGHT|blend` toàn kael/ → không có 70/30; D1 (§38.2) để Tu re-confirm hoặc re-decide.

---

## 2. MEDIUM

### M1 — Check-in photo ref không bind vào job + ảnh từ library

- **WHERE:** `router.ts:2409-2411` (`isAccessCheckInPhotoRef`) + `:2413-2426` (`isSupabaseJobMediaStageRef` — check protocol/bucket/`pathParts[1]===stage`/no dot-segments, **không so `pathParts[0]` với jobId**, không check tồn tại file); dispatch có sẵn `route.jobId` tại `:1884`. UI: `apps/mobile/components/worker/worker-surfaces.tsx` — `useWorkerArrivalCheckIn` dùng `ImagePicker.launchImageLibraryAsync` (chọn ảnh CŨ bất kỳ, không phải camera). So sánh: `attachJobMedia` validate đúng prefix jobId tại `services.ts:8622-8638`.
- **WHY:** §32.7 tuyên bố check-in refs "MUST be uploads into the controlled access_check_in stage", nhưng validator chỉ kiểm tra HÌNH DẠNG chuỗi. Thợ có job khác của chính mình có thể tái dùng ref ảnh sảnh cũ (storage policy `is_job_worker` cho phép upload vào job mình được gán), hoặc gửi ref bịa đúng format. Cộng `manual_photo` mode không bị geofence + ảnh từ library → "check-in tại sảnh" làm được từ quán cà phê. Lưới cuối là khách phải bấm authorize, nhưng evidence chain server tự nhận là gate thì gần như rỗng.
- **Impact:** suy yếu trust feature §32.7; với khách dễ tính, unit release dựa trên evidence giả được.

### M2 — `is_available` không bao giờ tự bật lại

- **WHERE:** set false: `supabase/migrations/20260518071000_accept_broadcast_privacy_guard_v2.sql:162-165` (trong `accept_broadcast_atomic`). Restore duy nhất: toggle tay `set_worker_availability_atomic` (`20260518003500`, có guard chặn bật khi còn active job). Grep toàn services + migrations: **không một path completion/cancellation/dispute nào set lại true** (customer-cancel RPC `20260525231655` và worker-cancel RPC `20260520141200` đều không đụng `worker_profiles`).
- **WHY:** vòng đời thợ: accept → offline khỏi matching → xong việc/hủy việc → VẪN offline cho tới khi tự nhớ bật. Marketplace pre-revenue pool thợ mỏng: mỗi job hoàn tất âm thầm rút một thợ khỏi supply. Đây là product decision (D2) chứ không thuần bug — nhưng hiện trạng không có cả PROMPT nhắc bật lại.
- **Impact:** supply decay tích luỹ; kết hợp L17 (hủy không ma sát) làm méo hành vi thợ.

### M3 — Approve learning candidate: 2 RPC không atomic

- **WHERE:** `services.ts:6763-6814` — `admin_approve_learning_candidate` (`:6771-6787`) commit xong mới gọi `apply_approved_learning_candidate_to_knowledge` (`:6788-6796`).
- **WHY:** RPC2 fail (timeout/lỗi DB) → candidate đã `approved`/`auto_promoted` nhưng knowledge KHÔNG được apply; retry approve → RPC1 trả error đã-duyệt → `mapLearningCandidateReviewError` throw → **không còn đường nào chạy lại RPC2**. Knowledge layer lệch vĩnh viễn khỏi trạng thái candidate. Đúng pattern memory race-conditions: multi-step DB update cần atomic hoặc bước 2 phải idempotent-retryable.
- **Impact:** learning pipeline (ảnh hưởng pricing prior) im lặng mất rule đã duyệt.

### M4 — Lease retry-broadcast 1 giây, ngắn hơn critical section

- **WHERE:** `services.ts:7648-7670` — `acquireBroadcastRetryLease`, guard `broadcast_at <= now - 1_000` tại `:7654`. Critical section nó bảo vệ: `createBroadcasts` (`:7020-7084`) gồm query thợ + insert + `notifyBroadcastWorkers` `:7167-7186` — vòng `for` **tuần tự** gọi HTTP Expo push.
- **WHY:** 2 request confirm-search cách nhau >1s: request 1 chiếm lease lúc T0 rồi còn đang chạy push (dễ >1s); request 2 tại T0+2s qua được `hasActiveBroadcast` (rows chưa insert) và qua được guard (`broadcast_at=T0 <= T0+2s-1s`) → **double batch** (≤10 thợ, notification trùng). Hậu quả bị chặn bởi `accept_broadcast_atomic` (chỉ 1 thợ thắng) nhưng thợ thua thấy job "ma" + push rác.
- **Impact:** trải nghiệm thợ + nhiễu số liệu broadcast.

### M5 — Schema/validation/PII-scrubber duplicate 4 nơi, đã drift thật

- **WHERE & WHY (bằng chứng drift từng cặp):**
  1. `packages/shared/src/validation.ts` vs `supabase/functions/_shared/domain.ts` — cùng bộ Zod schemas chép tay 2 bản; `sanitizeForLLM` regex (`validation.ts:269-274`) vs vòng lặp charCode (`domain.ts:515-524`) — tương đương hôm nay, không ai đảm bảo ngày mai.
  2. District parser: `extractKnownDistrictLabel` (mobile-workflow.ts:803, **lỗi**) vs `extractDistrictFromAddressLabel` (constants.ts:259, **đúng**) — chính là gốc sinh ra H1.
  3. `scrubSensitiveForLLM`: `validation.ts:276-288` vs `kael/utils.ts:25-43` (cùng building list khổng lồ, 2 bản).
  4. `sanitizeMemoryText` (`kael/memory-sanitizer.ts:1-15`) — bản scrubber thứ 4, rule khác (không có building list, phone regex khác).
- **Impact:** mỗi lần sửa một bản là một cơ hội drift mới; lớp lỗi P4.

### M6 — Notification hứa "Kael sẽ tiếp tục theo dõi" — không có cơ chế

- **WHERE:** `services.ts:2916-2923` (insert notification khi zero-worker). Kiểm chứng không có backing: `supabase/functions/` chỉ có `mobile-api` + `map-proxy-spike`; 3 cron trong `kael/cron/` đều là learning (monitor-rules / process-batch / process-queue) — **không có re-broadcast/watcher nào**.
- **WHY:** copy sản phẩm hứa hành vi hệ thống không tồn tại → vi phạm data-honesty của RULES; khách chờ một promise không bao giờ đến thay vì chủ động retry.

### M7 — Map-proxy spike sẽ là open proxy nếu deploy no-JWT

- **WHERE:** `supabase/functions/map-proxy-spike/index.ts` — `Deno.serve` không có auth layer; MapLibre client fetch style/tiles **không gửi được custom header** → khả năng cao phải deploy `--no-verify-jwt`.
- **WHY:** bất kỳ ai có URL staging đều kéo tile qua VietMap key trả phí của Tu. Code rewrite/allowlist bản thân nó chặt (host exact-match, chặn `..`/`//`, gate G2 chống leak key) — vấn đề chỉ là thiếu lớp access control khi public. Chấp nhận cho spike; **bắt buộc** signed/short-lived token trước §37 MP1/MP2.

### M8 — Auth 2 network call tuần tự mỗi request

- **WHERE:** `supabase/functions/mobile-api/_shared/auth.ts:31-45` — `supabase.auth.getUser(token)` rồi `profiles` select role, không cache.
- **WHY:** mọi API call (kể cả stream start) trả 2 round-trip trước khi handler chạy — thuế cố định lên first-turn perf đúng lúc §32.14 đang tối ưu chỗ này. Fix cần cẩn trọng (stale-role risk) → defer sang perf plan, nhưng phải ghi nhận là nguồn latency có thật.

### M9 — Blind SSRF qua vision photo URLs

- **WHERE:** fetch: `kael/vision.ts:118-152` (`fetch(url)` tại `:122`); "sanitize" chỉ là http(s) check: `kael/utils.ts:3-23`; nguồn input: `photo_urls` schema `z.string().url()` không giới hạn host (`_shared/domain.ts:270` jobCreate, `:287` kaelChatCreate, `:300` turn).
- **WHY:** customer đã auth có thể gửi `http://169.254.169.254/...` hay URL nội bộ — Edge fetch server-side. Blind (body không echo trực tiếp) nhưng `problem_identified` từ vision được trả cho user → rò một phần nếu target trả ảnh hợp lệ; ngoài ra là vector đốt cost vision trên ảnh tuỳ ý. Nguồn hợp pháp duy nhất của ảnh là Supabase Storage → thiếu allowlist host là gap thuần.

### M10 — Mọi control state in-memory per-isolate

- **WHERE:** `rate-limit.ts:6` (`const store = new Map()`), `kael/circuit-breaker.ts:36-37` + singleton `:79`, push rate limit (`push.ts:45-49` dùng cùng store).
- **WHY:** Supabase Edge scale nhiều isolate + cold start. Breaker mở ở isolate A không truyền sang B → provider đang sập vẫn bị các isolate khác đập (đốt tiền + latency đúng lúc lỗi); rate limit nhân theo số isolate; cold start = reset. Các "cam kết" 5/min, 20/h, threshold breaker chỉ đúng trong 1 isolate. Fix thật = Postgres-backed (defer, §38.8) — nhưng phải coi là giới hạn đã biết, không phải guarantee.

### M11 — Giá méo 2 đầu complexity

- **WHERE:** `kael/pipeline.ts:172` — `preliminaryComplexity = "medium"` hardcode cho market lookup (chạy song song TRƯỚC khi vision chốt complexity); `kael/synthesis.ts:68-79` — `complexityMultiplier` (0.85/1.2) nhân lên **cả blend**, trong khi `baselineMin/Max` đã được chọn theo đúng complexity (`pickBaselineCandidate:211-227`).
- **WHY:** market data luôn là giá "medium" nhưng được trộn với baseline đúng complexity; multiplier bù cho market nhưng đồng thời **nhân đôi hệ số lên baseline**. Ví dụ: large job, baseline_large 500-800k, market_medium 300-500k → min = (300k×0.6 + 500k×0.4)×1.2 = 456k < baseline_large_min 500k → job large chốt DƯỚI sàn baseline của chính nó.
- **Impact:** méo giá hệ thống ở small/large — đúng phân khúc giá cần chuẩn nhất.

### M12 — Anthropic fallback bịa giá thị trường (mặc định prod)

- **WHERE:** vòng provider `kael/market.ts:150-201` (source-trust tắt → perplexity fail → `continue` sang anthropic fallback); prompt `kael/prompts.ts:191-218` — dòng "If weak evidence, use conservative estimates with confidence below 0.5" = **cho phép model tự chế range**; default flag: `env.ts:33-35` — `sourceTrustPerplexityFilterEnabled` khi env không set = `isStagingProjectUrl(supabaseUrl)` → **production mặc định TẮT**.
- **WHY:** khi tắt source-trust, "market data" có thể là số Claude nhớ từ training (không web search, không citation) → đổ vào blend với 60% trọng số (H6) → giá khách thấy chịu ảnh hưởng đa số từ dữ liệu không kiểm chứng. Vi phạm tinh thần no-fake-data của RULES và mục tiêu §25.
- **Impact:** tính chính trực của giá — flag policy (D3) phải được Tu chốt.

### M13 — Baseline đỏ: PR #66 commit với 2 test hỏng

- **WHERE:**
  1. `packages/shared/src/__tests__/mobile-wiring.test.ts` — test "keeps the Worker production visual contract..." expect chuỗi `` value: `${completedJobs}` `` trong `worker-surfaces.tsx`; PR #66 sửa file làm mất chuỗi, test không được update.
  2. `apps/api/src/__tests__/unit/mobile-api-edge-router.test.ts:1429-1467` — test check-in gửi ref stage `after/` (`supabase://job-media/job-1/after/lobby.jpg`); validator §32.7 mới (đúng) chỉ nhận stage `access_check_in/` → 400 ≠ 200 expected.
- **WHY:** cả 2 fail đều do test stale so với thay đổi CỦA CHÍNH PR #66 → suite không được chạy trước commit `1ca2c0d5`. Claim "1496 green" (§32.13) không còn đúng tại HEAD. Vi phạm verify-gate của critical.md; chặn TDD vì không có nền xanh để đo failing-test mới.
- **Evidence:** chạy thật 2026-06-11 (shared 586P/1F, api 1510P/1F/59skip, mobile 145P, tsc sạch ×3).

---

## 3. LOW (đủ WHERE + WHY, một đoạn mỗi mục)

- **L1** `access.ts:94-102` — `asJobStatus` fallback `"draft"` khi status DB không nhận diện. WHY: che data corruption; logic sau đó chạy trên status giả (may có optimistic-lock đỡ phần write, nhưng read-path quyết định sai). Nên hard-fail.
- **L2** `domain.ts:515-524` + `validation.ts:269-274` — `sanitizeForLLM` chỉ lọc ASCII control. WHY: zero-width/bidi (U+200B-200F, U+202A-E, U+2066-9) đi xuyên → prompt-injection tàng hình vào LLM boundary.
- **L3** `services.ts:8655-8657` — `mergeLimitedRefs` = `[...existing, ...incoming].slice(0, limit)`. WHY: khi existing đã đầy, ảnh MỚI bị drop im lặng (giữ ảnh cũ) — evidence hoàn tất mới nhất biến mất không báo lỗi.
- **L4** `services.ts:7786-7792` — busy-worker query `.limit(candidateIds.length)`. WHY: rows là JOBS không phải workers; 1 thợ nhiều active job → truncate sót thợ bận khác → broadcast cho thợ đang bận.
- **L5** `services.ts:7919-7921` — thợ không có home coords → `distanceScore = 0` (không phạt). WHY: incentive ngược — không khai vị trí thì né được penalty khoảng cách.
- **L6** `services.ts:3616-3648` + `router.ts:2329-2331` + `services.ts:9087` — `accuracy_m` được thu nhưng không dùng trong geofence gate; `checked_in_at` client tự khai (mọi thời điểm parse được đều nhận). WHY: audit-trail thời gian check-in spoof được.
- **L7** `services.ts:3406-3411` — `acceptBroadcast` validate transition SAU khi RPC đã mutate. WHY: nhánh fail trả 409 nhưng DB đã matched → client thấy lỗi dù đã nhận việc (inconsistent UX, không mất tiền).
- **L8** `services.ts:3744-3756` — nhánh auto-confirm `confirmed.error` nuốt im lặng (không log). WHY: vi phạm no-operational-silence; mất dấu vết khi auto-confirm fail.
- **L9** `domain.ts:457-469` — `disputeOpenRequestSchema.evidence_photo_urls` là free string 10-500 ký tự (không `.url()`/path-validate như mọi schema khác). WHY: evidence tranh chấp là dữ liệu bán-pháp-lý, nhận chuỗi rác.
- **L10** `env.ts:65-67` — project-ref staging hardcode trong source (`isStagingProjectUrl`). WHY: env-coupling; đổi project là đổi code; còn là input cho default của M12.
- **L11** `services.ts:2957-2978` — rollback broadcast không revert `final_price`/`kael_worker_brief_core` đã set ở confirm. WHY: rollback không trọn vẹn; hôm nay benign (giá tính lại giống), là nợ khi pricing đổi.
- **L12** `services.ts:4758` — ngưỡng auto-approve scope `confidence < 0.55` vs chuẩn hệ thống `CONFIDENCE_THRESHOLD=0.6` (PR #12). WHY: 2 ngưỡng confidence khác nhau không có ghi chú lý do.
- **L13** `router.ts:1320-1346` — route `/admin/kael-learning/*` khai `roles: ["customer","worker","admin"]`. WHY: gate thật nằm trong handler (deny + audit, an toàn hôm nay) nhưng route table "nói dối" — handler tương lai thêm vào path này mà quên gate nội bộ là thủng.
- **L14** `services.ts` 9.850 dòng / 1 export + `dbQuery` duplicate (`access.ts:108-121` vs `services.ts:9449`). WHY: god-file — mọi PR đụng 1 file, review/merge khó, là đất sinh lỗi kiểu H4.
- **L15** `services.ts:5474-5481` — `disintermediation_risk_count = previousCount + 1` qua read-modify-write rồi upsert. WHY: 2 vi phạm đồng thời → mất increment → thợ né ngưỡng penalty ≥2 (P3).
- **L16** `synthesis.ts:73-90` — market range từ LLM chỉ check `max ≥ min`, không clamp tuyệt đối vs baseline. WHY: range hallucinate khổng lồ vẫn ăn 60% trọng số; baseline 40% chỉ pha loãng chứ không chặn.
- **L17** `20260520141200:5-6,168` (rating penalty "intentionally omitted") + rate-limit 2-approved/24h (`:89-100`) + M2. WHY: tổng ma sát hủy việc của thợ ≈ 0 → không có gì ngăn hành vi nhận-rồi-bỏ lặp lại.
- **L18** `agentic/case-4-customer-cancel.ts:133-167`, `case-3-worker-cancel.ts:124-194` (matcher `hasAny`/`includes` `:370`). WHY: cùng bệnh substring với H5 (vd "đợi ý kiến"→`doi y`=đổi ý) nhưng stakes thấp: DB taxonomy là authoritative trong RPC, Phase0 không phạt tiền — chỉ nhiễu category/goodwill note.
- **L19** `apps/mobile/lib/api.ts:43,51` — chuỗi lỗi config bị mojibake ("Dá»‹ch vá»¥..."). WHY: file corruption encoding; user thấy rác nếu `mobileApiConfigError()` render.
- **L20** `apps/api/src/app/api/jobs/route.ts` POST gate `['customer']` vs Edge `customer+admin`. WHY: parity drift nhỏ — dev đọc apps/api làm reference sẽ hiểu sai contract.
- **L21** `apps/mobile/lib/media-upload.ts:59-106` — upload N ảnh xong mới attach; 1 ảnh fail → return fail nhưng các ảnh ĐÃ upload nằm mồ côi trong storage (không cleanup, retry tạo tên mới do `Date.now()`). WHY: storage bloat tích luỹ.
- **L22** `services.ts:6629-6652` — earnings: `pending_payment_amount` là GROSS, `net_earnings` là NET sau 10% fee. WHY: thợ thấy pending 500k nhưng nhận 450k — số không nhất quán trong cùng màn hình.
- **L23** `services.ts:6280-6294` — registerWorker chỉ chặn `approved/suspended`; hồ sơ `under_review` re-submit được → reset về `submitted`. WHY: kick hồ sơ khỏi thứ tự queue review, mất trạng thái thẩm định.
- **L24** `kael/provider-client.ts:151-157,215-217` + `kael/cost-tracking.ts:80-91` — bảng giá AI hardcode 2 nơi, match `model.includes("haiku")`. WHY: sai giá model (vd dùng Opus) = `costUsd` undercount = **budget cap (H3-adjacent) enforce trên số sai**; 2 bản chép tay = P4.

---

## 4. Patterns hệ thống (vì sao phải fix theo LỚP)

- **P1 Mock-pin-bug** — 124 file test, chỉ 3 integration thật (tự skip khi thiếu env → local run = ~99% mock/static). Mock client nhận mọi tên bảng/giá trị → bug được pin thành spec: H4 (test assert bảng SAI tại edge-runtime.test.ts:4803), H1 (zero behavior test), H6 (zero weight test). Fix lớp = schema-guard test (FX2.a) + behavior tests đi kèm mỗi fix.
- **P2 Substring tiếng Việt strip dấu, không word-boundary** — cùng một lỗi gốc ở 3 hệ độc lập: H1 (district), H5 (demanding detector), L18 (cancel classifiers). Tiếng Việt strip dấu có mật độ va chạm âm tiết cực cao (`lua/lụa/lúa/lựa`, `cho/chờ/chỗ/chọn`) → mọi matcher PHẢI word/token-boundary hoặc dùng cụm ≥2 âm tiết.
- **P3 Read-modify-write không atomic** — H2 (apartment_access_state JSONB), M3 (2-RPC), M4 (lease window), L15 (risk count). Fix lớp = guard/version có chủ đích từng điểm; điểm nào nhiều writer thật sự thì xuống RPC.
- **P4 Duplicate implementations drift** — M5 (4 bản schema/scrubber; sinh ra H1) + L24 (2 bản bảng giá). Fix lớp = consolidation plan riêng (§38.8), không vá trong đợt này để tránh diff lan rộng.

---

## 4b. Vòng 4 — tầng sâu chưa chạm (Claude 2026-06-11, bổ sung sau yêu cầu "audit chỗ thật sự chưa đụng")

Vùng đọc mới: learning.ts + learning SQL RPC bodies, kael/memory.ts (L1-L6), kael/scope-risk.ts
anti-fraud, kael/self-check.ts egress guard, kael/cron/process-batch-results.ts price compute,
apps/mobile/lib/frontend-workflow-provider.tsx state machine (1308 dòng), geo/auto-suspend migration.

### N1 — HIGH — Self-check egress guard ASCII/diacritic asymmetry (vừa lọt vừa chặn nhầm)
- **WHERE:** `supabase/functions/mobile-api/_shared/kael/self-check.ts:140-148` — `checkKaelResponse`
  dùng `lower = text.toLowerCase()` (KHÔNG strip dấu) rồi `lower.includes(phrase)`; nhưng
  `FORBIDDEN_PHRASES` (`:63-115`) toàn ASCII đã-strip-dấu ("nguy hiem chet nguoi", "chac chan 100%",
  "tu vong", "vai", "om"). Guard này là lớp egress cuối §32.8 ("self-check before every egress"),
  gọi từ `kael/orchestrator.ts:73-91` + `services.ts:5527` (runKaelSelfCheckPipeline).
- **WHY:** Kael sinh tiếng Việt CÓ DẤU → text giữ "nguy hiểm chết người", "chắc chắn 100%", "tử vong".
  `.includes()` so với phrase ASCII không dấu → **KHÔNG khớp** → nội dung fear-mongering / absolute-claim /
  accusatory-dispute / aggressive **lọt qua guard** (false negative — guard gần như vô hiệu với nội dung thật).
  Đồng thời từ vô hại trùng ASCII bị chặn (false positive): `casual_slang:["vai"]` → response chứa
  "**vai trò**"/"đôi **vai**"/"**vai** diễn" (đều ASCII "vai") → `lower.includes("vai")`=true → reject → fallback.
- **Trigger:** mọi response Kael có từ "vai trò" → bị thay bằng canned fallback; mọi nội dung nguy hiểm
  viết đúng chính tả tiếng Việt → không bị chặn.
- **Impact:** safety guarantee §32.8 substantially non-functional (cả 2 chiều); user thấy response đúng
  bị nuốt thành fallback. Cùng gốc P2 nhưng asymmetry làm SAFETY guard thủng.
- **Evidence:** `EXACT_VND_PATTERN` (`:119,150`) là regex digit+vnd/dong nên OK (không phụ thuộc dấu);
  semantic-guard layer (`:158-178`) chỉ chạy khi `semanticGuardEnabled` + dùng pattern riêng — không cứu lớp này.

### N2 — MEDIUM — KaelMemory (L1-L6, 355 dòng) là dead code production
- **WHERE:** `supabase/functions/mobile-api/_shared/kael/memory.ts` class `KaelMemory`. Sweep
  `new KaelMemory` / `.getContext(` toàn `supabase/functions` + `apps/api/src` (trừ chính file) → **0 caller production**;
  chỉ `apps/api/src/__tests__/unit/mobile-api-kael-p6.test.ts:55,97,153` instantiate; schema test
  `mobile-api-edge-schema.test.ts:421` assert `toContain('class KaelMemory')` (pin sự tồn tại của dead code).
  Endpoint thật `getMyKaelMemory`/`getWorkerKaelMemory` (`services.ts:6344,6369`) dùng query trực tiếp, KHÔNG qua class.
- **WHY:** feature "memory L1-L6 layering" của §31 được test nhưng chưa wire vào bất kỳ pipeline/endpoint nào →
  context bloat + 2 bug ngủ bên trong sẽ kích hoạt nếu ai wire sau: (a) `audit()` `:276-284` ghi
  `actor_id: subjectId` (= subject, không phải actor thật) → kael_memory_audit không phân biệt self-read vs system-read;
  (b) `fetchJobMemory` `:119-138` select job theo id KHÔNG scope theo actor → leak nếu gọi với jobId actor không sở hữu.
- **Impact:** structural — khớp memory "infra disconnected 3 chỗ". Không hại hôm nay (không chạy) nhưng là landmine.

### N3 — MEDIUM — Kill switch + learning flags chỉ nhận literal "true", trái phần còn lại của hệ
- **WHERE:** `kael/learning.ts:389-392` — `readBoolean(value)` = `value.toLowerCase() === "true"`
  (gate `KAEL_LEARNING_READ_ENABLED` / `WRITE_ENABLED` / `KILL_SWITCH` tại `:381-386`). So với chuẩn hệ:
  `env.ts:58-61` readBooleanFlag = `["1","true","yes","on"].includes(...)`; `cost-tracking.ts:165-168` envFlag y hệt;
  `source-trust.ts:108-115` y hệt; `autonomy-gate readBooleanFlag` y hệt.
- **WHY:** ops set `KAEL_LEARNING_KILL_SWITCH=1` để dừng khẩn cấp learning write → `readBoolean("1")` = false →
  **kill switch KHÔNG kích hoạt, learning vẫn ghi**. Tương tự `READ_ENABLED=1`/`WRITE_ENABLED=1` (cách set phổ biến)
  → learning review-outcome write im lặng đứng yên dù tưởng đã bật. Config-drift safety bug — nguy hiểm nhất ở kill switch.
- **Impact:** một nút an toàn (kill switch) không kill khi set theo convention `=1` mà phần còn lại của repo chấp nhận.

### N4 — MEDIUM — Race: local countdown hết giờ chặn poll, khách kẹt "no worker" giả khi đã match
- **WHERE:** `apps/mobile/lib/frontend-workflow-provider.tsx:746-752` (tick_broadcast setTimeout 1s tự lặp →
  `tick_broadcast` reducer `mobile-workflow.ts:600-632` đặt status 'expired' + workerGate 'backend_pending' khi về 0);
  `:717-744` (15s poll `refreshCurrentJob`) có guard `:721` `if (customerStatus==='broadcasting' && broadcast?.status==='expired') return` (NGỪNG poll).
  `refreshNotifications` `:593-609` chỉ update notification state, KHÔNG hydrate deal.
- **WHY:** đồng hồ đếm ngược chạy bằng client-clock (1s timer, bị throttle khi app nền). Thợ accept ở giây 59 →
  backend → worker_matched; nhưng local tick chạm 0 trước/đồng thời → local set 'expired' → **poll bị guard :721 ngừng**.
  Notification worker_matched (60s) chỉ đổ vào notification list, không hydrate deal → khách kẹt màn hình
  "chưa có thợ / hết hạn" trong khi backend đã có thợ; chỉ refresh tay/thao tác mới gỡ.
- **Impact:** customer trust — "app báo không có thợ nhưng thực ra đã có thợ nhận". Cửa sổ race nhỏ nhưng có thật.

### N5 — MEDIUM — Scope-change anti-fraud keyword evade bằng gõ không dấu
- **WHERE:** `kael/scope-risk.ts:111-113` `normalizeText` = `.toLowerCase().normalize("NFC")` (NFC **compose**,
  GIỮ dấu); keywords `DEFAULT_SUSPICIOUS_SCOPE_KEYWORDS:3-10` đều CÓ dấu ("phải thay hết", "đường ống chính"...).
  Match `matchSuspiciousScopeKeywords:28-34` = `normalized.includes(normalizeText(keyword))`.
- **WHY:** thợ gõ "phai thay het" (không dấu — cách gõ phổ biến nhất trên mobile VN) → NFC giữ nguyên "phai thay het" →
  KHÔNG chứa "phải thay hết" → **không match** → mất +0.15 điểm anti-fraud. Ngược hẳn với phần còn lại của repo
  (strip dấu NFD). Một fraudster chủ động sẽ gõ không dấu.
- **Impact:** anti-fraud component bị bỏ qua; không thảm hoạ đơn lẻ (0.15/0.5 challenge threshold) nhưng làm yếu detector.

### N6 — INFO + ĐÍNH CHÍNH L17 — `request_worker_cancellation_atomic` redefine 5 lần, auto-suspend đã bị GỠ
- **WHERE:** cùng tên function định nghĩa ở 5 migration: `20260519090200`, `20260520141200`, `20260521120000`
  (THÊM auto-suspend 7d≥5), `20260525140826` (p11), `20260526003315` (p14, LIVE). p14 comment `:325`:
  *"...never autonomously suspends a worker."* Live behavior: auto-approve + set `admin_review_required`
  khi ≥3 hủy/30d hoặc tỉ lệ hủy >30% (queue admin), KHÔNG auto-suspend.
- **WHY/ĐÍNH CHÍNH:** Vòng 2 tôi ghi **L17 "auto-suspend tồn tại 7d≥5"** — SAI: tôi đọc bản `20260521120000`
  đã bị p11/p14 thay. Bản LIVE không auto-suspend. Đính chính: hủy việc thợ ở live = không rating penalty,
  không auto-suspend, nhưng CÓ admin-review-flag ở ngưỡng 30d (≥3 hoặc >30%). Bài học audit: phải xác nhận
  migration LIVE (mới nhất theo timestamp) trước khi kết luận behavior — 5 bản chồng nhau là migration-hygiene risk.
- **Impact:** L17 ở §38.1.3 cần sửa lại mô tả (đỡ nghiêm trọng hơn tôi ghi); bản thân việc 5 redefinition
  chồng nhau làm static audit dễ sai (chính tôi đã sai) — đáng ghi nhận như rủi ro quy trình.

### Đã xác nhận SẠCH ở vòng 4 (đọc kỹ, không lỗi):
- `promote_learning_candidate` RPC (`20260604160000`): security definer + `pg_advisory_xact_lock` per scope +
  evidence gate (≥5 evidence, conf ≥0.6) + chặn forbidden effects (auto_charge_payment...) + version history → chặt.
- `process-batch-results.ts` price compute: IQR outlier rejection (`:594-608`) + percentile p25/p75 bound theo
  final_price THẬT + reject job có scope_change + confidence theo spread → learned price prior bị chặn ở nguồn,
  không thể ra giá phi lý (rút lại lo ngại "no clamp" sơ bộ).
- `chat_messages` là bảng THẬT (tôi từng nghi là job_messages — rút lại); memory.ts L6 + services.ts dùng nhất quán.

## 5. Vùng xác nhận SẠCH (đã đọc kỹ — Codex KHÔNG đụng trong đợt fix này)

- RLS: 67 bảng / 66 enabled; bảng thiếu duy nhất `worker_profiles_districts_backup_x3` đã drop ở `20260605006000` → thực chất 100%. `using(true)` duy nhất trên `price_baselines` (catalog tham chiếu — chấp nhận). Grant hardening 2026-06-04 đứng vững.
- SQL RPC bodies: `accept_broadcast_atomic` (FOR UPDATE đúng thứ tự job→broadcast→worker, guard thợ bận, eligibility re-check), `request_customer_cancellation_atomic`, `request_worker_cancellation_atomic`, `decide_scope_change_atomic` (CTE atomic + invariant exception) — đều chuẩn.
- Autonomy/permission gates: blocking thật (apiFailure khi non-allow), thứ tự check kỷ luật (schema → policy_id → transition → authority → PII → direct-mutation → evidence → high-stakes escalate).
- apps/api: auth per-route + role gating đúng; chỉ publishable keys ra `NEXT_PUBLIC`; `src/proxy.ts` đúng Next 16.2.6; không deploy config; không admin surface.
- Mobile: KHÔNG có direct DB read nào (`supabase.from` = 0 match) — đúng runtime boundary; api client retry chỉ cho idempotent requests.
- Perplexity endpoint `/v1/sonar`: nghi vấn vòng 2 đã RÚT — docs/memory/2026-05.md:72 có live-smoke evidence (sonar-pro, 3883ms, fail-closed đúng đường).

## 6. Evidence chạy test (2026-06-11, local, toolchain §38.4 FX0.5)

```text
@home-services/shared  : 586 pass / 1 FAIL (mobile-wiring — M13.1)        | tsc sạch
@home-services/api     : 1510 pass / 1 FAIL (edge-router check-in — M13.2)
                         59 skipped = 3 integration files thiếu env (đúng thiết kế) | tsc sạch
@home-services/mobile  : 145 pass / 0 fail                                 | tsc sạch
Phantom-table sweep    : .from()/.rpc() toàn Edge vs migrations → duy nhất scope_changes (H4)
Table-pin sweep        : 7 assertion pin tên bảng trong unit tests → 6 đúng, 1 sai (H4 test)
```
