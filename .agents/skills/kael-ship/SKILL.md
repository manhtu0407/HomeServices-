---
name: kael-ship
description: Use when preparing a change for push, for a pull request, or for handoff as delivered. Runs pnpm ship:check for the machine half — worktree state plus ten pure-node gates, and an explicit list of what could not run here — then applies the judgment half a script cannot: whether the change is one theme, whether the commit messages and PR body match what actually changed, whether anything was called done that no gate proved, and whether the Session Memory Gate was discharged.
---

# kael-ship

Delivery gate. It runs before a push or a pull request, not after — once a branch is pushed the reviewer's time is already spent, and every workflow in `.github/workflows/` triggers only on `pull_request` or push-to-main, so a branch pushed before its PR exists is checked by nothing.

Two halves. The command owns what a script can prove. You own the rest.

## Machine half

```bash
pnpm ship:check
```

Read **both** of its lists. The gate list is the easy half. The `not run by this command` list is the one that matters: `governance/critical.md` §3 says a gate that could not run is not a gate that passed. Whatever is named there stays unproven locally, and saying "checks pass" without naming it is a false completion report.

`pnpm lint:residue` is the one gate in that set most likely to be new to you — it catches a focused or skipped test, a leftover debug probe, and a `console.log` in runtime code.

## Judgment half

None of these are detectable by a script, and every one of them has shipped in this repo before:

1. **One theme, or two?** A PR carrying two subjects gets reviewed as neither. If it is two, say so in the description rather than letting the reviewer discover it.
2. **Is there anything in the diff you would not defend out loud at review?** Scaffolding kept "just in case", a rename half-applied, a workaround with no comment saying why. Cut it now, not after a reviewer asks.
3. **Did anything land in source whose home is `docs/`?** History, rationale, and status belong in the commit message and `docs/`, per `governance/protocols/code-hygiene.md`.
4. **Do the commit messages and the PR body describe what actually changed?** Re-read the diff against them. A description written before the last three commits is no longer true.
5. **Was anything called done that a gate could not prove?** Name it in the PR body, not only in your own head.
6. **Session Memory Gate.** `governance/critical.md` §3 — if this session produced a decision, an executed plan section, an environment change, or an honest gap, the entry is written before the work is reported complete.

## Guardrails

- Do not push or open a PR unless Tu asked for it in the current conversation (`governance/critical.md` §3 Git Rule).
- Do not present `ship:check` as equivalent to CI. It runs the pure-node gates; type-check, tests, build, Edge `deno check`, and the SQL matrix are not among them.
- Do not widen or disable a gate to make this pass. A red gate is the finding.
- A gate that could not run is reported, never omitted.

## Close

Report both halves. A close that lists only the gates that passed is the failure this skill exists to prevent — the unrun list is not an appendix, it is half the result.

```text
Branch:
Theme:
ship:check:
Not run here:
Judgment findings:
Memory entry:
```
