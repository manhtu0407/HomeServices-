# Home Services — Progress Log

### 2026-05-11 — PR#3 Schema Tests

- **Task**: Viết 177 test cases cho database schema PR#3 (4 files, Vitest)
- **Result**: 177/177 PASSED — 4 files, 312ms. Tier1 (types), Tier2 (business rules), Tier3 (relationships), Tier4 (SQL migration).
- **Next**: Merge tests vào PR#3, tiến tới Phase 1 application code
- **Blockers**: None. `database.types.ts` có artifact `<claude-code-hint>` tag cần remove (đã fix).

### 2026-05-12 — Foundation Hardening (Phase 0)

- **Task**: Fix 6 infrastructure gaps phát hiện qua audit: env validator, type-safe Supabase, AI wrapper, CLAUDE.md updates, settings.json, layout.tsx
- **Result**: 6/6 items done. `npm run build` pass, 177/177 tests pass. Files: `src/lib/env.ts`, `src/lib/ai/` (client + types + 3 providers), `server.ts`/`client.ts`/`middleware.ts` type-safe, CLAUDE.md thêm Platform/Structure/Phase, settings.json mở rộng, layout.tsx lang=vi
- **Next**: Feature implementation plan (riêng) — bắt đầu từ Auth (A0/B0)
- **Blockers**: None

### 2026-05-12 — PR#5: Full Audit Remediation + 417 Tests

- **Task**: Audit toàn bộ PR#1-4 với góc nhìn senior engineer (Anthropic/OpenAI), fix critical bugs, viết comprehensive test suite multi-layer
- **Audit verdict**: 65-70% solid. Schema tốt, nhưng 4 critical bugs + 4 gaps + 3 design issues
- **Critical bugs fixed**:
  - C1: Next.js 16 proxy wiring — `src/proxy.ts` (middleware.ts deprecated, dùng `export function proxy()`)
  - C2: Role escalation — `handle_new_user()` force `'customer'` always (trước đây user có thể pass `{ role: 'admin' }`)
  - C3: Env validator — server keys giờ throw khi missing (trước đây return empty string)
  - C4: Admin RLS — 12 policies cho all 9 tables (trước đó admin không query được gì)
- **Gaps filled**: Zod validation (`validation.ts`), rate limiter (`rate-limit.ts`), health check (`/api/health`), seed.sql, SMS signup enabled
- **Bug found in testing**: `scopeChangeSchema` cho phép `new_price_min > new_price_max` — fixed với `.refine()`
- **Test suite**: 240 new tests across 8 files + 177 existing = **417/417 PASSED**
  - Unit (5 files): env, ai-types, ai-client, validation, rate-limit
  - Wiring (1 file): proxy, providers, supabase clients, health route, env structure
  - SQL (2 files): security hardening migration, seed validation
- **Verification**: `npm test` 417 pass, `tsc --noEmit` 0 errors, `npm run build` success
- **Testing guidelines**: Viết vào `.claude/commands/test-log.md` — 5 sections, anti-patterns, checklists
- **PR**: [#5](https://github.com/manhtu0407/HomeServices-/pull/5)
- **Next**: Monorepo setup + RN skeleton
- **Blockers**: None

### 2026-05-13 — PR#6: Monorepo + Expo RN Skeleton + 255 Adversarial Tests

- **Task**: Audit PR#1→5 stability, setup Turborepo monorepo, create Expo RN app skeleton, write adversarial tests
- **Audit**: Foundation stable. 6 non-blocking issues (dead code migration #1, in-memory rate limiter, missing AI content validation, missing region column, no proxy test, fragile isBuildTime). No blockers.
- **Monorepo**: Turborepo + pnpm workspaces — `apps/api/` (Next.js 16 moved from root), `apps/mobile/` (Expo SDK 54, RN 0.81.5, Expo Router 6), `packages/shared/` (constants, validation, types)
- **RN Skeleton**: Auth stack (login → verify-otp → onboard), Customer 5-tab (Trang chủ | Đặt lịch | Kael | Lịch sử | Hồ sơ), Worker 5-tab (Trang chủ | Công việc | Chat | Thu nhập | Hồ sơ), Auth provider (role-based routing), Supabase client (AsyncStorage, no secrets)
- **Bugs found & fixed**:
  - `as const` arrays mutable at runtime — added `Object.freeze()` to all constants
  - SQL enum parser broke on inline comments with commas — fixed by stripping comments before splitting
- **Test suite**: 255 new tests across 5 files + 417 existing = **672/672 PASSED**
  - constants.test.ts (28): enum cross-check against SQL, business rules, immutability
  - validation.test.ts (48): boundary values, Rule #6, sanitizeForLLM edge cases
  - exports.test.ts (17): barrel export completeness, package.json export map
  - monorepo-wiring.test.ts (42): workspace structure, turbo pipeline, dependency consistency
  - mobile-wiring.test.ts (120): navigation vs STRUCTURES.md, Rule #1 sweep, auth wiring
- **Verification**: `turbo test` 672 pass, `tsc --noEmit` 0 errors on api + shared + mobile
- **PR**: [#6](https://github.com/manhtu0407/HomeServices-/pull/6)
- **Next**: Feature implementation plan — Auth (A0/B0) → Kael Price Check → Worker matching
- **Blockers**: None
