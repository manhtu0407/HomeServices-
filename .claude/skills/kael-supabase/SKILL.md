---
name: kael-supabase
description: Supabase workflow for NestScout. Use when changing the database, Auth, RLS, migrations, generated types, storage, realtime, seed data, edge functions, or Supabase clients. Add a new migration (never edit merged ones), regenerate types, and write positive and negative RLS tests per actor.
---

# kael-supabase

> Outranks the upstream `supabase` skill inside this repo. That one is a library / CLI / API
> reference; this one owns NestScout's workflow and the rules a change here must satisfy.

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/ai-data-security.md` — do not duplicate it here.

## CLI access for agents

Use the repo wrapper instead of raw `supabase`:

```powershell
pnpm supabase -- --version
pnpm supabase -- db --help
pnpm supabase:agent -- db query "select 1" --local
```

The wrapper runs the workspace CLI from `apps/api/node_modules/.bin/supabase`, falls back to `pnpm --filter @nestscout/api exec supabase`, and prepends the bundled Codex Node runtime when needed.

Before remote commands, check the target explicitly. This repo may be linked to production in `supabase/.temp/project-ref`; prefer `--local` unless Tu explicitly asks for linked/staging/production access. Do not print Supabase access tokens, service-role keys, DB passwords, or exact connection strings.

When this fires:

1. Read current schema + the generated types under `packages/shared/src/types/database/**` first.
2. Schema change → NEW migration (never edit old merged migrations); regenerate types whenever schema changes.
3. RLS positive AND negative tests for each relevant actor (customer/worker/admin); test constraints/triggers/indexes when touched.
4. Keep Supabase client/server code type-safe; apply `kael-security-sweep` for PII/auth/logging.

## Close

```text
Schema area:
Migration strategy:
Generated types:
RLS impact:
Actor tests:
Data integrity tests:
Limitations:
```

Migrations and RLS are proven against real Postgres. If the local stack did not start, say the SQL is unrun rather than reviewed-and-correct.
