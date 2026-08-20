---
name: kael-codebase-memory
description: Structural code discovery in NestScout — find a symbol, trace its callers and callees, judge blast radius, spot dead code, and settle on the smallest set of files worth reading before editing. Use when architecture or code ownership is unclear, before a refactor, or when deciding what to read. Works with Grep / Glob / Read on any machine; an indexing MCP server only makes the same method faster.
---

# kael-codebase-memory

Discovery is a method, not a tool. The steps below run with Grep, Glob, and Read — always available,
never wrong, only slower than an index. Where an indexing MCP server is configured, it accelerates
the same steps; it never changes them and never becomes the authority.

Read the layer map first: `docs/architecture/code-ownership-map.md` names the owner file per layer,
which is usually a faster answer than any search.

## Workflow

1. **Bound the question.** Name the symbol, behavior, or table you are chasing and what decision the
   answer feeds. "Understand the module" is not a bounded question; "what writes `jobs.status`" is.
2. **Start at the boundary, not the leaf.** For Edge work the layering is
   `http/` → `domains/` → `kael/` → `platform/` (`docs/architecture/code-ownership-map.md`). Enter at
   the layer that owns the concern.
3. **Find the exact definition before reading anything.** Grep the symbol with a definition-shaped
   pattern (`function <name>`, `const <name> =`, `create (or replace )?function <name>`) rather than
   the bare word, which matches every call site too.
4. **Trace callers outward one hop at a time.** Grep the bare name, drop the definition file, and
   repeat on each caller until you reach a route handler, a test, or a migration. Stop at the hop
   that answers the question — a full transitive closure is rarely the question.
5. **Judge blast radius before editing.** Count call sites, and check whether any live in
   `supabase/migrations/`, `supabase/tests/`, or `packages/shared` — a shared or SQL caller makes a
   local-looking change cross-package.
6. **Suspect dead code, do not declare it.** No callers in source is a hypothesis; check tests,
   generated types, dynamic dispatch, and string-keyed lookups before calling anything dead.
7. **Cut the read set.** Name the smallest file list that answers the question and read those in
   full. Reading five whole files beats skimming thirty.

## Optional accelerator

If an indexing MCP server (`codebase-memory-mcp` or equivalent) is configured in the session, its
graph tools map onto the same steps — `search_graph` for step 3, `trace_path` for steps 4-5,
`get_architecture` for step 2. Two standing constraints if it is present:

- Graph output is a lead, not proof. Verify anything load-bearing by reading the source.
- Never run an upstream installer that writes MCP config, skills, or hooks without Tu asking; never
  commit a graph artifact without approval.

The server is not configured in this repo today, and not depending on it is a decision rather than an
oversight. Nothing above waits on it.

## Close

```text
Question:
Entry point:
Definition:
Callers:
Blast radius:
Minimal read set:
Unresolved:
```

Structural search finds candidates; it does not prove behavior. Say which conclusions you confirmed
by reading source and which are still inferred from grep hits — and never call code dead on caller
count alone.

Pair with `kael-diagnose` for a failing signal and `kael-wayfinder` when the question is which work
to do rather than where the code is.
