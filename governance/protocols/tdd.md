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

1. Identify the public behavior and the independently knowable expected result.
2. Choose the highest viable public seam; test implementation details only when no higher seam can observe the behavior.
3. Write one failing test first for one narrow behavior (a tracer bullet).
4. Run it and observe the relevant red signal when feasible.
5. Implement the smallest code change that makes that behavior pass.
6. Run the test and observe green.
7. Repeat for the next behavior; do not batch a horizontal suite of imagined tests before learning from the previous cycle.
8. Refactor only while tests are green, then use `kael-review` for the maintainability pass.
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
- Expected values must come from a spec, known-good example, or other independent source; a test must not recompute the implementation's answer.
- Prefer assertions through the public behavior at the selected seam over mocks, private methods, or side-channel state.
- Static-only coverage is insufficient for behavior or security changes.
- Negative tests are mandatory for security changes.
- Bugfixes MUST state where the regression test lives and how it reproduces the old bug.
- Build failure means the task is not done.

Two test layers are valuable only when they cover distinct risk. For example, a unit test plus an integration/wiring check can prove more than two tests of the same internal helper. State why each selected layer is needed.

Type-only assertions, broad snapshots, or simple existence checks are allowed only if they verify something useful. They MUST NOT be used as fake confidence.

A text assertion over migration SQL is a ratchet, never a test layer. Matching a substring in a `.sql` file proves the string is in the file; it does not prove the migration ran, that a later migration did not drop the object, or that Postgres rejects a bad row. Anything a database enforces — constraints, RLS, grants, triggers, RPC atomicity — needs a script in `supabase/tests/` that exercises it against a real Postgres. Reading text stays correct for claims that are *about* text: application source (a banned call path must not reappear), config files, generated database types, and negative scans for committed secrets.

`supabase/seed.sql` is the same artifact class as a migration: `supabase db reset --local` replays it in CI, so what it produces is settled by running it, and only a committed credential or a real phone number still needs a reader.

Committed documentation is not a test layer either. Asserting that a `.md` file contains a sentence, a status banner, or a ticked checkbox proves the document says so; it fails when someone edits prose and stays green while the behaviour it names breaks. Markdown that the runtime *ships* is a different artifact — the Kael charter is read into the Edge system prompt and served by the public charter route, and the service playbooks are injected into model input — so comparing it byte-for-byte against the constant the runtime uses is a parity check, in the same family as generated database types.

For an artifact CI already executes — every script under `supabase/tests/` is run by `run-sql-tests.ps1` in the `database-controls` job — a text assertion is only worth writing when execution cannot prove the same thing. Rollback-only discipline qualifies, because a script that commits still passes when it runs; "the fixtures are valid" and "it emits a summary row" do not.

Whether reading source text counts at all depends on what else can reach the code. Under `supabase/functions` it does: Deno Edge code has no other layer available, so a substring is the only signal there is. Under `apps/mobile` it does not: React Native Testing Library mounts the real component, so a substring assertion is a weaker copy of a check that suite can already make — icon colour, stroke weight, row order and rendered copy are properties of a rendered node, not of a file. The one claim that stays a file read on either side is absence: removed code renders nothing, so only text can say a retired payment rail, a debug escape hatch, a static import that crashes at load, or a PII field never came back.

`scripts/find-artifact-text-assertions.mjs` enforces this and runs in the `harness manifest + skills-sync + structure ratchet` job. It classifies per case, resolves paths built from constants and helpers, and follows bindings sliced out of an already-tainted variable — every one of those exists because a hand-written sweep missed that shape.

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

