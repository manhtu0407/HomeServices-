---
name: kael-frontend-test
description: Frontend testing workflow for the NestScout Expo React Native app. Use when building or verifying UI — screens, components, layout, responsiveness, accessibility, motion, dark mode, state coverage — or before claiming any frontend/UI task done. Enforces real evidence (type-check + jest-expo/RNTL), RN reality (no browser/hover/web glass), and the material / glass + motion + data-honesty contracts.
---

# kael-frontend-test

Auto-trigger wrapper. Full procedure is canonical in `governance/protocols/frontend-test.md` — do not duplicate it here.

When this fires:

1. G0–G1: understand the current surface (read-only), then reuse existing standards — `governance/design.md`/`governance/design/*.md`, `AGENTS.md`, `governance/STRUCTURES.md`, `governance/protocols/ui.md`. Do not re-derive them.
2. G2: pick the test layers that reduce real risk (component, accessibility, interaction, state coverage, motion, visual).
3. G3: run real static gates — `pnpm type-check:mobile` and `pnpm test:mobile` (root aliases for `@nestscout/mobile` type-check + jest-expo/RNTL that inject bundled Node when agent shells lack `node`). For React/React Native performance or hook-risk changes, also run `pnpm doctor:react:changed`. In Claude Code the `Stop` hook blocks a false "done" on a red gate; Codex has no hook — run both commands by hand before G6.
4. G4–G5: validate on iOS + Android (light/dark, Reduce Motion/Transparency, VI/EN, glass budget); cover key flows + money-impacting confirmations. This is RN — no browser, no web glass, press not hover. For a visual change, hand off to `kael-visual-qa` (capture matrix + naming; runbook `docs/design-research/visual-qa-runbook.md`) — automated capture is not set up yet.
5. G6: end with real evidence (commands + results + states tested + states NOT tested). No evidence → not done.

## Close

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

G3 is `pnpm type-check:mobile` plus `pnpm test:mobile`. If either did not run, the surface is unverified — name the gate that did not run instead of calling it done.
