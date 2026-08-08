# Kael Live Evaluation

Use deterministic evaluation for every pull request and live evaluation only against an explicitly approved local or staging target. Deterministic mode checks fixtures and local rules; it does not call a model and must never be presented as proof that Kael is correct in production.

## Deterministic gates

```bash
node apps/api/scripts/kael-eval.mjs --mode deterministic --report /tmp/kael-eval.md
node apps/api/scripts/kael-multi-turn-eval.mjs
pnpm --filter @nestscout/api exec vitest run kael-redteam
```

The multi-turn fixture covers all six launch services. It checks that answered slots are not asked again, one question is asked at a time, and each scenario reaches its bounded completion state within the declared turn budget.

## Live evaluation boundary

Required environment names:

```text
KAEL_EVAL_RUN_LIVE=yes
KAEL_EVAL_MOBILE_API_URL=<local or approved staging mobile-api URL>
KAEL_EVAL_BEARER_TOKEN=<short-lived test actor access token>
KAEL_EVAL_ANON_KEY=<staging publishable key when required>
KAEL_EVAL_REQUEST_TIMEOUT_MS=45000
```

Run:

```bash
KAEL_EVAL_RUN_LIVE=yes node apps/api/scripts/kael-eval.mjs --mode live --report /tmp/kael-eval-live.md
```

The script must fail when required variables are absent. Never silently fall back from live to deterministic mode.

## Live red-team

Required opt-in:

```text
KAEL_REDTEAM_RUN_LIVE=yes
```

Run:

```bash
KAEL_REDTEAM_RUN_LIVE=yes node apps/api/scripts/kael-live-redteam.mjs
```

The runner refuses the production project reference and accepts only local or the approved staging host. It must use a short-lived test identity. Do not put access tokens in files, shell history, issue comments, or test reports.

## Reading results

Record all of the following together:

```text
mode: deterministic | live
commit SHA
target environment
fixture count
failed case IDs
latency percentile
provider cost, when available
cleanup result
```

A deterministic 100% result means fixtures and local rules agree. A live result measures one configured target at one commit and does not replace production monitoring.
