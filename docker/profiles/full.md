# full profile — only when you need it

Everything the CLI starts by default, including the services the lean profile
excludes. Costs noticeably more RAM, which is the binding constraint on this
machine — do not make it the habit.

## Extra services

```text
studio      the web UI for browsing the local database
mailpit     catches outbound mail so you can read auth emails
realtime    websocket change feed
analytics   log aggregation (logflare + vector)
```

## When it is actually justified

- You need to **look** at local data and a psql query is genuinely harder.
- You are testing an **auth email** flow and need to read the message.
- You are testing **realtime subscriptions**, which the lean profile omits.

If none of those apply, use lean.

## Start it

```bash
node scripts/run.mjs docker/scripts/up --profile full
```

The doctor gate enforces **7 GB available RAM** for this profile. The floor has
no caller override. If RAM is low, the skill may perform one safe recovery pass
limited to exact stale task-owned helper/dev/test children, then one final
doctor. A second recovery or app/WSL/Docker-data cleanup is not authorized.

## Stop it

```bash
pnpm db:local:down
```

Same rule as lean: every `up` gets its `down`.
