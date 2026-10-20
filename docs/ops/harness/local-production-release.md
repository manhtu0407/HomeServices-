# Local Production release

`kael-ship` keeps `pnpm ship:check` as the pre-push gate. The standard Stage 1 Production release runs from a clean local `main` checkout through `pnpm release:production`; `release-production.yml` runs main quality checks and the scheduled stale-canary reconciler only. GitHub Actions must not dispatch this standard release.

This runner does not manage the separate Backend System Health or Plan55 Production release workflows. Those specialist lanes retain their existing, separately governed gates.

The runner defaults to a read-only preflight. `--execute` is for a task whose current request explicitly authorizes a Production release. It does not grant commit, push, pull-request, or merge authority.

## Preflight

Run the preflight against the exact merged commit:

```powershell
pnpm release:production -- --source-sha <40-character-main-merge-sha>
```

The runner requires a clean local `main` at that SHA, remote `main` at the same SHA, a merged pull request with the current required approval, successful `release-production.yml` quality checks for that exact SHA, the locked Production project ref, no unresolved release candidate, available local credentials and configuration, and the registered Expo project. Any unknown gate is `BLOCKED`; it does not start the release pipeline.

Use a new scoped Supabase personal access token for this machine. In Supabase account settings, create a scoped token limited to the Production project `iwevizmsedyqozxlawwl`. Grant Edge Functions read/write and Edge Function Secrets read/write. Also grant Project Settings, API Keys, and API Key Secrets read access because `supabase link` uses those read APIs. Do not use a legacy account-wide PAT. Supabase currently supports custom PAT expiry up to one year; schedule rotation before its chosen expiry. The CLI accepts a scoped token through `SUPABASE_ACCESS_TOKEN`; this runner reads it from the OS credential store and places it only in child-process environments. [Supabase PAT guide](https://supabase.com/docs/guides/platform/personal-access-tokens)

Preflight verifies the scoped-token format and read access to Functions and Function Secrets on the exact project. Supabase does not document a CLI endpoint that exposes a token's complete grant list, so preflight cannot prove the token has no other grants or test its write permissions without a write. Set the project and permissions exactly in the Supabase token creation screen.

`supabase db push` connects with `SUPABASE_DB_PASSWORD`; that database connection is not constrained by the PAT permission scopes. The separate database password is required in the same protected local credential store, and the pipeline still limits migrations to the reviewed expand-only inventory. [Supabase CLI authentication](https://supabase.com/docs/reference/cli/supabase-test)

Store each required credential with the hidden prompt; the name is validated against a fixed allow-list and the value is never an argument:

```powershell
pnpm release:credentials:set -- SUPABASE_ACCESS_TOKEN
pnpm release:credentials:set -- SUPABASE_DB_PASSWORD
```

Repeat for the other credential names in `.claude/skills/kael-ship/SKILL.md`. Windows uses Credential Manager; Linux requires Secret Service (`secret-tool`). An unavailable credential store, absent secret, or missing release variable blocks the runner. Do not paste credentials into a command, `.env` file, repository, or report.

## Execute a release

Only after reviewing a passing preflight, and only when the current task explicitly requests a Production release, run:

```powershell
pnpm release:production -- --source-sha <40-character-main-merge-sha> --execute
```

The local pipeline uses pinned EAS CLI `22.0.0`, verifies the registered Expo project, reuses or builds store binaries bound to the exact commit and app version, and attests their build IDs and explicit build numbers before Production writes begin. It then runs the existing Stage 1 release bundle, target checks, migration and backend parity gates, canary, Edge deployments, source attestation, three complete synthetic smokes, and atomic promotion. The full release has a 90-minute deadline. The canary is limited to 80 minutes and each recovery step to 15 minutes, so a configured candidate reaches scheduled stale reconciliation within 110 minutes of setup and the server's two-hour stale-candidate cutoff. If a failure occurs after canary setup, it runs the rollback/reconciliation steps and writes proof; an unproven recovery is reported as `UNPROVEN`.

Expo submission is a separate optional operation. Name the platform in the current task and pass it explicitly:

```powershell
pnpm release:production -- --source-sha <sha> --submit-platform ios --execute
pnpm release:production -- --source-sha <sha> --submit-platform android --execute
```

`all` submits both platforms only when the task names both. Submission sends only an exact-source build ID already present in the runner's attestation. The report records upload separately from store processing and tester installation; an EAS success does not prove App Store Connect processing, tester availability, or device installation. This flow does not perform OTA updates or public store rollout. [Expo EAS Submit for TestFlight](https://docs.expo.dev/submit/testflight/)

## Evidence and recovery

The machine receipt and step evidence go under the ignored `artifacts/production-release-<run-id>/` directory. A secret-redacted human report goes under `docs/test-logs/`. Reports name the exact source SHA, locked Production project, steps, submission result, and rollback status. Review them before archiving or copying evidence elsewhere.

The scheduled `stale-canary-reconciler` remains the recovery path if the local process or machine stops during a candidate. A new local release preflight blocks while an active or ambiguous candidate exists. Never infer recovery from a process exit alone; use the runner's rollback proof or the next reconciler evidence.
