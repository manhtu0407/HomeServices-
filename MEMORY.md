# MEMORY

## 2026-05-18 React Doctor & AI Coding Agents Skills Session

- Added project-local React Doctor runner at the repo root. `package.json` now has `doctor:react` for full workspace scans and `doctor:react:changed` for diff scans, both using `npx -y react-doctor@latest` with `--yes`, `--verbose`, `--offline`, and `--fail-on none`. Added `react-doctor.config.json` with `share: false`, `failOn: none`, and `respectInlineDisables: true`.
- Verified React Doctor setup with `pnpm doctor:react:changed`: API scanned clean at 100/100, mobile scored 91/100 with existing warnings. Then ran full `pnpm doctor:react`: API scored 93/100 with 43 issues across 28/108 files; mobile scored 90/100 with 55 issues across 12/29 files. Treat the project as generally healthy but with mobile cleanup priority.
- React Doctor findings to remember: mobile state/effect cleanup is the highest-value area (`auth-provider.tsx`, `client-price-check-flow.tsx`), followed by unused exports/types, `react-native` `Image` imports that should move to `expo-image` where appropriate, and React 19 context API warnings. The `no-secrets-in-client-code` findings reviewed during the session looked like route/test marker constants, not real secrets.
- API React Doctor findings were mostly performance/style/dead-code signals. Do not blindly parallelize the Kael provider fallback loop in `apps/api/src/lib/kael/intent.ts`; the sequential DeepSeek -> Anthropic behavior is intentional failover unless product requirements change.
- Added `skills.md` at the repo root as the project memory/reference for Karpathy-inspired AI coding behavior: think before coding, simplicity first, surgical changes, and goal-driven execution. This is adapted for Home Services: ship toward first real transaction, keep Kael narrow, protect auth/secrets/PII/booking, and verify with evidence.
- Installed the project-local AI Coding Agents skill at `.agents/skills/karpathy-guidelines/SKILL.md`, adapted from `multica-ai/andrej-karpathy-skills`, and registered it in `skills-lock.json` with SHA-256 `78577415bd09ecf7283752cf163e15c5d57c9972c80550df78d278f89f8ef1c7`.
- Updated `CLAUDE.md`, `critical.md`, and `RULES.md` after Tu explicitly approved editing locked docs. New rule: coding/review/refactor/debug/planning agents must read `skills.md` or invoke the project-local `karpathy-guidelines` skill. `RULES.md` remains higher priority than `skills.md` if they conflict.
- Important PR hygiene from this session: the worktree contained unrelated pre-existing mobile/API/migration changes. When committing this session, stage only the agent-skill/React Doctor/memory files unless Tu explicitly asks to include the broader dirty worktree.

## 2026-05-18 Supabase Edge Backend Wiring Session

- Locked deployment path: React Native AppStore/CHPlay -> Supabase Auth -> Supabase Edge Function `mobile-api` -> DB/RPC/Storage/Realtime -> AI providers. No Vercel or hosted Next.js runtime for mobile.
- Added Supabase Edge Function `supabase/functions/mobile-api` with custom Bearer auth, role guards, CORS/OPTIONS, JSON errors, Deno env loading, Edge Kael pipeline, and mobile routes for services/jobs/worker lifecycle/scope-change/completion/review.
- Mobile now calls `EXPO_PUBLIC_API_BASE_URL` through `apps/mobile/lib/api.ts` with Supabase publishable `apikey` and session access token. UI components stay behind workflow provider/actions; they do not call `fetch`, Supabase mutations/RPCs, service-role paths, or AI providers directly.
- Added service-role-only RPC hardening for atomic accept/cancel/review/scope-change/availability. Latest accept RPC enforces worker service/district eligibility, rejects null/citywide job districts, marks losing sent broadcasts reassigned, and guards null/empty worker capability arrays. Latest availability RPC expires sent broadcasts before locking worker rows to avoid accept/offline deadlock.
- Direct authenticated workflow table DML is revoked for the mobile runtime. Authenticated clients remain read-oriented for app bootstrap; workflow writes go through Edge/service-role paths.
- Staging `xyylanuyflrjzbjzhqfl` has `mobile-api` deployed and mobile-api hardening migrations applied through the 2026-05-18 series, including the accept broadcast privacy guard. Private RLS helper hardening removes PUBLIC/anon execute, keeps authenticated execute, and pins `search_path = public, pg_catalog`. The RLS consolidation replaces overlapping admin `FOR ALL` policies with DML-specific admin policies and single SELECT policies, clearing Supabase performance advisor warnings without reopening authenticated workflow DML grants.
- Audit-loop bug fix: Kael baseline lookup now resolves `service_problems.slug -> id` before querying `price_baselines.service_problem_id` in both Edge and Next reference code. `/services` also deduplicates service-level baselines so mobile receives 3 service baselines instead of 24 duplicate problem-specific rows per service.
- Kael intent now attempts DeepSeek first and falls back to Anthropic before local heuristic fallback. Earlier staging DeepSeek returned insufficient-balance/HTTP 402; after key rotation, production smoke returned a non-fallback Kael estimate. Keep provider billing/key health validated per environment before release.
- Staging rollback security harness currently passes 29/29 checks and is aligned with Edge-only direct DML: admin direct notification inserts are expected to be blocked, not allowed.
- Production `iwevizmsedyqozxlawwl` has `mobile-api` deployed, required secrets set by name, mobile-api migrations applied through `20260518071000_accept_broadcast_privacy_guard_v2.sql`, and a disposable full workflow smoke passed through the deployed Edge function: unauth guard, worker register/approval/availability, job create with Kael, confirm search, broadcast, accept, negative cases, scope change, completion, customer confirm, review, and cleanup.
- Mobile release prep added `apps/mobile/eas.json` and EAS scripts for TestFlight/App Store and Play internal builds. `app.config.ts` now derives the Edge `mobile-api` base URL from the Supabase URL when `EXPO_PUBLIC_API_BASE_URL` is not explicitly set.
- Payment, chat persistence, media upload, distributed rate limiting, realtime, worker self-service role promotion, and Edge learning-rule application remain intentionally incomplete/locked. Do not fake success for those areas.
- README still has a historical Next/Vercel decision note, but `CLAUDE.md` locks README edits unless Tu explicitly approves. Treat the runtime source of truth as this memory, `critical.md`, and the Edge `mobile-api` implementation.

## 2026-05-17 Frontend Logic & Workflow Session

- Completed mobile frontend workflow slice focused on auth, role guards, Customer booking, Kael handoff, Worker local deal audit, and frontend-only PR#12 lifecycle alignment.
- Added an in-memory local deal state machine in shared code. It does not use AsyncStorage, Supabase mutations, or backend job mutations.
- Customer flow now follows: draft/analyzing -> awaiting customer confirm -> broadcasting -> worker accepted/progressed -> completed by worker -> confirmed by customer.
- Worker flow now sees incoming local broadcasts only after customer confirm, hides full address until accept, then progresses through on-way/arrived/inspecting/repairing/completed.
- Login now uses Supabase Email/Password, reads profile role, guards Customer/Worker sections, and lets admin audit both sections from the auth gateway.
- Mobile Expo config loads public Supabase URL/publishable key from environment or local env files. Do not commit secrets, passwords, service-role keys, or admin credentials.
- Customer Profile admin header was fixed after browser audit so the role badge and section switch action do not overflow on narrow viewports.
- Fake production data was removed from Customer/Worker surfaces: no fake worker, earnings, payment success, review success, fixed VND estimate, or hardcoded Kael draft.
- Payment/review/scope-change remain locked placeholders until backend wiring is intentionally added.

## Verification Notes

- Relevant checks run during the backend wiring session: Deno Edge check/lint/fmt, full repo type-check, lint, test, build, Expo doctor, staging security advisor, staging performance advisor, staging rollback security harness, deployed Edge OPTIONS/auth/404 smoke, authenticated `GET /mobile-api/services` smoke with disposable cleanup, staging workflow smoke, and production disposable workflow smoke with cleanup.
- Previous frontend workflow checks included mobile/shared type-check, full repo type-check, shared mobile workflow tests, shared mobile wiring tests, full test suite, build, static sweeps, and Expo web route smoke.
- Known residual issue: Supabase security advisor still reports `auth_leaked_password_protection` disabled. Attempting to enable it via Management API returned a Pro-plan requirement.
- Auth residual: `STRUCTURES.md` still specifies A0 phone OTP, while current mobile login uses email/password and the staging CLI warns that no SMS provider is enabled. Do not claim phone OTP production readiness until SMS provider/Auth config and mobile OTP flow are intentionally completed.
- Runtime caveat: payment/chat/media/realtime/distributed rate limiting remain locked or non-production-grade until explicitly built.
