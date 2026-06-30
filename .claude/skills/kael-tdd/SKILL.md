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

## Red flags — stop and write the failing test first

- "I'll add the test after the change works." (test-after rationalizes the implementation, not the behavior)
- "It's a one-line fix, a test is overkill." (one-liners on money/auth/status are exactly where regressions hide)
- "The unit test passes, ship it." (no integration/negative layer = unproven against the real seam)
- Editing a money/auth/Supabase/AI path with zero new or changed test.
- Deleting or weakening an assertion to make the suite green.

## Rationalization table

| Rationalization | Reality | Do instead |
|---|---|---|
| "Mocks prove it works." | Mocks prove the mock works. 567 mocks once passed while a real status-override bug shipped. | Add one integration/SQL/wiring layer that hits the real seam. |
| "I saw it work manually." | Manual is not repeatable; the next change silently breaks it. | Encode the manual check as the failing test, then make it pass. |
| "Red-first is slower." | Skipping red means you never proved the test CAN fail — a test that cannot fail is theater. | Observe red, then green. |
| "Negative cases are edge cases." | For security/money/auth they ARE the spec. | Negative test is mandatory there. |

## Baseline-fail scenario (documented)

A `maybePromote` change passed every unit test (mocked DB). Only an integration test against a real Supabase instance caught that it overrode a status it should not have. Lesson: unit-green is not behavior-proven; the second layer (real-DB integration) is what caught the bug. (Memory: integration-caught-bug, mock-vs-real-tests.)
