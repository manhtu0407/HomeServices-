---
name: kael-codebase-memory
description: Structural code discovery in NestScout — find a symbol, decide which runtime owns it when Edge and apps/api both define the same name, trace callers, judge blast radius, spot dead code, and settle on the smallest set of files worth reading before editing. Use when architecture or code ownership is unclear, before a refactor, or when deciding what to read. Works with Grep / Glob / Read on any machine; an indexing MCP server only makes the same method faster.
---

# kael-codebase-memory

Discovery is a method, not a tool. The steps below run with Grep, Glob, and Read — always available,
never wrong, only slower than an index. An indexing MCP server accelerates the same steps; it never
changes them and never becomes the authority. Read the layer map first:
`docs/architecture/code-ownership-map.md` names the owner file per layer, which is usually a faster
answer than any search.

## Runtime ownership

Four trees hold TypeScript and only one of them ships to users. Settle which tree owns the question
before naming a symbol, or the answer comes back confidently about code nobody runs.

| Tree | What it is |
|---|---|
| `supabase/functions` | The production mobile API on the Edge Deno runtime. This is what users hit. |
| `apps/api` | Next.js reference, parity, admin, support. **Never the mobile runtime.** |
| `packages/shared` | Contracts, constants, and generated DB types used by both. |
| `apps/mobile` | The Expo client. |

73 exported names are defined in **both** `supabase/functions` and `apps/api` — among them
`PLATFORM_FEE_WORKER`, `PRICE_DISCLAIMER`, `callAI`, `applyLearnedPriceRule`, `checkRateLimit`.
Editing the `apps/api` copy of a production symbol changes nothing for a user, and still type-checks.
So split hits by tree before reading any: `callAI` is 264 hits across the TypeScript trees but 15 in
`supabase/functions` once each tree is counted separately, and of the 243 in `apps/api`, 235 are
under `apps/api/src/__tests__/`.

## Workflow

1. **Bound the question.** Name the symbol, behavior, or table you are chasing and what decision the
   answer feeds. "Understand the module" is not a bounded question; "what writes `jobs.status`" is.
2. **Start at the boundary, not the leaf.** For Edge work the layering is `http/` → `domains/` →
   `kael/` → `platform/` (`docs/architecture/code-ownership-map.md`); enter at the layer that owns
   the concern. The outermost edge is a **string**, not a call: 47 dotted route keys such as
   `"kael.chat.create"` live under `supabase/functions/mobile-api/_shared/http/dispatch/`, and a
   search by function name never reaches them.
3. **Find the exact definition before reading anything.** Grep a definition-shaped pattern, never the
   bare word — the bare word matches every call site too.

   | Where | Pattern |
   |---|---|
   | TS / TSX | `export (async )?function <name>` or `export const <name> =` |
   | SQL | `^create (or replace )?function +(public\.)?<name>` |

   The `public.` is not optional in practice: this repo schema-qualifies every function and mostly
   writes `drop function if exists …` then a plain `create function …`, so a pattern assuming an
   unqualified name or `create or replace` returns nothing and reads as absence.

   **Inside `supabase/migrations/`, the last file by timestamp wins.** A function is redefined across
   many migrations — one atomic RPC is defined in 22 of them — and the first hit is a body replaced
   long ago. List every matching file, sort by name, take the tail, read that one. And if a
   definition appears in more than one tree, resolve `## Runtime ownership` before reading any.
4. **Trace callers outward one hop at a time.** Split the hits by tree first. Then grep the bare
   name, drop the definition file, and repeat on each caller until you reach a route handler, a test,
   or a migration. Stop at the hop that answers the question — a full transitive closure rarely is.
   Two things end a trace without announcing it:

   - **A barrel is not a caller.** 170 `export *` and `export { … } from` lines re-export symbols
     onward. When a hit is a re-export, the next hop continues from the barrel's own name, not the
     symbol's; counting it as a caller overstates reach and hides the real one.
   - **Grep does not cross a string edge.** TypeScript reaches SQL through `.rpc('<sql_name>')` —
     nine such names, including the atomic money RPCs — and reaches a handler through a dotted route
     key. Neither side shares an identifier with the other, so both are searched by hand or not at all.
5. **Judge blast radius before editing.** Count call sites, and check whether any live in
   `supabase/migrations/`, `supabase/tests/`, or `packages/shared` — a shared or SQL caller makes a
   local-looking change cross-package. Then look for the callers that import nothing: 77 test files
   under `apps/api/src/__tests__/` read source off disk and assert on its **text**, 100 of those reads
   pointing into `supabase/functions`. They break on an edit they never imported, so no caller trace
   surfaces them — grep the changed file's path, and a distinctive fragment of the changed line,
   against that directory. `PLATFORM_FEE_WORKER` is the shape of it: defined in
   `supabase/functions/_shared/contracts/common.ts` and `packages/shared/src/constants.ts`, held in
   agreement by a test comparing the two as strings.
6. **Suspect dead code, do not declare it.** No callers in source is a hypothesis; check tests,
   generated types, dynamic dispatch, and string-keyed lookups before calling anything dead.
7. **Cut the read set.** Name the smallest file list that answers the question and read those in
   full. Reading five whole files beats skimming thirty.

## Optional accelerator

If an indexing MCP server (`codebase-memory-mcp` or equivalent) is present in the session, its graph
tools map onto the same steps — `search_graph` for step 3, `trace_path` for steps 4-5,
`get_architecture` for step 2. Two standing constraints whenever it is present:

- Graph output is a lead, not proof. Verify anything load-bearing by reading the source.
- Never run an upstream installer that writes MCP config, skills, or hooks without Tu asking; never
  commit a graph artifact without approval.

What exists today is a machine-local `.mcp.json` under `.claude/` naming that server. It is
gitignored, so it is absent from a clean checkout, and its tools have not loaded in a session yet.
Treat the server as available only when its tools actually answer — never because a file mentions
it. Not depending on it is a decision rather than an oversight; nothing above waits on it.

## Close

```text
Question:
Owning runtime:
Entry point:
Definition:
Callers:
Blast radius:
Minimal read set:
Unresolved:
```

Structural search finds candidates; it does not prove behavior. Say which conclusions you confirmed
by reading source and which are still inferred from grep hits. Never call code dead on caller count
alone, and never report a definition without naming the tree it lives in — the same name in the
wrong tree is the most expensive way to be right. Pair with `kael-diagnose` for a failing signal and
`kael-wayfinder` when the question is which work to do rather than where the code is.
