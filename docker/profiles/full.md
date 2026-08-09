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
powershell -NoProfile -ExecutionPolicy Bypass -File docker/scripts/up.ps1 -Profile full
```

The doctor gate still runs. Given the extra services, consider raising the floor
rather than lowering it:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File docker/scripts/up.ps1 -Profile full -MinRamGb 7
```

## Stop it

```bash
pnpm db:local:down
```

Same rule as lean: every `up` gets its `down`.
