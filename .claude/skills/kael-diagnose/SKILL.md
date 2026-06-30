---
name: kael-diagnose
description: Diagnose and fix bugs, failing tests, build failures, runtime errors, performance regressions, or flaky behavior in the Home Services codebase. Use when something is broken, a test fails, a build breaks, or behavior is wrong, before patching. Forces a reproduce-first, hypothesis-driven fix with a regression test.
---

# kael-diagnose

Auto-trigger wrapper. Full procedure is canonical in `protocols/diagnose.md` (repo root) — do not duplicate it here.

When this fires:

1. Run `kael-preflight` (`critical.md` §5) before editing; obey gates in `critical.md` §3, §24, §25.
2. Read and follow `protocols/diagnose.md`: build a feedback loop, reproduce, rank 3-5 falsifiable hypotheses, add a regression test at the right seam, apply the smallest fix, rerun the original signal, remove `[DEBUG-kael-...]` instrumentation.
3. No local repro → say so and verify at the closest signal. Never report "fixed" without rerunning the failing signal.
4. Close with `kael-review` (`critical.md` §8).

Output:

```text
Feedback loop:
Reproduction:
Hypotheses:
Instrumentation:
Fix:
Regression test:
Verification:
Remaining risk:
```

## Red flags — stop and reproduce first

- Editing the fix before you can make the failure happen on demand.
- A single confident hypothesis with no alternatives ranked.
- "Probably this line" without a repro that confirms it.
- Reporting "fixed" without re-running the exact failing signal.
- Scoping the search too narrow (one dir/file) and concluding root cause from absence.

## Rationalization table

| Rationalization | Reality | Do instead |
|---|---|---|
| "I know what is wrong, just patch it." | A confident wrong guess patches the symptom and adds a regression. | Reproduce, rank 3-5 falsifiable hypotheses, fix the confirmed one. |
| "A grep over this folder found nothing, so it is the other layer." | A scoped grep proves absence only in that scope. | Widen the search to where the runtime actually lives before concluding. |
| "Tests are green now, must be fixed." | Green can mean the test never exercised the failure. | Re-run the ORIGINAL failing signal, not just the suite. |
| "No local repro, so I will guess." | Guessing without a loop is symptom-patching. | Say there is no repro and verify at the closest signal. |

## Baseline-fail scenario (documented)

A failing edge-router test (`access_check_in` → 400) was first attributed to "apps/api reference drift" from a grep scoped to `apps/api/src`. Reproduce-first tracing showed the test imports the EDGE router, which was behaving correctly (rejecting a stale `after`-stage payload per a security rule). The real fix was the stale test payload, not the runtime. Lesson: a scoped grep proves absence only in its scope — confirm the runtime path before naming a root cause. (Home Services P0 baseline.)
