---
name: react-doctor
description: Run or triage React Doctor diagnostics in the NestScout repo. Use when the user asks for React Doctor, `/doctor`, a changed React scan, a full React health scan, or cleanup based on React Doctor findings. Uses the project-local runner, not npx, so any agent can invoke it directly on any platform.
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

The root scripts dispatch through `scripts/run.mjs` to `scripts/run-react-doctor.ps1` on Windows and `scripts/run-react-doctor.sh` elsewhere. Both pin `react-doctor@0.5.8`, prefer the installed local binary, and fall back to `pnpm dlx`.

## Triage Rules

1. Treat React Doctor as an objective signal, not an automatic refactor order.
2. Fix errors before warnings.
3. Before changing a reported hook dependency, read the whole hook and prefer stable callbacks, functional updates, or moving unstable values inside the hook when appropriate.
4. Do not blindly parallelize async loops in provider fallback or upload flows; verify product behavior first.
5. Do not touch unrelated findings unless Tu asked for a cleanup pass.
6. After fixes, rerun the same React Doctor command and the narrowest relevant type-check/test gate.

## Close

Summarize:

```text
Command:
Result:
Findings:
Fixed:
Remaining:
Verification:
```

The exit code is the signal, not your reading of the findings. A finding you chose not to fix stays in `Remaining`; never silently drop one.
