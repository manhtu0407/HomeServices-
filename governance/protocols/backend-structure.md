# Kael Protocols — Backend Structure & Parity

Canonical body for `kael-backend-structure` (§24) and `kael-backend-parity` (§25). The two SKILL.md files are auto-trigger wrappers; this file is the procedure.

Both fire on every task whose change set touches a backend path, at every reach including `T`. The rule lives in `protocols/work-router.md` under `## Lane — by backend path`.

Neither protocol may close with "nothing to report". Always-on and always-ceremonial are one step apart, and a Close block that is reflexively empty teaches the reader that the check happened when it did not. `kael-backend-structure` names the files it actually inspected; `kael-backend-parity` runs a real query every time.

Ownership boundary against neighbouring protocols:

- `kael-supabase` (§14) owns **how to change** the database — migrations, RLS, generated types, actor tests.
- `kael-backend-structure` (§24) owns **where code belongs and whether the structure held**.
- `kael-backend-parity` (§25) owns **whether deployed code and the target schema agree**.
- `kael-security-sweep` (§15) still applies whenever the change reaches auth, PII, logs, or money.

---

## 24. Kael Protocol: `kael-backend-structure`

### Inputs Required

- The change set, or the intended change when nothing is written yet.
- `docs/architecture/code-ownership-map.md` for owner files.
- `governance/structures/backend-domain-model.md` for the module nouns.
- `scripts/structure-baseline.json` when the diff touches it.

### Workflow

#### Step 1 — Placement, in one of two modes

**Mode A — new leaf.** A new file, export, table, or RPC. Choose the layer before writing:

| The change is… | Layer |
|---|---|
| routing, dispatch, DTO validation, request parsing | `http/` |
| workflow read/write, DB/RPC/Storage, matching, notification | `domains/` |
| Kael pipeline, providers, guardrails | `kael/` |
| env, logging, other cross-cutting helpers | `platform/` |

Then the owner file from `code-ownership-map.md`. Then the two questions the linter cannot answer — `scripts/lint-structure.mjs` checks import *direction*, never cohesion:

- *New `domains/` module, or an existing one?* A new module needs a workflow noun that is not already one of the ten in `backend-domain-model.md`. If it maps to an existing noun, it belongs in that module.
- *New table or RPC, or reuse?* If an existing table already carries the same fact, reuse it. A table with writers and no readers is not a feature; it is debt with a cron job attached.

**Mode B — vertical slice.** The change crosses layers, as a new payment state or a new workflow step does. The ladder does not apply. Produce an ordered surface list and land the change in that order, so no layer is left referencing something that does not exist yet:

```text
database -> Edge domain -> both contract twins -> generated types -> consumers
```

Mode B is the mode for hard tasks. Answering "which layer" for a change that touches all four is how a vertical slice gets half-built.

#### Step 2 — Weakening test

1. Will any touched file cross **800 lines**? Split before committing.
2. Does the change add an exported `type` or `interface` name that already exists elsewhere?
3. Did `scripts/structure-baseline.json` change in this diff? **Stop and ask Tu.**
4. **Never run `node scripts/lint-structure.mjs --init`.** It regenerates the grandfather list from whatever is on disk, so it forgives the oversize file that was just created.
5. **Reachability obligation.** Adding an enum value, status, phase, or table means naming, in the Close block, the code path that *writes* it and the paths that *handle* it.

Point 5 is an obligation on the author, not a scanner, and the distinction is load-bearing:

- Measuring reachability from **production data** is invalid while the product is pre-revenue. The database declares eighteen `job_status` values and has observed seven; the eleven absent ones are an empty product, not dead code.
- Measuring it **statically after the fact** is too noisy to gate on. A prototype cleared sixteen of eighteen statuses and produced two false positives, because those two are written through RPC parameters rather than literal assignment. A gate that reddens valid code gets switched off.

The author, having just written the code, answers with certainty. Only the retroactive question is hard.

#### Step 3 — Blast radius

Name every surface the change reaches before editing:

- Edge files under `supabase/functions/mobile-api/_shared/**`.
- **Both contract twins** — `supabase/functions/_shared/contracts/**` *and* `packages/shared/src/contracts/**`.
- Generated types under `packages/shared/src/types/database/**`.
- **`apps/api`, by name, every time.** It is the one that gets skipped, and its tests assert `apps/mobile` source strings.
- Tests asserting **string literals inside function bodies**. Identifier scans are blind to them, so a deletion that looks unreferenced can still break a guard.

`kael-codebase-memory` supplies the discovery technique; this protocol supplies the checklist of what must be searched.

#### Step 4 — Gates, keyed by risk

Key on what could break, not on which folder was edited. A copy fix in a `domains/` file changes no line count and no type, so the structure gates say nothing about it, while the assertions that do cover it live in `apps/api/src/__tests__/`.

| The change alters… | Run |
|---|---|
| user-visible copy or any string literal | `test:api` |
| an enum, status, phase, or CHECK constraint | Step 2 obligation, then `test:api` |
| an RPC name, signature, or call site | `lint:edge-db`, then `edge:check` |
| file size, module layout, exported types | `lint:structure`, `lint:baseline` |
| migrations | `harness:migrations:check`, then `kael-backend-parity` |
| contracts or shared types | `type-check:shared`, `test:api` |
| access, capability, privileged client | `harness:access:check`, `harness:capabilities:check`, `harness:privileged:check` |

Name every gate that could not run, and why. A gate that could not run is not a gate that passed (`governance/critical.md` §3).

### Output Format

```text
Placement (mode A/B):
Weakening test:
Reachability:
Blast radius:
Gates run:
Gates not run:
```

### Failure Modes

- Answering "which layer" for a change that spans all four.
- Treating the 800-line cap as the whole weakening question, when unreachable states and reader-less tables are how this codebase actually rots.
- Running the structure gates on a copy change and calling it verified.
- Editing `structure-baseline.json` to make a gate pass.

### Anti-Patterns

- "It is one line, the structure cannot move."
- "`--init` will fix the baseline."
- "`apps/api` is reference code, it cannot be affected."
- Closing with "nothing to report" instead of naming what was inspected.

---

## 25. Kael Protocol: `kael-backend-parity`

The invariant is narrower than "the repository matches production", and deliberately so. A repository always differs from production while a migration is being written; treating that as drift makes every branch red and trains everyone to ignore the alarm. What must never be true is:

> **Deployed Edge code must not reference database objects the target lacks.**

### Inputs Required

- The target project and the environment the caller *intends* — stated, never inferred from the response being checked.
- Supabase MCP or `pnpm supabase:agent` for the migration list.

### Workflow

#### Step 0 — Edge-to-database contract check, always

```bash
node scripts/check-edge-db-contract.mjs --emit-sql
```

Run the emitted SQL against the target, save the function names, then:

```bash
node scripts/check-edge-db-contract.mjs --functions <file>
```

This is what makes always-on worth its cost: one query, seconds, and never a no-op. It resolves literal `.rpc("name")` call sites and names assigned to a local `const`, including ternary chains. A name arriving through a function parameter or an object property cannot be resolved and is printed as residue. **Report the residue count.** A partial scan presented as a full one is silent degradation (`governance/RULES.md` #8).

#### Step 1 — Migration surface

Continue only when the change touches `supabase/migrations/**`, or the task is a deploy, a release, or a question about production being broken.

#### Step 2 — Snapshot and compare

```bash
node scripts/harness/parity-snapshot.mjs \
  --health-url <project>/functions/v1/mobile-api/harness/health \
  --migrations <file> --environment <intended> \
  --out-remote <file> --out-release <file>
node scripts/harness/deployment-drift.mjs --release <file> --remote <file>
```

`/harness/health` is public and needs no auth. Pass `--environment` explicitly; deriving both sides from the same response makes the environment check compare a value with itself.

The health payload carries no migration-inventory digest, so that dimension reports as missing unless the target's registered release row supplies it through `--remote-inventory-sha`. Report it missing rather than substituting the manifest digest, which is a different hash and would manufacture a mismatch.

#### Step 3 — Classify

The drift gate reports facts. This protocol assigns severity.

| Finding | Means | Severity |
|---|---|---|
| Step 0 names a missing function **and** the Edge function is deployed | deployed code is ahead of the schema | **P0** |
| Step 0 names a missing function, nothing deployed yet | ordinary work in progress | note only |
| `remote is missing migrations` | half-applied deploy | **P0**, name the versions and what they contain |
| `remote has unknown migrations` | ledger divergence, such as one migration recorded under two versions | **P1** replay hazard |
| release ID or Git SHA missing | the runtime does not declare itself | **P1** configuration debt |

The first two rows are the whole point: severity comes from deployed-ahead-of-schema, not from repository-differs-from-production.

For a P0, name the absent objects and the endpoints that call them.

### Preconditions

The target is reachable through Supabase MCP or `pnpm supabase:agent`.

### Degraded lane

Run `pnpm harness:migrations:check`. It validates `config/harness/migration-inventory.json` against `supabase/migrations/**` entirely offline, so the repository half is still proven. Emit a debt record naming the target as unverified. This is a debt record, never a verdict.

### Output Format

```text
Edge-to-database contract:
Parity surface:
Lane:
Migration delta:
Identity:
Verdict:
```

### Failure Modes

- Reporting parity green when the runtime answered `registered: false`, which means identity was never checked.
- Reporting the RPC scan as complete without its residue count.
- Copying the environment from the health response and calling the environment check passed.
- Raising a P0 for a migration that was written on this branch and never deployed.

### Anti-Patterns

- "The repository and production differ, so something is broken."
- "The drift script exists, so drift is covered." It reads a file that nothing produced until `parity-snapshot.mjs` existed.
- Skipping step 0 because the change looked small.
