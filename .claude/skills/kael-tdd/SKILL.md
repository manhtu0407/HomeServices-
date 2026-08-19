---
name: kael-tdd
description: Test-driven workflow for the NestScout codebase. Use when implementing a feature, fixing a bug, or changing behavior, security, AI-boundary, or Supabase logic. Write the failing test first, implement the smallest change, verify a real pass, and cover at least two relevant test layers.
---

# kael-tdd

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/tdd.md` — do not duplicate it here. Before writing a test file, read `governance/protocols/test-pillars.md`: it holds the pattern catalogue, the required `PILLAR` manifest, and the worked example to copy for each layer.

When this fires:

1. Identify the public behavior, an independently knowable expected result, and the highest viable test seam.
2. Work one tracer bullet at a time: write a failing behavior test, observe the relevant red signal, implement the smallest change, then observe green.
3. Cover at least two relevant layers only when they address distinct risk (static/unit/integration/SQL/wiring/e2e/UI/security-negative). Negative tests are mandatory for security changes.
4. Test count is not a quality metric — layer coverage and failure relevance are. Build failure means not done.

Direct agent commands:

- Mobile static/unit: `pnpm type-check:mobile`, `pnpm test:mobile`.
- API static/unit: `pnpm type-check:api`, `pnpm test:api`.
- Shared static/unit: `pnpm type-check:shared`, `pnpm test:shared`.
- Whole repo gates: `pnpm type-check`, `pnpm test`, `pnpm build` only when the broader Turbo graph is required.
- React/React Native risk: add `pnpm doctor:react:changed`.

Prefer these root aliases over raw package binaries. They route through `scripts/run.mjs`, which picks the PowerShell runner on Windows and the bash mirror everywhere else, so an agent shell can run them on any platform without `turbo`, `jest`, or `vitest` being globally available.

If a gate does not run, the task is not done. Name the gate that did not run and why; never infer a green signal from reading the code. A red-green loop with no observed red is not TDD.

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
