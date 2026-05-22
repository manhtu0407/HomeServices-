# Karpathy-Inspired Coding Skills

Sources:

- https://github.com/multica-ai/andrej-karpathy-skills
- https://github.com/addyosmani/agent-skills

Purpose: project-local operating rules for AI coding agents working in this repo. These rules are adapted from Karpathy-inspired guidelines and the production workflow discipline in `addyosmani/agent-skills`, then tightened for Home Services: ship toward the first real transaction, avoid needless complexity, keep diffs small, and verify with evidence.

Use these skills whenever writing, reviewing, refactoring, debugging, or planning code changes.

## Agent-Skills Distillation

Use this lifecycle for non-trivial work:

1. Define: clarify the real goal, user, success criteria, constraints, and explicit out-of-scope items.
2. Plan: break work into small verifiable slices with dependency order and acceptance criteria.
3. Build: implement one bounded slice at a time using existing repo patterns.
4. Verify: prove the change with real evidence, not confidence.
5. Review: check correctness, simplicity, architecture, security, performance, and documentation impact.
6. Ship: report changed files, verification, known risks, and next action.

Use these control loops when needed:

- Interview loop for unclear intent: `HYPOTHESIS -> CONFIDENCE -> ONE QUESTION -> RESTATE -> EXPLICIT YES`.
- Context loop for large sessions: load stable rules first, task-specific docs/code next, error output during iteration, and `MEMORY.md` last.
- Ownership loop for code enhancement: open `docs/architecture/code-ownership-map.md`, map workflow step to owner files, preserve layer boundaries, then choose the narrowest verification gate.
- Doubt loop for non-trivial decisions: `CLAIM -> EXTRACT -> DOUBT -> RECONCILE -> STOP`.
- Verification loop for every change: define evidence before editing, run the relevant check, read the output, and report only what actually happened.

Anti-rationalization rule: do not skip a step because the task "seems simple" if skipping it would make the result depend on hidden assumptions.

## Core Skill 1: Think Before Coding

Do not silently guess. Surface assumptions before implementation.

Checklist:

- State the real goal in one sentence.
- List assumptions that affect scope, data, security, UX, or architecture.
- If a request has multiple valid interpretations, name the options instead of choosing silently.
- Push back when a simpler path can reach the same business outcome.
- Stop and ask only when the missing answer changes the implementation materially.
- For this project, always evaluate through: "Does this move us closer to the first real transaction?"

Good behavior:

- "This could mean A or B. A is smaller and enough for now; B is heavier and only needed if..."
- "I can implement this, but it creates complexity that does not help Phase 0. I recommend..."
- "This touches client code and may expose secrets; we should move it server-side."

Bad behavior:

- Assuming hidden requirements.
- Building broad infrastructure for a narrow request.
- Hiding uncertainty behind confident implementation.
- Changing behavior before confirming the actual failure mode.

## Core Skill 2: Simplicity First

Write the minimum code that solves the current problem. Nothing speculative.

Rules:

- No features beyond what was asked.
- No abstractions for one use case.
- No "future flexibility" unless the current code already needs it.
- No configuration systems for values that are not yet variable in practice.
- No defensive branches for impossible states unless they protect money, auth, secrets, booking, or user trust.
- If a 200-line solution can be 50 lines without losing clarity, simplify it.

Complexity is allowed only when it buys something concrete:

- Removes repeated logic that already exists in multiple places.
- Protects a high-risk path: auth, payment, booking, AI response validation, PII, secrets.
- Matches an established local pattern.
- Makes verification easier, not harder.

Project-specific filters:

- Prefer boring TypeScript over clever architecture.
- Prefer existing Supabase, Expo, Next.js, and Turbo patterns.
- Prefer explicit data flow over magic.
- Prefer small functions over framework-like internal APIs.
- Keep Kael scoped to Home Services: electrical repair, plumbing repair, and home cleaning/housekeeping only.

## Core Skill 3: Surgical Changes

Touch only what the task requires. Clean up only the mess created by your own change.

Rules:

- Do not refactor unrelated code.
- Do not reformat files as a side effect.
- Do not rename symbols unless required by the task.
- Do not remove existing dead code unless explicitly asked.
- Do not rewrite comments or copy just because they look imperfect.
- Match local style even when another style is personally preferable.
- Every changed line must trace back to the user request or a required verification fix.

When editing:

- Read nearby code before changing it.
- Preserve existing public contracts unless the task is to change the contract.
- Keep file ownership boundaries intact.
- If unrelated issues are discovered, report them separately instead of fixing them opportunistically.
- If user changes exist in the same files, work with them; never revert them.

Diff quality test:

- Can every changed line be explained in one sentence?
- Did the task require touching this file?
- Would this diff still make sense if reviewed by someone focused only on the requested outcome?

## Core Skill 4: Goal-Driven Execution

Convert tasks into verifiable goals. Do not stop at "looks done."

For non-trivial work, define:

- Goal: what user-visible or system-visible outcome must be true.
- Scope: which files/modules are likely involved.
- Success criteria: concrete checks that prove the goal.
- Risk: what could regress.
- Verification: exact commands, tests, or manual checks.

Preferred loop:

1. Reproduce or inspect the current behavior.
2. Make the smallest useful change.
3. Verify with the narrowest relevant check.
4. Run broader checks if the change touches shared behavior.
5. Report what passed, what failed, and what remains risky.

Examples of stronger task framing:

- Instead of "fix auth": "Reproduce session bug, add/adjust test, implement fix, run auth tests."
- Instead of "add validation": "Reject invalid input at boundary, test invalid and valid paths."
- Instead of "clean up mobile": "Remove unused exports first, then run type-check and React Doctor."
- Instead of "make it faster": "Measure current path, pick response time, throughput, or perceived speed, then change one bottleneck."

## Anti-Patterns To Avoid

Hidden assumption:

- Bad: export all user data because user said "export".
- Better: clarify scope, fields, privacy, volume, and delivery mechanism.

Over-abstraction:

- Bad: strategy classes, factories, config layers for one calculation.
- Better: one function until multiple real variants exist.

Speculative features:

- Bad: cache, notifications, validation, merging, and audit log for a simple save request.
- Better: implement the requested save path; add extras when the product needs them.

Drive-by refactor:

- Bad: fix empty email and also rewrite username validation, comments, style, and return flow.
- Better: change only the empty-email path and its test.

Style drift:

- Bad: convert quote style, add types, add docstrings, and reorder code while adding logging.
- Better: add logging in the existing style and leave unrelated formatting alone.

Vague verification:

- Bad: "review code, improve, test."
- Better: "write failing test for X, implement Y, run Z, confirm no regression."

## Home Services Operating Addendum

These repo-specific constraints override generic coding advice.

Product:

- Primary client is React Native / Expo.
- Store-bound runtime is `Expo React Native -> Supabase Auth -> Supabase Edge Function mobile-api -> Supabase DB/RPC/Storage/Realtime -> server-side providers`.
- Next.js in `apps/api` is reference/parity/admin/support unless Tu explicitly assigns a Next.js task.
- Service scope is electrical, plumbing, and cleaning only.
- Kael is the primary AI assistant for intake, diagnosis, price analysis, worker brief, and support; Kael never performs booking, payment, cancellation, or worker punishment without explicit user/admin confirmation.
- Optimize for first real transaction, not architectural perfection.

Security:

- No secrets in client code.
- No PII in logs.
- AI API calls must go through centralized wrappers.
- AI output must be validated before reaching users.
- Price estimates must include the required disclaimer.
- Network calls need timeout and bounded retry.

Execution:

- Respect locked docs unless explicitly allowed.
- Keep user-facing copy Vietnamese-first.
- Prefer focused tests over broad rewrites.
- Mention unrelated quality issues, but do not fix them without scope.
- Use React Doctor as a quality signal, not as an excuse for blind refactors.

## Decision Protocol For Agents

Before editing:

1. What exactly is the user asking?
2. What is the smallest change that satisfies it?
3. What assumptions could be wrong?
4. What files must change, and which files must not?
5. What command proves the change works?

While editing:

1. Keep the diff small.
2. Follow existing patterns.
3. Remove only unused code introduced by this change.
4. Preserve user work.
5. Avoid opportunistic cleanup.

Before final response:

1. Run the relevant verification command.
2. Read the output.
3. Report evidence, not confidence.
4. State known warnings or skipped checks.
5. Suggest the next concrete step only if it naturally follows.

## Quick Prompt Template

When assigning work to an AI agent in this repo:

```text
Goal:
[observable outcome]

Scope:
[files/modules likely involved]

Constraints:
- Keep changes surgical.
- Prefer simplest working implementation.
- Follow existing project patterns.
- Do not touch unrelated files.
- Preserve user changes.

Verification:
[exact command or manual check]

Risk:
[what must not regress]
```

## One-Line Summary

Think first, build the smallest correct thing, touch only what is necessary, and finish only after verification evidence exists.
