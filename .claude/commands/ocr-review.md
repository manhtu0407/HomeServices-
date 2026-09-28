---
description: Review everything changed in this worktree and branch through OCR delegation — report only, no edits
allowed-tools: Read, Glob, Grep, Bash
argument-hint: "[--full] [--base <ref>]"
---

Review the whole change of this worktree and branch against `origin/main` as one snapshot: commits, staged and unstaged edits, and new files. OCR only selects files and rules; you do the review. Report findings. Do not edit files, and do not run `git commit`, `git stash`, `git checkout` or `git reset`. The flow keeps its snapshot objects in `.scratch/ocr/objects` and writes nothing to the repository's object database, refs, index or working files, so it also works where `.git` is read-only (Codex's sandbox).

Codex has no slash commands: follow these steps by hand.

## Steps

1. **Plan.** Run `node scripts/run.mjs run-node scripts/ocr-review.mjs plan --fetch $ARGUMENTS`.
   - `ocr` missing: stop and tell Tu to install the pinned version from `docs/ops/agent-tooling.md`. Do not install it yourself.
   - Any other failure: report the message verbatim and stop.
   - Default is incremental: only what changed since the last recorded review. `--full` reviews the whole branch again, and it is chosen automatically after a rebase, a branch switch or a merge of the base.
2. **Nothing new.** If the plan says "Nothing new to review", say so and stop. Still handle the "Not reviewed by OCR" list below.
3. **Review batch by batch, in order.** Run the batch's `diff:` command once (it prints the diff of every file in the batch; plain `git diff` cannot see the snapshot), then review only the changed lines against the batch's rule group and the `governance/RULES.md` rules that group cites. Read surrounding code when a finding depends on it. Do not review untouched code.
4. **Coverage.** Every file in the plan ends as `reviewed` or `skipped` with a concrete reason. Files under "Not reviewed by OCR" (Markdown, `.mts`, images) are not covered by OCR: check them by hand against `governance/critical.md` section 8, or state that they were not reviewed. Never leave a file unaccounted for.
5. **Report**, most severe first:

   ```text
   Findings:
   P1/P2 - file:line - issue, impact, required fix

   Coverage: total <n> / reviewed <n> / skipped <n> (<reason each>) / coverage_rate <r>
   Not reviewed by OCR: <files and whether you checked them by hand>
   Open questions:
   Residual risk:
   ```

   P1 is a bug, a security or data-loss risk, or a violation of a hard rule in `governance/RULES.md`. P2 is a real concern with a concrete fix. Drop style nits and anything the diff does not support. Line numbers refer to the new file. If no findings survive, say so explicitly.
6. **Record the review** only when coverage is complete: run the `mark` command printed at the end of the plan. It stores the reviewed snapshot so the next run starts from there. If you skipped files for lack of context, do not mark; tell Tu what is missing.

Fixing the findings is a separate step that Tu asks for.
