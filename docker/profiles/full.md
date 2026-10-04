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

Available RAM is reported for capacity context only. There is no minimum RAM
requirement for this profile; the doctor still checks daemon reachability,
free disk, and port availability. Resource failures from Docker itself remain
visible, and the runner does not retry automatically.

## Stop it

```bash
pnpm db:local:down
```

Same rule as lean: every `up` gets its `down`.
