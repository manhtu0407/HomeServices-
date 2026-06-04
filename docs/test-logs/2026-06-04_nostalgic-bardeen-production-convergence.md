# 2026-06-04 Nostalgic Bardeen Production Convergence

Status: executed on branch `claude/nostalgic-bardeen-ac835c`.

This report records the production SQL convergence, Edge deploy, health endpoint,
CI gate, and remaining operational gaps from the June 4 audit. It contains no
secret values and no user PII.

## Scope

Executed:

- Production hardening migration dry-run, apply, and post-check.
- Production `mobile-api` deploy.
- Staging and production `/health` deploy and smoke.
- CI quality workflow addition.
- Broad operational audit for observability, push, recovery, and Auth posture.

Not executed:

- Real-device push verification.
- Sentry project creation/linking; blocked by missing Sentry auth token/session.
- Cloud EAS build or App Store / Play Store submission.
- Full PITR/project restore drill.
- Git staging, commit, push, or PR.

Attempted but externally blocked:

- Auth leaked-password protection enable through Supabase Management API. Both
  staging and production returned HTTP `402` because HaveIBeenPwned leaked
  password protection is available only on Pro plans and up.

## Supabase Projects

- Staging: `xyylanuyflrjzbjzhqfl`
- Production: `iwevizmsedyqozxlawwl`
- Local Supabase link before production work: staging.
- Local Supabase link after production work: restored to staging.

## Production Pre-Apply Evidence

Production migration dry-run listed exactly:

```text
20260604091224_harden_public_grants_followup.sql
20260604093025_harden_global_function_default_privileges.sql
20260604095731_combine_customer_kael_feedback_select_policy.sql
20260604100550_revoke_authenticated_table_ddl_privileges.sql
```

Production schema lint:

```text
supabase db lint --linked --schema public --level warning --fail-on warning
No schema errors found
```

Production security advisors before apply:

```text
WARN auth_leaked_password_protection
```

Production performance advisors before apply:

```text
No issues found
```

Production metadata row-count audit used approximate table counts only. No row
data or PII was read. Notable app data existed, including:

```text
profiles=3
customer_profiles=1
worker_profiles=1
jobs=24
job_events=73
notifications=6
storage.objects=8
```

Production ACL summary before apply showed the expected hardening gap:

```text
routine PUBLIC EXECUTE=3
routine anon EXECUTE=3
routine authenticated EXECUTE=3
authenticated REFERENCES/TRIGGER/TRUNCATE on 29 tables
authenticated SELECT on 60 tables
source_trust_registry-style authenticated DML exception present
```

## Production Apply Evidence

Command:

```text
supabase db push --linked --yes
```

Result:

```text
Applied migration 20260604091224_harden_public_grants_followup.sql
Applied migration 20260604093025_harden_global_function_default_privileges.sql
Applied migration 20260604095731_combine_customer_kael_feedback_select_policy.sql
Applied migration 20260604100550_revoke_authenticated_table_ddl_privileges.sql
```

The customer Kael feedback consolidation migration emitted expected idempotent
notices for old policy names that were not present:

```text
policy "Customers read own Kael feedback" does not exist, skipping
policy "Admins read Kael feedback" does not exist, skipping
```

## Production Post-Apply Evidence

Post-apply dry-run:

```text
Remote database is up to date.
```

Migration list:

```text
20260604091224 | 20260604091224
20260604093025 | 20260604093025
20260604095731 | 20260604095731
20260604100550 | 20260604100550
```

ACL summary after apply:

```text
No routine EXECUTE grants for PUBLIC, anon, or authenticated.
No authenticated REFERENCES/TRIGGER/TRUNCATE table grants.
Authenticated DML remains only for intended exception paths:
- SELECT on current Data API surface
- INSERT/UPDATE/DELETE on `source_trust_registry`
```

Default privilege probe after apply:

```text
anon table SELECT=false
authenticated table SELECT=false
authenticated table INSERT=false
anon sequence USAGE=false
anon function EXECUTE=false
authenticated function EXECUTE=false
service_role function EXECUTE=false
```

Interpretation: future public-schema tables, sequences, and functions are not
auto-exposed. Future RPC migrations must grant intended execution explicitly.

Post-apply lint and advisors:

```text
supabase db lint --linked --schema public --level warning --fail-on warning
No schema errors found

supabase db advisors --linked --type security --level warn
WARN auth_leaked_password_protection

supabase db advisors --linked --type performance --level warn
No issues found
```

## Edge Deploy And Smoke

Production deploy:

```text
supabase functions deploy mobile-api --project-ref iwevizmsedyqozxlawwl --use-api --no-verify-jwt
Deployed Functions on project iwevizmsedyqozxlawwl: mobile-api
```

Staging deploy:

```text
supabase functions deploy mobile-api --project-ref xyylanuyflrjzbjzhqfl --use-api --no-verify-jwt
Deployed Functions on project xyylanuyflrjzbjzhqfl: mobile-api
```

Production smoke:

```text
GET /mobile-api/health -> 200
{"status":"ok","service":"mobile-api","project_ref":"iwevizmsedyqozxlawwl","checks":{"edge":"ok","supabase_env":"ok","provider_env":"ok"}}

GET /mobile-api/kael/charter -> 200
GET /mobile-api/notifications without Authorization -> 401 AUTH_MISSING
```

Staging smoke:

```text
GET /mobile-api/health -> 200
{"status":"ok","service":"mobile-api","project_ref":"xyylanuyflrjzbjzhqfl","checks":{"edge":"ok","supabase_env":"ok","provider_env":"ok"}}

GET /mobile-api/kael/charter -> 200
```

## Code Changes Added During Execution

Health endpoint:

- `GET /mobile-api/health`
- public-safe
- does not authenticate
- does not expose secrets
- reports Edge boot, Supabase env presence, provider env presence, project ref
- currently does not perform a DB read

CI workflow:

- `.github/workflows/quality.yml`
- shared/API/mobile type-checks
- shared/API/mobile tests
- `git diff --check`
- secret-looking token pattern scan
- staging-only Supabase dry-run when staging secrets are configured
- no deploy and no production mutation

Mobile crash/error reporting scaffold:

- `@sentry/react-native` added to the Expo app.
- `apps/mobile/metro.config.js` uses the Sentry Expo Metro config for source
  map support.
- `apps/mobile/lib/error-reporting.ts` initializes Sentry only when
  `EXPO_PUBLIC_SENTRY_DSN` is configured.
- `sendDefaultPii` is disabled, tracing is off by default, and `beforeSend`
  runs a local scrubber for phone/email/CCCD/token/address/problem/prompt style
  fields before events leave the device.
- Real Sentry ingestion/source-map upload still requires Tu to create a Sentry
  project and configure `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, and EAS secret `SENTRY_AUTH_TOKEN`.

Push launch configuration update:

- `expo-notifications` config plugin is enabled in `apps/mobile/app.config.ts`.
- The custom iOS entitlement stripping plugin was removed.
- `expo-device` was added so token registration returns unavailable on
  simulator/emulator instead of attempting a push token flow.
- `apps/mobile/eas.json` no longer sets EAS Update channels because the app
  does not install `expo-updates`; the previous channel config made
  `eas build:inspect` fail before credential validation.
- EAS production config now resolves `sentryEnvironment=production` and includes
  `expo-notifications` in the plugin list.
- `eas build:inspect -p ios -s pre-build -e production` used remote iOS
  credentials and completed its copy step, but did not produce local native
  entitlement files in the inspect output. The inspect attempts incremented the
  remote iOS build number from `9` to `12`.

## Verification Commands

Local:

```text
git grep secret-pattern scan -> no matches
git diff --check -> pass, CRLF warnings only
api targeted router/runtime/schema tests -> 4 files, 299 tests passed
api type-check -> pass
shared type-check -> pass
shared mobile-wiring test -> 1 file, 228 tests passed
mobile type-check -> pass
mobile Jest -> 12 suites, 118 tests passed
mobile error-reporting scrubber test -> 1 suite, 3 tests passed
mobile type-check after Sentry scaffold -> pass
shared mobile-wiring after Sentry scaffold -> 1 file, 229 tests passed
mobile type-check after push config update -> pass
shared mobile-wiring after push config update -> 1 file, 229 tests passed
EAS whoami -> tshine / manhtu0407@gmail.com
EAS project:info -> @tshine/home-services, df74d6a3-f85b-4b40-85ef-fe3162023d6e
EAS production config -> expo-notifications plugin present, sentryEnvironment=production
EAS iOS build:inspect pre-build -> remote credentials detected, copy step completed, no native entitlement proof emitted locally
```

Supabase Management API:

```text
GET /v1/projects/{ref}/config/auth
- staging password_hibp_enabled=false
- production password_hibp_enabled=false

PATCH /v1/projects/{ref}/config/auth {"password_hibp_enabled":true}
- staging -> 402, Pro plan required
- production -> 402, Pro plan required

GET /v1/projects/{ref}/advisors/security
- staging -> WARN auth_leaked_password_protection
- production -> WARN auth_leaked_password_protection
```

Staging recovery drill:

```text
GET /v1/projects/xyylanuyflrjzbjzhqfl/database/backups -> count 1
GET /v1/projects/xyylanuyflrjzbjzhqfl/database/backups/schedule -> 402 Enterprise plan required
POST /database/query/read-only recovery probe:
- migration_count=92
- profiles_estimate=6
- jobs_estimate=4
- notifications_estimate=7
- drill_artifact_exists_before=false
POST /database/query rollback fixture:
- create public.kael_recovery_drill_20260604 inside transaction
- insert 1 fixture row
- rollback
- rollback_clean=true
POST /database/query/read-only after-probe:
- drill_artifact_absent_after=true
```

Runtime:

```text
staging /health -> 200 ok
production /health -> 200 ok
staging /kael/charter -> 200
production /kael/charter -> 200
production /notifications without auth -> 401 AUTH_MISSING
production final dry-run -> Remote database is up to date
production final public/anon/authenticated routine grants -> none
production final non-SELECT authenticated table grants -> source_trust_registry INSERT/UPDATE/DELETE only
```

## Remaining Operational Gaps

### Auth

Supabase still reports:

```text
auth_leaked_password_protection
```

This is an Auth project setting, not SQL. It was attempted through the
Supabase Management API on both staging and production; both projects returned
HTTP `402` because leaked-password protection via HaveIBeenPwned requires a Pro
plan or higher. It remains an external project-plan blocker before claiming a
fully clean security advisor.

### Mobile Error Tracking

Sentry SDK scaffold is now wired into the Expo app with a PII scrubber and
source-map Metro hook. Real crash ingestion is not proven yet because no Sentry
project DSN/auth token was configured in this run, and no release build was
used to verify events in a Sentry dashboard. Existing Edge `api_logs` and
Supabase logs still do not capture native mobile crashes by themselves.

### Push

Push code exists:

- `expo-notifications`
- `expo-device`
- `expo-notifications` config plugin
- mobile token registration
- Edge push helper
- stale token disable on `DeviceNotRegistered`

The prior iOS entitlement-stripper has been removed, so the code/config path is
now launch-oriented. Launch-grade push is still not proven because real
TestFlight/internal Android device delivery was not verified in this run, and
the local EAS inspect output did not include generated native entitlement files
to inspect directly.

### Recovery

Prior production backup/export evidence exists in May docs, and this migration
did not mutate row data. A June staging recovery drill was run through the
Supabase Management API: backup list was reachable, a metadata count probe ran,
and a transaction-scoped fixture rolled back cleanly with no persistent table.
This was not a full PITR/project restore drill; backup schedule metadata is
plan-gated and returned HTTP `402` Enterprise required.

### CI

The GitHub Actions workflow is now present locally, but it has not run on GitHub
until the branch is pushed and a workflow run completes.

### Health

`/health` is live and public-safe, but it currently checks env/readiness metadata
only. A stronger `/ready` can add a bounded service-role DB catalog read later.
