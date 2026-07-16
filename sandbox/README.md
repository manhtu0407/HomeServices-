# NestScout Agent Sandbox

This folder is the in-repo sandbox for Codex, Claude Code, and future AI coding agents.

Use it when an agent needs to test a small idea, verify local tooling, or create a temporary probe without doing that work outside the NestScout workspace.

## Commands

Run from the repo root:

```powershell
pnpm sandbox:test
pnpm sandbox:type-check
```

Equivalent aliases:

```powershell
pnpm test:sandbox
pnpm type-check:sandbox
```

These commands use the same Windows-safe wrappers as the rest of the repo.

## Rules

- Keep sandbox experiments inside `sandbox/agent/workbench/`.
- Keep generated run output inside `sandbox/agent/.runs/`.
- Do not put `.env`, secrets, tokens, customer PII, worker PII, raw addresses, or provider keys in the sandbox.
- Do not call production Supabase, AI providers, payment providers, or external APIs from sandbox probes unless Tu explicitly approves that exact test.
- Do not treat sandbox code as production code. Promote only the small proven idea into the proper owner file after reading `critical.md`, `RULES.md`, `STRUCTURES.md`, and `docs/architecture/code-ownership-map.md`.
- UI and mobile behavior still need the real mobile gates. The sandbox is a first-pass agent test area, not a replacement for `pnpm type-check:mobile`, `pnpm test:mobile`, React Doctor, or native device validation.

## Current Package

`sandbox/agent` is a private pnpm workspace package named `@nestscout/sandbox`.

It currently provides a zero-dependency health check that proves:

- the sandbox is registered in `pnpm-workspace.yaml`,
- root sandbox scripts are wired,
- core NestScout authority docs are visible,
- required app/package boundaries exist,
- scratch paths are ignored,
- forbidden `.env` files are not present under `sandbox/`.
