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

### 2026-05-13 — Critical Execution Contract

- **Task**: Create `critical.md` as the mandatory AI execution contract after reading `Master Prompt 2.0.pdf` and repo context.
- **Result**: Added embedded Kael protocols for preflight, diagnose, TDD, review, architecture, AI boundary, Supabase, security, UI/RN, PRD/issues/triage, docs, handoff, dormant protocols, and forbidden behaviors.
- **Next**: Use `critical.md` before every coding task; edit it only when Tu explicitly requests updates.
- **Blockers**: None

### 2026-05-13 — Rebuild App Workflow Blueprint

- **Task**: Rewrite `STRUCTURES.md` into the app workflow source of truth for frontend/backend implementation.
- **Result**: Added full customer/worker/admin/Kael workflows, backend domain modules, state machines, trust/safety, notifications, failure recovery, testing blueprint, and evidence-gated Kael self-learning.
- **Next**: Use `STRUCTURES.md` as the workflow contract before building Auth, Kael Price Check, matching, chat, admin, or learning services.
- **Blockers**: None

### 2026-05-13 - Mission 3 Prepared Foundation

- **Task**: Prepare the repo for future mobile/backend/Kael implementation without building those features yet.
- **Result**: Restored dependency state with `npm ci`, fixed Next/Turbopack workspace root, removed build-time Google Fonts dependency, added `docs/foundation/pre-app-build-contract.md`, and added 10 foundation guard tests.
- **Quality gates**: `npm run test` 427/427 pass, `npm run lint` pass with clean output, `npm run build` pass.
- **Security note**: Supabase temporary access token was not persisted to repo files. Static test now scans repo text files for `sbp_` management-token patterns.
- **Next**: Design Supabase schema alignment migration and shared state-machine contracts before Expo mobile scaffold.
- **Blockers**: `npm audit --omit=dev` reports 2 moderate vulnerabilities from Next's transitive `postcss`; npm only offers `--force` with a breaking downgrade, so no automatic fix was applied.

### 2026-05-13 - Supabase Schema Alignment Foundation

- **Task**: Align local Supabase schema/types/tests with rebuilt `STRUCTURES.md` before mobile/backend feature work.
- **Result**: Added `20260513114845_align_structures_workflow.sql` with workflow enums, service taxonomy, price baseline granularity, job events, scope-change requests, notifications, learning candidates/rules/versions, private RLS helpers, tighter storage policies, explicit Data API grants, and API log metadata fields.
- **Security changes**: Removed broad profile/worker self-update patterns from the new policy layer, moved admin helper to `private.is_admin()`, scoped media access by job/worker folder, and kept normal app users away from learning tables.
- **Types/tests**: Updated `database.types.ts`, schema relationship/business-rule tests, SQL migration tests, and seed status for the new workflow. Test suite is now 357 passing tests.
- **Verification**: `npx supabase --version` 2.98.2, `npm run test` pass, `npm run lint` pass, `npm run build` pass.
- **Blockers**: `npx supabase migration list --local`, `db reset`, and `gen types --local` cannot run until Docker/Supabase local Postgres is available. Docker engine is not running or reachable on this machine.
- **Next**: Start Docker Desktop, run local `supabase db reset`, regenerate types from the local DB, then review SQL runtime issues before any remote Supabase deployment.

### 2026-05-13 - Supabase Remote Dry-Run Check

- **Task**: Try the non-Docker Supabase remote/staging direction without applying migrations.
- **Result**: Supabase CLI token-based project listing worked after network permission. Organization currently shows no dedicated staging project; linked project is `HomeServices` with ref `iwevizmsedyqozxlawwl`.
- **Dry-run result**: `supabase db push --dry-run --linked` did not mutate remote and reported two pending local migrations: `20260512000000_security_hardening.sql` and `20260513114845_align_structures_workflow.sql`.
- **Risk note**: Any real remote push would apply both pending migrations in order, not only the new schema-alignment migration.
- **Next**: Create a separate HomeServices staging project or explicitly approve using the linked project for a real staging apply. Revoke the temporary Supabase access token used in this session.

### 2026-05-13 - Supabase Staging Runtime Verification

- **Task**: Apply the local migration chain to the new `HomeServices Staging` Supabase project and verify runtime schema behavior before any production decision.
- **Target**: `HomeServices Staging` ref `xyylanuyflrjzbjzhqfl`, region `ap-southeast-1`. The local Supabase link is currently set to this staging project.
- **Result**: `supabase db push --linked` applied `20260511000000_init_schema.sql`, `20260512000000_security_hardening.sql`, and `20260513114845_align_structures_workflow.sql` successfully on staging.
- **Runtime checks**: Remote migration history matches all three local migrations. SQL smoke checks found 17 public tables, RLS enabled on all 17, policies on all 17, 3 storage buckets, 6 storage policies, 2 service categories, 2 service problems, 6 price baselines, and 3 learning tables.
- **Types/tests**: Regenerated `src/lib/database.types.ts` from staging, converted it to UTF-8 for local tooling, and reran `npm run test`, `npm run lint`, and `npm run build` successfully.
- **Next**: Review staging schema in Dashboard if desired, then decide whether to keep iterating on staging or prepare a production migration checklist for `HomeServices`.

### 2026-05-13 - Supabase Staging Security Verification

- **Task**: Verify real RLS and storage behavior on `HomeServices Staging` before any production migration checklist.
- **Result**: Added `supabase/tests/staging_security_verification.sql`, a rollback-only staging harness with deterministic auth/profile/job fixtures.
- **Remote checks**: Harness passed 29/29 checks on staging, covering customer/job isolation, matched worker access, pre-match worker privacy, outsider denial, admin visibility, learning table protection, direct client mutation denial, and job/completion/worker-document storage boundaries.
- **Local tests**: Added a static harness guard test to keep the staging verification rollback-only, secret-free, and coverage-aware.
- **Verification**: `npm run test` 362/362 pass, `npm run lint` pass, `npm run build` pass, and repo secret scan found no Supabase management token.
- **Next**: Keep staging as the verification target for any further schema/auth/storage changes. Production migration still requires explicit approval and a separate checklist.

### 2026-05-13 - Production Migration Checklist Prep

- **Task**: Prepare the production migration safety gate without applying production changes.
- **Result**: Added `docs/ops/production-migration-checklist.md` and a new staging-verified migration `20260513125704_harden_function_execution.sql`.
- **Preflight**: Production `HomeServices` ref `iwevizmsedyqozxlawwl` currently has only `20260511000000_init_schema.sql`; checked production app/storage table counts are all 0.
- **Dry-run status**: Production dry-run before hardening reported two pending migrations. After adding hardening, final production dry-run requires `SUPABASE_DB_PASSWORD`; expected pending chain is now `20260512000000_security_hardening.sql`, `20260513114845_align_structures_workflow.sql`, and `20260513125704_harden_function_execution.sql`.
- **Security advisor fix**: Staging advisors initially flagged mutable function `search_path` and executable `handle_new_user()`. The hardening migration pins function search paths and revokes direct API execution of `handle_new_user()`.
- **Staging verification**: Applied hardening to staging, reran security advisors (`No issues found`), and reran RLS/storage harness (29/29 pass).
- **Verification**: `npm run test` 364/364 pass, `npm run lint` pass, `npm run build` pass, secret scan clean. Local Supabase link restored to staging `xyylanuyflrjzbjzhqfl`.
- **Next**: Do not apply production until Tu explicitly approves and provides production DB password as process env for a final dry-run/apply window.

### 2026-05-13 - Production Apply Attempt Blocked

- **Task**: Execute the final production dry-run/apply sequence after Tu provided credentials.
- **Result**: Production was linked temporarily, but final `supabase db push --dry-run --linked` failed before any migration apply because the provided production database password failed PostgreSQL SASL authentication for user `postgres`.
- **Safety outcome**: No production migration was applied. Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`.
- **Verification**: Secret scan found no Supabase access token or provided DB password persisted in repo files.
- **Next**: Verify or reset the production database password in Supabase, then rerun the checklist final dry-run before any production apply.

### 2026-05-13 - Production Migration Applied With Advisor Blocker

- **Task**: Retry final production migration with corrected DB password.
- **Result**: Production dry-run matched the expected chain exactly, then production applied `20260512000000_security_hardening.sql`, `20260513114845_align_structures_workflow.sql`, and `20260513125704_harden_function_execution.sql`.
- **Post-apply checks**: Production migration history shows all four migrations. Schema smoke checks passed: 17 public tables, RLS enabled on all 17, policies on all 17, 3 storage buckets, 6 storage policies, 2 service categories, 2 service problems, 6 price baselines, 3 learning tables, and 0 app/storage fixture rows after rollback.
- **RLS/storage harness**: Rollback-only production harness passed 29/29 checks.
- **Blocker**: Supabase security advisors still warn that production-only `public.rls_auto_enable()` is executable by `anon` and `authenticated` via RPC. Production is migrated but not fully green until this is revoked with a targeted follow-up migration.
- **Safety outcome**: Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`.
- **Next**: Add and verify a small migration that revokes direct API execution of `public.rls_auto_enable()` from `public`, `anon`, and `authenticated`.

### 2026-05-13 - Production Security Advisor Cleared

- **Task**: Fix the remaining production `public.rls_auto_enable()` security advisor warning with a sustainable migration.
- **Result**: Added `20260513131949_revoke_rls_auto_enable_rpc.sql`, a conditional no-op-safe migration that revokes direct `EXECUTE` from `public`, `anon`, and `authenticated` only when `public.rls_auto_enable()` exists.
- **Staging verification**: Migration applied cleanly on staging where the function is absent; security advisors still report `No issues found`; RLS/storage harness still passes 29/29.
- **Production verification**: Dry-run showed exactly the new migration, apply succeeded, security advisors now report `No issues found`, migration history includes all five migrations, production smoke counts pass, and RLS/storage harness still passes 29/29.
- **Safety outcome**: Local Supabase link was restored to staging `xyylanuyflrjzbjzhqfl`, and secret scan found no token/password persisted.
- **Next**: Rotate/revoke the Supabase access token and reset/rotate the DB password used in this session.
