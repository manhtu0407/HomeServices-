---
name: react-doctor
description: Run or triage React Doctor diagnostics in the NestScout repo. Use when the user asks for React Doctor, `/doctor`, a changed React scan, a full React health scan, or cleanup based on React Doctor findings. Uses the project-local runner, not npx, so Claude Code agents can invoke it directly in this Windows/Codex workspace.
---

# React Doctor

Use the repo scripts; do not call `npx react-doctor`.

## Commands

- Changed scan after React/React Native edits:

```powershell
pnpm doctor:react:changed
```

- Full scan when Tu asks for a broader React Doctor pass:

```powershell
pnpm doctor:react
```

- Short alias for the changed scan:

```powershell
pnpm doctor
```

The root scripts call `scripts/run-react-doctor.ps1`, which pins `react-doctor@0.5.8`, prepends the bundled Codex Node runtime when needed, prefers the installed local binary, and falls back to `pnpm dlx`.

## Triage Rules

1. Treat React Doctor as an objective signal, not an automatic refactor order.
2. Fix errors before warnings.
3. Before changing a reported hook dependency, read the whole hook and prefer stable callbacks, functional updates, or moving unstable values inside the hook when appropriate.
4. Do not blindly parallelize async loops in provider fallback or upload flows; verify product behavior first.
5. Do not touch unrelated findings unless Tu asked for a cleanup pass.
6. After fixes, rerun the same React Doctor command and the narrowest relevant type-check/test gate.

## Reporting

Summarize:

```text
Command:
Result:
Findings:
Fixed:
Remaining:
Verification:
```
