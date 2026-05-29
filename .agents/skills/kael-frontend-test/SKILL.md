---
name: kael-frontend-test
description: Frontend testing workflow for the Home Services Expo React Native app. Use when building or verifying UI — screens, components, responsiveness, accessibility, motion, state coverage — or before claiming any frontend/UI task done. Enforces real evidence (type-check + jest-expo/RNTL), RN reality (no browser/hover/web glass), and the glass-liquid + motion + data-honesty contracts.
---

# kael-frontend-test

Auto-trigger wrapper. Full procedure is canonical in `protocols/frontend-test.md` (repo root) — do not duplicate it here.

When this fires:

1. G0–G1: understand the current surface (read-only), then reuse existing standards — `design.md`/`design/*.md`, `AGENTS.md`, `STRUCTURES.md`, `protocols/ui.md`. Do not re-derive them.
2. G2: pick the test layers that reduce real risk (component, accessibility, interaction, state coverage, motion, visual).
3. G3: run real static gates — `pnpm --filter @home-services/mobile type-check` and `... test` (jest-expo + RNTL). The `Stop` hook blocks a false "done" on a red gate.
4. G4–G5: validate on iOS + Android (light/dark, Reduce Motion/Transparency, VI/EN, glass budget); cover key flows + money-impacting confirmations. This is RN — no browser, no web glass, press not hover.
5. G6: end with real evidence (commands + results + states tested + states NOT tested). No evidence → not done.

Output:

```text
Surface(s):
Standards reused:
Test plan (layers):
Static validation (commands + results):
UI/UX validation (modes/devices/states):
User-flow validation:
States NOT covered:
Evidence:
```
