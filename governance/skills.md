# Karpathy-Inspired Coding Skills

Sources:

- https://github.com/multica-ai/andrej-karpathy-skills
- https://github.com/addyosmani/agent-skills

Purpose: project-local operating rules for AI coding agents working in this repo. These rules are adapted from Karpathy-inspired guidelines and the production workflow discipline in `addyosmani/agent-skills`, then tightened for Home Services: ship toward the first real transaction, avoid needless complexity, keep diffs small, and verify with evidence.

Use these skills whenever writing, reviewing, refactoring, debugging, or planning code changes.

## Agent-Skills Distillation

Use this lifecycle for non-trivial work: **Define → Plan → Build → Verify → Review → Ship**. The canonical step definitions live in `critical.md` §0 (Agent-Skills Lifecycle) — single-sourced there; this doc does not restate the full list.

Use these control loops when needed:

- Interview loop for unclear intent: `HYPOTHESIS -> CONFIDENCE -> ONE QUESTION -> RESTATE -> EXPLICIT YES`.
- Context loop for large sessions: load stable rules first, task-specific docs/code next, error output during iteration, and `.claude/MEMORY.md` last.
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
- Keep Kael scoped to the six approved Home Services: electrical, plumbing, cleaning/housekeeping, HVAC/indoor air, upholstery care, and handyman/minor installation only.

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

## Core Skill 5: Comment Discipline

Comments explain non-obvious WHY or warn about a trap — short, at the point they apply. Source code is not a changelog, a worklog, or a transcript of the session that produced it. Authorship lives in `git blame`; history in the commit message and `docs/`; the task in the PR.

Never bake into code: dates, phase/plan tags, status banners, audit/ticket codes, internal-doc references, AI self-attribution ("added by Claude/Codex"), request narration ("as requested"), first-person change narration, dead commented-out code, or changelog/narrative headers. Keep: architectural WHY, invariants/gotchas, JSDoc on public APIs, and authority citations (`// RULES.md #8`). The ban targets dated/status/plan-tag narrative and AI residue, not authority citations.

This skill is promoted to the always-on `kael-core-hygiene` skill (`.claude/skills/kael-core-hygiene`, `.agents/skills/kael-core-hygiene`). The full ban list (machine-enforced + judgment), before/after examples, and self-check are **canonical in `protocols/code-hygiene.md`** — do not duplicate them here.

Enforcement: `pnpm lint:comments` (`--diff`/`--working` ratchet), the `comment-hygiene` Stop hook (`.claude/hooks/verify-comment-hygiene.mjs`), and the `comment-discipline` CI job. Going-forward ratchet — legacy files are cleaned when next touched, not in one mass rewrite.

## Core Skill 6: Code Organization

One concept lives in one place; related code groups into cohesive, right-sized "chains." This is the permanent guardrail against the two failure modes the reorg pays down: god-files (one file owning a whole layer) and scattered duplicates (one concept declared across many files/runtimes).

Rules:

- One concept = one canonical home. Import it; never re-declare a type, contract, or constant across files or runtimes. Shared logic lives in `packages/shared`; Edge and mobile import it.
- Group by domain into cohesive modules. Never append a new concern to a catch-all god-file.
- Size is a guardrail, not a target. A file past ~600-800 lines, or one mixing unrelated domains, is a signal to split by domain first — but right-size to the domain (some modules are larger, some smaller). Do NOT fragment into many tiny uniform files; that recreates the mess. Success = understandable at a glance, not lines-per-file. (See `docs/architecture/code-ownership-map.md` §0.5 and the C1 target map.)
- A folder must earn its place as one chain. It is justified by ≥2 tightly-related files (they call each other, share state, or serve one workflow domain) or by a single file large enough (~400+ lines) to stand as its own domain. Do not create a folder for one small file, and do not split a file just to populate a folder — the folder boundary, not file count, is what is being right-sized.
- Position in a folder encodes role, replacing ad-hoc filename suffixes: `<domain>/index.ts` is the chain's public face — the only file an assembling factory imports; `policy.ts` (or `*-policy.ts`) is pure decision logic with no I/O — no `db`, no `fetch`, testable without mocks; `<domain>/<name>.ts` is internal to that chain; `_runtime/*` is shared infrastructure any domain may import. Drop the redundant `.service.ts` suffix — the folder already carries that meaning.
- No duplicated logic across runtimes (Edge vs Next.js vs mobile). Share one source via `packages/shared`.

Red flags — stop and find the home first:

- About to add a function/handler to `services.ts`, `router.ts`, or a `*-surfaces.tsx` god-file.
- Copy-pasting a type/interface/constant into a second file "so this layer has it too."
- Declaring an exported type name that already exists elsewhere.
- A new file already past ~800 lines, or one file owning two unrelated domains.

| Rationalization | Reality | Do instead |
|---|---|---|
| "It is faster to add it to the existing file." | The god-file is the cost the reorg is paying down; one more function deepens it. | Put it in (or create) the domain module; assemble via an index. |
| "I will re-declare the type here to avoid an import." | Re-declaration is how `KaelEstimate` reached 4 homes and 108 duplicate-type groups accumulated. | Import from the one canonical home (`packages/shared`). |
| "Splitting now is over-engineering." | Splitting by domain is right-sizing, not abstraction. | Split by cohesion; do not invent layers. |
| "Edge cannot import shared, so copy it." | Copying spawned a 628-line `domain.ts` clone. | Resolve the import (C2/OQ5); share, do not clone. |

Enforcement: `pnpm lint:structure` (`scripts/lint-structure.mjs`) is a CI ratchet that fails on a NEW oversized file, a grandfathered god-file that grows, a NEW cross-file duplicate exported type, or a flat source file at a reorg root — every module under `services/` and `kael/` must live in a domain folder, and only each root's `rootAllowlist` (`scripts/reorg-manifest.json`) may sit flat. Today's god-files and duplicate-type groups are grandfathered in `scripts/structure-baseline.json`; the reorg removes entries as it splits files and collapses contracts (regenerate intentionally with `node scripts/lint-structure.mjs --init`).

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
- Kael is the default workflow actor for intake, diagnosis, price analysis, matching, cancellation, scope, completion, dispute, and payment/refund decisions when server-side policy has enough data; raw AI output never mutates workflow status directly, and all Kael transitions must be schema-validated, audited, reversible/appealable where policy requires.
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
