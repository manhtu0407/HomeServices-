---
name: kael-backend-parity
description: Prove that deployed Edge code and the target database still agree. Use whenever a change touches supabase/functions, supabase/migrations, packages/shared contracts, or generated database types, and whenever the task is a deploy, a release, or a question about production being broken. Checks that every Postgres function the Edge code calls exists, then compares applied migrations and runtime identity against the repository.
---

# kael-backend-parity

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/backend-structure.md` §25 — do not duplicate it here.

Fires on **every** task whose change set touches a backend path, at every reach including `T`. The rule is `## Lane — by backend path` in `governance/protocols/work-router.md`. This skill may not appear in a `dropped:` line.

The invariant is deliberately narrower than "the repository matches production", because a repository always differs from production while a migration is being written, and an alarm that fires on ordinary work gets ignored:

> **Deployed Edge code must not reference database objects the target lacks.**

When this fires:

1. **Step 0, always** — `node scripts/check-edge-db-contract.mjs --emit-sql`, run the SQL against the target, then `--functions <file>`. One query, seconds, never a no-op. **Report the residue count**: names reaching `.rpc()` through a function parameter or object property cannot be resolved, and a partial scan presented as complete is silent degradation (`governance/RULES.md` #8).
2. **Migration surface** — continue only when the change touches `supabase/migrations/**`, or the task is a deploy, a release, or a production-broken question.
3. **Snapshot and compare** — `scripts/harness/parity-snapshot.mjs` against the public `/harness/health` endpoint plus the applied-migration list, then `scripts/harness/deployment-drift.mjs`. Pass `--environment` explicitly; deriving both sides from one response makes the environment check compare a value with itself.
4. **Classify** — a missing function **while the Edge function is deployed** is P0; the same finding with nothing deployed is ordinary work in progress. Missing migrations are P0; unknown remote migrations are a P1 replay hazard; a missing release ID or Git SHA is P1 configuration debt.

## Preconditions

The target is reachable through Supabase MCP or `pnpm supabase:agent`.

## Degraded lane

Run `pnpm harness:migrations:check`. It validates `config/harness/migration-inventory.json` against `supabase/migrations/**` entirely offline, so the repository half is still proven. Emit a debt record naming the target as unverified. A debt record, never a verdict.

## Close

```text
Edge-to-database contract:
Parity surface:
Lane:
Migration delta:
Identity:
Verdict:
```

A green report proves parity only for what was actually queried. When the runtime answers `registered: false`, identity was **not** verified — say so rather than rounding it to "matches", and say the RPC scan covered resolvable call sites only.
