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

Project-local behavioral skill adapted from `multica-ai/andrej-karpathy-skills`.

These rules bias toward caution over speed. Use judgment for trivial one-line changes, but apply the full workflow for code that touches behavior, data, auth, payments, booking, AI, tests, or architecture.

## When To Apply

Use this skill before:

- Writing production code
- Reviewing code
- Refactoring
- Debugging
- Planning multi-step work
- Changing React, React Native, Next.js, Supabase, AI, auth, booking, or pricing paths
- Acting on broad quality signals such as React Doctor findings

## Principle 1: Think Before Coding

Do not silently guess. Surface assumptions.

Before implementing:

- State the real goal in one sentence.
- List assumptions that affect scope, data, security, UX, or architecture.
- If multiple interpretations exist, name them instead of picking silently.
- Push back when a simpler path reaches the same outcome.
- Stop and ask only when the missing answer materially changes the implementation.
- For this repo, evaluate work through: does this move us closer to the first real transaction?

Good agent behavior:

- "This could mean A or B. A is smaller and enough for now; B is heavier and only needed if..."
- "I can implement this, but it adds complexity that does not help the current phase. I recommend..."
- "This would put sensitive behavior in client code. The safer path is server-side."

Avoid:

- Hidden assumptions
- Confident implementation while confused
- Broad infrastructure for a narrow request
- Changing behavior before confirming the failure mode

## Principle 2: Simplicity First

Write the minimum code that solves the current problem.

Rules:

- No features beyond what was asked.
- No abstractions for a single use case.
- No speculative flexibility.
- No configuration layer until values actually vary.
- No defensive branches for impossible states unless they protect money, auth, secrets, booking, or user trust.
- If a 200-line solution can be 50 lines without losing clarity, simplify it.

Add complexity only when it:

- Removes real duplication already present in the codebase
- Protects a high-risk path
- Matches an established local pattern
- Makes verification easier

Home Services filters:

- Prefer plain TypeScript over clever architecture.
- Prefer existing Expo, Next.js, Supabase, Turbo, and workspace patterns.
- Prefer explicit data flow over magic.
- Keep Kael scoped to price check for electrical and plumbing.
- Ship toward the first real transaction, not theoretical scale.

## Principle 3: Surgical Changes

Touch only what the task requires. Clean up only your own mess.

Rules:

- Do not refactor unrelated code.
- Do not reformat files as a side effect.
- Do not rename symbols unless required.
- Do not remove pre-existing dead code unless asked.
- Do not rewrite comments or copy just because they look imperfect.
- Match local style even when another style is personally preferable.
- Every changed line must trace back to the user request or required verification.

When editing:

- Read nearby code first.
- Preserve public contracts unless the task is to change them.
- Keep module boundaries intact.
- If unrelated issues are discovered, report them separately.
- If user changes exist in the same files, work with them and never revert them.

Diff test:

- Can every changed line be explained in one sentence?
- Did the task require this file?
- Would this diff make sense to a reviewer focused only on the requested outcome?

## Principle 4: Goal-Driven Execution

Define success criteria and loop until verified.

For non-trivial work, define:

- Goal: observable outcome
- Scope: files or modules likely involved
- Success criteria: concrete checks
- Risk: what must not regress
- Verification: exact commands or manual checks

Preferred loop:

1. Reproduce or inspect current behavior.
2. Make the smallest useful change.
3. Verify with the narrowest relevant check.
4. Run broader checks when shared behavior is touched.
5. Report evidence, failures, skipped checks, and residual risk.

Transform vague tasks into verifiable goals:

- "Fix auth" becomes "Reproduce the auth symptom, add or adjust test, implement fix, run auth tests."
- "Add validation" becomes "Reject invalid input at the boundary, test invalid and valid paths."
- "Clean up mobile" becomes "Remove unused exports first, run type-check, then run React Doctor."
- "Make it faster" becomes "Measure current path, choose response time, throughput, or perceived speed, then fix one bottleneck."

## Anti-Patterns

Avoid hidden assumptions:

- Do not infer data scope, privacy rules, file formats, or delivery mechanisms without evidence.

Avoid over-abstraction:

- Do not introduce strategies, factories, registries, or plugin systems for one active use case.

Avoid speculative features:

- Do not add cache, notifications, retries, analytics, or generic config unless the request or existing system needs them.

Avoid drive-by refactors:

- Do not fix one bug and also rewrite adjacent validation, comments, types, formatting, or return flow.

Avoid vague verification:

- Do not say "tested" unless you can name the command and result.

## Home Services Addendum

Project constraints override generic advice:

- Primary client is React Native / Expo.
- Next.js is secondary: API routes and admin only.
- Service scope is electrical and plumbing only.
- Kael is AI Price Check only.
- User-facing text should be Vietnamese-first.
- No secrets in client code.
- No PII in logs.
- AI API calls go through centralized wrappers.
- AI output must be validated before reaching users.
- Price estimates require the project disclaimer.
- Network calls need timeout and bounded retry.
- Locked docs are not edited without explicit permission.

## Decision Protocol

Before editing:

1. What exactly is the user asking?
2. What is the smallest change that satisfies it?
3. What assumptions could be wrong?
4. Which files must change, and which files must not?
5. What command proves the change works?

While editing:

1. Keep the diff small.
2. Follow existing patterns.
3. Remove only unused code introduced by this change.
4. Preserve user work.
5. Avoid opportunistic cleanup.

Before final response:

1. Run relevant verification.
2. Read the output.
3. Report evidence, not confidence.
4. State warnings or skipped checks.
5. Suggest only concrete follow-up work.

## Prompt Template

```text
Goal:
[observable outcome]

Scope:
[files/modules likely involved]

Constraints:
- Keep changes surgical.
- Prefer the simplest working implementation.
- Follow existing project patterns.
- Do not touch unrelated files.
- Preserve user changes.

Verification:
[exact command or manual check]

Risk:
[what must not regress]
```

## Summary

Think first, build the smallest correct thing, touch only what is necessary, and finish only after verification evidence exists.
