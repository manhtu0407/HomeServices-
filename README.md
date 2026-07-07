<p align="center">
  <img src="docs/assets/nestscout-aurora-nest-logo.png" alt="NestScout AuroraNest logo" width="180" />
</p>

# NestScout

NestScout is a mobile-first app that helps **Ho Chi Minh City apartment residents** book trustworthy **electrical repair, plumbing repair, and home cleaning** — with fair, transparent pricing. **Kael**, the in-app AI assistant, handles intake, photo-based diagnosis, market-price estimates, worker briefing, and workflow orchestration.

The product is **pre-revenue**, rebuilding toward its first real transaction. This README is a fast on-ramp for developers and future co-founders; it intentionally stays an introduction only — the operating rules live in `governance/` (see [Working in this repo](#working-in-this-repo)).

## Status

**Phase 0 — production fix and foundation hardening.** The Expo app and the Supabase Edge workflow exist, but the product is not store-ready until backend smoke checks, release build/export checks, and TestFlight / Play internal validation pass with honest evidence. Durable build history: [`docs/progress-log.md`](docs/progress-log.md).

## Runtime

```text
Expo React Native app
  -> Supabase Auth
  -> Supabase Edge Function `mobile-api`   (the production mobile API boundary)
  -> Supabase DB / RPC / Storage / Realtime
  -> server-side AI + external providers
```

The mobile app never calls AI providers directly, holds no server secrets, and never mutates workflow-sensitive state on its own — everything money- or workflow-impacting goes through the Edge function.

## Repository

```text
apps/
  mobile/    Expo SDK / React Native app (Expo Router) — the primary customer + worker client
  api/       Next.js — reference / parity / admin / support surface (NOT the mobile runtime)
packages/
  shared/    shared constants, contracts, schemas, generated DB types, tests
supabase/
  functions/mobile-api/   production Edge runtime for mobile workflow APIs
  migrations/             database schema, RLS, RPC, storage, hardening
governance/  the rule stack agents follow (routers + critical / RULES / STRUCTURES / design / skills / Plan)
docs/        durable feature, ops, design, and historical notes (incl. progress-log.md)
```

Monorepo: **Turborepo + pnpm workspaces** — `@nestscout/mobile`, `@nestscout/api`, `@nestscout/shared`.

## Quickstart

Requires Node and **pnpm 10.16.1** (via Corepack).

```bash
pnpm install

pnpm type-check     # turbo type-check across all workspaces
pnpm test           # turbo test
pnpm lint           # turbo lint
pnpm build          # turbo build

pnpm --filter @nestscout/mobile start   # run the Expo app (expo start)
pnpm --filter @nestscout/api dev         # run the Next.js reference/admin surface
```

Mobile is tested with **jest-expo + React Native Testing Library**; the api with **Vitest**. Store builds go through **EAS** (`testflight`, `play:internal` scripts in `apps/mobile`).

## Kael & the agentic workflow

Kael is the product's AI co-worker and the default workflow actor: intake, diagnosis, price analysis, market check, worker brief, support, and orchestration. Kael changes money-impacting state **only** through server-side validated `KaelAutonomyDecision` objects — never from raw model output or client code. Every price estimate carries the required Vietnamese disclaimer, and data is never faked (real empty states instead of mock numbers).

## Working in this repo

This repository is built largely by AI coding agents (Claude Code, Codex) acting as the technical co-founder, plus human review. The operating rules are a small **hub-and-spoke** stack — start at the router and read only the spoke your task needs:

- **`CLAUDE.md`** / **`AGENTS.md`** — routers: task → which governance file to read.
- **`governance/critical.md`** — execution contract (preflight, gates, review, protocol index).
- **`governance/RULES.md`** — non-negotiable product / security / runtime rules.
- **`governance/STRUCTURES.md`** (+ `governance/structures/*`) — workflow, taxonomy, state machines, backend contracts.
- **`governance/design.md`** (+ `governance/design/*`) — UI / motion / glass / mascot design system.
- **`governance/skills.md`**, **`governance/Plan.md`** — coding behavior + the rolling plan.

## Conventions

- User-facing copy is **Vietnamese-first** (English only via the in-app VI/EN switch); code, comments, and docs are English.
- Supported services are **only** electrical, plumbing, and cleaning — no scope creep, no fake workers/prices/ratings.
- Every change is gated: tests pass, type-check passes, review passes, with honest evidence — no false "done".
- React Native (`apps/mobile`) is the primary product surface; Next.js (`apps/api`) is reference/admin/support only unless explicitly assigned.