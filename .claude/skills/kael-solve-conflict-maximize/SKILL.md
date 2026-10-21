---
name: kael-solve-conflict-maximize
description: Use at the close of any code, test, or bugfix task, and whenever you are about to write or edit a test, change a gate or its config, add a comment or a header to source, or say a check passed, is fixed, or was already failing. Blocks three shortcuts: weakening or skipping a test or changing a gate to turn it green, leaving comments or watermarks in production code, and reporting verification you did not observe. Canonical: governance/protocols/solve-conflict-maximize.md.
---

# kael-solve-conflict-maximize

Auto-trigger wrapper. The full procedure, the forbidden-move table, and the Claim→Evidence format are canonical in `governance/protocols/solve-conflict-maximize.md`. Do not restate them here.

This skill applies at the end of a task, not the beginning. Its job is to stop a green result that did not come from correct code.

## When it fires

- You are about to write or edit a test file, or any file in the protected surface (gates, workflow files, test configs, `settings.json`, hooks).
- A test is red and the fix you are about to make is in the test or in a gate, not in the code under test.
- You are adding anything to a file under `apps/`, `packages/`, or `supabase/functions/` that is a comment, a header, a note, or an attribution.
- You are about to write a final message containing "pass", "done", "fixed", "verified", "pre-existing", or a test count.

## The three rules

1. **Gates are the oracle.** Make the code correct, not the check green. Do not skip, delete, weaken, or snapshot-update a test to pass it. Do not edit a protected gate to pass it. If you must change a protected path, Tu approves it in chat, and it appears on its own line in the final report. After two code changes that leave the same gate red, stop and report the unedited output.
2. **No comments, no watermarks in production source.** On added lines in production code, write no comment token: no line comment, block comment, JSDoc, authority citation, or trailing comment. Put no AI, author, license, or generated-by marker in any source file. Do not split code across lines to make room for a comment.
3. **Only observed verification is reported.** Every claim in the final message maps to a command you ran, its exit code, and a count copied from its output. A bug is fixed only after the original repro passes again. "Pre-existing" needs a baseline on a clean tree. Every `file:line` you cite is checked in this turn. Anything not run goes under `Not run:`.

## Commands

```bash
pnpm lint:test-integrity --working
pnpm lint:added-hygiene --working
pnpm lint:comments --working
```

Exit `0` is clean, `1` means blocking findings, `2` means the checker could not run. A `2` is not a pass; name it.

## Honest limits

These checks catch what is visible in a diff. They do not catch a weak assertion that still runs real code, or a test that checks the wrong property well. Those are reviewer findings, and this skill does not claim to stop them.

## Close

Do not report a task as done until the Claim→Evidence block is filled. Its fields are the only place the result appears:

```text
Claims -> evidence:
Not run:
Pre-existing (baseline):
Gate or protected-surface changes:
Comments / watermark (lint result):
Stop-rule triggers:
```

An empty `Not run:` must say "none" and why. Do not claim done while a blocking finding is open, while a checker exited `2`, or while a claim has no evidence row.
