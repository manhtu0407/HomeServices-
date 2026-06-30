---
name: kael-tdd
description: Test-driven workflow for the Home Services codebase. Use when implementing a feature, fixing a bug, or changing behavior, security, AI-boundary, or Supabase logic. Write the failing test first, implement the smallest change, verify a real pass, and cover at least two relevant test layers.
---

# kael-tdd

Auto-trigger wrapper. Full procedure is canonical in `protocols/tdd.md` (repo root) — do not duplicate it here.

When this fires:

1. Identify the public behavior and the correct test seam.
2. Write one failing test first (bugfix/feature logic), observe the red signal, implement the smallest change, observe green.
3. Cover at least two relevant layers (static/unit/integration/SQL/wiring/e2e/UI/security-negative). Negative tests are mandatory for security changes.
4. Test count is not a quality metric — layer coverage and failure relevance are. Build failure means not done.

Direct agent commands:

- Mobile static/unit: `pnpm type-check:mobile`, `pnpm test:mobile`.
- API static/unit: `pnpm type-check:api`, `pnpm test:api`.
- Shared static/unit: `pnpm type-check:shared`, `pnpm test:shared`.
- Whole repo gates: `pnpm type-check`, `pnpm test`, `pnpm build` only when the broader Turbo graph is required.
- React/React Native risk: add `pnpm doctor:react:changed`.

Prefer these root aliases over raw package binaries. They route through wrapper scripts that prepend the bundled Codex Node runtime, so agent shells can run tests directly even when `node`, `turbo`, `jest`, or `vitest` are not globally available.

Output:

```text
Behavior under test:
Test seam:
Red signal:
Implementation:
Green signal:
Layer coverage:
Limitations:
```
