---
name: kael-codebase-memory
description: Use codebase-memory-mcp as a small code-discovery helper for NestScout architecture, symbol lookup, caller/callee tracing, impact checks, and targeted snippets.
---

# kael-codebase-memory

Use codebase-memory-mcp as a lightweight map before opening files.

## Flow

1. `list_projects` / `index_status` to confirm the graph exists.
2. `get_graph_schema` or `get_architecture` to orient.
3. `search_graph` to find exact symbols.
4. `trace_path` for callers/callees/impact.
5. `get_code_snippet` after exact `qualified_name` is known.
6. Fall back to normal file reads for verification.

## Boundaries

- Graph output guides discovery; source code and NestScout docs remain authoritative.
- Do not run the full upstream installer or enable `auto_index` without Tu's explicit approval.
- Do not write hooks, MCP config, or `.codebase-memory/graph.db.zst` unless Tu asks.
