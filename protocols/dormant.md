# Kael Protocols — Dormant

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

These MUST NOT auto-trigger. Propose only when genuinely necessary.

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

