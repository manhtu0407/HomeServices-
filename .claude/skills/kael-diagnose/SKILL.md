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
