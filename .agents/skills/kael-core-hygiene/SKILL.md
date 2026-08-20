---
name: kael-core-hygiene
description: Always use when writing, editing, or reviewing any code — before adding any comment, header, or note. Enforces senior-developer output hygiene so the source is not an AI worklog. Forbids dates, phase/plan/status/audit banners, AI self-attribution ("added by Claude/Codex"), request narration ("as requested"), first-person change narration, restated-code and dead-code comments; keeps only non-obvious WHY, invariants, JSDoc, and authority citations. Canonical: governance/protocols/code-hygiene.md. Enforced by pnpm lint:comments and the comment-discipline CI job for both agents, plus the comment-hygiene Stop hook in Claude Code only.
---

# kael-core-hygiene

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/code-hygiene.md` — do not duplicate it here.

This skill is always on for code. It is not opt-in per task class; it runs on every code change, before you add any comment, header, or note. The standard: write source the way a senior developer hands it to a reviewer — the file is not your worklog, changelog, or a transcript of the session that produced it.

When this fires:

1. A comment earns its place only if it states a non-obvious WHY, an invariant, or a trap. If it restates WHAT the code does, delete it.
2. Never bake in AI residue or narrative: dates, phase/plan tags, status banners (`WIRED/DONE/DEFERRED`), audit/ticket codes, plan/audit/Notes references, `added by Claude/Codex`, `as requested`, first-person `I/we added…`, or bare `TODO/FIXME`.
3. Cut the judgment-level noise a linter can't: task/mission prose, restated code, dead commented-out blocks, editorializing (`clever`, `obviously`, `simply`), and conversational tone.
4. Keep the legitimate: architectural WHY, invariants/gotchas, JSDoc on public APIs, authority citations (`// RULES.md #8`), and bare scope language (`// Phase 1 fire-and-forget`).
5. Do not annotate your own edit process or leave debug logs; temporary probes are prefixed `[DEBUG-kael-...]` and removed before final.

Commands:

- `pnpm lint:comments` — full report over `apps/`, `packages/`, `supabase/functions/`.
- `pnpm lint:comments --diff <ref>` — judge only lines added versus a ref (CI ratchet).
- `pnpm lint:comments --working` — judge only the current uncommitted change (what the Claude Code Stop hook runs). Codex has no Stop hook: run this by hand before reporting done.

Self-check before reporting done:

```text
Comments added: <count, or none>
Each earns its place (WHY/invariant/trap, not WHAT): yes/no
No AI residue (attribution, request narration, first-person, dates, status/plan/audit tags): yes/no
No dead code / bare TODO / restated-code / editorializing: yes/no
lint:comments on this change: clean / <violations>
```

## Close

`pnpm lint:comments` is the only proof a comment passes. If it did not run, say so rather than asserting the file is clean.
