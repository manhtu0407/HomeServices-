---
name: kael-doc-audit
description: Audit and report on the Home Services governance stack (CLAUDE.md, critical.md, RULES.md, STRUCTURES.md, design.md, AGENTS.md, skills.md, protocols/, .claude/MEMORY.md, and the .claude/.agents skills) for drift, duplication, dead cross-references, scope creep, and context bloat. Use when the user asks to audit, check, or review the docs/rules/protocols/skills, or mentions "governance audit", "doc drift", or "project memory health". Reports a scored health report first; edits only after Tu approves (locked docs need explicit approval).
---

# kael-doc-audit

Adapted from Anthropic's `claude-md-improver` for the full Home Services governance stack (not just CLAUDE.md). Full rubric + red-flags: `references/audit-rubric.md` in this skill folder.

## Workflow

### Phase 1 — Discover
List the stack: `CLAUDE.md`, `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, `AGENTS.md`, `skills.md`, `protocols/*.md`, `.claude/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`, `docs/architecture/*.md`, `.claude/MEMORY.md`.

### Phase 2 — Assess
Score each axis 0-100 and grade A-F per `references/audit-rubric.md`. Cross-reference docs against the actual codebase and against each other.

### Phase 3 — Report FIRST (always, before any edit)
Output the health report: per-doc scores, a consolidated issue list with `file:line`, and recommended fixes. Do not edit yet.

### Phase 4 — Fix only after approval
Locked docs (`CLAUDE.md`, `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, `README.md`) need Tu's explicit approval per change. Non-locked docs still get a proposed diff before applying. Show diff, get a yes, then Edit.

## What to check (summary)
- **Drift**: file paths that no longer exist; `§N` cross-references that do not resolve; protocols referenced but missing.
- **Scope**: any service beyond electrical / plumbing / cleaning; any money/booking/scope-change path missing explicit-confirmation language.
- **Duplication**: lifecycle / runtime / scope blocks re-emerging verbatim outside their canonical home.
- **Skill <-> protocol coherence**: every protocol-wrapper kael-* skill points to a real `protocols/` section and its output format still matches; standalone audit/context/design skills may point to `references/` or their own workflow.
- **Context economy**: always-loaded files (CLAUDE.md, critical.md core) stay lean; protocol bodies do not creep back into the core.
- **Lock integrity**: no locked doc changed without an approval trail in a change log.

Single source of the rubric = `references/audit-rubric.md`.
