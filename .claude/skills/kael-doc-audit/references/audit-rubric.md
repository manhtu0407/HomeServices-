# kael-doc-audit — Rubric & Red Flags (Home Services)

Adapted from Anthropic `claude-md-improver`, retargeted from "one CLAUDE.md" to the full governance stack.

## Scoring axes (100 total)

### 1. Protocol & Gate Coverage (20)
- `governance/critical.md` §1 index maps every task class to a loadable protocol file.
- Core gates present: No False Completion, Required Final Response, Production-Ready, Git Rule, Forbidden Behaviors, Final Checklist.
- `kael-preflight` + `kael-review` inline in core.

### 2. Authority & Cross-Reference Integrity (20)
- Authority order consistent across CLAUDE.md / governance/critical.md / governance/RULES.md / AGENTS.md.
- Every `§N`, `governance/protocols/*.md`, and file-path reference resolves.
- No conflicting instructions between docs. If found: STOP, surface to Tu, do not auto-resolve.

### 3. Drift vs Codebase (15)
- Service scope, runtime path, provider list, env-var names match code.
- Owner files named in `docs/architecture/code-ownership-map.md` still exist.

### 4. Duplication / Single-Source (15)
- Lifecycle canonical only in `governance/critical.md` §0; runtime canonical `governance/RULES.md` #0; scope canonical `governance/RULES.md` #6.
- Safety invariants MAY repeat (defense-in-depth) but must never contradict.

### 5. Context Economy (15)
- `governance/critical.md` core lean (target <= ~650 lines); protocol bodies live in `governance/protocols/`, not the core.
- CLAUDE.md free of long restated process lists.

### 6. Skill Health (15)
- Each skill has `name` + a trigger-shaped `description`.
- Each protocol-wrapper kael-* skill points to a real `governance/protocols/` section; standalone audit/context/design skills may point to `references/` or a self-contained workflow instead.
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

## Design Stack Coverage (added 2026-05-29)

When auditing, also score the design docs:

- **governance/design.md core lean:** target <= ~400 lines; recipe/lab/palette/motion bodies live in `governance/design/`, not the core.
- **Reference index resolves:** every `governance/design/*.md` listed in governance/design.md "Design Reference Files" exists; every moved section (§3, §7, §9-§25) has a redirect stub.
- **Motion single source:** `governance/design/motion.md` is the only home for timing ranges; the `kael-motion` skill points to it, not a copy.
- **Recipes complete:** each screen recipe in `governance/design/screen-recipes.md` covers loading / empty / error / success + money-impacting confirmation where relevant.

### Design red flags (instant deductions)
- A service beyond electrical / plumbing / cleaning in any recipe or surface.
- A money-impacting screen recipe without explicit-confirmation language.
- A forbidden AI default (gradient orbs, bento-default, purple/blue AI gradient, card spam, fake stats) presented as allowed.
- English user-facing copy in a recipe example.
- Motion timing duplicated outside `governance/design/motion.md`.
- `governance/design.md` or `governance/design/` referencing a screen/file path that no longer exists.
