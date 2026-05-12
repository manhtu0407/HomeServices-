# Project Memory — Home Services

File này ghi lại context và kết quả từng session làm việc.
Mỗi session mới: đọc file này trước, sau đó update khi kết thúc.

---

## Session 4 — 2026-05-12

**Branch**: `claude/nostalgic-borg-dcb1f3` → pushed to GitHub
**Người làm**: Claude Opus 4.6 + Tu

### Làm gì

Session dài nhất — cover toàn bộ Phase 0 Foundation Hardening: verify PRs, audit, build 6 items, tạo PR#4, viết 103 tests.

**1. Verify 3 PRs đã merged**
- PR#1 — Project setup (Next.js, Supabase, Tailwind, TypeScript)
- PR#2 — Claude Code infrastructure (CLAUDE.md, RULES.md, STRUCTURES.md, settings.json, commands)
- PR#3 — Database schema (9 tables, 7 enums, RLS, Realtime, Storage, 177 tests)

**2. Foundation Audit — phát hiện 6 gaps**
Khoảng cách giữa docs (excellent) và executable code (thiếu):
1. Không có env validator (RULES.md Rule #1)
2. Supabase clients thiếu `Database` generic (không type safety)
3. Không có AI wrapper (RULES.md Rule #2)
4. CLAUDE.md thiếu platform/structure/phase info
5. settings.json thiếu routine commands trong allowlist
6. layout.tsx còn scaffolding text + lang="en"

**3. Clarification: RN là primary**
Tu xác nhận: Home Services là thuần app mobile (React Native). Next.js chỉ support (API routes + admin panel).

**4. Execute Foundation Hardening — 6 items, 2 tầng**

Tầng 1 — Blocking:
- `src/lib/env.ts` — Env validator, crash nếu thiếu required vars
- `src/lib/server.ts`, `client.ts`, `middleware.ts` — Thêm `<Database>` generic
- `src/lib/ai/types.ts` — AIProvider, AIRequest, AIResponse, AIError, AIResult, TIMEOUT_MS, MAX_RETRIES
- `src/lib/ai/client.ts` — `callAI()` với timeout per provider, retry 2x backoff, logging Rule#9
- `src/lib/ai/providers/anthropic.ts` — system message extraction, cost calc Sonnet/Haiku
- `src/lib/ai/providers/perplexity.ts` — OpenAI-compatible, default temp 0.2
- `src/lib/ai/providers/deepseek.ts` — OpenAI-compatible, cheapest pricing

Tầng 2 — Claude Code Concentration:
- `CLAUDE.md` — Thêm Platform (RN-primary), Project Structure, Current Phase
- `.claude/settings.json` — Thêm git/gh/vitest vào allowlist
- `src/app/layout.tsx` — lang="vi", title="Home Services"

**5. PR#4 merged**

**6. Viết 103 Foundation Tests — 5 tiers, chained**

| Tier | File | Cases | Verifies |
|------|------|-------|----------|
| 1 | `tier1-types-constants.test.ts` | 19 | TIMEOUT_MS, MAX_RETRIES, AI types |
| 2 | `tier2-env-validator.test.ts` | 13 | env.ts throws, error messages, getters |
| 3 | `tier3-providers.test.ts` | 20 | 3 providers: endpoints, headers, body, cost, errors |
| 4 | `tier4-ai-client.test.ts` | 23 | callAI() routing, timeout, retry, backoff, logging |
| 5 | `tier5-integration.test.ts` | 28 | Database generic, layout Rule#5, file structure, chain |

**7. Kết quả: 280/280 PASSED, ~45s (0 failures)**

### Commits trên branch

```
aefe1e6  feat: foundation hardening — env validator, AI wrapper, type-safe Supabase, DX improvements
baee288  test: add 103 foundation tests for PR#4 — 5 tiers, 280/280 total passed
```

### Key Lessons

- **Scope creep**: Plan đầu gộp foundation + features → Tu bắt lỗi → viết lại foundation-only
- **Test honesty**: Tu hỏi "test thật hay chỉ report?" → dẫn đến viết 103 tests thật
- **Memory location**: Tất cả memory lưu trong `.claude/MEMORY.md` (repo), không tạo file riêng

### Tình trạng cuối session

- ✅ Phase 0 Foundation Hardening DONE (6/6 items)
- ✅ 280/280 tests passing (177 schema + 103 foundation)
- ✅ AI wrapper sẵn sàng: `callAI()` với 3 providers
- ✅ Env validator + type-safe Supabase
- ⏳ Feature implementation plan chưa tạo — cần plan riêng cho Phase 1+

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

## Cấu trúc hiện tại (sau Session 4)

```
src/
  __tests__/
    schema/             ← 4 test files, 177 tests (PR#3)
    foundation/         ← 5 test files, 103 tests (PR#4)
  app/
    layout.tsx          ← lang="vi", title="Home Services"
  lib/
    ai/
      client.ts         ← callAI() — main entry point
      types.ts          ← AIProvider, AIRequest, AIResult, constants
      providers/
        anthropic.ts    ← Anthropic API wrapper
        perplexity.ts   ← Perplexity API wrapper
        deepseek.ts     ← DeepSeek API wrapper
    client.ts           ← Supabase browser client (type-safe)
    server.ts           ← Supabase server client (type-safe)
    middleware.ts       ← Auth middleware (type-safe)
    env.ts              ← Env validator (crash on missing vars)
    database.types.ts   ← Auto-generated types (9 tables, 7 enums)
supabase/
  migrations/
    20260511000000_init_schema.sql
docs/
  test-logs/
    INDEX.md
    2026-05-11_pr3-schema-tests.md
.claude/
  commands/             ← 7 custom slash commands
  MEMORY.md             ← file này
  settings.json         ← permissions + allowlist
```
