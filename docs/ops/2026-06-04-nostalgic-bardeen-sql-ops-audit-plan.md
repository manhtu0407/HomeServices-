# 2026-06-04 Nostalgic Bardeen SQL And Ops Audit Plan

Status: branch audit artifact for `claude/nostalgic-bardeen-ac835c`.
Execution update: production SQL convergence, Edge redeploy, `/health`, and CI
workflow work were executed later in this same audit. See
`docs/test-logs/2026-06-04_nostalgic-bardeen-production-convergence.md` for the
current evidence.

This document records the current evidence, conclusions, and implementation
plan for the SQL/RLS/Edge hardening work on the branch. It does not approve
production migrations, production Edge deploys, production secret changes, or
App Store / Play Store submission by itself.

## Operating Role

Use a principal product/platform reviewer stance:

- protect the first real Ho Chi Minh City apartment transaction,
- keep the Expo app and Supabase backend aligned,
- verify SQL against runtime behavior, not only SQL text,
- keep production operations explicit enough for a vibe coder to follow safely,
- stop before production mutation unless Tu approves the exact production step.

## Scope

In scope:

- SQL/RLS/default privilege hardening in this branch.
- Edge `mobile-api` type/deploy boundary.
- Generated DB type alignment.
- Frontend/backend runtime boundary.
- Operational stack coverage beyond pure app deployment.
- Detailed next implementation plan.

Out of scope after this execution pass:

- Auth leaked-password protection was attempted through the Supabase Management
  API and is blocked until the Supabase projects are on Pro plans or higher.
- App Store / Play Store submission.
- New payment rails, load balancers, or external observability vendors.

## Current Branch Changes Reviewed

Branch: `claude/nostalgic-bardeen-ac835c`

Main SQL files:

- `supabase/migrations/20260604090000_revoke_anon_public_grants.sql`
- `supabase/migrations/20260604090100_revoke_residual_authenticated_dml.sql`
- `supabase/migrations/20260604090200_harden_default_privileges_public.sql`
- `supabase/migrations/20260604091224_harden_public_grants_followup.sql`
- `supabase/migrations/20260604093025_harden_global_function_default_privileges.sql`
- `supabase/migrations/20260604095731_combine_customer_kael_feedback_select_policy.sql`
- `supabase/migrations/20260604100550_revoke_authenticated_table_ddl_privileges.sql`

Main code/test files:

- `supabase/functions/mobile-api/_shared/db-types.ts`
- `supabase/functions/mobile-api/_shared/**`
- `packages/shared/src/types/database.types.ts`
- `apps/api/src/__tests__/schema/mobile-api-edge-schema.test.ts`
- `apps/api/src/__tests__/schema/tier1-type-completeness.test.ts`
- `packages/shared/src/__tests__/mobile-wiring.test.ts`

## Direct Answers To Tu's Four Questions

### 1. If the SQL Editor is newly written like this, is it enough?

For the current hardening goal, yes on staging and fresh databases.

The SQL covers:

- existing anon/PUBLIC grants on public tables, sequences, functions, and schema usage,
- residual authenticated grants on missed tables/views,
- future default privileges for migration-created tables, sequences, and functions,
- global default function EXECUTE inherited through PUBLIC,
- authenticated DDL-style table privileges such as TRUNCATE / REFERENCES / TRIGGER,
- advisor-clean customer Kael feedback SELECT policy consolidation,
- explicit exceptions for `source_trust_registry` and `customer_kael_feedback`.

But SQL Editor content alone is not enough for production readiness. It must be
paired with:

- migration history alignment,
- generated type refresh,
- Edge function redeploy,
- staging/prod dry-run,
- schema lint/advisors,
- runtime smoke,
- explicit production approval.

### 2. Does the codebase still need more SQL so frontend and backend work together?

No major new business-schema SQL is currently required for the two main app
functions, frontend and backend, to align.

Current evidence:

- Mobile workflow writes mostly go through Edge `mobile-api`.
- The one direct mobile table read found is post-login `profiles` role lookup.
- Mobile direct Storage upload uses private buckets and `upsert: false`, then
  Edge attaches workflow metadata.
- Edge uses service-role DB access and now has local table/RPC name guards.
- Shared/API/mobile type-checks pass after generated DB type refresh.

Production still needs the pending hardening follow-up SQL applied before the
security posture matches staging. That is not new product schema; it is
production convergence.

### 3. From these SQL files, should more SQL be added?

Do not add more security SQL now without new evidence.

The next SQL action should be production application of the exact pending
follow-up chain after approval:

- `20260604091224_harden_public_grants_followup.sql`
- `20260604093025_harden_global_function_default_privileges.sql`
- `20260604095731_combine_customer_kael_feedback_select_policy.sql`
- `20260604100550_revoke_authenticated_table_ddl_privileges.sql`

Future SQL should be added only when a new table/RPC/view/storage path is
introduced. Because default privileges are now hardened, future migrations must
grant access explicitly and add RLS/actor tests intentionally.

### 4. Outside deployment, what is still missing from the stack diagram?

The product is a mobile app deployed through App Store / Play Store, so classic
web hosting is not the central product surface. Still, several layers in the
diagram remain incomplete or only partially covered:

- CI/CD and version control: no `.github` workflow folder exists.
- Error tracking and logs: Edge logs and `api_logs` exist. A Sentry mobile SDK
  scaffold was added in this execution pass, but real crash ingestion still
  needs a Sentry project DSN/auth token plus release-build verification.
- Availability and recovery: production checklist exists, but staging backup /
  restore remains only partially proven. A safe staging rollback drill was run,
  but full PITR/project restore is still not proven.
- Rate limiting: DB-backed `/kael/chat` limiter exists; broader route limits
  are best-effort/in-memory or provider-specific.
- Caching/CDN: Kael market cache exists; no broad media/CDN strategy beyond
  Supabase Storage.
- Load balancing/scaling: handled mainly by Supabase platform; no app-level load
  test or scaling SLO is documented for the current launch slice.
- Auth hardening: Supabase advisor still reports leaked password protection is
  disabled; this is an Auth project setting, not SQL, and Management API enable
  attempts returned `402` because the projects are not on Pro plans or higher.
- Push readiness: code exists, but real-device TestFlight/internal Android
  delivery is not verified. The iOS entitlement stripper was removed and
  `expo-notifications` config plugin is now enabled, but device delivery is
  still unproven.

## Verification Evidence

Current safe reruns completed in this audit continuation:

```text
Supabase CLI local version:
- 2.98.2

Staging migration list:
- local/remote aligned through 20260604100550
- linked project: xyylanuyflrjzbjzhqfl

API:
- tsc --noEmit: pass
- mobile-api-edge-schema + tier1 type tests: 2 files, 152 tests passed

Shared:
- tsc --noEmit: pass
- mobile-wiring test: 1 file, 228 tests passed

Mobile:
- tsc --noEmit: pass

Git:
- git diff --check: pass, CRLF warnings only
```

Previously completed in this branch audit session:

```text
Staging:
- hardening migrations applied through 20260604100550
- mobile-api deployed to staging
- OPTIONS /mobile-api/kael/charter: 204
- GET /mobile-api/kael/charter: 200
- staging advisors/lint were clean except known auth_leaked_password_protection
  and INFO-only deny-all/service-role-only tables

Production read-only audit:
- pending dry-run chain was exactly 4 migrations:
  20260604091224
  20260604093025
  20260604095731
  20260604100550
```

Current limitation:

```text
supabase db push --dry-run --linked
- not rerun in the latest shell because SUPABASE_DB_PASSWORD was unavailable
- failure was password auth for cli_login_postgres, not a migration/schema error
```

## Current Risk Register

### R1: Production is not converged

Severity: high before launch.

Production still needs the exact four pending hardening migrations and
production Edge redeploy after Tu approves that production mutation.

Mitigation:

- regenerate dry-run with `SUPABASE_DB_PASSWORD`,
- verify pending chain is exact,
- apply only after explicit approval,
- restore local link to staging,
- rerun lint/advisors/smoke.

### R2: Auth leaked password protection is not SQL-fixable

Severity: medium.

Supabase security advisor reports Auth leaked-password protection disabled.
This must be enabled in Supabase Auth/project settings if launch posture
requires a clean security advisor, but current staging and production attempts
through the Supabase Management API returned HTTP `402` because the feature is
available only on Pro plans and up.

Mitigation:

- upgrade or move the staging/production projects to a plan that supports
  HaveIBeenPwned leaked-password protection,
- enable `password_hibp_enabled` in staging first,
- verify advisor output,
- repeat in production after approval.

### R3: No CI/CD workflow exists

Severity: medium.

The repo currently has no `.github` folder. Local tests are strong, but there is
no automatic branch/PR gate.

Mitigation:

- add GitHub Actions for type-check, tests, `git diff --check`, secret scan,
  and Supabase dry-run when secrets are available.

### R4: Mobile crash/error tracking is absent

Severity: medium.

Edge structured logs and `api_logs` cover backend/provider behavior. The mobile
app now has a Sentry SDK scaffold and PII scrubber, but runtime crash capture is
not proven until Sentry DSN/auth token are configured and a release build sends
a real event.

Mitigation:

- create/link a Sentry project,
- configure `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and EAS
  secret `SENTRY_AUTH_TOKEN`,
- verify a release-build event in the Sentry dashboard,
- keep PII scrub rules blocking raw address, phone, CCCD, bank, exact location,
  raw description, prompt/response, or auth tokens in telemetry.

### R5: Push is code-wired but not real-device verified

Severity: medium.

`expo-notifications`, token registration, and Edge push helper exist. Docs still
require TestFlight/internal Android verification. The June continuation removed
the iOS entitlement stripper, enabled the `expo-notifications` config plugin,
added `expo-device`, and removed unsupported EAS Update `channel` fields from
`eas.json` because `expo-updates` is not installed.

Mitigation:

- decide whether push is required for first launch,
- if yes, keep iOS push entitlement and verify APNs/EAS credentials,
- run real-device customer/worker staging push flow,
- verify role-safe deep links and no PII push body.

### R6: Edge health is indirect

Severity: low to medium.

The active runtime is Supabase Edge `mobile-api`. Current smoke can use
`/kael/charter`, but there is no dedicated health/readiness endpoint for
monitoring.

Mitigation:

- add `GET /health` or `GET /ready` to `mobile-api`,
- check env presence, service catalog reachability, DB read, and optional
  provider-secret presence without exposing values,
- keep unauth response safe and non-PII.

## Implementation Plan

### Phase 0: Pre-plan And Context Recovery

Goal: prevent a production or architecture mistake before touching code.

Steps:

1. Confirm branch and worktree state.
2. Read authority docs in order:
   - `critical.md`
   - `RULES.md`
   - `STRUCTURES.md`
   - `AGENTS.md`
   - `CLAUDE.md` if strategic ambiguity exists
   - `docs/architecture/code-ownership-map.md`
   - `docs/ops/production-migration-checklist.md`
   - relevant `docs/**/*.md`
   - `MEMORY.md` last
3. Load the minimum skills/protocols:
   - `supabase`
   - `kael-supabase`
   - `kael-security-sweep`
   - `kael-tdd`
   - `kael-review`
4. Rebuild current evidence:
   - `git status --short --branch`
   - `supabase migration list --linked`
   - `supabase db push --dry-run --linked`
   - targeted type-checks/tests

Acceptance criteria:

- current branch is known,
- local link target is known,
- no production mutation is started,
- missing credentials are called out honestly.

### Phase 1: Production SQL Convergence Gate

Goal: apply only the exact hardening chain to production after explicit approval.

Prerequisites:

- Tu approves production SQL application in the current conversation.
- `SUPABASE_DB_PASSWORD` is available only as env/process value.
- `SUPABASE_ACCESS_TOKEN` is available only as env/process value.
- Local link starts and ends on staging unless intentionally switched.

Steps:

1. Snapshot current local link:
   - `supabase/.temp/project-ref`
2. Link scratch or local project to production `iwevizmsedyqozxlawwl`.
3. Run:
   - `supabase migration list --linked`
   - `supabase db push --dry-run --linked`
   - `supabase db lint --linked --schema public --level warning`
   - `supabase db advisors --linked --type security --level warn`
4. Confirm dry-run contains exactly:
   - `20260604091224_harden_public_grants_followup.sql`
   - `20260604093025_harden_global_function_default_privileges.sql`
   - `20260604095731_combine_customer_kael_feedback_select_policy.sql`
   - `20260604100550_revoke_authenticated_table_ddl_privileges.sql`
5. Stop if any unexpected migration appears.
6. Apply production migrations only after the exact-chain confirmation.
7. Restore link to staging `xyylanuyflrjzbjzhqfl`.

Acceptance criteria:

- production migration list includes the four new versions,
- production dry-run after apply says remote is up to date,
- local link is restored to staging,
- no unexpected migrations were applied.

### Phase 2: Production Edge Deploy And Smoke

Goal: keep production Edge code aligned with DB/types.

Prerequisites:

- Phase 1 completed or Tu explicitly chooses Edge-only deploy.
- Production secrets are already set; no secret values are written to repo.

Steps:

1. Deploy `mobile-api` to production.
2. Smoke public-safe route:
   - `OPTIONS /mobile-api/kael/charter`
   - `GET /mobile-api/kael/charter`
3. Smoke auth-gated behavior with disposable production account only if Tu
   approves mutating smoke.
4. Verify no direct mobile AI/provider secret exposure.

Acceptance criteria:

- Edge deploy succeeds,
- `kael/charter` returns safe public payload,
- auth-gated route rejects missing auth with structured error,
- production link is restored to staging after deployment work.

### Phase 3: Add Edge Health Endpoint

Goal: replace indirect `/kael/charter` smoke with an intentional operational
health/readiness surface.

Candidate design:

- `GET /health`
- public-safe, unauthenticated
- returns no secrets, no PII, no row data
- checks:
  - edge boot ok,
  - Supabase URL/publishable/service env presence booleans,
  - DB read of a public-safe catalog table with `limit(1)`,
  - optional service count equals active three services,
  - function version/build marker if available.

Tests:

- API Edge router unit test for route parse.
- Edge runtime unit test for success/degraded shape.
- Schema/wiring test that mobile-api owns health, not Next reference API only.

Acceptance criteria:

- `/health` can distinguish healthy/degraded without leaking internals,
- staging smoke uses `/health`,
- production checklist points to `/health`.

### Phase 4: CI/CD Gate

Goal: create repeatable PR gates so a vibe coder is not relying on memory.

Add `.github/workflows/quality.yml` with jobs:

- checkout + setup Node/pnpm,
- API type-check,
- shared type-check,
- mobile type-check,
- API tests,
- shared tests,
- mobile tests,
- `git diff --check`,
- secret pattern scan,
- optional Supabase dry-run when secrets are available.

Keep production deploy out of CI unless Tu explicitly wants it.

Acceptance criteria:

- PR quality workflow runs without production credentials,
- Supabase dry-run job skips cleanly when secrets are absent,
- no production mutation is possible from a normal PR.

### Phase 5: Mobile Error Tracking

Goal: cover mobile runtime crashes/errors without leaking PII.

Candidate work:

- add Sentry/Expo integration,
- add app-level error boundary,
- add before-send scrubber,
- document event taxonomy.

PII scrub rules:

- remove phone, CCCD, bank, unit/floor/full address, exact coordinates,
  Authorization, access token, refresh token, raw problem description, raw AI
  prompt/response.

Tests:

- unit test scrubber with representative PII strings,
- wiring test that mobile config has DSN name only,
- negative test that raw sensitive fields are removed.

Acceptance criteria:

- mobile crash capture exists,
- scrubber tests pass,
- `.env.example` has DSN name only,
- no actual DSN/secret is committed.

### Phase 6: Push Readiness

Goal: decide and verify whether push is launch-required.

Decision fork:

- If push is optional for first transaction:
  - keep notification rows as source of truth,
  - document push as deferred real-device verification.
- If push is required:
  - keep the current `expo-notifications` config plugin and no entitlement
    stripper,
  - verify APNs/EAS credentials,
  - run TestFlight/internal Android device flow.

Real-device checks:

- customer + worker sign in,
- permission granted and denied paths,
- token registration through `/notifications/device-token`,
- broadcast push deep link,
- scope-change push deep link,
- no full address/unit/phone/raw problem/CCCD/bank/API key in push title/body/data.

Acceptance criteria:

- device evidence exists for iOS and Android if launch-required,
- push failure does not roll back workflow state,
- stale tokens are disabled on Expo `DeviceNotRegistered`.

### Phase 7: Backup, Restore, And Recovery Drill

Goal: prove operational recovery, not only migration forward fixes.

Current execution update:

- staging backup list was reachable through Management API with count `1`,
- backup schedule metadata returned `402` because it requires Enterprise,
- read-only staging probe returned migration/table-count metadata,
- transaction-scoped rollback fixture returned `rollback_clean=true`,
- after-probe confirmed `public.kael_recovery_drill_20260604` was absent.

Staging drill:

1. Capture schema/migration history.
2. Capture public table counts and storage object counts.
3. Export a scoped safe snapshot or use Supabase backup tooling.
4. Apply a reversible test fixture to staging.
5. Restore or clean up.
6. Verify counts return to expected values.

Production preflight before any future major SQL:

- if real user rows exist, stop and create a proper backup/export,
- never rely on down migrations,
- prefer forward-fix migrations,
- capture failing SQL and exact error if apply fails.

Acceptance criteria:

- staging drill report exists,
- production checklist references current restore path,
- Tu has an understandable stop/recover playbook.

### Phase 8: Final Review And Ship Readiness

Run `kael-review`:

- spec compliance,
- rules/standards compliance,
- maintainability,
- scope creep,
- verification,
- required fixes.

Minimum final gates before calling production-ready:

- local type-check/tests pass,
- DB lint/advisors reviewed,
- staging health/smoke pass,
- production SQL applied only after approval,
- production Edge deployed only after approval,
- known warnings are explicitly accepted or fixed,
- docs/MEMORY updated with final evidence.

## Stop Conditions

Stop and ask Tu if:

- production dry-run includes any unexpected migration,
- production ref is not `iwevizmsedyqozxlawwl`,
- local link cannot be restored to staging,
- DB password/token is missing for a required production check,
- Supabase advisor reports a new warning/error after apply,
- real production user data exists and no backup/export exists,
- push launch requirement conflicts with stripped iOS entitlement,
- a test/build gate fails and cannot be explained as environment-only.
