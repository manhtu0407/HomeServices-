# Test Log: PR#3 Database Schema — 2026-05-11

> Status: historical PR#3 evidence. This log predates later monorepo,
> Supabase Edge `mobile-api`, cleaning-service, storage, notification, and
> workflow hardening work. Do not use the table counts, service counts, or
> branch state here as current truth. Use current schema, migrations, tests,
> `STRUCTURES.md`, and `MEMORY.md` for present-state decisions.

## Tổng kết

| Metric | Value |
|--------|-------|
| Test files | 4 |
| Total tests | 177 |
| Passed | 177 |
| Failed | 0 |
| Duration | 312ms |
| Framework | Vitest 4.1.5 |
| Branch | `claude/vibrant-jennings-d0bc85` (trên `main`) |

---

## Test Tier 1: Type Completeness (`tier1-type-completeness.test.ts`)

**Mục đích**: Verify file `src/lib/database.types.ts` (auto-generated bởi Supabase CLI) match với STRUCTURES.md — đảm bảo types không bị thiếu table, thiếu field, hoặc sai required/optional.

### Tests chi tiết

| # | Test | Kết quả | Ý nghĩa |
|---|------|---------|----------|
| 1 | 9 tables tồn tại trong `Database['public']['Tables']` | PASS | profiles, customer_profiles, worker_profiles, price_baselines, jobs, job_broadcasts, chat_messages, reviews, api_logs |
| 2 | 7 enums tồn tại trong `Database['public']['Enums']` | PASS | user_role, service_type, job_status, complexity_level, broadcast_status, message_sender, api_provider |
| 3 | Enum values chính xác (7 sub-tests) | PASS | So sánh `Constants.public.Enums` với giá trị documented |
| 4 | profiles Insert requires `id`, `role` only | PASS | Dùng `satisfies` compile-time check — nếu ai bỏ DEFAULT trong SQL và regenerate types, test sẽ fail |
| 5 | customer_profiles Insert requires `id` only | PASS | Các field address (building_name, unit_number, floor, district) optional |
| 6 | worker_profiles Insert requires `id` only | PASS | service_types, is_approved, rating... đều có default → optional |
| 7 | price_baselines Insert requires `service_type`, `complexity`, `price_min`, `price_max` | PASS | 4 fields bắt buộc — không có giá baseline nào được tạo thiếu field |
| 8 | jobs Insert requires `customer_id`, `description`, `service_type` only | PASS | 33 fields còn lại optional (có default hoặc nullable) |
| 9 | job_broadcasts Insert requires `job_id`, `worker_id` | PASS | status defaults to 'pending' |
| 10 | chat_messages Insert requires `content`, `job_id`, `sender_role` | PASS | sender_id optional (null cho Kael system messages) |
| 11 | reviews Insert requires `customer_id`, `job_id`, `rating`, `worker_id` | PASS | 4 FK/value fields bắt buộc |
| 12 | api_logs Insert requires `provider`, `success` | PASS | Minimum logging: biết provider nào, thành công hay thất bại |
| 13 | Row field count per table | PASS | profiles(7), customer_profiles(7), worker_profiles(15), price_baselines(6), jobs(36), job_broadcasts(6), chat_messages(7), reviews(8), api_logs(11) |
| 14 | Type helpers (Tables, TablesInsert, TablesUpdate, Enums) | PASS | Generics resolve đúng types |

### Vì sao test này quan trọng

Khi regenerate types bằng `npx supabase gen types`, nếu ai đó thay đổi DEFAULT hoặc NOT NULL trong migration, Insert type sẽ thay đổi. Test `satisfies` bắt lỗi này ở compile-time — Vitest report nó như test failure.

---

## Test Tier 2: Business Rules (`tier2-business-rules.test.ts`)

**Mục đích**: Verify types enforce các business rules từ RULES.md và STRUCTURES.md.

### Tests chi tiết

| # | Test | Kết quả | Rule liên quan |
|---|------|---------|----------------|
| 1 | service_type CHỈ có `['electrical', 'plumbing']` — length 2, exact match | PASS | RULES #6: Kael chỉ điện + nước |
| 2 | service_type không chứa service nào khác | PASS | Hard rule — phải fail nếu ai thêm service mới |
| 3 | job_status có đúng 11 states | PASS | Workflow A3→cancelled |
| 4 | job_status states match order trong STRUCTURES.md | PASS | pending, broadcast, matched, worker_en_route, inspecting, in_progress, scope_change, completed, confirmed, paid, cancelled |
| 5 | Key workflow states tồn tại (pending=A3, broadcast=A7, matched=B2, scope_change=A11, completed=B5, confirmed=A12) | PASS | 5 confirmation points từ 3E |
| 6 | complexity_level = [small, medium, large] | PASS | Price Estimate Card A5 |
| 7 | api_provider = [anthropic, perplexity, deepseek] | PASS | AI Stack Section 4 |
| 8 | message_sender includes 'kael' | PASS | Chat relay 3D — Kael inject messages |
| 9 | user_role includes 'admin' | PASS | Worker approval B0 |
| 10 | jobs.worker_id nullable | PASS | Chưa assign khi tạo job |
| 11 | jobs.customer_id NOT nullable, required in Insert | PASS | Mọi job phải có customer |
| 12 | jobs.scheduled_at nullable (null = "ngay bây giờ") | PASS | A6 scheduling |
| 13 | kael_* fields nullable (populated sau AI processing) | PASS | kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory |
| 14 | scope_change fields nullable (chỉ khi B4) | PASS | scope_change_description, scope_change_customer_decision |
| 15 | reviews.rating là number, required in Insert | PASS | Cho check constraint 1-5 |
| 16 | price_baselines.price_min/max là number (not nullable) | PASS | Fallback pricing phải có giá |
| 17 | Constants.public.Enums keys match Database.public.Enums | PASS | Runtime vs type-level consistency |
| 18 | chat_messages.sender_id nullable + optional (Kael messages) | PASS | 3D: null sender = Kael |
| 19 | worker_profiles.service_types là array | PASS | Thợ có thể làm cả điện + nước |
| 20 | api_logs structure (cost_usd, latency_ms, error_code) | PASS | RULES #9 logging |

### Vì sao test này quan trọng

Test này là bảo vệ cho business rules. Nếu ai thêm service type thứ 3 mà chưa có quyết định mở rộng → test fail ngay. Nếu ai bỏ 'kael' khỏi message_sender → chat relay logic hỏng → test fail.

---

## Test Tier 3: Relationships (`tier3-relationships.test.ts`)

**Mục đích**: Verify FK relationships, cardinality (1:1 vs 1:many), nullable FKs.

### Tests chi tiết

| # | Test | Kết quả | Chi tiết |
|---|------|---------|----------|
| 1 | customer_profiles.id → profiles.id là 1:1 | PASS | isOneToOne: true |
| 2 | worker_profiles.id → profiles.id là 1:1 | PASS | isOneToOne: true |
| 3 | reviews.job_id → jobs.id là 1:1 | PASS | 1 review per job (UNIQUE) |
| 4 | jobs.customer_id → profiles.id là 1:many | PASS | Customer có nhiều jobs |
| 5 | jobs.worker_id → profiles.id là 1:many | PASS | Worker nhận nhiều jobs |
| 6 | chat_messages.job_id → jobs.id là 1:many | PASS | Job có nhiều messages |
| 7 | chat_messages.sender_id → profiles.id là 1:many | PASS | User gửi nhiều messages |
| 8 | job_broadcasts.job_id → jobs.id là 1:many | PASS | Job broadcast cho nhiều workers |
| 9 | job_broadcasts.worker_id → profiles.id là 1:many | PASS | Worker nhận nhiều broadcasts |
| 10 | api_logs.job_id → jobs.id là 1:many | PASS | Job có nhiều API calls |
| 11 | reviews.customer_id → profiles.id là 1:many | PASS | Customer viết nhiều reviews |
| 12 | reviews.worker_id → profiles.id là 1:many | PASS | Worker nhận nhiều reviews |
| 13 | Required FKs: jobs.customer_id (compile-time @ts-expect-error) | PASS | Thiếu customer_id → TypeScript error |
| 14 | Required FKs: chat_messages.job_id (compile-time) | PASS | Thiếu job_id → TypeScript error |
| 15 | Required FKs: job_broadcasts.job_id + worker_id | PASS | Thiếu cả 2 → TypeScript error |
| 16 | Required FKs: reviews 4 fields | PASS | Thiếu bất kỳ → TypeScript error |
| 17 | Nullable FK: jobs.worker_id accepts null | PASS | Chưa assign worker |
| 18 | Nullable FK: chat_messages.sender_id accepts null | PASS | Kael system messages |
| 19 | Nullable FK: api_logs.job_id accepts null | PASS | Standalone API calls |
| 20 | profiles: 0 outgoing FKs (references auth.users — không trong public schema) | PASS | — |
| 21 | price_baselines: 0 outgoing FKs | PASS | Standalone lookup table |
| 22 | jobs: exactly 2 FKs | PASS | customer_id, worker_id |
| 23 | chat_messages: exactly 2 FKs | PASS | job_id, sender_id |
| 24 | job_broadcasts: exactly 2 FKs | PASS | job_id, worker_id |
| 25 | reviews: exactly 3 FKs | PASS | customer_id, worker_id, job_id |
| 26 | api_logs: exactly 1 FK | PASS | job_id |

### Vì sao test này quan trọng

FK cardinality sai = data model sai. Ví dụ: nếu reviews.job_id bị đổi từ 1:1 sang 1:many → 1 job có thể có nhiều reviews → logic payment sẽ hỏng.

---

## Test Tier 4: SQL Migration Parsing (`tier4-sql-migration.test.ts`)

**Mục đích**: Parse `supabase/migrations/20260511000000_init_schema.sql` dạng text — bắt lỗi mà TypeScript types không thấy được.

### Tests chi tiết

| # | Test | Kết quả | Chi tiết |
|---|------|---------|----------|
| 1-9 | 9 tables có RLS enabled | PASS | `ALTER TABLE x ENABLE ROW LEVEL SECURITY` cho mỗi table |
| 10 | Exactly 11 indexes | PASS | Không thừa, không thiếu |
| 11-21 | 11 indexes tồn tại theo tên | PASS | jobs(4), job_broadcasts(2), chat_messages(2), api_logs(3) |
| 22 | INSERT INTO price_baselines exists | PASS | Seed data có |
| 23 | 6 combo service_type × complexity | PASS | electrical×3 + plumbing×3 |
| 24 | Seed prices là positive integers | PASS | ≥12 numbers, all > 0 |
| 25 | CHECK rating BETWEEN 1 AND 5 | PASS | reviews table |
| 26 | CHECK scope_change_customer_decision IN ('approved','cancelled') | PASS | jobs table |
| 27 | UNIQUE(service_type, complexity) | PASS | price_baselines |
| 28 | UNIQUE(job_id, worker_id) | PASS | job_broadcasts — 1 broadcast per worker per job |
| 29 | UNIQUE phone | PASS | profiles.phone |
| 30 | UNIQUE reviews.job_id | PASS | 1 review per job |
| 31-33 | 3 storage buckets (job-photos, completion-photos, worker-documents) | PASS | — |
| 34 | job-photos 10MB limit | PASS | 10485760 bytes |
| 35 | worker-documents 5MB limit | PASS | 5242880 bytes |
| 36-38 | 3 tables in supabase_realtime | PASS | jobs, chat_messages, job_broadcasts |
| 39 | Sensitive tables NOT in realtime | PASS | profiles, api_logs, price_baselines, reviews không có |
| 40-46 | 7 triggers tồn tại | PASS | 5 updated_at + on_auth_user_created + reviews_update_worker_rating |
| 47-51 | No secrets/PII in SQL | PASS | No sk-, pplx-, phone numbers, process.env, email |
| 52-56 | Critical RLS policies | PASS | Customer create jobs, worker respond broadcasts, reviews for confirmed jobs only, price_baselines public read, worker documents folder isolation |
| 57-63 | 7 enums created | PASS | Tất cả CREATE TYPE ... AS ENUM |
| 64-66 | 3 utility functions | PASS | update_updated_at, handle_new_user, update_worker_rating |
| 67 | handle_new_user defaults to 'customer' | PASS | `coalesce(..., 'customer')` |

### Vì sao test này quan trọng

TypeScript types KHÔNG thể thấy: RLS policies, check constraints, indexes, triggers, storage buckets, realtime config. Nếu ai edit migration mà xóa RLS → bảo mật hỏng nhưng TypeScript vẫn compile OK. Test tier 4 bắt loại lỗi này.

---

## Issues phát hiện & đã fix

1. **`database.types.ts` line 679**: Có artifact `<claude-code-hint v="1" type="plugin" value="supabase@claude-plugins-official" />` — không phải TypeScript hợp lệ, gây parse error khi Vitest transform. **Đã remove.**

2. **`vite-tsconfig-paths` plugin deprecated**: Vite 6+ đã support native `resolve.tsconfigPaths: true`. **Đã switch sang native, remove dependency.**

---

## Giới hạn (thành thật)

| Không test được | Lý do | Cần gì |
|-----------------|-------|--------|
| RLS policy enforcement thực tế | Cần Supabase instance + test users | `supabase start` + Docker |
| Trigger behavior (handle_new_user, update_worker_rating) | Cần execute SQL | Supabase local DB |
| Check constraint enforcement (rating 1-5) | SQL text chỉ verify existence, không test actual rejection | Real DB |
| Index performance | Cần data volume | Load testing |
| Storage bucket access control | Cần Supabase storage runtime | Integration tests |

---

## Cách chạy lại

```bash
npm test          # run once
npm run test:watch  # watch mode
```
