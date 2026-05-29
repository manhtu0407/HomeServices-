# kael-doc-audit — Rubric & Red Flags (Home Services)

Adapted from Anthropic `claude-md-improver`, retargeted from "one CLAUDE.md" to the full governance stack.

## Scoring axes (100 total)

### 1. Protocol & Gate Coverage (20)
- `critical.md` §1 index maps every task class to a loadable protocol file.
- Core gates present: No False Completion, Required Final Response, Production-Ready, Git Rule, Forbidden Behaviors, Final Checklist.
- `kael-preflight` + `kael-review` inline in core.

### 2. Authority & Cross-Reference Integrity (20)
- Authority order consistent across CLAUDE.md / critical.md / RULES.md / AGENTS.md.
- Every `§N`, `protocols/X.md`, and file-path reference resolves.
- No conflicting instructions between docs. If found: STOP, surface to Tu, do not auto-resolve.

### 3. Drift vs Codebase (15)
- Service scope, runtime path, provider list, env-var names match code.
- Owner files named in `docs/architecture/code-ownership-map.md` still exist.

### 4. Duplication / Single-Source (15)
- Lifecycle canonical only in `critical.md` §0; runtime canonical `RULES.md` #0; scope canonical `RULES.md` #6.
- Safety invariants MAY repeat (defense-in-depth) but must never contradict.

### 5. Context Economy (15)
- `critical.md` core lean (target <= ~650 lines); protocol bodies live in `protocols/`, not the core.
- CLAUDE.md free of long restated process lists.

### 6. Skill Health (15)
- Each skill has `name` + a trigger-shaped `description`.
- Each kael-* skill points to a real `protocols/` section; output format matches the protocol.
- Skills mirrored in `.claude` (Claude Code) and `.agents` (Codex) where cross-agent parity is intended.

## Grades
A 90-100 / B 70-89 / C 50-69 / D 30-49 / F 0-29.

## Red Flags (instant deductions)
- A service category other than electrical / plumbing / cleaning anywhere in product scope.
- A money / booking / scope-change path without explicit-confirmation language.
- PII (phone, CCCD, address, bank) shown in a logging example.
- A protocol referenced in §1 with no source file.
- A skill body that copies a protocol instead of pointing to it.
- A locked doc changed with no approval trail.
- Hardcoded VND values in any doc example.
- "production-ready" claimed without tests + build + review.

## Report format

    ## Governance Health Report (kael-doc-audit)
    Stack files: X | Avg score: Y/100 | Files needing update: Z

    ### Per file
    #### <path> — NN/100 (Grade)
    | Axis | Score | Notes |
    Issues: [file:line — problem]
    Recommended: [fix]

    ### Consolidated drift list
    - [ ] ...

    ### Proposed edits (await Tu approval; locked docs need explicit per-change approval)
