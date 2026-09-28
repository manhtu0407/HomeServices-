# Plan 55 Production source attestation — 2026-09-27

## Result

PASS for the active Production health identity and the six corpus / six service-playbook assets. This is an identity check only; it is not a live service evaluation, safety/G5 result, account canary, or permission to enable a playbook.

Command: `pnpm exec node apps/api/scripts/kael-playbook-production-attest.mjs`
Observed: `2026-09-27T01:13:03.960Z`
Exit: `0`

The script made one bounded public `GET` to the exact Production `/harness/health` endpoint, then compared the twelve local inputs with Git blobs at the registered deployment commit using Git's clean filter. No Auth, database, flags, service cases, customer account, or worker state was accessed or mutated. No secrets or user payloads were emitted.

| Active release identity | Value |
|---|---|
| Project | `iwevizmsedyqozxlawwl` |
| Health | `ok` |
| Provider / webhook classes | `production-locked` / `production-signed` |
| Release / deployment | `harness-645c907e178f-f426155f83de` / `iwevizmsedyqozxlawwl_7d0946b9-aa63-42d3-b4d6-f1615a2c4d05_273` |
| Registered source commit | `645c907e178f21ddde24a72501e6c8449d6720f9` |
| Manifest SHA-256 | `f5b620a9acbe44370b1737743e592cff14a969e843192e817546e29a389edb0a` |
| Bundle SHA-256 | `e179c0572365ff73ba0765a34685cf7034f2c439b5ccc3fdbe69a230793955f3` |
| Source bundle SHA-256 | `ec3108a99b29ed82541e56367d7378dfafb2391eb37404221bf48717b6d4cd8d` |
| Edge bundle SHA-256 | `6b173e2a9be01e4e1461f70504941dae5a4ec599cba84fdfe5e7e52cf7fc963b` |

## Per-service asset identities

Every row passed exact Git blob identity at the registered source commit. The local Windows raw-byte SHA-256 differs because the worktree uses CRLF; Git's configured clean filter canonicalizes the files to the exact deployed blobs. The attestation records both raw-byte and deployed-byte digests and does not call the raw bytes identical.

| Service | Asset | Git blob SHA-1 | Deployed-byte SHA-256 |
|---|---|---|---|
| HVAC | corpus | `f0d10a4bac5d28b4fc712d105d1dc9f656592ccb` | `e74d92b646b3b76cb5161025908e49e55bd61b2b4fd52dc7030c6c7b61fceee6` |
| HVAC | playbook | `ff3360a4435c04e7f0e9501be620b50af2de31b1` | `ba9002839a23696eb1aa433e9c94f655aec5ee1b2d647beef4e585157414b857` |
| Handyman | corpus | `1dde86d99181e286b840a12cdc02700c2ddc68ec` | `99c054aa9656dd87ce1e36a5967d1318da946510a3d67c4e38781d20e8f7289a` |
| Handyman | playbook | `b6c4d82500f01c5ce6f9fadc65beb18ef9e8d8ec` | `fad61233323baf2a7a5aba3a121c6c407a3751fbe2118da950b72a0457c0795d` |
| Cleaning | corpus | `0017a92bb2da49f01e1d10bf6971944cb6ec08b8` | `83031501f617c56dde6e963247f198c5d6d88e88102440e8fa3f359e127268fa` |
| Cleaning | playbook | `6591460b7930400989816eeb35c32446f4a71d98` | `910c63b13d52c4f1cc05542150eb5308eca6d39a04b479ee931b84a45aaf1bff` |
| Upholstery | corpus | `65963ac2e709e3fc828a513af89be113b08280d3` | `ec87ea009b95024b1d4b1c6ebb1c8cb0a6210acdf821efc628197ce05a2c91fe` |
| Upholstery | playbook | `a5cf2150256ca00e2ae08092bfa064bfddcaf8d6` | `dc48695f06b752888690e53553e30e035751b1f97dc9074de9339d89754800ec` |
| Electrical | corpus | `00acc3900e20867bd30a81026f12b24a94e7dd18` | `01a80d0ac15fdfede6c5a6fa01313d5dff7e5763fa6b98c9224ac460c47364f3` |
| Electrical | playbook | `edb1e451aa2d934867942df45d26d34c3839a9f0` | `73b29c6779cf4019bc63c0a930e826163b3b480b717c84431b6df88f0508c99f` |
| Plumbing | corpus | `4a8e6fa6db013dde0079e17b8bfc6ec32981013a` | `e11c974549803225877a7a89876169c2e90266d1541ccb67b4b79b9ea2ab4b2d` |
| Plumbing | playbook | `81e13e39bfa082547f51d4655da09339ed9a7a35` | `516383608074c7ae8e0152817f73c66782b611187a94fea463d50fcc38f2d28e` |

## Not cleared

- Goal checkout remains `4b3c62ac3dbd642f278ea75c9320f7c97181e4fa`; its runtime/evaluator and migration inventory are not the registered deployment source. Asset equality does not imply whole-tree equality.
- Production migration inventory remains 398 entries versus 336 Goal-worktree files (69 Production-only and 7 Goal-only); the Goal-only migrations are behavioral/schema/data-affecting and were not applied.
- Active release remains in the `verification` lane; the three false push-readiness fields still block the full Production lane.
- All six current-source 96-case service receipts, their G5 deltas, cleanup receipts, independent cohort, paired waves, and publication allow-list remain unverified. No service evaluation, account provisioning, flag mutation, or workflow write was performed.
- Docker was not invoked: the fresh host sample at `2026-09-27T01:14:47Z` found 2.35 GiB free of 15.71 GiB, below the Plan's 4 GiB Docker floor.
- No attributable USD cost telemetry was available.

## Addendum — source-mismatch attribution correction — 2026-09-27T13:57Z

A fresh read-only check found Production project `iwevizmsedyqozxlawwl` with active `mobile-api` v273 (417 files). The retrieved active bundle's Git-blob identities for the 19 attested runtime paths match 19/19 both at registered source commit `645c907e178f21ddde24a72501e6c8449d6720f9` and at committed Goal HEAD `4b3c62ac3dbd642f278ea75c9320f7c97181e4fa`.

The hardened local attestor compares those deployed commit blobs with the current working-tree blobs. The working tree differs on 17/19 runtime paths because the actor-scoped canary patch is still local and unshipped; therefore the failure at `flags.ts` is expected and does not indicate a backend switch or a mismatch in the committed Goal runtime baseline. The guard is not yet proven deployed, so no canary is authorized. Current-source Production service receipts remain 0/6; prior Staging or older-deployment measurements do not replace them, and no valid slice should be rerun.

The check was read-only: no evaluator, account, flag, database, Production, or Staging state changed. No attributable USD cost telemetry was available.
