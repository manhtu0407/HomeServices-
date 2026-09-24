---
name: karpathy-guidelines
description: Use when writing, reviewing, refactoring, debugging, or planning code. Reduces common LLM coding mistakes by forcing explicit assumptions, a reuse-before-build search, simple implementations, surgical diffs, and verifiable success criteria.
license: MIT
metadata:
  source: multica-ai/andrej-karpathy-skills
  source_url: https://github.com/multica-ai/andrej-karpathy-skills
  adapted_for: home-services
---

# Karpathy Guidelines

Auto-trigger wrapper adapted from `multica-ai/andrej-karpathy-skills`. The full procedure is canonical in `governance/skills.md` Core Skill 1-4 — think before coding, simplicity first, surgical changes, goal-driven execution — together with its Anti-Patterns, Decision Protocol, and operating addendum. Do not duplicate them here.

These rules bias toward caution over speed. Use judgment on a trivial one-line change; apply the full workflow to code that touches behavior, data, auth, payments, booking, AI, tests, or architecture.

## When To Apply

Before writing production code, reviewing, refactoring, debugging, or planning multi-step work — and on any change to React, React Native, Next.js, Supabase, AI, auth, booking, or pricing paths, or when acting on a broad quality signal such as React Doctor findings.

This skill governs the **shape of the artifact**: the smallest correct thing, the smallest diff, evidence instead of confidence. How the effort itself is spent — what to read, in which slice, with which skills — belongs to `kael-work-router`.

Before writing any new function, module, or dependency, run the Reuse-Before-Build Ladder canonical in `governance/skills.md` Core Skill 2: does it need to exist -> is it already in this codebase -> does stdlib/framework already provide it -> does the platform have a native feature for it -> does an installed dependency already cover it -> can a single-line/minimal form solve it -> only then write new code. `.claude/hooks/verify-reuse-ladder.mjs` (Claude Code Stop hook, `pnpm lint:reuse-ladder` for Codex) observes new exported symbols and reminds — it never blocks and cannot prove a search happened; the `Reuse check` field below is what actually carries the discipline.

If the ladder finds a candidate and you write new code anyway, that is debt, not a violation — record it in `docs/reuse-ladder-debt.md` with the reason. `pnpm audit:reuse-ladder` reports every exported function/class name declared in more than one file across the repo, for spotting duplication that already landed. Over-engineering review on a diff — did a change introduce speculative generality or an unneeded abstraction — already runs under `kael-review` (`governance/critical.md` section 8, Long-Term Maintainability axis); this skill does not duplicate that pass.

## Prompt Template

```text
Goal:
Scope:
Reuse check: [what you searched in the codebase/stdlib/native feature/dependency before writing new code, and what you found]
Constraints:
Verification:
Risk:
```

`Goal` is an observable outcome. `Scope` names the files that may change and, when it matters, the files that may not. `Reuse check` names where you searched before adding new code, even when the answer is "nothing found, wrote new code." `Verification` is an exact command, not an intention.

## Close

Finish only after verification evidence exists. An unrun command in the `Verification` field means the task is not done — name the gate that did not run and why, and never infer a green signal from reading the code. Reporting done with new code and no `Reuse check` is a skipped required protocol — the No False Completion gate (`governance/critical.md` section 3) already forbids that, and so is reporting done with an unlogged reuse candidate that was found and declined; this skill does not need a second gate.
