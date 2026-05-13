# Project Memory — Home Services

File này ghi lại context và kết quả từng session làm việc.
Mỗi session mới: đọc file này trước, sau đó update khi kết thúc.

---

## Session 8 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Implemented the Supabase schema alignment foundation from the approved plan. This stayed local-first and did not push or apply anything to remote Supabase.

### Key decisions

- Schema now follows the rebuilt `STRUCTURES.md` workflow states instead of the old 11-state job enum.
- Existing legacy job statuses are mapped explicitly in the new migration.
- Service taxonomy is table-driven with `service_categories` and `service_problems`.
- Price baselines now attach to service problems and district scope instead of only service type plus complexity.
- Scope change, notifications, job events, and Kael learning now have dedicated tables.
- RLS is stricter: normal users do not directly mutate workflow state, worker approvals, profile roles, or learning rules.
- Admin helper moved to `private.is_admin()` and storage policies are scoped by job/worker folder path.

### Result

- Created `supabase/migrations/20260513114845_align_structures_workflow.sql` using Supabase CLI.
- Updated `src/lib/database.types.ts` to the aligned schema because local type generation is blocked by Docker availability.
- Updated `supabase/seed.sql` to use the new `analyzing` workflow status and approved worker verification status.
- Rewrote schema tests for new table/enums/relationships/RLS/storage contract.

### Verification

- `npx supabase --version`: 2.98.2.
- `npm run test`: 13 files, 357/357 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx supabase migration list --local`: failed because local Postgres is not running on 127.0.0.1:54322.
- `npx supabase db reset`: failed because Docker engine is not running or reachable.
- `npx supabase gen types typescript --local`: failed for the same Docker/local Supabase reason.

### Next

Before remote deployment, start Docker Desktop, run local `supabase db reset`, regenerate `database.types.ts` from local DB, and fix any SQL runtime issues the static tests cannot catch.

---

## Session 9 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Tested the non-Docker Supabase remote path without applying migrations.

### Result

- Token-based `supabase projects list` worked after network permission.
- No dedicated HomeServices staging project exists in the current organization.
- The repo is linked to `HomeServices` with project ref `iwevizmsedyqozxlawwl`.
- `supabase migration list --linked` shows remote has only `20260511000000`; local also has `20260512000000` and `20260513114845`.
- `supabase db push --dry-run --linked` completed without mutating remote.

### Dry-run finding

A real remote push would apply both pending migrations in order:

- `20260512000000_security_hardening.sql`
- `20260513114845_align_structures_workflow.sql`

### Next

Create or identify a real HomeServices staging Supabase project before applying migrations, or explicitly approve using the linked `HomeServices` project for staging apply. Revoke the temporary Supabase token used in this session.

---

## Session 10 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Applied and verified the migration chain on the new `HomeServices Staging` Supabase project.

### Target

- Project: `HomeServices Staging`
- Ref: `xyylanuyflrjzbjzhqfl`
- Region: `ap-southeast-1`
- Local Supabase link: currently points to staging after this session.

### Result

- `supabase db push --dry-run --linked` showed the expected three migrations for a fresh staging DB.
- `supabase db push --linked` applied:
  - `20260511000000_init_schema.sql`
  - `20260512000000_security_hardening.sql`
  - `20260513114845_align_structures_workflow.sql`
- `supabase migration list --linked` confirmed all three migrations are present remotely.
- Generated `src/lib/database.types.ts` from staging and converted it to UTF-8 so Vitest/ESLint can parse it.

### Runtime smoke checks

- 17 public tables exist.
- RLS is enabled on all 17 public tables.
- Policies exist for all 17 public tables.
- Storage has 3 buckets and 6 storage policies.
- Service taxonomy has 2 categories and 2 generic problems.
- Price baselines has 6 rows.
- Learning foundation has all 3 tables.
- Workflow enums match the `STRUCTURES.md` state contract.

### Verification

- `npm run test`: 13 files, 357/357 passed.
- `npm run lint`: passed.
- `npm run build`: passed.

### Next

Use staging for any additional Supabase runtime checks before production. Do not push migrations to the production `HomeServices` project until Tu explicitly approves a production migration checklist. Revoke the temporary Supabase access token used in this session.

---

## Session 11 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Executed deeper Supabase staging RLS/storage security verification.

### Result

- Added `supabase/tests/staging_security_verification.sql`.
- The harness creates deterministic staging-only auth users, profiles, jobs, broadcasts, messages, events, scope changes, notifications, learning records, and storage objects inside a single transaction.
- The harness uses `set local role authenticated` and `set local request.jwt.claim.sub` to simulate customer, matched worker, broadcast-only worker, outsider, and admin contexts.
- The harness ends with `rollback`, so no fixture data remains in staging.
- Added `src/__tests__/schema/tier7-staging-security-harness.test.ts` to statically guard the harness against token persistence, missing rollback, and missing coverage groups.

### Remote verification

- Ran the harness on linked `HomeServices Staging` (`xyylanuyflrjzbjzhqfl`).
- Final summary: 0 failures / 29 checks.
- Covered:
  - customer can read own profile/job/evidence but not another customer's job/profile
  - customer cannot insert jobs directly
  - customer cannot read learning candidates or API logs
  - matched worker can read assigned job and upload completion photo
  - broadcast-only worker can read own broadcast but cannot read full job/address before match
  - unmatched worker cannot upload job photos
  - outsider cannot read protected jobs/photos
  - normal user cannot insert learning candidates
  - admin can read jobs, learning candidates, API logs, worker documents, and manage notifications

### Verification

- `npm run test`: 14 files, 362/362 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Secret scan found no `sbp_...` token in repo files.

### Next

Keep local Supabase link pointed at staging for future verification unless Tu wants it restored to production. Production migration still requires explicit approval and a separate checklist.

---

## Session 12 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Prepared the production migration safety gate without applying production migrations.

### Result

- Added `docs/ops/production-migration-checklist.md`.
- Added `supabase/migrations/20260513125704_harden_function_execution.sql`.
- Updated `src/__tests__/schema/tier4-sql-migration.test.ts` with static assertions for function execution hardening.

### Production preflight

- Temporarily linked to production `HomeServices` (`iwevizmsedyqozxlawwl`) for read-only checks, then restored link to staging.
- Production migration history currently contains only `20260511000000 init_schema`.
- Production app/storage table counts checked: all 0 for profiles, customer_profiles, worker_profiles, jobs, job_broadcasts, chat_messages, reviews, and storage_objects.
- Production dry-run before the hardening migration reported pending `20260512000000_security_hardening.sql` and `20260513114845_align_structures_workflow.sql`.
- After adding hardening, final production dry-run is blocked until `SUPABASE_DB_PASSWORD` is provided; expected pending chain is now:
  - `20260512000000_security_hardening.sql`
  - `20260513114845_align_structures_workflow.sql`
  - `20260513125704_harden_function_execution.sql`

### Security advisor finding and remediation

- Production/staging advisors surfaced function warnings before hardening:
  - mutable `search_path` on `update_updated_at`, `update_worker_rating`, `handle_new_user`
  - direct API execution of trigger-only `handle_new_user()`
- Added hardening migration to pin `search_path = public` and revoke direct execute on `handle_new_user()` from `public`, `anon`, and `authenticated`.
- Applied this migration to staging only.
- Staging `supabase db advisors --linked --type security --level warn`: No issues found.
- Staging RLS/storage harness still passes 29/29.

### Verification

- `npm run test`: 14 files, 364/364 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Secret scan found no `sbp_...` token in repo files.
- Local Supabase link is restored to staging `xyylanuyflrjzbjzhqfl`.

### Next

Production apply requires explicit Tu approval, production DB password as process env only, final production dry-run, and the checklist in `docs/ops/production-migration-checklist.md`.

---

## Session 13 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Attempted the final production dry-run/apply sequence after Tu provided production credentials.

### Result

- Temporarily linked local Supabase CLI target to production `HomeServices` (`iwevizmsedyqozxlawwl`).
- Final production `supabase db push --dry-run --linked` failed before any migration apply.
- Failure reason: PostgreSQL SASL authentication failed for user `postgres`, meaning the provided production database password was not accepted.
- No production migrations were applied.
- Restored local Supabase link to staging `xyylanuyflrjzbjzhqfl`.
- Updated `docs/ops/production-migration-checklist.md` and README with the blocker.

### Verification

- Confirmed local link is staging after the failed dry-run.
- Secret scan found no Supabase access token or provided DB password persisted in repo files.

### Next

Tu needs to verify or reset the production database password in Supabase. After that, rerun the production checklist final dry-run before any apply.

---

## Session 14 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Retried and applied the production migration chain with the corrected production DB password.

### Production apply

- Temporarily linked to production `HomeServices` (`iwevizmsedyqozxlawwl`).
- Final production dry-run matched exactly:
  - `20260512000000_security_hardening.sql`
  - `20260513114845_align_structures_workflow.sql`
  - `20260513125704_harden_function_execution.sql`
- Applied all three pending migrations to production successfully.

### Post-apply verification

- Production migration history now includes all four migrations.
- Production schema smoke passed:
  - 17 public tables
  - 17 public tables with RLS enabled
  - policies on all 17 public tables
  - 3 storage buckets
  - 6 storage policies
  - 2 service categories
  - 2 service problems
  - 6 price baselines
  - 3 learning tables
  - profiles/jobs/storage objects remain 0 after rollback-only fixture harness
- Production rollback-only RLS/storage harness passed 29/29 checks.

### Remaining blocker

Supabase security advisors still report WARN on production-only `public.rls_auto_enable()`:

- `anon` can execute the SECURITY DEFINER function via RPC.
- `authenticated` can execute the SECURITY DEFINER function via RPC.
- Function definition is an event trigger helper with `search_path=pg_catalog`.

This is not from the local migration chain and did not exist on staging advisors. Production is migrated, but not fully green until a targeted follow-up migration revokes direct execute from `public`, `anon`, and `authenticated` when the function exists.

### Safety

- Local Supabase link restored to staging `xyylanuyflrjzbjzhqfl`.
- Do not call production fully green until the advisor blocker is fixed and advisors return "No issues found".

---

## Session 15 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Fixed the remaining production Supabase security advisor warning for `public.rls_auto_enable()`.

### Migration

- Added `supabase/migrations/20260513131949_revoke_rls_auto_enable_rpc.sql`.
- Migration is conditional/idempotent:
  - checks whether `public.rls_auto_enable()` exists with no arguments
  - revokes `EXECUTE` from `public`, `anon`, and `authenticated`
  - does not drop the function or event trigger helper behavior
  - safely no-ops on environments where the function is absent
- Added static test coverage in `tier4-sql-migration.test.ts`.

### Staging verification

- Dry-run showed only `20260513131949_revoke_rls_auto_enable_rpc.sql`.
- Applied on staging successfully.
- Security advisors: No issues found.
- RLS/storage harness: 29/29 passed.

### Production verification

- Dry-run showed only `20260513131949_revoke_rls_auto_enable_rpc.sql`.
- Applied on production successfully.
- Security advisors: No issues found.
- RLS/storage harness: 29/29 passed.
- Smoke counts passed:
  - 17 public tables
  - 17 RLS-enabled public tables
  - policies on all 17 public tables
  - 3 storage buckets
  - 6 storage policies
  - 2 service categories
  - 2 service problems
  - 6 price baselines
  - 3 learning tables
  - production profiles/jobs/storage objects remain 0 after rollback-only harness
- Production migration history now includes all five migrations.

### Safety

- Local Supabase link restored to staging `xyylanuyflrjzbjzhqfl`.
- Secret scan found no Supabase access token or DB password persisted in repo files.
- Tu should revoke/rotate the temporary Supabase access token and DB password used in command execution context.

---

## Session 7 - 2026-05-13

**Branch**: current working tree
**Worker**: Codex + Tu

### What changed

Implemented Mission 3 prepared foundation without building backend, frontend, or Kael runtime features.

### Key decisions

- Current root Next.js app stays active for now; future `apps/admin` migration needs explicit approval.
- Future mobile path is Expo + TypeScript + Expo Router.
- Mobile must call Home Services backend only; no direct AI provider calls and no server secrets in React Native.
- Supabase schema is known to drift from the rebuilt `STRUCTURES.md`; schema alignment must happen before real workflow feature work.
- Supabase temporary access token from the conversation was not persisted into repo files.

### Result

- Restored local dependencies with `npm ci`.
- Fixed Next/Turbopack workspace-root issue in `next.config.ts`.
- Removed build-time dependency on Google Fonts from `src/app/layout.tsx` and `src/app/globals.css`.
- Added `docs/foundation/pre-app-build-contract.md`.
- Added `src/__tests__/foundation/pre-app-build-contract.test.ts` with 10 guard tests.
- Updated ESLint config to treat `_`-prefixed unused variables/args as intentional and removed one dead helper from relationship tests.

### Verification

- `npm run test`: 13 files, 427/427 passed.
- `npm run lint`: passed with clean output.
- `npm run build`: passed.
- `npm audit --omit=dev`: reports 2 moderate vulnerabilities from Next's transitive `postcss`; npm suggests `--force` with a breaking downgrade, so no automatic fix was applied.

### Next

Recommended next implementation step is Supabase schema alignment design plus shared state-machine contracts, then Expo mobile scaffold. Do not jump straight into UI screens that require backend states not represented in the database.

---

## Session 6 — 2026-05-13

**Branch**: current working tree
**Người làm**: Codex + Tu

### Làm gì

Rebuilt `STRUCTURES.md` from a high-level app context document into a full workflow blueprint for frontend/backend implementation.

### Key Decisions

- `STRUCTURES.md` remains the single source of truth for app workflows.
- It now covers customer, worker, admin, Kael, backend domain modules, state machines, trust/safety, pricing, notifications, failure recovery, frontend/backend contracts, and testing.
- Kael self-learning is allowed for analysis behavior and price suggestions after evidence gates pass.
- Kael learning must be auditable, reversible, measurable, and visible to admin.
- Kael still cannot autonomously execute booking, payment, cancellation, worker punishment, scope-change approval, or service expansion.

### Result

- Rewrote `STRUCTURES.md` with 22 sections.
- Added `MarketMemoryService` and `CaseReviewService` as controlled support services for Kael learning.
- Added evidence-gated learning states, rollback requirements, and critical test cases.
- Updated README progress log for this session.

### Next

Future implementation should use `critical.md` for execution discipline and `STRUCTURES.md` for workflow truth before building Auth, Kael Price Check, worker matching, chat/evidence, admin, or learning services.

---

## Session 5 — 2026-05-13

**Branch**: current working tree
**Người làm**: Codex + Tu

### Làm gì

Created `critical.md` as the AI execution contract for Home Services after reading `Master Prompt 2.0.pdf`, `CLAUDE.md`, `RULES.md`, `STRUCTURES.md`, `.claude/MEMORY.md`, custom Claude commands, package scripts, and test logs.

### Key Decisions

- `critical.md` is the mandatory execution layer for every coding task.
- It is English-only, AI-facing, and locked unless Tu explicitly asks to edit it.
- It embeds Kael-specific protocols instead of linking out to separate skill files.
- Agents must run short preflight before edits, select protocols, and run review after edits.
- No false verification reports: failed or unrun tests/builds must be stated honestly.
- Lessons learned should go to `docs/agent-lessons.md`; README is only for end-of-session progress entries.

### Result

- Added `critical.md` with Kael protocols for preflight, diagnose, TDD, review, architecture deepening, prototype, clarification, AI boundary, zoom-out, Supabase, security sweep, UI/RN execution, PRD, issue slicing, triage, docs execution, handoff, compact communication, dormant protocols, forbidden behaviors, and final agent checklist.
- Updated README progress log for this session.

### Next

Use `critical.md` before every future coding task. Do not edit `critical.md` unless Tu explicitly requests it.

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
