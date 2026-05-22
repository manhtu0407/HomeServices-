# Home Services Critical Execution Contract

This file is a mandatory execution contract for AI coding agents working on Home Services.

It exists to help Codex, Claude Code, and any future AI coding tool execute with discipline. `design.md` provides the design execution contract for UI work. `CLAUDE.md`, `RULES.md`, and `STRUCTURES.md` provide project context and hard product/security rules. `AGENTS.md` provides the local workspace operating loop. `skills.md` and `.agents/skills/karpathy-guidelines/SKILL.md` provide AI Coding Agent skills for explicit assumptions, simple implementations, surgical diffs, and verification-driven execution. `MEMORY.md` stores the freshest session memory and MUST be read last. This file provides the operating skills, execution protocols, quality gates, and anti-patterns that agents MUST use while changing the codebase.

This file is locked. AI agents MUST NOT edit `critical.md` unless Tu explicitly requests that edit in the current conversation.

This file MUST stay in technical English. User-facing app copy remains Vietnamese as required by `RULES.md`.

## 0. Agent Activation Contract

Every coding task, including small changes, MUST pass through this contract.

Before editing files, the agent MUST:

1. Read `critical.md`.
2. Read `RULES.md`.
3. Read `STRUCTURES.md`.
4. Read `design.md` when the task touches UI, frontend, prototype, visual design, motion, mascot, layout, design tokens, or component styling.
5. Read `AGENTS.md` for the local Codex/Claude Code workspace loop.
6. Read `CLAUDE.md` when the task is ambiguous, strategic, cross-cutting, or may conflict with project identity.
7. Read `skills.md`, or invoke the project-local `karpathy-guidelines` skill from `.agents/skills/karpathy-guidelines/SKILL.md`, before writing, reviewing, refactoring, debugging, or planning code.
8. Read relevant `docs/**/*.md`, `README.md`, and `Plan.md` sections only when they materially affect the task or contain current/deferred work.
9. Read the relevant code and tests before proposing or making changes.
10. Read `MEMORY.md` last for current session facts, dirty-worktree context, latest caveats, and handoff notes.
11. Classify the task.
12. Select the smallest sufficient protocol set.
13. State the selected protocols before editing.

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
8. `MEMORY.md` is read last. It provides the freshest AI-agent session memory and may be updated continuously. It does not silently override hard rules, locked docs, or code.

If `MEMORY.md` or a historical doc conflicts with the hard docs or current code, treat it as a freshness signal and ask Tu instead of guessing.

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

For small tasks, protocol outputs MUST be short. A simple preflight or review should usually fit in 5-8 concise lines. For complex tasks, expand only the sections that reduce real risk.

When information is missing, ask focused questions until the task is clear. For alignment-sensitive work, ask one question at a time with a stated hypothesis and confidence level, then wait for Tu's reaction. For simple factual gaps, ask 1-3 concise questions and provide a recommended answer when possible.

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
Risk notes:
Verification plan:
```

For tiny tasks, keep this status short. Do not skip it.

## 1. Quick Protocol Index

Use this index when deciding what to run.

| If the task is... | Required protocols |
|---|---|
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

## 4. Survival and Scope Rules

Home Services is pre-revenue and rebuilding from zero. The current technical goal is quality execution that moves toward the first real transaction without building unnecessary systems.

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
- HCMC apartment residents,
- Kael as the primary AI assistant for intake, diagnosis, price analysis, worker briefing, and customer/worker workflow support.

The agent MUST NOT implement:

- service expansion beyond electrical/plumbing/cleaning,
- multi-city expansion,
- autonomous booking,
- multi-agent orchestration,
- custom memory system,
- web consumer product,
- L3/L4 autonomy,
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
- `MEMORY.md` last when the task is long-running, cross-cutting, continues prior work, or depends on current workspace state.

### Workflow

1. Identify asked task and real goal.
2. Classify the task.
3. Run scope check.
4. Run survival test.
5. Check "do not build now" risk.
6. Identify applicable rules from `RULES.md`.
7. Identify security, PII, AI, Supabase, and test impact.
8. Select protocols.
9. State verification plan.
10. Only then edit files.

### Output Format

```text
Asked task:
Real goal:
Scope:
Survival:
Applicable rules:
Selected protocols:
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

Use for every bug, failing test, build failure, runtime failure, performance regression, flaky behavior, or "something is broken" task.

### Inputs Required

- User-reported symptom.
- Exact error output, logs, stack trace, or failing command.
- Relevant code paths.
- Existing tests.
- Reproduction environment details.

### Workflow

1. Build a feedback loop before fixing.
2. Reproduce the failure when possible.
3. Confirm the failure matches the user's actual symptom.
4. Generate 3-5 ranked falsifiable hypotheses.
5. Present hypotheses to Tu unless the change is low-risk and local.
6. Instrument one variable at a time.
7. Add a regression test at the correct seam before the fix when possible.
8. Apply the smallest fix.
9. Rerun original repro and relevant tests.
10. Remove temporary instrumentation.
11. Report the correct hypothesis and regression coverage.

### Feedback Loop Examples

- Failing unit/integration test.
- Repro command.
- Build command.
- HTTP/API script.
- Minimal UI interaction.
- SQL query against local Supabase.
- Loop for flaky reproduction.

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

For performance regressions: measure first, fix second. Do not optimize by intuition alone.

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

## 7. Kael Protocol: `kael-tdd`

Use for every feature, bugfix, behavior change, security fix, AI boundary change, Supabase change, and non-trivial refactor.

### Inputs Required

- Public interface or user-facing behavior.
- Expected behavior.
- Current behavior if bugfix.
- Test layer available.
- Relevant existing tests.

### Workflow

1. Identify the public behavior.
2. Choose the correct test seam.
3. Write one failing test first for bugfixes and feature logic.
4. Run it and observe failure when feasible.
5. Implement the smallest code change.
6. Run the test and observe pass.
7. Add additional tests one behavior at a time.
8. Refactor only while tests are green.
9. Run relevant broader test/build commands.

UI-only small tasks may use test-after, but MUST still include verification such as visual inspection, component test, DOM check, screenshot, or explicit manual checklist.

### Required Test Layers

Every meaningful change SHOULD cover at least two relevant layers:

- Static/Type.
- Unit.
- Integration.
- SQL/Migration.
- Wiring.
- E2E.
- UI Visual.
- Security Negative.

If a layer is unavailable, report the limitation and test at the closest available layer. Do not delegate the problem to Tu unless blocked; propose the exact next execution path.

### Test Integrity Rules

- Test count is not a quality metric.
- Layer coverage and failure relevance are quality metrics.
- Static-only coverage is insufficient for behavior or security changes.
- Negative tests are mandatory for security changes.
- Bugfixes MUST state where the regression test lives and how it reproduces the old bug.
- Build failure means the task is not done.

Type-only assertions, broad snapshots, or simple existence checks are allowed only if they verify something useful. They MUST NOT be used as fake confidence.

### Output Format

```text
Behavior under test:
Test seam:
Red signal:
Implementation:
Green signal:
Layer coverage:
Limitations:
```

### Failure Modes

- Horizontal slicing: writing many tests before learning from implementation.
- Tests coupled to implementation details.
- No negative tests for security.
- Tests that never execute real code.
- Wiring not tested for new files.

### Anti-Patterns

- `expect(true).toBe(true)` as proof of behavior.
- `as any` hiding the behavior being tested.
- Reporting "tests pass" while build fails.
- Large test count in one layer used as evidence of quality.

## 8. Kael Protocol: `kael-review`

Use after every code edit and before reporting completion.

### Inputs Required

- Diff or changed files.
- Original request.
- Relevant rules from `RULES.md`.
- Relevant workflow from `STRUCTURES.md`.
- Test/build results.

### Workflow

Review along three mandatory axes:

1. Spec Compliance: did the change solve the real task?
2. Rules/Standards Compliance: did it obey `RULES.md`, `STRUCTURES.md`, and `critical.md`?
3. Long-Term Maintainability: is the code local, testable, simple, and easy to modify?

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

Use before feature work, before refactors, and whenever code is difficult to test or understand.

### Required Vocabulary

Use these terms exactly:

- Module: anything with an interface and implementation.
- Interface: everything callers must know to use the module.
- Implementation: the code inside the module.
- Seam: where behavior can be changed without editing callers in place.
- Adapter: a concrete implementation at a seam.
- Leverage: value callers get from a small interface.
- Locality: maintainers can change/debug behavior in one place.
- Deep module: small interface hiding substantial behavior.
- Shallow module: interface nearly as complex as implementation.

### Inputs Required

- Target behavior or refactor goal.
- Current modules and callers.
- Existing tests.
- Relevant domain terms from `STRUCTURES.md`.
- Any ADR/rule/context docs if present.

### Workflow

1. Map the relevant modules and callers.
2. Identify current seams.
3. Look for shallow modules and pass-through abstractions.
4. Apply the deletion test.
5. Prefer deep modules with small stable interfaces.
6. Check testability at the interface.
7. Propose the smallest architecture change needed.
8. Split refactors into tiny steps where each step can build/test.
9. If code is hard to test because of architecture, stop and report the blockage before refactoring.

### Deletion Test

Before adding or keeping an abstraction, ask:

- If this module is deleted, does complexity disappear?
- Or does complexity scatter across callers?

If complexity only moves around, the abstraction is shallow.

Creating an interface with one adapter is allowed only with explicit justification. The agent MUST report it to Tu.

### Output Format

```text
Relevant modules:
Current seams:
Architecture friction:
Deepening opportunity:
Deletion test:
Testing impact:
Proposed steps:
Risks:
```

### Failure Modes

- Refactor for aesthetic "clean code."
- Creating hypothetical seams without justification.
- Large refactor steps that cannot be validated.
- Extracting pure functions that do not improve locality.

### Anti-Patterns

- Interface for one caller without explanation.
- Pass-through service modules.
- Refactor before understanding workflow.
- Architecture changes that do not improve testing or maintainability.

## 9A. Kael Protocol: `kael-code-enhancement`

Use before enhancing, reorganizing, cleaning up, or refactoring existing code. This protocol keeps Codex/Claude Code from scattering logic across routes, surfaces, providers, runtime services, and shared contracts.

### Inputs Required

- Tu's requested enhancement.
- `docs/architecture/code-ownership-map.md`.
- Relevant workflow section from `STRUCTURES.md`.
- Current owner files from the ownership map.
- Existing tests or static gates for the touched boundary.

### Workflow

1. Name the workflow step or cross-cutting concern.
2. Identify the touched layer: route, UI surface, provider/state, mobile API client, Edge runtime, shared contract, storage/media, notification, or test.
3. Read the owner files from `docs/architecture/code-ownership-map.md`.
4. Search for an existing helper, pattern, schema, selector, or service method before adding a new one.
5. Keep routes thin, surfaces visual, providers orchestration-focused, shared contracts centralized, and workflow-sensitive writes behind Edge.
6. Do not move logic across layers unless the reason and verification impact are stated.
7. Choose the narrowest test/static gate that proves the ownership boundary still holds.
8. If no owner exists, stop and propose a small ownership decision to Tu before creating a new structure.

### Output Format

```text
Workflow / concern:
Touched layer:
Owner files read:
Existing pattern reused:
Boundary risk:
Verification gate:
```

### Failure Modes

- Adding helpers before searching existing shared/provider/service files.
- Moving workflow-sensitive writes into UI, route files, or direct mobile Supabase calls.
- Adding route-level business logic.
- Creating a second source of truth for service scope, workflow status, copy state, or API response shapes.
- Refactoring because code "looks messy" without tying the change to a workflow owner and test gate.

### Anti-Patterns

- "Enhance code" with no workflow step named.
- "Clean up" that touches unrelated layers.
- Duplicating state selectors in UI components.
- Adding direct `fetch` calls to components instead of `apps/mobile/lib/services.ts`.
- Treating `apps/api` as the mobile runtime.

## 10. Kael Protocol: `kael-prototype`

Use when a design question must be answered before production implementation.

### Inputs Required

- Question the prototype must answer.
- Whether it is logic/state or UI.
- Where the production code will likely live.
- How the user will run/inspect the prototype.

### Workflow

1. State the prototype question.
2. Choose logic prototype or UI prototype.
3. Place prototype code near relevant code when useful, but mark it clearly as throwaway.
4. Keep state in memory unless persistence is the question.
5. Use one command to run.
6. Surface relevant state after each action.
7. Capture the learning.
8. Delete the prototype or absorb the validated part into production.

Prototypes may live in `src/` when useful, but MUST be clearly named as prototype/throwaway and MUST NOT be mistaken for production code.

### Output Format

```text
Prototype question:
Prototype type:
Location:
How to run:
What was learned:
Delete or absorb plan:
```

### Failure Modes

- Prototype becomes production accidentally.
- Prototype answers a different question.
- Too much polish.
- Persistence added without need.

### Anti-Patterns

- Leaving stale prototypes in production paths.
- Building a complete feature while calling it a prototype.
- No documented learning.

## 11. Kael Protocol: `kael-clarify-with-docs`

Use when the task has unclear requirements, fuzzy domain terms, conflicting assumptions, or architectural decisions.

### Inputs Required

- Tu's request or plan.
- `STRUCTURES.md`.
- Existing docs, ADRs, memory, and relevant code.

### Workflow

1. Explore code/docs first when the answer is discoverable.
2. Ask one focused question at a time when human judgment is needed.
3. Provide a recommended answer for each question.
4. Challenge fuzzy or overloaded terms.
5. Cross-check claimed behavior against code.
6. Propose doc updates when a new rule, term, or decision crystallizes.
7. Wait for Tu approval before editing locked docs.

### Output Format

```text
Open question:
Why it matters:
What code/docs say:
Recommended answer:
Decision needed:
```

### Failure Modes

- Interviewing Tu about things the code already answers.
- Asking broad open-ended questions.
- Updating locked docs without approval.
- Letting ambiguous terms survive into code.

### Anti-Patterns

- "What do you want?" with no recommendation.
- Ignoring domain vocabulary.
- Making silent assumptions about money, booking, or service scope.

## 12. Kael Protocol: `kael-ai-boundary`

Use when a task touches AI providers, prompts, prompt routing, price synthesis, vision analysis, advisory generation, worker brief generation, AI validation, AI logging, or AI cost tracking.

### Inputs Required

- AI boundary being changed.
- Provider(s): Anthropic, Perplexity, DeepSeek.
- Prompt version.
- Schema for structured output.
- Cost/budget impact.
- Fallback behavior.

### Workflow

1. Keep all AI calls server-side.
2. Route provider calls through `callAI()` or an approved wrapper above it.
3. Never import provider SDKs directly in routes/components.
4. Store prompt templates under `src/lib/ai/prompts/` when implemented.
5. Version prompts in code.
6. Require structured data first, prose second.
7. Validate all AI output crossing into user-facing UI with Zod or equivalent.
8. Track session cost before making the next provider call.
9. Enforce provider timeouts and retry limits.
10. Use fallback behavior without fake success.
11. Ensure logs contain only safe metadata.

### Mandatory AI Rules

- Price estimates MUST be structured data before prose.
- Price estimates MUST include the required disclaimer.
- No hardcoded VND price values in source code.
- Perplexity is for market pricing only.
- Anthropic handles vision/problem identification/synthesis.
- DeepSeek handles classification, simple FAQ, and lightweight pre-screening.
- Raw AI output MUST NOT be shown to users.

### Prompt Version Example

```typescript
export const KAEL_PRICE_SYNTHESIS_PROMPT_VERSION = "2026-05-13.v1";
```

### Output Format

```text
AI boundary touched:
Provider routing:
Prompt/version:
Structured schema:
Validation:
Fallback:
Cost tracking:
Tests:
```

### Failure Modes

- Prompt inline inside a random route.
- Parsing prose instead of structured output.
- Missing output validation.
- Missing budget tracking.
- Fake price data when provider fails.

### Anti-Patterns

- Direct SDK call in route/component.
- Client-side AI call.
- Hardcoded prices.
- Silent fallback.
- Raw LLM text shown to users.

## 13. Kael Protocol: `kael-zoom-out`

Use when the agent is unfamiliar with a code area, when a change crosses several modules, or when local edits would be risky without a higher-level map.

### Inputs Required

- Task request.
- Relevant directories/files.
- Current callers and imports.
- Domain workflow from `STRUCTURES.md`.

### Workflow

1. Step up one abstraction level before editing.
2. Map relevant modules and callers.
3. Identify the user/product workflow each module supports.
4. Identify likely seams and shared dependencies.
5. Summarize the smallest safe area to edit.
6. Continue with the relevant primary protocol.

### Output Format

```text
Area map:
Key modules:
Callers:
Workflow supported:
Safe edit area:
Next protocol:
```

### Failure Modes

- Editing a local file without knowing its callers.
- Missing a shared module.
- Confusing prototype/admin surface with product surface.

### Anti-Patterns

- Reading only the file named by the error.
- Refactoring before mapping callers.
- Using broad repo summaries instead of task-relevant maps.

## 14. Kael Protocol: `kael-supabase`

Use for every task involving Supabase database, Auth, RLS, migrations, generated types, storage, realtime, seed data, edge functions, or Supabase clients.

### Inputs Required

- Existing migrations.
- Generated `database.types.ts`.
- Affected tables/policies/functions.
- Actor roles: customer, worker, admin.
- Existing SQL/tests.

### Workflow

1. Read current schema and generated types.
2. Add a new migration for schema changes. Do not edit old merged migrations.
3. Update generated types whenever migration changes the schema.
4. Add or update seed data when needed.
5. Write RLS positive and negative tests for each relevant actor.
6. Test constraints, triggers, indexes, and function behavior when relevant.
7. Verify Supabase client/server code remains type-safe.
8. Apply `kael-security-sweep` for PII, auth, and logging.

### Required Tests

For migration/schema changes:

- RLS positive tests.
- RLS negative tests.
- Constraint tests.
- Trigger tests when triggers are touched.
- Generated type checks.
- Wiring tests when new modules/files are introduced.

### Output Format

```text
Schema area:
Migration strategy:
Generated types:
RLS impact:
Actor tests:
Data integrity tests:
Limitations:
```

### Failure Modes

- Editing old migration after merge.
- Schema changed but generated types stale.
- Admin path not tested.
- Customer can access another customer's data.
- Tests only grep SQL text without runtime confidence.

### Anti-Patterns

- RLS enabled but untested.
- No negative tests.
- Storing PII without classification.
- Using untyped Supabase clients.

## 15. Kael Protocol: `kael-security-sweep`

Use for any task involving secrets, PII, auth, logging, payment, booking, AI APIs, rate limits, input validation, file uploads, or database access.

### Inputs Required

- Changed files.
- Data touched.
- User inputs touched.
- Logs produced.
- Network/API calls.
- Storage/database paths.

### Workflow

1. Check secrets are server-side only.
2. Check no secrets in code, client bundle, logs, or git-tracked examples.
3. Check `.env.example` has names only, no values.
4. Check new secrets are added to env validation and deployment config.
5. Classify PII.
6. Ensure logs use IDs and metadata only.
7. Validate/sanitize all user input before DB or LLM.
8. Enforce timeout and retry rules for network calls.
9. Enforce rate limit and AI budget rules.
10. Verify security negative tests where behavior changed.

### PII Classification

| Data | Classification | Rule |
|---|---|---|
| Phone number | Sensitive PII | Never log full value. Scrub before LLM unless required. |
| CCCD images/numbers | Highly sensitive PII | Never log. Store only through approved secure flow. |
| Full apartment address | Sensitive PII | Do not log full value. Share only when job requires it. |
| Unit number/floor | Sensitive PII | Avoid logs and LLM unless necessary. |
| Worker bank account | Financial PII | Never log. Never send to LLM. |
| Exact worker/customer location | Sensitive PII | Never log exact coordinates/address. |
| Raw problem description | Potential PII | Do not log raw text if it may include phone/address. |
| API keys/tokens | Secret | Never expose, log, or commit. |

### Output Format

```text
Secrets:
PII:
Input validation:
Logging:
Network/timeouts:
Rate/cost limits:
Security tests:
```

### Failure Modes

- Logs include raw user text or address.
- Secrets appear in client code.
- Missing validation before LLM.
- No negative test for security behavior.

### Anti-Patterns

- "It is only a dev log."
- Swallowing security failures.
- Returning fake success when a provider or DB fails.
- Sending more PII to LLM than needed.

## 16. Kael Protocol: `kael-ui-rn-execution`

Use for UI work in the current Expo React Native app and in Next.js support/admin/prototype surfaces.

### Inputs Required

- Target surface: Expo React Native app, admin, prototype, or API support.
- User flow step.
- Copy requirements.
- Confirmation requirements.
- Verification method.
- `design.md` when the task touches visual design, layout, motion, mascot, design tokens, frontend styling, or prototype UI.

### Workflow

1. Confirm the surface is not turning Next.js into the consumer product.
2. Apply `design.md` before choosing visual direction, layout, tokens, motion, mascot treatment, or prototype structure.
3. For major screens or visual systems, run the `design.md` design lab before production build.
4. State skill adaptations from `design.md` before using generic design/frontend skills.
5. Use Vietnamese for all user-facing text.
6. Use terms from `STRUCTURES.md`.
7. Preserve explicit confirmation for booking/payment/scope changes.
8. Verify UI impact across related screens/components.
9. For small UI tasks, use test-after or visual/manual verification.
10. For React Native work, check mobile constraints and the Edge/mobile runtime boundary.

### Current Product Workflow Reference

Customer flow:

- A0 Auth.
- A1 Customer dashboard.
- A2 Problem chips.
- A3 Detailed description and media upload.
- A4 Kael clarification.
- A5 Price estimate card.
- A6 Time selection.
- A7 Customer confirms booking search.
- A8 Searching for worker.
- A9 Worker matched.
- A10 Active job and chat.
- A11 Scope change confirmation.
- A12 Completion confirmation.
- A13 Payment.
- A14 Worker rating.

Worker flow:

- B0 Worker registration and manual approval.
- B1 Admin approval required.
- B2 Worker home and availability.
- B3 Incoming job request with 60s accept countdown.
- B4 Job details after accept.
- B5 On-site status updates.
- B6 Scope change request.
- B7 Complete job.
- B8 Earnings.

Critical confirmations:

- A7 customer booking confirmation.
- B2 worker accept.
- A11 customer scope change confirmation.
- B5 worker completion signal.
- A12 customer completion/payment confirmation.

### Money-Impacting UI Rule

Any booking, payment, cancellation, or scope change UI MUST include explicit user confirmation. The UI MUST NOT auto-advance through money-impacting states.

Scope change A11 is a critical confirmation protocol:

- full-screen or equivalent hard-stop state,
- old scope vs new scope,
- old price reference vs new price reference,
- clear reason,
- continue or cancel,
- worker blocked until customer decision.

B2 worker accept countdown MUST later be tested for expiry and auto-decline behavior when implemented.

### Chat Relay Conduct Rule

Customer and worker chat content is relayed through Kael. Kael MUST NOT filter or rewrite normal customer/worker content. Kael may only intervene for safety, legal, security, abuse, or platform-protection cases. Kael system messages MUST be visually distinct from human messages.

### Current React Native Mobile Constraints

For React Native work, the agent MUST consider:

- small screen layout,
- slow network,
- image/video upload,
- push notifications,
- permission flows,
- offline-ish interruption handling,
- mobile keyboard behavior,
- accessibility/touch targets.

### Output Format

```text
Surface:
Workflow step:
User-facing copy:
Confirmation states:
design.md impact:
Skill adaptation:
Verification:
Related UI risk:
```

### Failure Modes

- English user-facing copy.
- Generic SaaS/Bento/web design default instead of `design.md`.
- Next.js becomes consumer web product.
- Auto-confirming money-impacting actions.
- UI change verified only in one narrow state.

### Anti-Patterns

- Marketing landing page instead of functional app surface.
- Using XanhSM as a copy target instead of a reference system.
- Hidden booking/payment side effects.
- Future-service entries shown without Tu's explicit approval.

## 17. Kael Protocol: `kael-to-prd`

Use when turning current context into a product/technical PRD.

### Inputs Required

- Current conversation context.
- Relevant codebase state.
- Product workflow from `STRUCTURES.md`.
- Constraints from `RULES.md` and `critical.md`.

### Workflow

1. Explore repo if needed.
2. Identify modules to build or modify.
3. Look for deep module opportunities.
4. Draft PRD in technical execution terms.
5. Publish to the project issue tracker when the tracker and tooling are configured.
6. If publishing is blocked by missing tooling/access, stop and report the exact blocker instead of silently keeping the PRD local.
7. Apply `ready-for-agent` state when using the issue workflow.

### Output Format

```text
Problem statement:
Solution:
User stories:
Implementation decisions:
Testing decisions:
Out of scope:
Further notes:
Issue/publish target:
```

### Failure Modes

- PRD contains stale file paths.
- PRD ignores current phase.
- PRD expands beyond electrical/plumbing/cleaning/HCMC.

### Anti-Patterns

- PRD as generic product essay.
- No testing decisions.
- No out-of-scope section.

## 18. Kael Protocol: `kael-issue-slicing`

Use when breaking a plan, PRD, feature, or refactor into issues or internal implementation slices.

### Inputs Required

- Source plan/spec.
- Current codebase state.
- Dependency graph.
- Acceptance criteria.

### Workflow

1. Break work into vertical slices.
2. Prefer AFK-ready tasks.
3. Each slice must be independently verifiable.
4. Each slice should cut through all necessary layers, not one horizontal layer.
5. Publish issues in dependency order when using issue tracker.
6. Keep parent issue unchanged unless Tu asks.

### Output Format

```text
Title:
Type: AFK or HITL
Blocked by:
User stories covered:
What to build:
Acceptance criteria:
Verification:
```

### Failure Modes

- Horizontal slices by layer only.
- Issues too large for an agent.
- No acceptance criteria.
- Hidden dependency between slices.

### Anti-Patterns

- "Build backend" then "build frontend" as separate blind slices.
- File-path-heavy issue bodies that stale quickly.
- No demoable outcome per issue.

## 19. Kael Protocol: `kael-triage`

Use when creating, evaluating, labeling, or preparing issues for agents/humans.

### Inputs Required

- Full issue body.
- Comments.
- Labels/state.
- Relevant code context.
- Prior triage notes.

### Workflow

1. Read full issue context.
2. Determine category: bug or enhancement.
3. Determine state: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix`.
4. For bugs, attempt reproduction before grilling.
5. Write an agent brief for `ready-for-agent`.
6. Ask specific questions for `needs-info`.
7. Add AI triage disclaimer to comments.

### Required Disclaimer

Any issue comment generated during triage MUST start with:

```markdown
> *This was generated by AI during triage.*
```

### Output Format

```text
Issue:
Category:
State:
Reasoning:
Codebase context:
Reproduction:
Recommended action:
Comment/brief:
```

### Failure Modes

- Triage without reading comments.
- Asking for generic "more info."
- Marking ready-for-agent without acceptance criteria.
- Filing implementation details that stale quickly.

### Anti-Patterns

- No reproduction attempt for bugs.
- No disclaimer.
- Multiple conflicting state labels.

## 20. Kael Protocol: `kael-docs-execution`

Use for technical execution documents: ADRs, PRDs, issue bodies, test reports, handoffs, commit/PR descriptions, implementation notes, and lessons learned.

### Inputs Required

- Document type.
- Source facts.
- Verification results.
- Intended reader: AI agent, Tu, future maintainer, or reviewer.

### Workflow

1. Write for future execution, not decoration.
2. Use concise technical English unless document is user-facing Vietnamese.
3. Capture decisions, constraints, tests, limitations, and next steps.
4. Do not edit locked docs unless Tu approved it.
5. For learned failures, store durable lessons in `docs/agent-lessons.md` rather than bloating README.
6. After large sessions, update `MEMORY.md` when new durable session memory, caveats, or handoff facts would help the next AI agent. Update README only at session end and only when progress-log rules allow it.

### Locked Files

These files require explicit permission during active work:

- `CLAUDE.md`
- `RULES.md`
- `STRUCTURES.md`
- `README.md`
- `critical.md`
- `design.md`

README may be updated only at session end for progress logging. `critical.md` and `design.md` may be edited only when Tu explicitly requests the specific edit.

### Output Format

```text
Document type:
Audience:
Facts captured:
Decisions:
Verification:
Limitations:
Next use:
```

### Failure Modes

- Docs that repeat source files without adding execution value.
- Hiding limitations.
- Updating locked docs mid-task without approval.
- Lessons buried in chat only.

### Anti-Patterns

- PRD without testing decisions.
- Test report without real command output.
- Handoff that duplicates existing artifacts instead of linking them.

## 21. Kael Protocol: `kael-handoff`

Use after long sessions, before context compaction, when switching between Claude Code and Codex, or when Tu requests a handoff.

### Inputs Required

- Current task status.
- Changed files.
- Commands run.
- Decisions made.
- Open risks.
- Next recommended action.

### Workflow

1. Summarize only what the next agent needs.
2. Reference existing artifacts instead of duplicating them.
3. Include protocols used and protocols likely needed next.
4. Include exact verification state.
5. Put the handoff section in the final response unless Tu asks for a file.
6. For large sessions, update `MEMORY.md` and README at session end according to lock rules and current dirty-worktree safety.

### Output Format

```text
Handoff:
Current state:
Files changed:
Commands run:
Decisions:
Risks:
Next protocols:
Next action:
```

### Failure Modes

- Handoff omits failing tests.
- Handoff hides assumptions.
- Next agent cannot resume without re-discovering context.

### Anti-Patterns

- Huge narrative summary.
- No file references.
- No verification state.

## 22. Kael Protocol: `kael-compact-communication`

Use only when Tu asks for brief/caveman/low-token mode or when final status must be extremely concise.

### Inputs Required

- User request for compactness.
- Technical facts that must not be lost.

### Workflow

1. Remove filler.
2. Keep exact technical terms.
3. Preserve warnings and irreversible action confirmations.
4. Resume normal clarity when compactness would create risk.

### Output Format

```text
Thing:
Action:
Reason:
Next:
```

### Failure Modes

- Too terse for safety.
- Dropping constraints.
- Omitting verification.

### Anti-Patterns

- Using compact mode to avoid explaining a risk.
- Compact final response without verification.

## 23. Dormant Protocols

Dormant protocols MUST NOT auto-trigger. The agent MAY propose them only when genuinely necessary.

### `kael-interface-design`

Source idea: deprecated `design-an-interface`.

Use only when a module interface is strategically important and multiple radically different API shapes should be compared before implementation.

Required output:

```text
Design A:
Design B:
Design C:
Comparison:
Recommendation:
```

### `kael-qa-session`

Source idea: deprecated `qa`.

Use only when Tu wants to report bugs conversationally and have the agent turn them into durable issues.

Required output:

```text
Reported behavior:
Expected behavior:
Reproduction:
Issue breakdown:
Issue links:
```

### `kael-refactor-plan`

Source idea: deprecated `request-refactor-plan`.

Use only for large refactors that need a separate planning conversation and tiny commit steps before coding.

Required output:

```text
Problem:
Solution:
Tiny steps:
Testing plan:
Out of scope:
```

### `kael-domain-language`

Source idea: deprecated `ubiquitous-language`.

Use only when domain language is confused enough to block implementation. Propose glossary updates, but do not edit locked docs without approval.

Required output:

```text
Term:
Definition:
Aliases to avoid:
Ambiguity:
Recommended canonical term:
```

### `kael-agent-context-setup`

Source idea: `setup-matt-pocock-skills`.

Use only when the repo is missing durable agent context for issue tracker workflow, triage labels, domain docs, or protocol discovery.

Inputs required:

- Current repo docs.
- Issue tracker location.
- Triage label vocabulary.
- Domain doc layout.
- Tu's approval for locked doc edits.

Workflow:

1. Explore existing docs and issue workflow.
2. Present what exists and what is missing.
3. Ask Tu for decisions one section at a time.
4. Draft the agent-context block and supporting docs.
5. Wait for approval before editing locked files.
6. Write only the approved setup.

Output format:

```text
Existing context:
Missing context:
Issue tracker:
Triage labels:
Domain docs:
Files to update:
Approval needed:
```

Failure modes:

- Creating duplicate agent instructions.
- Editing locked docs without approval.
- Assuming GitHub labels that do not exist.

Anti-patterns:

- Installing a generic workflow that does not match Home Services.
- Mixing product roadmap rules into execution setup.

### `kael-precommit-setup`

Source idea: `setup-pre-commit`.

Use only when Tu asks to configure commit-time checks. Do not add hooks or dependencies without approval.

### `kael-shoehorn-migration`

Source idea: `migrate-to-shoehorn`.

Use only when TypeScript tests need partial object fixtures and Tu approves adding `@total-typescript/shoehorn`.

### `kael-exercise-scaffold`

Source idea: `scaffold-exercises`.

Use only for course/exercise repositories. It is not part of normal Home Services execution.

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

Prevention: apply survival test and scope check. The approved 2026-05-19 scope is electrical, plumbing, and cleaning in HCMC only; stop for Tu approval on any scope beyond that.

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

### 11. Money-Impacting Autonomous Actions

Risk: booking, payment, cancellation, or scope change happens without user confirmation.

Prevention: enforce explicit confirmation at A7, A11, A12, and related states.

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
[ ] `MEMORY.md` was read last when the task depended on current session context, dirty worktree state, prior handoff, or long-running work.
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
```
