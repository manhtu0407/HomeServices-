---
name: kael-codebase-memory
description: UNAVAILABLE in this repo — requires the codebase-memory-mcp MCP server, which has no committed configuration; use Grep / Glob / Read instead. Once configured, it gives lightweight structural code discovery in NestScout. Trigger when exploring architecture, finding symbols, tracing callers/callees, checking impact, looking for dead code, or deciding which files to read before editing.
---

# kael-codebase-memory

> **Unavailable in this repo.** Every tool below comes from the `codebase-memory-mcp` MCP
> server, which is not configured: there is no committed `.mcp.json` at the repo root, and the
> `.claude/` variant is gitignored. Stop here and use Grep / Glob / Read instead.

## Preconditions

| Needs | Check | If absent |
|---|---|---|
| `codebase-memory-mcp` tools in the session | is `list_projects` callable? | Use Grep / Glob / Read. They answer every question below — slower, never wrong. Do not ask Tu to install the server; not depending on it is a decision, not an oversight. |

The absence is deliberate: importing an unvetted third-party MCP server that can write agent config
and hooks costs this repo more than the discovery speed returns. The workflow below applies only
once Tu decides otherwise. Even then it is a discovery accelerator, not an authority source.

## Workflow

1. Check index state with `list_projects` or `index_status`.
2. If the current repo is not indexed and Tu approved MCP setup, run `index_repository` for the repo root.
3. Start broad with `get_architecture` or `get_graph_schema`.
4. Find exact symbols with `search_graph` before reading files.
5. Use `trace_path` for callers, callees, dependency paths, and impact questions.
6. Use `get_code_snippet` only after `search_graph` returns the exact `qualified_name`.
7. Use `search_code` for text patterns inside indexed files when structural search is not enough.

## Guardrails

- Do not treat graph output as final truth; verify risky conclusions by reading source.
- Do not run the upstream full installer unless Tu explicitly asks; it can write MCP config, skills, and hooks.
- Keep `auto_index` off unless Tu asks for background indexing.
- Do not commit `.codebase-memory/graph.db.zst` unless Tu explicitly approves a shared graph artifact.
- If graph output conflicts with `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, or code, stop and surface the conflict.

## Preferred Tool Order

```text
list_projects
get_graph_schema
get_architecture
search_graph
trace_path
get_code_snippet
search_code
query_graph
detect_changes
```
