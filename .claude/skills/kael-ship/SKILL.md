---
name: kael-ship
description: Use before a push, pull request, handoff, Production release, or Expo store submission. Preserves the pre-push ship gate and adds a read-only exact-source release preflight plus an explicitly authorized local Production and EAS lane.
---

# kael-ship

Delivery and release gate. `pnpm ship:check` remains the pre-push machine gate. Production release is a separate, non-repeatable local operation with exact-source review, CI, project, candidate, credential, and release-evidence gates.

## Preconditions

The Production lane is gated. Before calling the runner, confirm all of the following from current evidence:

- Tu's current task explicitly asks for a Production release before `--execute` is used. The skill does not authorize commits, pushes, PR creation, or merges.
- The local checkout is clean `main`, `HEAD` equals `--source-sha`, and GitHub `main` still points at that SHA.
- The SHA is the merge commit of one closed PR into `main`, with a current human `APPROVED` review by `kouuuuuuuuu` on the PR's exact head SHA, from someone other than the author.
- The `release-production.yml` push run and its exact-SHA `quality` job completed successfully.
- The workflow and the Supabase CLI wrapper both resolve to the registered Production project `iwevizmsedyqozxlawwl`; release control is readable and has no active or unresolved candidate.
- Required variables are set in the local process: `KAEL_DURABLE_GUARDS_ENABLED=true`, `KAEL_AI_KILL_SWITCH=false`, `NESTSCOUT_ANDROID_FCM_V1_READY=true`, `NESTSCOUT_IOS_APNS_READY=true`, and `NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY=true`.
- The OS credential store is available. On Windows, use Windows Credential Manager; on Linux, use Secret Service. Do not use `.env`, skill text, command arguments, shell history, or logs for secrets. Set or rotate a value with the masked prompt: `pnpm release:credentials:set -- SUPABASE_ACCESS_TOKEN`.
- The Supabase PAT is scoped to the exact Production project. Grant Edge Functions and Edge Function Secrets read/write access. The current migration flow also runs `supabase link`, so the PAT needs Project Settings, API Keys, and API Key Secrets read access for this same project. Supabase currently limits custom PAT expiry to one year; rotate it before expiry. Do not use a legacy account-wide token or reuse the CI credential. The separate `SUPABASE_DB_PASSWORD` is needed for the expand-only migration and is not restricted by PAT scopes; protect it separately in the OS credential store.
- The credential store has these other values by name: `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SUPABASE_ANON_KEY`, `SUPABASE_DB_PASSWORD`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `VIETMAP_API_KEY`, `EXPO_TOKEN`, `CLOUDFLARE_API_TOKEN`, `SYSTEM_HEALTH_MONITOR_SECRET`, `SYSTEM_HEALTH_OBSERVER_SECRET`, `PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL`, `PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD`, `PRODUCTION_SYNTHETIC_WORKER_EMAIL`, and `PRODUCTION_SYNTHETIC_WORKER_PASSWORD`.
- EAS authentication resolves to the registered `@nestscout/home-services` project. Use the pinned `eas-cli@22.0.0`; build identity must match the exact source SHA, app version, platform, and explicit build number in `apps/mobile/config/release-client-policy.json` (`autoIncrement` is off).

The runner checks these conditions again. It reports credential **names** only. It never prints or stores secret values in the repository.

## Degraded lane

Without a secure credential store, GitHub authentication, current review, green exact-SHA CI, the exact project, readable release control, or required release configuration, run only the read-only preflight and report the named missing or blocked gates. Do not start any Production write, EAS build, or store submission. Never turn an unknown check into a pass.

An unreadable release-control state counts as blocked. A candidate, including a stale or ambiguous candidate, must be resolved by the scheduled reconciler and verified before another release can begin.

## Pre-push machine half

```bash
pnpm ship:check
```

Read **both** lists. The gate list is the easy half. The `not run by this command` list is the one that matters: `governance/critical.md` §3 says a gate that could not run is not a gate that passed. Whatever is named there stays unproven locally, and saying "checks pass" without naming it is a false completion report.

`pnpm lint:residue` is the one gate in that set most likely to be new to you — it catches a focused or skipped test, a leftover debug probe, and a `console.log` in runtime code.

## Local Production release

The default command performs read checks and does not write Production:

```bash
pnpm release:production -- --source-sha <40-character-merge-sha>
```

It verifies exact clean `main`, current PR approval, exact-SHA CI, the locked Supabase project, secure credentials, scoped-token format, PAT read access, EAS project identity, and the absence of a conflicting candidate. A blocked check stops execution. PAT read access is tested against the exact project; the runner cannot prove the token's exclusive scope or write permissions without performing a write, so create it with only the scopes in the precondition and runbook.

Use `--execute` only when the current task explicitly requests the Production release:

```bash
pnpm release:production -- --source-sha <40-character-merge-sha> --execute
```

The local runner is the standard Stage 1 release executor. It builds and verifies the immutable bundle, checks Cloudflare and Supabase baselines, attests exact EAS binaries, verifies expand-only migrations and backend parity evidence, applies the migrations through `pnpm supabase`, configures the synthetic canary, deploys and attests Supabase Edge Functions and the System Health Observer, runs three full synthetic smokes, atomically promotes, and verifies hosted state. The release has a 90-minute overall deadline, the canary is bounded to 80 minutes, and each recovery step to 15 minutes. A candidate therefore reaches stale reconciliation within 110 minutes of canary setup, inside the existing two-hour window. After a configured canary fails, it runs the release-control recovery, cleanup, Edge/Cloudflare restoration, and rollback proof. Report `rollback=UNPROVEN` whenever the proof does not pass; do not retry a partial release blindly.

The standalone step source is `scripts/harness/production-release-steps.yml`. Supabase CLI access must go through `pnpm supabase` and its fixed Production target wrapper, including for isolated migration workdirs.

## Expo submission

The release builds and attests store binaries for the exact source. Submit only a platform named in the current task, only after Production promotion and successful binary attestation:

```bash
pnpm release:production -- --source-sha <40-character-merge-sha> --submit-platform ios --execute
pnpm release:production -- --source-sha <40-character-merge-sha> --submit-platform android --execute
```

Use `--submit-platform all` only when Tu asks for both platforms. Submission uses the attested EAS build ID with `eas-cli@22.0.0`. This flow does not run OTA updates or public store rollout. Report EAS upload separately from App Store / Play processing; report tester installation only when a real device proves it. EAS upload success is not store processing or device evidence.

## Evidence and judgment half

Production machine evidence is written under `artifacts/production-release-<run-id>/`; the redacted operator report is written under `docs/test-logs/`. The report lists the exact source SHA, project, step outcomes, rollback status, and (when requested) separate upload, store-processing, and tester-install states. Never copy a token, signed artifact URL, synthetic password, or raw CLI output into tracked docs.

The judgment half remains human work. None of these are detectable by a script, and every one of them has shipped in this repo before:

1. **One theme, or two?** A PR carrying two subjects gets reviewed as neither. If it is two, say so in the description rather than letting the reviewer discover it.
2. **Is there anything in the diff you would not defend out loud at review?** Scaffolding kept "just in case", a rename half-applied, a workaround with no comment saying why. Cut it now, not after a reviewer asks.
3. **Did anything land in source whose home is `docs/`?** History, rationale, and status belong in the commit message and `docs/`, per `governance/protocols/code-hygiene.md`.
4. **Do the commit messages and the PR body describe what actually changed?** Re-read the diff against them. A description written before the last three commits is no longer true.
5. **Was anything called done that a gate could not prove?** Name it in the PR body, not only in your own head.
6. **Session Memory Gate.** `governance/critical.md` §3 — if this session produced a decision, an executed plan section, an environment change, or an honest gap, prepare the entry using `docs/memory/INDEX.md` and show it to Tu before writing.

## Guardrails

- Do not push or open a PR unless Tu asked for it in the current conversation (`governance/critical.md` §3 Git Rule).
- Do not present `ship:check` as equivalent to CI. It runs the pure-node gates; type-check, tests, build, Edge `deno check`, and the SQL matrix are not among them.
- CI minutes are metered (`docs/ops/github-actions-cost.md`). Open the PR as a draft (`gh pr create --draft`), which runs nothing, and batch the fixes locally. Check `mergeStateStatus` is not `CONFLICTING`, then mark it ready once (`gh pr ready`). Every later push re-runs the whole PR, 15 to 20 minutes.
- Do not widen or disable a gate to make this pass. A red gate is the finding.
- A gate that could not run is reported, never omitted.
- Never stage, commit, push, merge, release, or submit Expo binaries unless the current task names that action. `--execute` is a Production write boundary; `--submit-platform` is a separate store upload boundary.

## Close

Report both halves and keep upload, store processing, and device installation distinct:

```text
Branch:
Theme:
ship:check:
Production preflight:
Production execution:
Expo upload / store processing / tester install:
Rollback:
Not run here:
Judgment findings:
Memory entry:
```
