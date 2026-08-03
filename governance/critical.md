# NestScout Critical Execution Contract

This file is a mandatory execution contract for AI coding agents working on NestScout.

It exists to help Codex, Claude Code, and any future AI coding tool execute with discipline. `design.md` provides the design execution contract for UI work. `CLAUDE.md`, `RULES.md`, and `STRUCTURES.md` provide project context and hard product/security rules. `AGENTS.md` provides the local workspace operating loop. `skills.md` and `.agents/skills/karpathy-guidelines/SKILL.md` provide AI Coding Agent skills for explicit assumptions, simple implementations, surgical diffs, and verification-driven execution. `.claude/MEMORY.md` stores the freshest session memory and MUST be read last. This file provides the operating skills, execution protocols, quality gates, and anti-patterns that agents MUST use while changing the codebase.

This file is locked. AI agents MUST NOT edit `critical.md` unless Tu explicitly requests that edit in the current conversation.

This file MUST stay in technical English. User-facing app copy remains Vietnamese as required by `RULES.md`.

> **Modularized 2026-05-29:** this contract keeps the universal activation contract, gates, `kael-preflight`, `kael-review`, forbidden behaviors, and the final checklist. Detailed per-task protocols now live in `protocols/*.md` and load on demand per §1. Section numbers are preserved; moved sections below redirect to their protocol file.

## 0. Agent Activation Contract

Every coding task, including small changes, MUST pass through this contract.

Before editing files, the agent MUST:

1. Read `critical.md`.
2. Read `RULES.md`.
3. Read `STRUCTURES.md`.
4. Read `design.md` when the task touches UI, frontend, prototype, visual design, motion, mascot, layout, design tokens, or component styling.
5. Read `AGENTS.md` for the local Codex/Claude Code workspace loop.
6. Read `CLAUDE.md` when the task is ambiguous, strategic, cross-cutting, or may conflict with project identity.
7. Read `skills.md`, or invoke the project-local `karpathy-guidelines` skill from `.agents/skills/karpathy-guidelines/SKILL.md`, before writing, reviewing, refactoring, debugging, or planning code. Whenever you write or edit code, the always-on `kael-core-hygiene` skill (canonical `protocols/code-hygiene.md`) is mandatory before adding any comment, header, or note; it is enforced by `pnpm lint:comments`, the comment-hygiene Stop hook, and the `comment-discipline` CI job.
8. Read relevant `docs/**/*.md`, `README.md`, and `Plan.md` sections only when they materially affect the task or contain current/deferred work.
9. Read the relevant code and tests before proposing or making changes.
10. Read `.claude/MEMORY.md` last for current session facts, dirty-worktree context, latest caveats, and handoff notes.
11. Classify the task.
12. Select the smallest sufficient protocol set.
13. State the selected protocols before editing.

For every task or mission, before task decomposition, the agent MUST apply `kael-subagent-orchestration` and record a `local` or `delegated` decision. This is a developer-agent decision gate, not authorization for product/runtime multi-agent orchestration.

The agent MUST distinguish:

- `Asked task`: what Tu literally asked for.
- `Real goal`: what the codebase actually needs to achieve safely.

If the asked task and real goal diverge, the agent MUST say so before implementation.

### Authority And Context Flow

The project docs are a supporting stack, not competing prompts:

1. `critical.md` controls execution discipline: preflight, protocol selection, review, and verification.
2. `RULES.md` controls non-negotiable product, security, AI, data, and runtime boundaries. These cannot be bypassed.
3. `STRUCTURES.md` controls workflow truth, service taxonomy, state machines, backend contracts, and "do not build now" boundaries.
4. `design.md` controls UI, motion, glass, prototype, and production visual contracts.
5. `AGENTS.md` controls local workspace expectations for Codex/Claude Code.
6. `Plan.md` applies only when the task continues that plan or references its deferred items.
7. `README.md` and `docs/**/*.md` provide progress history, durable decisions, feature contracts, and historical evidence.
8. `.claude/MEMORY.md` is read last and written back at session close (§3 Session Memory Gate). It provides the freshest AI-agent session memory. It does not silently override hard rules, locked docs, or code.

If `.claude/MEMORY.md` or a historical doc conflicts with the hard docs or current code, treat it as a freshness signal and ask Tu instead of guessing.

### Conflict Rule

If `critical.md` conflicts with `design.md`, `CLAUDE.md`, `RULES.md`, `STRUCTURES.md`, existing code, or Tu's current request, the agent MUST stop and explain:

- the current task,
- the conflicting instructions,
- the technical risk,
- 2-3 feasible options,
- the recommended option.

The agent MUST wait for Tu's approval before continuing. Security rules in `RULES.md` cannot be bypassed by convenience.

### Protocol Load Rule

Agents MUST avoid protocol overload.

Use:

- one primary protocol for the task type,
- mandatory supporting protocols,
- only the additional protocols that materially reduce risk.

Do not invoke every protocol just because it is available. Overloaded context creates distraction and worse code.

Protocol procedures are split across `protocols/*.md`. Load only the protocol files whose protocols you selected for this task; do not load all of them. `kael-preflight` (§5) and `kael-review` (§8) remain inline here because every task uses them.

For small tasks, protocol outputs MUST be short. A simple preflight or review should usually fit in 5-8 concise lines. For complex tasks, expand only the sections that reduce real risk.

When information is missing, ask focused questions until the task is clear. For alignment-sensitive work, ask one question at a time with a stated hypothesis and confidence level, then wait for Tu's reaction. For simple factual gaps, ask 1-3 concise questions and provide a recommended answer when possible.

### Always-On Delegation Gate: `kael-subagent-orchestration`

Apply this protocol before decomposing every task or mission. It requires a deliberate `local` or `delegated` decision; it does not require spawning subagents. Load `protocols/subagent-orchestration.md` for the canonical decision, scale, ownership, stop-condition, and integration rules.

### Agent-Skills Lifecycle

Use the distilled lifecycle from `addyosmani/agent-skills` without copying its repo structure:

1. Define: clarify the real goal, binding constraints, and explicit out-of-scope items.
2. Plan: split work into small verifiable slices with dependencies and acceptance criteria.
3. Build: implement one bounded slice at a time using existing project patterns.
4. Verify: prove behavior with tests, type-checks, smoke checks, screenshots, runtime output, or source citations as appropriate.
5. Review: check correctness, simplicity, architecture, security, performance, and documentation impact.
6. Ship: summarize changes, real verification, risks/limitations, and the next action.

For ambiguous intent, use the interview loop: `HYPOTHESIS -> CONFIDENCE -> ONE QUESTION -> RESTATE -> EXPLICIT YES`.

For non-trivial technical decisions, use the doubt loop: `CLAIM -> EXTRACT -> DOUBT -> RECONCILE -> STOP`. Reviewer output is data, not verdict. Reconcile it against the artifact and project contract.

### Required Pre-Edit Status

Before file edits, provide a short status:

```text
Asked task:
Real goal:
Task class:
Selected protocols:
Delegation decision:
Risk notes:
Verification plan:
```

For tiny tasks, keep this status short. Do not skip it.

## 1. Quick Protocol Index

Use this index when deciding what to run.

For UI, motion, glass, or other design tasks, route through `governance/design/runtime.md` first (the design router: design task-class → skill + preflight + gates), then apply the protocols below.

| If the task is... | Required protocols |
|---|---|
| Every task or mission | `kael-subagent-orchestration`, then the smallest sufficient task-specific protocols |
| Any coding change | `kael-preflight`, relevant primary protocol, `kael-review` |
| Bug, failing test, build failure, runtime failure | `kael-preflight`, `kael-diagnose`, `kael-tdd`, `kael-review` |
| Feature work | `kael-preflight`, `kael-architecture-deepening`, `kael-tdd`, `kael-review` |
| Code enhancement, reorganization, or cleanup | `kael-preflight`, `kael-code-enhancement`, relevant primary protocol, `kael-review` |
| UI-only small change | `kael-preflight`, read `design.md`, `kael-ui-rn-execution`, test-after or visual verification, `kael-review` |
| Refactor | `kael-preflight`, `kael-architecture-deepening`, `kael-tdd` when behavior may change, `kael-review` |
| Supabase, Auth, SQL, RLS, migrations, generated types | `kael-preflight`, `kael-supabase`, `kael-tdd`, `kael-security-sweep`, `kael-review` |
| AI provider, prompt, LLM output, price synthesis, worker brief | `kael-preflight`, `kael-ai-boundary`, `kael-tdd`, `kael-security-sweep`, `kael-review` |
| Security, PII, secrets, logging, rate limit | `kael-preflight`, `kael-security-sweep`, `kael-tdd`, `kael-review` |
| Architecture planning | `kael-preflight`, `kael-architecture-deepening`, `kael-clarify-with-docs` |
| Unfamiliar code area | `kael-preflight`, `kael-zoom-out`, then the relevant primary protocol |
| PRD/spec creation | `kael-to-prd`, `kael-clarify-with-docs` when missing decisions |
| Issue breakdown | `kael-issue-slicing` |
| Issue triage | `kael-triage` |
| Prototype | read `design.md` when visual/UI-related, `kael-prototype`, `kael-review` before absorbing into production |
| Long session or tool handoff | `kael-handoff` |
| Technical documentation | `kael-docs-execution` |
| Agent context setup missing | propose `kael-agent-context-setup` |


### Protocol Source Files

critical.md keeps `kael-preflight` (§5) and `kael-review` (§8) inline because every task uses them. All other protocols live in `protocols/` and load on demand:

| Protocol(s) | File |
|---|---|
| `kael-subagent-orchestration` | `protocols/subagent-orchestration.md` |
| `kael-diagnose` | `protocols/diagnose.md` |
| `kael-tdd` | `protocols/tdd.md` |
| `kael-architecture-deepening`, `kael-code-enhancement`, `kael-zoom-out` | `protocols/architecture.md` |
| `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep` | `protocols/ai-data-security.md` |
| `kael-ui-rn-execution` | `protocols/ui.md` |
| `kael-prototype`, `kael-clarify-with-docs` | `protocols/prototype-clarify.md` |
| `kael-to-prd`, `kael-issue-slicing`, `kael-triage`, `kael-docs-execution`, `kael-handoff`, `kael-compact-communication` | `protocols/docs-workflow.md` |
| dormant protocols | `protocols/dormant.md` |

Load a protocol file only when §1 selects its protocol for the current task class.

## 2. Task Classification Matrix

Classify every task before edits.

| Class | Examples | Default primary protocol |
|---|---|---|
| `bugfix` | broken behavior, failing tests, build failure | `kael-diagnose` |
| `feature` | new user-visible or internal capability | `kael-architecture-deepening` + `kael-tdd` |
| `ui` | screen, component, layout, copy, visual state | read `design.md` + `kael-ui-rn-execution` |
| `enhancement` | improve, reorganize, or clean up existing code without new product scope | `kael-code-enhancement` |
| `refactor` | behavior-preserving structure change | `kael-architecture-deepening` |
| `test` | adding/fixing tests, test infra | `kael-tdd` |
| `infra` | config, scripts, build, lint, env | `kael-preflight` + relevant protocol |
| `security` | secrets, auth, PII, RLS, logs | `kael-security-sweep` |
| `database` | schema, migration, seed, generated types | `kael-supabase` |
| `ai` | prompts, providers, wrappers, validation | `kael-ai-boundary` |
| `docs` | PRD, ADR, test report, handoff, issue body | `kael-docs-execution` |
| `review` | diff review, PR review, standards review | `kael-review` |

## 3. Core Quality Gates

These gates apply to all code changes.

### No False Completion

The agent MUST NOT claim the task is done if:

- relevant tests fail,
- `npm run build` fails when applicable,
- the implementation was not verified,
- a required protocol was skipped,
- the agent could not run verification and did not say so.

False success reports are forbidden.

### Required Final Response

After coding, final responses MUST include:

```text
Changed:
Verification:
Risks/Limitations:
Next Step:
```

For small tasks, each section may be one line. The verification section MUST only include commands actually run and their real results.

### Production-Ready Claim

The agent MUST NOT say "production-ready" unless:

- relevant tests pass,
- build passes when applicable,
- `kael-review` passes,
- no known critical limitation remains.

### Git Rule

The agent MUST NOT commit, push, open a PR, amend history, or run destructive git commands unless Tu explicitly requests it in the current conversation.

### Session Memory Gate

`.claude/MEMORY.md` is an output, not only an input. Reading it last (§0, §25) does not discharge this gate.

Where it is written: the full entry goes in `docs/memory/<YYYY-MM>.md` and exactly one line in the `.claude/MEMORY.md` Recall Index. Claude Code uses `/kael-mem`; Codex has no slash commands and follows the same steps by hand. The folder contract — naming, month rollover, what belongs, honesty rules — is `docs/memory/INDEX.md`.

Before reporting a session complete, the agent MUST write that entry, or state explicitly why no entry is needed, when the session produced any of:

- a decision Tu made, plus the rationale,
- a `Plan.md` section, phase, or track executed,
- a migration, deploy, or environment/tooling change,
- an honest gap, deferred item, or known-red state that the next agent would otherwise rediscover,
- a handoff between Claude Code and Codex.

A trivial single-file fix with no durable lesson needs no entry. When unsure, write it: a missing memory costs the next session far more than one extra line.

Memory entries obey the same honesty rule as verification above. Record only real commands, real results, and real gaps. Never write memory for work that was not done.

## 4. Survival and Scope Rules

NestScout is pre-revenue and rebuilding from zero. The current technical goal is quality execution that moves toward the first real transaction without building unnecessary systems.

### Survival Test

Every coding task MUST answer:

- Does this move the product closer to the first real transaction?
- Does it reduce risk for the current Kael Price Check flow?
- Does it protect code quality, security, or maintainability needed for the first transaction?
- Is it necessary now, or only at more than 10x current scale?
- Does it create data, workflows, or abstractions we can validate soon?
- Does it avoid technical satisfaction that does not serve the current phase?

Infrastructure work passes the survival test when it supports safe Phase 0/Phase 1 execution, testing, security, AI boundaries, Supabase correctness, or maintainability.

### Current Product Scope

Current service scope is only:

- electrical repair,
- plumbing repair,
- home cleaning / housekeeping,
- air conditioning and indoor air service,
- sofa, mattress, curtain, and carpet care,
- minor repair and installation,
- HCMC apartment residents,
- Kael as the primary AI assistant for intake, diagnosis, price analysis, worker briefing, and customer/worker workflow support.

The agent MUST NOT implement:

- service expansion beyond the six services above,
- multi-city expansion,
- raw-AI/client-side autonomous booking,
- multi-agent orchestration,
- custom memory system,
- web consumer product,
- L3/L4 autonomy outside the Tu-approved Kael Autonomy v2 server-side decision contract,
- meta-orchestrator systems.

If Tu asks for a scope-risk task, stop and discuss. If Tu explicitly approves, split the plan into small phases and proceed only within the approved scope. Hard security rules still apply.

### Current Runtime Boundary

The store-bound runtime path is:

```text
Expo React Native mobile app
-> Supabase Auth
-> Supabase Edge Function `mobile-api`
-> Supabase DB/RPC/Storage/Realtime
-> server-side AI and external providers
```

Runtime implications:

- `apps/mobile` is the primary customer/worker product.
- `supabase/functions/mobile-api` is the production mobile API boundary.
- `apps/api` is Next.js reference/parity/admin/support code unless Tu explicitly assigns a Next.js task.
- Mobile must not call AI providers directly, store server secrets, or bypass Edge for workflow-sensitive writes.
- Direct authenticated mobile Supabase access is read/bootstrap-oriented unless a documented contract explicitly permits a narrow write.

## 5. Kael Protocol: `kael-preflight`

Use for every coding task before editing files.

### Inputs Required

- Tu's request.
- `critical.md`.
- `RULES.md`.
- `STRUCTURES.md`.
- `AGENTS.md`.
- Relevant code/tests.
- `CLAUDE.md` when ambiguity or conflict exists.
- `.claude/MEMORY.md` last when the task is long-running, cross-cutting, continues prior work, or depends on current workspace state.

### Workflow

1. Identify asked task and real goal.
2. Classify the task.
3. Run scope check.
4. Run survival test.
5. Check "do not build now" risk.
6. Identify applicable rules from `RULES.md`.
7. Identify security, PII, AI, Supabase, and test impact.
8. Apply `kael-subagent-orchestration` and record the `local` or `delegated` decision.
9. Select protocols.
10. State verification plan.
11. Only then edit files.

### Output Format

```text
Asked task:
Real goal:
Scope:
Survival:
Applicable rules:
Selected protocols:
Delegation decision:
Security/PII notes:
Verification plan:
```

Keep this output short. Do not skip it for small tasks.

### Failure Modes

- Missing relevant context.
- Hidden scope expansion.
- Editing before protocol selection.
- Treating a support/admin prototype as the future mobile product.

### Anti-Patterns

- "This is small, no preflight needed."
- Starting implementation before reading relevant code.
- Ignoring `RULES.md` because the task appears harmless.
- Solving the literal request while missing the real goal.


## 6. Kael Protocol: `kael-diagnose`

> Moved to [`protocols/diagnose.md`](protocols/diagnose.md). Load it for bug, failing test, build/runtime failure, performance regression, or flaky behavior (§1). The full procedure there is canonical.

## 7. Kael Protocol: `kael-tdd`

> Moved to [`protocols/tdd.md`](protocols/tdd.md). Load it for features, bugfixes, behavior/security/AI/Supabase changes, and non-trivial refactors (§1). The full procedure there is canonical.

## 8. Kael Protocol: `kael-review`

Use after every code edit and before reporting completion.

### Inputs Required

- Fixed point: commit, branch, tag, or merge-base; state explicitly when reviewing uncommitted work instead.
- Exact diff command and commits included.
- Diff or changed files.
- Original request.
- Originating PRD, issue, spec, or an explicit `No spec available`.
- Relevant rules from `RULES.md`.
- Relevant workflow from `STRUCTURES.md`.
- Test/build results.

### Workflow

1. Pin the review surface before reading findings: `git rev-parse <fixed-point>`, `git diff <fixed-point>...HEAD`, and `git log <fixed-point>..HEAD --oneline` when a fixed point exists.
2. Locate the spec source from the request, linked issue/PR, commit messages, or relevant docs. If none exists, say so; do not invent requirements.
3. Review along three mandatory axes and keep the findings separate:

   1. Spec Compliance: did the change solve the real task?
   2. Rules/Standards Compliance: did it obey `RULES.md`, `STRUCTURES.md`, and `critical.md`?
   3. Long-Term Maintainability: is the code local, testable, simple, and easy to modify?

For standards, repository rules outrank the smell baseline. For maintainability, consider the following only as evidence-backed heuristics, not hard violations: mysterious names, duplicated code, data clumps or primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle men, and refused bequest. Skip concerns tooling already enforces.

Also check:

- scope creep,
- hidden autonomous action,
- AI boundary violations,
- PII/logging risk,
- test coverage gaps,
- dead code/wiring gaps,
- UI copy language,
- build/test honesty.

### Output Format

```text
Fixed point:
Spec source:
Spec compliance:
Rules/standards compliance:
Maintainability:
Scope creep:
Verification:
Required fixes:
```

### Failure Modes

- Reviewing only style.
- Ignoring product rules.
- Ignoring test limitations.
- Treating "lint passes" as a full review.

### Anti-Patterns

- "Looks good" without evidence.
- No mention of scope creep.
- No maintainability pass.
- No verification details.


## 9. Kael Protocol: `kael-architecture-deepening`

> Moved to [`protocols/architecture.md`](protocols/architecture.md). Load it before feature work, refactors, or when code is hard to test/understand (§1).

## 9A. Kael Protocol: `kael-code-enhancement`

> Moved to [`protocols/architecture.md`](protocols/architecture.md). Load it before enhancing, reorganizing, or cleaning up existing code (§1).

## 10. Kael Protocol: `kael-prototype`

> Moved to [`protocols/prototype-clarify.md`](protocols/prototype-clarify.md). Load it when a design question must be answered before production implementation (§1).

## 11. Kael Protocol: `kael-clarify-with-docs`

> Moved to [`protocols/prototype-clarify.md`](protocols/prototype-clarify.md). Load it when requirements, domain terms, or decisions are unclear (§1).

## 12. Kael Protocol: `kael-ai-boundary`

> Moved to [`protocols/ai-data-security.md`](protocols/ai-data-security.md). Load it for AI providers, prompts, price synthesis, vision, worker brief, and AI validation/logging/cost (§1).

## 13. Kael Protocol: `kael-zoom-out`

> Moved to [`protocols/architecture.md`](protocols/architecture.md). Load it for unfamiliar code areas or cross-module changes (§1).

## 14. Kael Protocol: `kael-supabase`

> Moved to [`protocols/ai-data-security.md`](protocols/ai-data-security.md). Load it for DB, Auth, RLS, migrations, generated types, storage, realtime, and edge functions (§1).

## 15. Kael Protocol: `kael-security-sweep`

> Moved to [`protocols/ai-data-security.md`](protocols/ai-data-security.md). Load it for secrets, PII, auth, logging, payment, booking, AI APIs, rate limits, input validation, and file uploads (§1).

## 16. Kael Protocol: `kael-ui-rn-execution`

> Moved to [`protocols/ui.md`](protocols/ui.md). Load it for UI work in the Expo RN app and Next.js support/admin/prototype surfaces; read `design.md` alongside (§1).

## 17. Kael Protocol: `kael-to-prd`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it when turning current context into a product/technical PRD (§1).

## 18. Kael Protocol: `kael-issue-slicing`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it when breaking a plan/PRD/feature/refactor into issues or slices (§1).

## 19. Kael Protocol: `kael-triage`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it when creating, evaluating, labeling, or preparing issues (§1).

## 20. Kael Protocol: `kael-docs-execution`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it for ADRs, PRDs, issue bodies, test reports, handoffs, and commit/PR descriptions (§1).

## 21. Kael Protocol: `kael-handoff`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it after long sessions, before compaction, or when switching between Claude Code and Codex (§1).

## 22. Kael Protocol: `kael-compact-communication`

> Moved to [`protocols/docs-workflow.md`](protocols/docs-workflow.md). Load it only when Tu asks for brief/low-token mode (§1).

## 23. Dormant Protocols

> Moved to [`protocols/dormant.md`](protocols/dormant.md). These MUST NOT auto-trigger; propose only when genuinely necessary (§1).

## 24. Forbidden Behaviors

These behaviors are forbidden because they create low-quality code, false confidence, or project risk.

### 1. Editing Before Protocol Selection

Risk: the agent writes code before understanding scope, test impact, or security constraints.

Prevention: run `kael-preflight` and state selected protocols before edits.

### 2. Lying About Verification

Risk: Tu believes the code works when tests/build were not run or failed.

Prevention: final response verification must list only real commands and real results.

### 3. Fixing Bugs Without a Feedback Loop

Risk: the agent patches symptoms or nearby code and creates regressions.

Prevention: use `kael-diagnose`. If no local repro exists, report limitation and closest available verification.

### 4. Building Outside Current Product Scope

Risk: pre-revenue rebuild wastes time on future systems.

Prevention: apply survival test and scope check. The approved scope is the six services in §4 (`RULES.md` #6) in HCMC only; stop for Tu approval on any scope beyond that.

### 5. Over-Engineering

Risk: complex abstractions slow the path to first transaction.

Prevention: use `kael-architecture-deepening`, deletion test, and smallest sufficient design.

### 6. Creating Shallow Modules

Risk: code looks organized but complexity is scattered across callers.

Prevention: prove leverage/locality before adding abstraction.

### 7. Fake Data or Silent Degrade

Risk: users receive fabricated prices, worker data, or success states.

Prevention: fallback is allowed; fake success is forbidden.

### 8. Raw AI Output to Users

Risk: invalid, off-topic, unsafe, or badly formatted AI content reaches customers/workers.

Prevention: structured output, schema validation, and user-facing templates.

### 9. Client-Side Secrets or AI Calls

Risk: keys leak into browser/RN bundles.

Prevention: all secrets and AI calls stay server-side.

### 10. PII in Logs

Risk: phone numbers, CCCD, address, bank data, or raw descriptions leak.

Prevention: use IDs, status codes, and safe metadata only.

### 11. Unvalidated Money-Impacting Autonomous Actions

Risk: booking, payment, cancellation, or scope change happens from raw AI output, mobile UI, client-side code, or missing policy evidence.

Prevention: enforce server-side `KaelAutonomyDecision` validation with policy id, evidence, confidence, reversibility/appealability, and audit trail at A7, A11, A12, and related states.

### 12. Turning Next.js Into the Consumer Product

Risk: the project drifts away from React Native primary architecture.

Prevention: Next.js remains support/admin/API/prototype. The consumer product is mobile app first.

### 13. Test Count Theater

Risk: many weak tests hide missing integration/security/runtime coverage.

Prevention: prioritize layer coverage, negative tests, runtime behavior, and honest limitations.

### 14. Leaving Temporary Debug Code

Risk: debug noise leaks PII, changes behavior, or pollutes logs.

Prevention: prefix temporary logs with `[DEBUG-kael-...]` and remove them before final.

### 15. Updating Locked Docs Without Permission

Risk: project memory changes without Tu's control.

Prevention: propose doc updates and wait for approval, except approved end-of-session progress/memory updates.

## 25. Final Agent Checklist

Before saying a coding task is complete, the agent MUST verify:

```text
[ ] Preflight was run.
[ ] Protocols were selected before edits.
[ ] Required docs were read in authority order.
[ ] `.claude/MEMORY.md` was read last when the task depended on current session context, dirty worktree state, prior handoff, or long-running work.
[ ] Relevant code and tests were read.
[ ] `design.md` was read for UI, frontend, prototype, visual, motion, mascot, layout, token, or component-styling work.
[ ] Scope and survival test passed or Tu approved exception.
[ ] RULES.md impact was checked.
[ ] Security/PII/AI/Supabase impact was checked when relevant.
[ ] Tests were added/updated when behavior changed.
[ ] Relevant tests were run.
[ ] Build was run when applicable.
[ ] kael-review was run.
[ ] Temporary debug code was removed.
[ ] Final response reports only real verification.
[ ] Session memory was written (`/kael-mem`, or by hand for Codex), or the §3 Session Memory Gate was declared not applicable.
```
