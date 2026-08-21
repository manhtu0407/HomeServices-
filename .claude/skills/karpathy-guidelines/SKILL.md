---
name: karpathy-guidelines
description: Use when writing, reviewing, refactoring, debugging, or planning code. Reduces common LLM coding mistakes by forcing explicit assumptions, simple implementations, surgical diffs, and verifiable success criteria.
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

## Prompt Template

```text
Goal:
Scope:
Constraints:
Verification:
Risk:
```

`Goal` is an observable outcome. `Scope` names the files that may change and, when it matters, the files that may not. `Verification` is an exact command, not an intention.

## Close

Finish only after verification evidence exists. An unrun command in the `Verification` field means the task is not done — name the gate that did not run and why, and never infer a green signal from reading the code.
