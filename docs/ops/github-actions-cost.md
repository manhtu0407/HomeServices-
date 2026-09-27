# GitHub Actions cost: model, guardrails, and what to do when CI is blocked

CI on this private repository runs on metered GitHub-hosted minutes. When the monthly spending limit is reached GitHub refuses to start any job, every workflow goes red at once, and no code is at fault. This page is the billing model, the policy that keeps usage under the limit, and the runbook for a block.

## How the bill is computed

Facts below were checked against GitHub's billing documentation and reconciled against the account's Billing page (the measurement follows).

| Item | Value | Source |
|---|---|---|
| Included minutes per month, GitHub Free | 2,000 | docs.github.com `githubs-plans`, `product-billing/github-actions` |
| Included minutes per month, GitHub Pro | 3,000 | same |
| Linux 2-core (`ubuntu-latest`) after the included minutes | $0.006 per minute | docs.github.com `billing/reference/actions-runner-pricing` |
| Windows 2-core / macOS 3- or 4-core | $0.010 / $0.062 per minute | same |
| Artifact storage / Actions cache beyond the included amount | $0.25 / $0.07 per GB-month | `product-billing/github-actions` |

**Each job is billed separately and rounded up to a whole minute.** The pages checked do not state the rounding rule; the Billing page confirms it. Across 1 to 20 September the 1,178 billed jobs add up to 2,585 minutes of real run time, which would be a $3.51 overage. Rounding each job up gives 3,227 minutes and $7.36, against $7.00 shown as spent. Only the rounded figure reproduces the bill.

The consequence is easy to miss: **572 of those 1,178 jobs ran under 60 seconds and still billed a full minute, which is 20% of every billed minute.** A `classify changed paths` job runs for 7 seconds and costs 1 minute. Splitting work across many small jobs costs more than the work itself.

A budget set to stop usage blocks jobs from starting once it is reached. A blocked job fails within seconds having run **no steps**, is not billed, and carries this annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

## What September looked like

Measured from the workflow runs (`node scripts/ci-usage-report.mjs --month 2026-09`).

- **3,227 billable minutes in 20 days.** Pull requests 64%, pushes to `main` 29%, schedules 4%, manual dispatches 2%.
- By workflow: `harness-assurance` 54%, `kael-agentic-completeness` 17%, `integration` 10%, `security` 9%, `release-production` 8%, `comment-discipline` 3%.
- A push to a pull request cost a median 32 minutes before path-aware lanes and 39 after; a push to `main` cost 35 and then 48 (6 and 5 runs after, so a direction rather than a measurement). Path-aware lanes were not reducing the cost: 32 of the 40 most recent merged pull requests selected the heavy lanes, and for 10 of them the only trigger was rules, skills, or memory files. Regenerating `governance/protocols/test-pillars.md` marked a change as harness work even when the rest of it was a mobile screen.
- **CI was blocked five times.** Each block began when billed minutes crossed a round spending cap, then the cap was raised and the next one was crossed:

| Block began (UTC) | Billed minutes at that moment | Overage at $0.006 |
|---|---|---|
| 15 Sep 00:28 | 2,027 | $0.16 |
| 15 Sep 10:13 | 2,529 | $3.17 |
| 15 Sep 14:43 | 2,722 | $4.33 |
| 19 Sep 05:53 | 2,989 | $5.93 |
| 20 Sep 15:53 | 3,227 | $7.36 |

The caps are inferred from these crossings, not read from GitHub. The Billing page showing exactly $7.00 spent against a $9.00 budget fits a meter that stopped at a $7.00 cap before the budget was raised.

- **By 24 September the month stood at 5,054 billable minutes** ($18.32 overage, about $26 projected), with 96 jobs refused on six days. The costliest items were `harness-assurance` on pull requests (1,764 minutes, 18.4 per run), `release-production-verification` (673), `harness-assurance` on pushes to `main` (591), and `kael-agentic-completeness` on pull requests (591). One push to a pull request that only touched two `scripts/harness` files billed 36 minutes, because the whole-workspace type-check ran three times, the whole-workspace tests twice, the Deno checks twice, and every job paid its own checkout and install. That is why the five pull-request workflows were folded into `ci.yml` (below).
- The hourly `stale-canary-reconciler` failed all 98 of its September runs, which billed 94 minutes. After its TypeScript import was fixed it failed on Production having no release-control table, apart from the runs a billing block refused. The nightly `integration` schedule re-ran, on unchanged code, the suite that already runs for every change that can affect it.

## What runs when

| Event | Runs | Does not run |
|---|---|---|
| Push to a draft pull request | nothing | everything |
| Push to a ready pull request, or marking a draft ready | `ci` job `controls` (secret scan, classification, every ratchet once), plus `workspace` and `database` when the changed paths select them | lanes no changed path selects |
| Push to `main` | `ci` job `controls` only | `workspace`, `database`, and `release-production` unless its switch is on (below) |
| Sunday 18:00 UTC, on `main` | `ci` with every lane: whole-workspace type-check, tests, build, Kael evals, Edge checks, database replay, SQL matrix, generated types, integration suite | |
| Daily 03:17 UTC, on `main` | the stale-canary reconciler | |

`ci.yml` has three jobs, and each gate runs in exactly one of them:

- `controls` always runs (except on drafts). It does the gitleaks scan, one `pnpm install`, the path classification the other jobs read, and every script-level ratchet, including the comment-discipline full report, which is a superset of the added-lines check.
- `workspace` does one type-check and one test pass. It covers all four workspaces when the change crosses workspaces or reaches Kael (with the JSON reports the transaction gate binds), and only the touched workspace otherwise. It also runs the build, the Kael deterministic evals, one Edge `deno check` of every function, and the protected-boundary check.
- `database` starts one local Supabase for the empty-reset replay, the SQL matrix, the generated-type drift check, the schema lint, and the integration suite. It replays again before the suite, because not every SQL verification file rolls back. It checks out the pull request head, because the suite's release preflight binds that SHA; `release-production` reruns the schema gates on the merged tree before any deploy.

**The strict release lane is paused by a switch.** `release-production` still triggers on every push to `main` (pillar P56 forbids a manual dispatch for it). Its jobs run only when the repository variable `NESTSCOUT_STRICT_RELEASE_ENABLED` is `true`. While transaction entries are unmapped its gate cannot pass, so the variable stays unset, every job is skipped at no cost, and `main` no longer shows a red run per merge. The dispatch lane `release-production-verification` is the release path meanwhile. Set the variable (Settings, then Secrets and variables, then Actions, then Variables) once the strict gate can pass.

A push to `main` carries a tree its pull request already ran the heavy lanes on. What still runs there is what a merge can break without conflicting: the registries and ratchets (pillar ids, manifests, structure baseline), the secret scan, and the release gate. `release-production` is the post-merge authority once its gate can pass; until then nothing is deployed from `main`, and the weekly runs catch a semantic conflict between two pull requests that each passed alone. Reinstate the conditional lanes on pushes if the release gate is ever disabled or weakened.

## Guardrails

`node scripts/check-workflow-cost.mjs` (`pnpm lint:workflow-cost`) runs in the always-on `ci` `controls` job and fails a change that:

- leaves a job without a literal `timeout-minutes`, or sets one above 90, because a hung job otherwise bills to the 360-minute default;
- adds a schedule that fires more than 28 times a week. Availability monitoring belongs on an external uptime service, not on metered runner minutes; a `*/15` cron is 672 runs a week;
- uses anything but a standard `ubuntu-*` runner;
- adds a `pull_request` workflow with no `concurrency` block that cancels superseded runs;
- adds a `pull_request` workflow that omits `ready_for_review` from its `types` or has a job with no `needs` that does not skip drafts.

A deliberate exception is added to `EXCEPTIONS` in that script with a reason. An exception that no longer excuses anything fails, so the list cannot become the hole. Today there are two, both the `production-release` job, which waits on EAS store builds: one in `release-production.yml` and the same job in `release-production-verification.yml`, which is derived from it.

Lane selection lives in `scripts/harness/classify-ci-changes.mjs`. Documentation, rules (`governance/**`), skills, commands, and `.claude/MEMORY.md` select no conditional lane, because the ratchets that always run already prove them and nothing compiles or tests them. Hooks, settings, workflows, `scripts/harness/**`, `config/harness/**`, and root manifests still select everything, and any path no lane claims still selects everything. Across all 3,418 tracked paths at the time of the change, only the 349 documentation, rule, skill, and command paths changed classification; no source path did.

Cheap script-level controls share one job, because each job bills a whole minute and spends about a third of it on checkout and dependency install. `release-production` fails its `quality` job in seconds with `transaction-critical-coverage.mjs --require-mapped` while any transaction entry is unmapped, instead of after the whole-workspace tests; the gate that follows cannot pass in that state, so the conclusion is the same and arrives roughly 7 minutes earlier per push to `main`.

CI supply-chain hardening is a collected pillar (`P194-ci-supply-chain-hardening`): every action pinned to a full SHA, no checkout keeping its token, and a secret scan that reads full history, skips no path, and runs on pull requests and pushes.

## Push discipline

Every push to a ready pull request re-runs the lanes chosen by the whole pull request, not by the last commit, so one push costs 20 to 40 minutes.

- Iterate in a draft pull request. Nothing runs until it is marked ready, and marking it ready runs everything once.
- Batch commits and push once per review round. Run `pnpm ship:check` before pushing.
- Before a burst of pushes, run `node scripts/ci-usage-report.mjs --month <YYYY-MM> --budget <cap>`. If fewer than three full pushes of headroom remain, stop and tell Tu instead of pushing.
- A failing run is not a reason to rerun it repeatedly, and jobs that fail in seconds having run no steps are a billing block, not a code fault.
- Check `gh pr view <n> --json mergeStateStatus` before waiting on checks. A `CONFLICTING` pull request gets no CI at all, so waiting on it only burns session time.
- Do not re-dispatch `release-production-verification` after a failed smoke until the failure is diagnosed. Each run bills 28 to 58 minutes.
- When a billing block appears, run the report above and give Tu the real figures. Do not guess.

## Measuring

The billing API needs a `user` token scope that agent tokens do not have, so usage is reconstructed from the runs:

```bash
node scripts/ci-usage-report.mjs --month 2026-09 --budget 9
```

It lists runs day by day (the API returns at most 1,000 results for a `created` filter), reads every job including re-run attempts, bills each job rounded up, skips skipped jobs and blocked jobs, and prices the total. It reports minutes left in the budget, how long the budget lasts at this month's average pace and at the last seven days' pace, and any day CI was blocked. Budget and plan are inputs because only the account owner can read them at github.com under Settings, then Billing.

The budget a month needs is `included + budget / rate` minutes, so a target of M minutes needs a budget of `(M - included) x rate`.

## When CI is blocked

1. Confirm the cause: the failed job has no steps and the annotation above. Anything else is a code failure.
2. Run the report to see how far over the month is and whether it will recur before the month ends.
3. Only the account owner can raise the budget or wait for the month to reset. Raising it without changing usage repeats the block within days.
4. After it is raised, rerun only the runs that matter. A rerun of a full pull request costs 20 to 40 minutes.

## Still open

These need a decision or a larger change.

- **GitHub Pro** includes 3,000 minutes and lists protected branches for private repositories (both per GitHub's plan documentation), and this repository currently has no branch protection. It costs less than the Free overage once monthly usage passes about 2,000 plus its monthly price divided by $0.006 minutes. The price was not verifiable from the pages checked; read it on the billing page. Only the account owner can change the plan.
- **`eas build --wait` occupies a runner while the store build runs**, up to the 240-minute ceiling. It has not run because the release gate has never passed.

## Limits

- The report is an estimate. It lands within a few percent of the Billing page and does not model storage charges or runs still in flight.
- A job that fails within ten seconds having run no steps is treated as a billing block. A genuine runner-startup failure looks the same and is billed by GitHub, so a small count is not conclusive; a cluster on one day is.
- The policy for a push to `main` can only be observed on a push to `main`. After any change to these workflows, compare the first run of each kind with `gh run list` and the report before trusting the estimates above.
