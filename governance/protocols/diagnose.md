# Kael Protocol — Diagnose

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Load for: bug, failing test, build/runtime failure, performance regression, or flaky behavior (`bugfix`).

## 6. Kael Protocol: `kael-diagnose`

Use for every bug, failing test, build failure, runtime failure, performance regression, flaky behavior, or "something is broken" task.

### Inputs Required

- User-reported symptom.
- Exact error output, logs, stack trace, or failing command.
- Relevant code paths.
- Existing tests.
- Reproduction environment details.

### Workflow

1. Build a tight feedback loop before fixing.
2. Run it, reproduce the failure when possible, and confirm it matches the user's actual symptom.
3. Minimize the repro until every remaining step, input, and dependency is load-bearing.
4. Generate 3-5 ranked falsifiable hypotheses.
5. Present hypotheses to Tu unless the change is low-risk and local.
6. Instrument one variable at a time.
7. Add a regression test at the correct seam before the fix when possible.
8. Apply the smallest fix.
9. Rerun the original repro and relevant tests.
10. Remove temporary instrumentation.
11. Report the correct hypothesis, regression coverage, and any loop limitation.

### Feedback Loop Examples

- Failing unit/integration test.
- Repro command.
- Build command.
- HTTP/API script.
- Minimal UI interaction.
- SQL query against local Supabase.
- Loop for flaky reproduction.

### Feedback Loop Gate

Before testing hypotheses, record one exact command, script, or interaction that has already been run. It should be:

- **Red-capable**: exercises the reported symptom, not merely a nearby code path.
- **Deterministic**: produces the same verdict across normal reruns; for flakes, has a measured reproduction rate high enough to debug.
- **Fast enough to iterate**: narrow the setup or assertion before moving forward when practical.
- **Agent-runnable**: unattended unless the task is genuinely HITL.

If no such loop can be built, report what was tried and use the closest available signal. Do not present code-reading alone as a reproduction.

### Reproduction Minimization

After the signal turns red, remove inputs, calls, configuration, and data one at a time until the smallest reproducer remains. Use that minimized case for the regression test when the test seam is valid.

If a local repro is impossible, the agent may patch from code reasoning only when the final result is high-quality and verified by the closest available signal. The agent MUST clearly report the missing repro and remaining risk.

### Non-Deterministic Bugs

For flaky bugs, run repeated loops and report reproduction rate.

Example:

```text
Reproduction loop: npm test -- rate-limit
Runs: 30
Failures: 9
Rate: 30%
```

### Debug Instrumentation

Temporary debug logs MUST use a unique prefix:

```text
[DEBUG-kael-<short-id>]
```

All debug instrumentation MUST be removed before final response.

### Performance Rule

For performance regressions: record a baseline measurement, workload, and measurement command before changing code. Compare the same measurement after the fix; do not optimize by intuition alone.

### Output Format

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

### Failure Modes

- No feedback loop.
- Fixing a nearby bug, not the reported bug.
- Single-hypothesis anchoring.
- Leaving debug logs behind.
- Optimizing without measurement.

### Anti-Patterns

- "The cause is obvious" without repro.
- Reading code only and patching blindly when repro is feasible.
- Adding logs everywhere instead of targeted probes.
- Reporting fixed without rerunning the original failure signal.

