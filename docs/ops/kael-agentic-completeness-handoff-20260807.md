# Kael Agentic Completeness Handoff

This packet describes the repository implementation of the Kael measurement, evaluation, prompt-wiring, and operations backbone. It does not authorize deployment or mutation of a live Supabase project.

## Repository scope

The change set adds:

- structured idempotent customer and worker feedback, including mobile controls;
- a monthly estimate-accuracy view grouped by service and complexity;
- admin routes and a reference UI for the Kael escalation queue;
- deterministic, multi-turn, offline red-team, live-eval, live-red-team, and model-health tooling;
- bounded L2 job and L3 customer memory summaries plus existing knowledge summaries in prompts;
- environment-configurable durable AI spend caps;
- a 90-day `api_logs` cleanup schedule;
- best-effort PII-free operational alerts;
- charter p11, static AI disclosure, and a public charter screen;
- incident, model-health, and evaluation runbooks.

## Migration order

Apply only after explicit approval and environment preflight, one migration at a time in this order:

```text
20260807090000_kael_structured_feedback.sql
20260807091000_kael_estimate_accuracy.sql
20260807092000_kael_admin_queue_resolution.sql
20260807093000_api_logs_retention.sql
```

Before any hosted apply, run the exact local replay and SQL verification process described in `docs/ops/production-migration-checklist.md`. If local replay is unavailable, mark the migrations unverified and stop at the deployment boundary. Do not borrow staging or production to manufacture a green result.

Verification files:

```text
supabase/tests/kael_structured_feedback_verification.sql
supabase/tests/kael_estimate_accuracy_verification.sql
supabase/tests/kael_admin_queue_resolution_verification.sql
supabase/tests/api_logs_retention_verification.sql
```

## Environment names

Set values through the approved secret/configuration system, never in repository files:

```text
KAEL_AI_GLOBAL_DAILY_CAP_USD
KAEL_AI_USER_DAILY_CAP_USD
KAEL_AI_USER_MONTHLY_CAP_USD
KAEL_OPS_ALERT_WEBHOOK_URL
KAEL_EVAL_RUN_LIVE
KAEL_EVAL_MOBILE_API_URL
KAEL_EVAL_BEARER_TOKEN
KAEL_EVAL_ANON_KEY
KAEL_REDTEAM_RUN_LIVE
ANTHROPIC_API_KEY
DEEPSEEK_API_KEY
PERPLEXITY_API_KEY
```

The webhook is intentionally a no-op while its HTTPS URL is unset. The default spend caps are 30 USD globally per day, 1 USD per user per day, and 5 USD per user per month; operators should replace them only with reviewed numbers based on actual spend evidence.

## Post-deploy smoke order

1. Confirm the four migrations appear in hosted migration history in the same order.
2. Redeploy `mobile-api` from the reviewed commit.
3. Submit customer and worker feedback twice for the same response ID and confirm one row per actor/response pair.
4. Query the admin queue as an admin and confirm a non-admin receives 403.
5. Resolve a disposable queue fixture and confirm `resolved_by`, `resolved_at`, and the PII-free note.
6. Query estimate accuracy. Zero rows is valid before completed jobs exist; do not claim measured accuracy from an empty view.
7. Confirm the cleanup cron exists with a 90-day command.
8. Confirm unset alert webhook is a no-op, then test an approved webhook endpoint with a non-PII fixture.
9. Run deterministic evaluation, multi-turn evaluation, offline red-team, then the approved live staging commands.
10. Confirm the public charter returns `2026-08-06.p11` and both mobile surfaces show the static AI disclosure.

## Deliberately manual or external

The repository does not automatically:

- apply migrations to staging or production;
- deploy Edge functions;
- run paid live evaluation or live red-team in pull-request CI;
- choose or provision an alert provider;
- host the Next.js admin reference surface;
- change locked governance status files.

## Rollback

Use forward fixes for schema changes. To disable behavior quickly:

- unset the alert webhook;
- restore reviewed spend-cap values;
- use the existing Kael kill switch;
- rollback a learning rule through the existing admin workflow;
- revert the application commit and redeploy the prior `mobile-api` version.

Do not delete hosted migration history or manually remove production columns. Preserve feedback and queue audit records unless a separately reviewed retention or privacy action requires otherwise.
