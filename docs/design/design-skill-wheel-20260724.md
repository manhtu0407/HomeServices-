# Design-Skill Wheel — Companion Doc

Companion to the initiative specified in `governance/Plan.md` §44 (Design-Skill Wheel — hub-and-spoke restructure + auto-trigger for Claude Code & Codex). The plan is the authority; this doc holds the executable detail that would bloat the plan: per-skill spoke↔skill map, the `description` auto-trigger template, the mirror-sync contract, and per-phase File / Action / Acceptance notes. Content is filled in as each phase runs — most of it in P3/P4.

## Status

Skeleton created in P1. Sections below are placeholders until their phase executes.

## P1 — Motion single-source

One motion vocabulary, one numeric source. Semantic tokens (`feedback | selection | route | sheet | stateChange | loading`) live in `apps/mobile/components/ui/motion-tokens.ts`; their meaning and ranges live in `governance/design/motion.md`. The old global 440ms `entrance` timing and unused `staggerDelayMs` / `scaleFrom` were removed; the `liquid.*` signature springs were left untouched. See the plan §44.1 for scope and acceptance.

## P2 — Glass → material semantics

Split "where glass goes" from "what glass looks like". New decision nan `governance/design/material-direction.md` classifies every surface by role (base / content / navigation / transient / media-overlay / interactive-control) → material → `GlassSurface` variant, with iOS / Android / web mapping; money / scope / payment / evidence stay solid; "zero glass is valid". `signature.md` demoted to the subordinate glass recipe — removed the "final gate" / mandatory-sheen / one-hero-quota / ≥9-10 self-score framing, kept the neutral + one-mint palette, spring tokens, dark mode, and dock. `glass-surface.tsx` hardened: native `GlassView` now requires both `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` (iOS 26 beta crash guard); `variant` is required (no silent `subtle` default, no `subtle → 'clear'`); the custom edge highlight runs only in the blur / solid fallback (native draws its own); a dev-only warning fires when opacity < 1 would flatten native glass. Skill `glass-liquid-signature` renamed to `kael-material-direction` (decision + recipe pointers), mirror synced. See plan §44.2.

## P3 — Router axle + auto-trigger + mirror-sync

_Placeholder. `governance/design/runtime.md` router, `description` template, mirror-sync reuse, `kael-ui-rn-execution` clean-up._

## P4 — Six missing spokes/skills

_Placeholder. tokens, adaptive-layout, accessible-content, design-evidence (+ ledger), design-review, visual-qa._

## P5 — Visual QA + framework

_Placeholder. `kael-frontend-test` → `kael-visual-qa`; Expo SDK upgrade steps._

## P6 — Continuous governance

_Placeholder. source-ledger review job, corpus manifest, design-incident log._
