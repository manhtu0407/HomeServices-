---
name: kael-handoff
description: Prepare a concise, safe handoff for long sessions, context compaction, Claude Code <-> Codex transfer, or explicit handoff requests. Use after substantial work, before switching agents, or when Tu asks for a handoff. Follows protocols/docs-workflow.md section 21 and adds artifact-linking, suggested-skills, and redaction safeguards.
license: MIT
metadata:
  source: mattpocock/skills handoff
  source_url: https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff
  adapted_for: nestscout
---

# kael-handoff

Auto-trigger wrapper. The canonical NestScout procedure is `protocols/docs-workflow.md` section 21 (`kael-handoff`) plus `critical.md` section 8 (`kael-review`). Do not duplicate large artifacts here.

Use this when:

- a session is long or likely to compact,
- work is moving between Claude Code and Codex,
- Tu explicitly asks for a handoff,
- the next agent needs exact state, verification, risks, and next protocols.

## Workflow

1. Run or confirm `kael-preflight` context for the current task before summarizing.
2. Read the current diff/status and the relevant files; do not rely on chat memory alone.
3. Summarize only what the next agent needs to continue safely.
4. Reference existing artifacts by path or URL instead of duplicating PRDs, plans, ADRs, logs, commits, or diffs.
5. Redact secrets, API keys, passwords, tokens, private credentials, phone numbers, exact addresses, CCCD/national ID, bank details, and any unnecessary PII.
6. Include exact verification state: commands run, pass/fail, skipped checks, and known blockers.
7. Include a `Suggested skills` section listing the project skills/protocols likely needed next.
8. Default to putting the handoff in the final response. If Tu asks for a file handoff, write it to the OS temp directory, not the repo, unless Tu explicitly asks for a tracked artifact.

## Output

```text
Handoff:
Current state:
Changed files:
Commands run:
Decisions:
Risks/limitations:
Suggested skills:
Next action:
```

## Guardrails

- Do not hide failing tests or skipped verification.
- Do not copy sensitive data into the handoff.
- Do not duplicate long artifacts already captured elsewhere.
- Do not write repo files for handoff unless Tu explicitly asked for a tracked document.
- Do not claim production-ready from a handoff alone.
