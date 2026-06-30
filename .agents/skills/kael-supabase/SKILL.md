---
name: kael-supabase
description: Supabase workflow for Home Services. Use when changing the database, Auth, RLS, migrations, generated types, storage, realtime, seed data, edge functions, or Supabase clients. Add a new migration (never edit merged ones), regenerate types, and write positive and negative RLS tests per actor.
---

# kael-supabase

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/ai-data-security.md` — do not duplicate it here.

When this fires:

1. Read current schema + generated `database.types.ts` first.
2. Schema change → NEW migration (never edit old merged migrations); regenerate types whenever schema changes.
3. RLS positive AND negative tests for each relevant actor (customer/worker/admin); test constraints/triggers/indexes when touched.
4. Keep Supabase client/server code type-safe; apply `kael-security-sweep` for PII/auth/logging.

Output:

```text
Schema area:
Migration strategy:
Generated types:
RLS impact:
Actor tests:
Data integrity tests:
Limitations:
```
