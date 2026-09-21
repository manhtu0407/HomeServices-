# Verification release lane

`release-production-verification.yml` is a manual lane that puts a build on Production while the transaction catalog still has open gaps. It exists because the strict lane (`release-production.yml`) cannot pass today, and Staging is retired, so Production is the only backend to verify against. It records what it accepted. It does not prove a transaction completed.

## Why the strict lane cannot pass (state on 2026-09-21)

- **Behavioral gate.** `transaction-critical-coverage.mjs --require-behavioral` fails while any catalog entry is `PARTIAL`. All 65 are, each with one open gap. The 316 bound assertions all execute and pass.
- **Push readiness.** `checkHarnessRelease` requires `android_fcm_v1`, `ios_apns`, and `push_receipt_reconciler` to be true for a Production release. Neither the `production` GitHub environment nor the repository sets `NESTSCOUT_ANDROID_FCM_V1_READY`, `NESTSCOUT_IOS_APNS_READY`, or `NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY`. The hosted runtime itself counts a release as registered on `anthropic`, `durable_guards`, `global_ai_enabled`, `perplexity`, and `vietmap` alone; nothing reads the push flags at request time.
- **Store binaries.** EAS has no finished store/production build of app version 0.2.0. The 0.2.0 builds numbered 45 and 4 are `INTERNAL` `native-proof-staging` builds that embed the retired Staging backend and cannot be attested for Production. The newest store build is iOS 0.1.0 number 44.

Until a release registers, the hosted `mobile-api` fails closed on its release-identity check and answers every request with 500.

## What the lane changes

| | Strict lane | Verification lane |
|---|---|---|
| Trigger | push to `main`, hourly reconcile | `workflow_dispatch` on `main`, typed confirmation phrase |
| Transaction gate | `--require-behavioral`, no `PARTIAL` allowed | `--require-bound-assertions` plus a checksummed receipt naming every acknowledged gap |
| Push readiness | three variables must be `true` | recorded as configured, `false` included |
| Manifest | no lane field | `releaseLane: "verification"`, part of the release identity |
| Store binaries | listed and built for the release commit | newest finished store build per platform reused, only a platform with none built |
| Attestation | exact commit | `binaryRelation: "latest_existing"` written into the receipt |
| Promotion packet | no lane fields | `lane`, the receipt digest summary, and the `transaction-bound-assertions` gate |

The five runtime provider flags stay required. Nothing else is relaxed: type-check, tests, security scan, harness gates, Edge check, empty-state migration replay, integration, SQL suite, hosted drift, byte-proof of the deployed source, three consecutive synthetic smokes on the exact cohort, atomic promotion, and the rollback that redeploys the downloaded hosted source all run as in the strict lane. Both workflows share the `production-release` concurrency group, so they cannot deploy at once.

The workflow is generated from the strict one, so every mutation and rollback step is the strict workflow's own text.

## What a verification release proves

- The bound assertions of every catalog entry ran and passed on the merged commit.
- The build deploys, registers, and serves on Production: three consecutive full synthetic smokes pass on a dedicated cohort, which is then cleaned and proven clean.
- The runtime release identity matches the manifest, and the deployed Edge source is byte-identical to the built source.

## What it does not prove

- That any real Customer-to-Worker transaction completes. No money has moved.
- Any of the open gaps. The receipt lists them; it does not close them.
- That push delivery works. With the flags false, Worker offers cannot be delivered by push.
- Anything about a native build. The binaries it attests may come from an older commit.

## Preconditions

- The change that adds this workflow is merged to `main`. A workflow file can only be dispatched from a ref that contains it, and its jobs run only on `main`.
- The twelve `production` environment secrets exist: `SUPABASE_ACCESS_TOKEN`, `PRODUCTION_SUPABASE_ANON_KEY`, `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `PERPLEXITY_API_KEY`, `VIETMAP_API_KEY`, `EXPO_TOKEN`, and the four `PRODUCTION_SYNTHETIC_*` credentials. `KAEL_DURABLE_GUARDS_ENABLED` is `true` and `KAEL_AI_KILL_SWITCH` is `false`.
- EAS can build the `production` profile for both platforms, because no store build of 0.2.0 exists. That spends EAS build minutes and needs iOS and Android credentials on EAS.
- The migrations pending on Production pass the expand-only assertion; the run refuses otherwise. It then applies them with `db push --linked --include-all`, and a database rollback is forbidden afterwards.

## Dispatching it

```bash
gh workflow run release-production-verification.yml --ref main -f confirm=deploy-verification-release-to-production
```

The run mutates Production. Dispatch it deliberately, not from automation.

## Evidence it leaves

Artifacts of the run: `verification-transaction-assertions-<sha>-<run>` (runner reports), `verification-transaction-behavior-<run>` (the receipt), `stage1-verification-quality-<run>`, and `stage1-verification-release-<run>` (manifest, attestation, packet, smoke, cleanup, promotion, and rollback evidence). The release ledger stores the manifest with its lane, and the acceptance note binds the packet digest.

## Rollback

Unchanged from the strict lane. On any failure after the canary is configured, the workflow aborts the canary, restores the previous runtime identity, redeploys the hosted source it downloaded before deploying, cleans the exact cohort, and writes a rollback proof. Migrations are never rolled back.

## Closing the acknowledged gaps

The lane makes the gaps visible and lets Production be verified. It does not shrink them. By keyword over the 65 gap sentences (classes overlap, so treat the counts as approximate):

| Evidence that closes the gap | Entries |
|---|---|
| Hosted Edge or Production proof | 63 |
| Native device or relaunch proof | 55 |
| SQL, RLS, or migration proof | 54 |
| Concurrency or race proof | 42 |
| External provider proof (push, payment, map, SMS) | 9 |

Nine entries name no native or provider gap. Two of them, `worker.fulfillment.advance` and `customer.review.submit`, only lack executable test cases and can be closed with local tests. A status changes only when a runner-verified binding and reviewed evidence say so; the receipt and this lane never flip one. Eight entries still cite Staging in their gap text; that wording predates the retirement of Staging and needs a reviewed edit when their evidence is re-run against Production.

## Keeping the workflows in sync

`generate-verification-workflow.mjs` derives the file from the strict workflow and fails when an anchor it depends on moves. `generate-verification-workflow.test.mjs` fails when the committed file differs from the derivation.

```bash
node scripts/harness/generate-verification-workflow.mjs
```

Never edit the generated file by hand.

## Retiring the lane

Delete the lane once the strict lane can pass: no `PARTIAL` entry, the push variables set truthfully, and a store build present. Remove the generated workflow, the generator and its test, `RELEASE_LANES` and the lane branch of `checkHarnessRelease`, the packet's lane fields, `transaction-behavior-receipt.mjs`, and the `latest_existing` relation.
