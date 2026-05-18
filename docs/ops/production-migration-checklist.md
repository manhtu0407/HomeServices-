# Production Migration Checklist

This checklist is the production safety gate for applying the Supabase migration chain from the verified staging database to the production `HomeServices` project.

> 2026-05-18 staging backend note: this checklist predates the `mobile-api`
> staging execution and the later staging-only hardening migrations through
> `20260518043000_harden_private_rls_helper_execution.sql`. Production was not
> mutated during that staging backend session. Before any production apply,
> rerun production migration history, dry-run the exact target, and regenerate
> the expected pending chain from current staging evidence.

## Current Target State

Production project:

```text
name: HomeServices
ref: iwevizmsedyqozxlawwl
region: ap-southeast-1
```

Staging project:

```text
name: HomeServices Staging
ref: xyylanuyflrjzbjzhqfl
region: ap-southeast-1
status: verified
```

Local Supabase link after this preparation session:

```text
xyylanuyflrjzbjzhqfl
```

Keep the local link pointed at staging unless Tu explicitly approves production migration execution.

## Production Preflight Results

Read-only production checks completed:

```text
production migration history:
-
|- 20260511000000 init_schema
|- 20260512000000 security_hardening
|- 20260513114845 align_structures_workflow
|- 20260513125704 harden_function_execution
|- 20260513131949 revoke_rls_auto_enable_rpc

production data counts:
-
|- profiles: 0
|- customer_profiles: 0
|- worker_profiles: 0
|- jobs: 0
|- job_broadcasts: 0
|- chat_messages: 0
|- reviews: 0
|- storage_objects: 0
```

Production dry-run before the hardening migration reported these pending migrations:

```text
pending before hardening:
-
|- 20260512000000_security_hardening.sql
|- 20260513114845_align_structures_workflow.sql
```

After the hardening migration was added and verified on staging, production still has only `20260511000000`, so the expected pending production chain is now:

```text
expected pending chain:
-
|- 20260512000000_security_hardening.sql
|- 20260513114845_align_structures_workflow.sql
|- 20260513125704_harden_function_execution.sql
```

Important limitation:

```text
final production dry-run/apply after password correction:
-
|- status: applied
|- dry-run: exact expected chain
|- applied: 20260512000000, 20260513114845, 20260513125704
|- production post-smoke: schema/RLS/storage counts passed
|- follow-up applied: 20260513131949 revoked direct RPC execute on public.rls_auto_enable()
|- final security advisors: No issues found
```

## Staging Verification Results

The same migration chain has been applied to staging.

```text
staging applied migrations:
-
|- 20260511000000_init_schema.sql
|- 20260512000000_security_hardening.sql
|- 20260513114845_align_structures_workflow.sql
|- 20260513125704_harden_function_execution.sql
|- 20260513131949_revoke_rls_auto_enable_rpc.sql
```

Staging security verification:

```text
Supabase security advisors:
-
|- result: No issues found

RLS/storage harness:
-
|- result: 29/29 checks passed
|- harness: supabase/tests/staging_security_verification.sql
```

Local verification after staging:

```text
local gates:
-
|- npm run test: passed
|- npm run lint: passed
|- npm run build: passed
|- secret scan for sbp token: passed
```

## Production Apply Preconditions

Do not apply production migrations unless every item below is true:

```text
preconditions:
-
|- Tu explicitly approves production migration execution.
|- Temporary Supabase access token has been rotated or confirmed still valid for this exact task.
|- Production DB password is available only as process-level env, not written to repo files.
|- Local working tree has no unrelated risky schema edits.
|- Local Supabase link is intentionally switched from staging to production.
|- `supabase db push --dry-run --linked` succeeds against production.
|- Dry-run output contains exactly the expected pending chain and no unknown migration.
|- Staging remains healthy after the same chain.
|- README and MEMORY reflect the final production decision.
```

## Backup And Rollback Strategy

Production currently has no app rows in the checked public tables or storage objects. Still, treat production as real.

Before apply:

```text
backup strategy:
-
|- export schema/migration history metadata
|- record production row counts
|- record storage object counts
|- record Supabase security advisor output
|- if real user data appears before apply, stop and create a proper database backup/export first
```

Rollback expectations:

```text
rollback strategy:
-
|- do not rely on automatic down migrations
|- if apply fails before completion, stop and capture exact failing migration/error
|- repair forward with a new migration when possible
|- if data exists and corruption occurs, restore from Supabase backup/export
|- if RLS locks out legitimate app access, apply a targeted forward-fix migration after Tu approval
|- never manually edit migration history unless the exact repair action is reviewed first
```

## Production Apply Procedure

Run only after Tu approval.

```powershell
$env:SUPABASE_ACCESS_TOKEN="<temporary-token>"
$env:SUPABASE_DB_PASSWORD="<production-db-password>"
npx.cmd supabase link --project-ref iwevizmsedyqozxlawwl
npx.cmd supabase db push --dry-run --linked
```

Stop if dry-run differs from:

```text
expected:
-
|- 20260512000000_security_hardening.sql
|- 20260513114845_align_structures_workflow.sql
|- 20260513125704_harden_function_execution.sql
```

If dry-run is exact and Tu approves the final apply:

```powershell
npx.cmd supabase db push --linked
```

Immediately restore local link to staging after production apply:

```powershell
npx.cmd supabase link --project-ref xyylanuyflrjzbjzhqfl
```

## Post-Apply Smoke Tests

Run immediately after production apply.

```text
post-apply checks:
-
|- migration history includes all five migrations: passed
|- public table count is 17: passed
|- RLS enabled table count is 17: passed
|- public policy table count is 17: passed
|- storage bucket count is 3: passed
|- storage policy count is 6: passed
|- service_categories count is 2: passed
|- service_problems count is 2: passed
|- price_baselines count is 6: passed
|- learning tables count is 3: passed
|- rollback-only RLS/storage harness: 29/29 passed
|- production fixture rollback check: profiles/jobs/storage_objects remain 0
|- `supabase db advisors --linked --type security --level warn`: No issues found
```

Resolved follow-up:

```text
advisor blocker:
-
|- function: public.rls_auto_enable()
|- issue: SECURITY DEFINER function executable by anon/authenticated via RPC
|- observed config: search_path=pg_catalog
|- fix: 20260513131949_revoke_rls_auto_enable_rpc.sql conditionally revokes EXECUTE from public, anon, and authenticated when the function exists
|- verification after fix: advisors returned "No issues found"; RLS/storage harness still passes
```

## Stop Conditions

Stop and ask Tu before continuing if any of these occurs:

```text
stop conditions:
-
|- dry-run includes unexpected migrations
|- production target ref is not `iwevizmsedyqozxlawwl`
|- security advisors report WARN/ERROR after apply
|- RLS/storage harness fails any check
|- production has real app data and no backup/export exists
|- Supabase CLI requests credentials not intentionally provided for this task
|- any migration fails partially
```
