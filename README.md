# Home Services

A mobile app for apartment residents in Ho Chi Minh City to book trusted home services —
**electrical repair, plumbing repair, and home cleaning**. The product is built around **Kael**,
an AI assistant that runs the whole job as one coordinated process ("Case Work"): it takes the
customer's request, diagnoses it, estimates a fair price against the local market, briefs the
worker, and orchestrates the booking through to completion.

This README is the fast on-ramp for engineers and future co-founders. For the running build
history, see [`docs/progress-log.md`](docs/progress-log.md).

## Status

**Phase 0 — pre-revenue, rebuilding toward the first real transaction.** Mobile and Supabase Edge
workflow slices exist and are heavily tested, but the product is **not store-ready** until backend
smoke checks, release build/export checks, and TestFlight / Play internal validation pass with
honest evidence. Treat anything not backed by a real run as unverified.

## Runtime (the locked path)

The store-bound runtime is a single, deliberate path — **the mobile app never calls AI providers
directly, stores no server secrets, and never mutates workflow-sensitive state from the client**:

```text
Expo React Native app
  -> Supabase Auth
  -> Supabase Edge Function `mobile-api`     (the production mobile API boundary)
  -> Supabase DB / RPC / Storage / Realtime
  -> server-side AI + external providers
```

`apps/api` (Next.js) is reference/parity/admin code — **not** the mobile runtime. Do not introduce
Vercel/Netlify/Docker assumptions; there is no hosted-Next.js deployment of the app.

## Repository structure

```text
apps/
  mobile/      Expo SDK / React Native app (Expo Router) — the primary customer & worker client
  api/         Next.js reference/parity/admin/support surface (NOT the mobile runtime)
packages/
  shared/      shared constants, contracts, zod schemas, generated DB types, pure Kael logic, tests
supabase/
  functions/
    mobile-api/  production Edge runtime for the mobile workflow (the `mobile-api` boundary)
  migrations/    schema, RLS, RPC, storage, and hardening migrations
docs/          durable feature/ops/design/historical notes (incl. progress-log.md)
.agents/ .claude/  project-local agent skills
```

## Quickstart

Requires Node 20+, [pnpm](https://pnpm.io) `10.16.1` (pinned via `packageManager`), and
[Deno](https://deno.com) for the Edge function.

```bash
pnpm install                 # install the monorepo

# Mobile app
cd apps/mobile && pnpm start  # Expo dev server (or: pnpm android | pnpm ios | pnpm web)

# Gates (run from repo root)
pnpm test                    # turbo: apps/api + packages/shared (vitest), apps/mobile (jest)
pnpm lint:structure          # file-size / structure ratchet
( cd supabase/functions/mobile-api && deno check index.ts )   # Edge type-check
```

Supabase work (migrations, RLS, types, edge functions) goes through the Supabase CLI / MCP against
**staging first**; production is treated as read-only unless explicitly confirmed per call.

## Kael & the agentic workflow

Kael is the product's assistant brand and the default workflow actor for intake, diagnosis, price
analysis, market check, worker brief, notifications, and orchestration. The guardrail that makes it
safe to give Kael autonomy:

> Kael may book/search, decide scope/cancel/completion/payment/dispute outcomes, and reassign —
> but **only** through server-side, schema-validated `KaelAutonomyDecision` objects, behind state
> machine, permission, invariant, evidence, confidence, and audit gates. Raw LLM output, mobile UI,
> and client code must never directly change money- or workflow-impacting state.

The frontend renders a **phase-gated** view: each surface reveals only what the current workflow
phase allows, driven by `packages/shared/src/workflow/` (phase context → components / actions /
artifact mode). The full FE↔BE process is specified in
[`docs/architecture/agentic-workflow-spec-20260616.md`](docs/architecture/agentic-workflow-spec-20260616.md)
and formalized in `STRUCTURES.md`.

## Governance & conventions

This repo is operated as a co-founder-grade engineering surface. Read these in order; the first six
are **locked** (no edits without explicit owner approval):

| Doc | What it governs |
|---|---|
| `critical.md` | execution protocols, preflight / review / verification gates |
| `RULES.md` | non-negotiable product, security, AI, data, runtime boundaries |
| `STRUCTURES.md` | workflow truth, service taxonomy, state machines, backend contracts |
| `design.md` | UI / motion / glass / production visual contracts |
| `CLAUDE.md` / `AGENTS.md` | AI co-founder operating guide + quick-start loop |
| `skills.md`, `.agents/skills/` | Karpathy-style working behavior and project skills |
| `docs/progress-log.md` | durable, reverse-chronological build history |

## Contributing

- **Lifecycle:** Define → Plan → Build → Verify → Review → Ship (defined in `critical.md` §0).
- **Verify with evidence, not vibes:** every change runs the relevant gates above; report the exact
  commands and unedited output. If tests fail or a step is skipped, say so.
- **Surgical changes:** match surrounding code; right-size modules to their domain (Core Skill 6),
  don't over-fragment.
- **Honesty first:** no fabricated data, no faked passes, no PII/secrets in logs or code.
- **Ask when unsure:** ambiguity or conflict with a locked doc → stop and ask the owner.
