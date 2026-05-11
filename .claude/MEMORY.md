# Project Memory — Home Services

File này ghi lại context và kết quả từng session làm việc.
Mỗi session mới: đọc file này trước, sau đó update khi kết thúc.

---

## Session 3 — 2026-05-11

**Branch**: `claude/vibrant-jennings-d0bc85` → pushed to `main`
**Người làm**: Claude Opus 4.6 + Tu

### Làm gì

PR#3 (`schema/phase1-clean`) đã merged vào main trước session này. Session này bổ sung tests + documentation cho PR#3.

**1. Test infrastructure setup**
- Cài Vitest 4.1.5, thêm `test` + `test:watch` scripts vào package.json
- `vitest.config.ts` dùng native `resolve.tsconfigPaths: true` (không cần plugin)

**2. Viết 177 test cases — 4 tiers**
- `src/__tests__/schema/tier1-type-completeness.test.ts` — 9 tables, 7 enums, Insert required fields cho toàn bộ tables
- `src/__tests__/schema/tier2-business-rules.test.ts` — Rule #6 (chỉ điện + nước), workflow states, nullability
- `src/__tests__/schema/tier3-relationships.test.ts` — FK cardinality (1:1 vs 1:many), nullable FKs
- `src/__tests__/schema/tier4-sql-migration.test.ts` — RLS, indexes, seed data, constraints, security, triggers

**3. Kết quả test: 177/177 PASSED, 312ms**

**4. Bug phát hiện & fixed**
- `database.types.ts` line 679 có artifact `<claude-code-hint>` tag — invalid TypeScript, gây parse error → đã remove

**5. Documentation**
- `docs/test-logs/2026-05-11_pr3-schema-tests.md` — full test report với breakdown từng tier
- `docs/test-logs/INDEX.md` — index tất cả reports
- `README.md` — progress log entry đầu tiên

**6. Custom commands thêm vào `.claude/commands/`**
- `test-report.md` — template sinh test report sau mỗi lần chạy
- `test-log.md` — cập nhật INDEX.md

### Commits pushed lên main

```
4a51d6c  test: add 177 schema tests for PR#3 database migration
37440b4  docs: log PR#3 schema test results — 177/177 passed
8db7ed0  docs: add detailed test log for PR#3 schema tests
1e2b0c2  feat: add test-report and test-log commands + INDEX
```

### Tình trạng cuối session

- ✅ Database schema PR#3 có test coverage
- ✅ Test infrastructure sẵn sàng cho test mới
- ✅ Workflow commands đầy đủ: `pre-flight`, `review`, `scope-check`, `security-audit`, `log`, `test-report`, `test-log`
- ⏳ Chưa có application code nào — schema xong, tests xong, next là Phase 1 app (Kael Price Check flow)

### Giới hạn tests hiện tại (cần biết cho session sau)

RLS enforcement, trigger behavior, check constraint rejection chưa test được — cần `supabase start` (Docker). Tất cả tests hiện tại là type-level + SQL text parsing, không có integration tests thật.

---

## Session 2 — trước 2026-05-11

**Làm gì**: PR#2 — setup initial Next.js project, Supabase client integration, middleware auth.
Xem commit `235e27b` và `0fc808c` trên main.

---

## Session 1 — trước 2026-05-11

**Làm gì**: PR#3 — Phase 1 database schema (9 tables, 7 enums, RLS, Realtime, Storage).
Xem commit `13f16be` và `6920481` trên main.

---

## Cấu trúc hiện tại (đầu session tiếp theo)

```
src/
  __tests__/schema/     ← 4 test files, 177 tests
  app/                  ← Next.js pages (chỉ có boilerplate)
  lib/
    client.ts           ← Supabase browser client
    server.ts           ← Supabase server client
    middleware.ts       ← Auth middleware
    database.types.ts   ← Auto-generated types (9 tables, 7 enums)
supabase/
  migrations/
    20260511000000_init_schema.sql  ← Phase 1 schema
docs/
  test-logs/
    INDEX.md
    2026-05-11_pr3-schema-tests.md
.claude/
  commands/             ← 7 custom slash commands
  MEMORY.md             ← file này
```
