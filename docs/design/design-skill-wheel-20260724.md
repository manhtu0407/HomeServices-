# Design-Skill Wheel — Companion Doc

Companion to the initiative specified in `governance/Plan.md` §44 (Design-Skill Wheel — hub-and-spoke restructure + auto-trigger for Claude Code & Codex). The plan is the authority; this doc holds the executable detail that would bloat the plan: per-skill spoke↔skill map, the `description` auto-trigger template, the mirror-sync contract, and per-phase File / Action / Acceptance notes. Content is filled in as each phase runs — most of it in P3/P4.

## Status

Skeleton created in P1. Sections below are placeholders until their phase executes.

## P1 — Motion single-source

One motion vocabulary, one numeric source. Semantic tokens (`feedback | selection | route | sheet | stateChange | loading`) live in `apps/mobile/components/ui/motion-tokens.ts`; their meaning and ranges live in `governance/design/motion.md`. The old global 440ms `entrance` timing and unused `staggerDelayMs` / `scaleFrom` were removed; the `liquid.*` signature springs were left untouched. See the plan §44.1 for scope and acceptance.

## P2 — Glass → material semantics

Split "where glass goes" from "what glass looks like". New decision nan `governance/design/material-direction.md` classifies every surface by role (base / content / navigation / transient / media-overlay / interactive-control) → material → `GlassSurface` variant, with iOS / Android / web mapping; money / scope / payment / evidence stay solid; "zero glass is valid". `signature.md` demoted to the subordinate glass recipe — removed the "final gate" / mandatory-sheen / one-hero-quota / ≥9-10 self-score framing, kept the neutral + one-mint palette, spring tokens, dark mode, and dock. `glass-surface.tsx` hardened: native `GlassView` now requires both `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` (iOS 26 beta crash guard); `variant` is required (no silent `subtle` default, no `subtle → 'clear'`); the custom edge highlight runs only in the blur / solid fallback (native draws its own); a dev-only warning fires when opacity < 1 would flatten native glass. Skill `glass-liquid-signature` renamed to `kael-material-direction` (decision + recipe pointers), mirror synced. See plan §44.2.

## P3 — Router axle + auto-trigger + mirror-sync

Assembled the axle. New `governance/design/runtime.md` routes every design task (11 classes: flow / screen / component / design-system / material / motion / accessibility / adaptive-layout / visual-bug / polish / research) → skill (5 live + 6 P4-pending, each with an interim fallback) → preflight + hard gates ("zero glass / zero motion is valid", anti-slop, money / scope = solid) + a verification matrix (widths / text-scale / VI-EN / light-dark / Reduce Motion+Transparency / states). The router is thin — it points to the nan (material-direction, signature, motion, AGENTS.md), never copies them. Wired the same entry into both agents: `AGENTS.md` routing row (Codex), `design.md` Reference Files table, and `critical.md` §1 index. Tightened auto-trigger descriptions for `kael-motion` (and fixed three `RULES.md` → `AGENTS.md` motion-rule refs in its body) and `kael-frontend-test` (glass-liquid → material / glass). `kael-ui-rn-execution` is named as a protocol (`protocols/ui.md` §16), not a skill. `kael-prototype` / `kael-research` left unchanged (shared skills). Mirror synced (`.claude` → `.agents`); skills:check green. See plan §44.3.

## P4a — Three spokes/skills: tokens · adaptive-layout · accessible-content

Added three nan + thin skills, grounded in the real repo (verify-first). `design/tokens.md` documents the actual token architecture — `theme.ts` is the runtime canonical ("implementation values come from this file"; every screen imports it), `tokens.json` is a v2.0.0 design export not wired at runtime, `constants/colors.ts` is a legacy alias with residual raw hex — plus the layer model, the one-canonical-source rule, and the raw-value ratchet (no refactor now). `design/adaptive-layout.md` sets window-size classes by available width (compact < 600 / medium 600–839 / expanded ≥ 840 dp), reflecting the real ad-hoc `useWindowDimensions` pattern (12 uses / 6 files, no shared helper yet). `design/accessible-content.md` covers VI/EN + diacritics, dynamic type, screen-reader name/role/state, contrast + non-color cues, target size, and a hard truncation rule (price / status / risk / address / recovery / primary action never hidden behind `numberOfLines` — ~420 uses). Skills `kael-design-tokens` / `kael-adaptive-layout` / `kael-accessible-content` are thin wrappers pointing to their nan with auto-trigger keywords. The router (`runtime.md`) flips these 3 classes from "P4 — pending" to "live" (8 live, 3 pending). Also removed the stray `license` / `metadata` frontmatter from `kael-prototype` (kept a body attribution). Mirror synced. See plan §44.4.

## P4b — Three spokes/skills (pending): design-evidence · design-review · visual-qa

_Placeholder. design-evidence (+ source ledger), design-review, visual-qa._

## P5 — Visual QA + framework

_Placeholder. `kael-frontend-test` → `kael-visual-qa`; Expo SDK upgrade steps._

## P6 — Continuous governance

_Placeholder. source-ledger review job, corpus manifest, design-incident log._
