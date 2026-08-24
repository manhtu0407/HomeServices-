---
name: kael-backend-structure
description: Keep NestScout's backend structure from degrading as features are added. Use whenever a change touches supabase/functions, supabase/migrations, packages/shared contracts, or generated database types — adding, moving, refactoring, or a one-line edit. Decides which layer and owner file a change belongs to, blocks the structure from getting weaker, names the blast radius, and selects gates by what could break rather than by which folder was edited.
---

# kael-backend-structure

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/backend-structure.md` §24 — do not duplicate it here.

Fires on **every** task whose change set touches a backend path, at every reach including `T`. The rule is `## Lane — by backend path` in `governance/protocols/work-router.md`. This skill may not appear in a `dropped:` line.

Boundary against its neighbours: `kael-supabase` owns *how to change* the database; this skill owns *where code belongs and whether the structure held*; `kael-backend-parity` owns *whether deployed code and the target schema agree*.

When this fires:

1. **Placement** — Mode A for a new leaf (pick the layer among `http/ → domains/ → kael/ → platform/`, then the owner file from `docs/architecture/code-ownership-map.md`, then ask whether an existing `domains/` module or table already carries the fact). Mode B for a vertical slice: order the surfaces `database -> Edge domain -> both contract twins -> generated types -> consumers` and land them in that order.
2. **Weakening test** — 800-line cap, duplicate exported types, and `scripts/structure-baseline.json` untouched. **Never run `lint-structure.mjs --init`**; it re-grandfathers whatever oversize file was just created. Adding an enum value, status, phase, or table carries a reachability obligation: name the path that writes it and the paths that handle it.
3. **Blast radius** — Edge files, **both** contract twins, generated types, **`apps/api` by name every time**, and tests that assert string literals inside function bodies. `kael-codebase-memory` supplies the technique.
4. **Gates by risk, not by folder** — copy or string change → `test:api`; enum or constraint → `test:api`; RPC name or call site → `lint:edge-db` then `edge:check`; file size or exported types → `lint:structure` and `lint:baseline`; migrations → `harness:migrations:check`; contracts or shared types → `type-check:shared` and `test:api`.

## Close

```text
Placement (mode A/B):
Weakening test:
Reachability:
Blast radius:
Gates run:
Gates not run:
```

Name every gate that could not run and why; a gate that could not run is not a gate that passed. **"Nothing to report" is not a valid Close** — name the files actually inspected. May not call a backend change structurally sound when the risk-keyed gate did not run, or when `structure-baseline.json` changed without Tu approving it in the current conversation.
