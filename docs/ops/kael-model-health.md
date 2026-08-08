# Kael Model Health

The model-health tooling has two modes.

## Inventory mode

Inventory mode reads model IDs directly from the runtime routing configuration and performs no provider I/O:

```bash
node apps/api/scripts/kael-model-health.mjs --list
```

The admin route `GET /admin/kael-model-health` exposes the same configuration-level inventory to authenticated admins. It reports whether the matching provider key is configured, never the key value.

## Live mode

Live mode sends a minimal request to each configured provider route through the canonical `provider-client.ts` transport, so kill-switch, circuit-breaker, retry, timeout, pricing, and provider adapters remain in force. It requires provider credentials in process environment only:

```text
ANTHROPIC_API_KEY
DEEPSEEK_API_KEY
PERPLEXITY_API_KEY
KAEL_MODEL_HEALTH_TIMEOUT_MS
KAEL_MODEL_HEALTH_MAX_RETRIES
```

Run:

```bash
node apps/api/scripts/kael-model-health.mjs
```

Each request has a bounded timeout and at most two retries. `--self-test` exercises the same provider-client path with local provider-shaped responses and no external I/O; CI uses only that mode. This command costs provider tokens and is intentionally outside pull-request CI. Missing credentials must produce a clear non-zero exit rather than a false green.

## Operator response

When one route fails:

1. Confirm whether the failure is authentication, timeout, quota, model removal, or provider outage.
2. Check the circuit-breaker state and recent provider spend.
3. Keep the kill switch available for unsafe or unstable output.
4. Change routing only through reviewed configuration and rerun deterministic plus live evaluation before promotion.
5. Record the provider, model, failure class, start time, recovery proof, and commit SHA. Do not record prompts, user content, or credential material.
