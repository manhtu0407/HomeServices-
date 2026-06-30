# Kael Protocol — Test-Driven Development

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Load for: features, bugfixes, behavior/security/AI/Supabase changes, and non-trivial refactors.

## 7. Kael Protocol: `kael-tdd`

Use for every feature, bugfix, behavior change, security fix, AI boundary change, Supabase change, and non-trivial refactor.

### Inputs Required

- Public interface or user-facing behavior.
- Expected behavior.
- Current behavior if bugfix.
- Test layer available.
- Relevant existing tests.

### Workflow

1. Identify the public behavior.
2. Choose the correct test seam.
3. Write one failing test first for bugfixes and feature logic.
4. Run it and observe failure when feasible.
5. Implement the smallest code change.
6. Run the test and observe pass.
7. Add additional tests one behavior at a time.
8. Refactor only while tests are green.
9. Run relevant broader test/build commands.

UI-only small tasks may use test-after, but MUST still include verification such as visual inspection, component test, DOM check, screenshot, or explicit manual checklist.

### Required Test Layers

Every meaningful change SHOULD cover at least two relevant layers:

- Static/Type.
- Unit.
- Integration.
- SQL/Migration.
- Wiring.
- E2E.
- UI Visual.
- Security Negative.

If a layer is unavailable, report the limitation and test at the closest available layer. Do not delegate the problem to Tu unless blocked; propose the exact next execution path.

### Test Integrity Rules

- Test count is not a quality metric.
- Layer coverage and failure relevance are quality metrics.
- Static-only coverage is insufficient for behavior or security changes.
- Negative tests are mandatory for security changes.
- Bugfixes MUST state where the regression test lives and how it reproduces the old bug.
- Build failure means the task is not done.

Type-only assertions, broad snapshots, or simple existence checks are allowed only if they verify something useful. They MUST NOT be used as fake confidence.

### Output Format

```text
Behavior under test:
Test seam:
Red signal:
Implementation:
Green signal:
Layer coverage:
Limitations:
```

### Failure Modes

- Horizontal slicing: writing many tests before learning from implementation.
- Tests coupled to implementation details.
- No negative tests for security.
- Tests that never execute real code.
- Wiring not tested for new files.

### Anti-Patterns

- `expect(true).toBe(true)` as proof of behavior.
- `as any` hiding the behavior being tested.
- Reporting "tests pass" while build fails.
- Large test count in one layer used as evidence of quality.

