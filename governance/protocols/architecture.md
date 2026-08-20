# Kael Protocols — Architecture & Code Structure

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Contains `kael-architecture-deepening`, `kael-code-enhancement`, `kael-zoom-out`. Load before feature work, refactors, code enhancement/cleanup, or when entering an unfamiliar code area.

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

1. Map the relevant modules and callers with `kael-codebase-memory`, settling which runtime tree owns each symbol first — a caller count means nothing until you know whether the definition ships to users.
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
4. Search for an existing helper, pattern, schema, selector, or service method before adding a new one, using `kael-codebase-memory` for the search — a helper that exists only in `apps/api` is not one the Edge runtime can reuse.
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


## 13. Kael Protocol: `kael-zoom-out`

Use when the agent is unfamiliar with a code area, when a change crosses several modules, or when local edits would be risky without a higher-level map.

### Inputs Required

- Task request.
- Relevant directories/files.
- Current callers and imports.
- Domain workflow from `STRUCTURES.md`.

### Workflow

1. Step up one abstraction level before editing.
2. Map relevant modules and callers with `kael-codebase-memory`.
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
- Confusing prototype/admin surface with product surface. The cure is the `## Runtime ownership` step in `kael-codebase-memory`: 73 exported names are defined in both the Edge runtime and `apps/api`.

### Anti-Patterns

- Reading only the file named by the error.
- Refactoring before mapping callers.
- Using broad repo summaries instead of task-relevant maps.

