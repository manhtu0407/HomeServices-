---
name: kael-visual-qa
description: Visual QA contract for the NestScout Expo React Native app — screenshot capture matrix, baseline naming, and diff review. Use when taking screenshots, setting a baseline, checking a visual regression or diff, or planning a device matrix for a UI change. Native iOS + Android only (no Expo-web); classifies every diff; defers taste to human sign-off. Guidance — building the screenshot / E2E tooling is a separate task.
---

# kael-visual-qa

Thin wrapper. The capture matrix, naming scheme, and diff classification are canonical in `governance/design/visual-qa.md` — do not duplicate them here. This nan is the contract; the actual screenshot / E2E tooling is a separate task (plan §44.5 / P5).

When this fires:

1. Capture the axes the change can affect — platform (iOS + Android native) × width × orientation / keyboard × theme × text scale × locale × accessibility × state. State which axes you skipped.
2. Name each shot `<flow>__<screen>__<platform-os>__<window>__<theme>__<text-scale>__<state>__<locale>.png` so baseline and candidate align.
3. Classify every diff: intended / platform-render / flaky-data / regression / baseline-update. Stabilize fixtures, don't mask a bug.
4. Native capture only (no Expo-web); a green pixel-diff is not aesthetic approval — defer taste to `kael-design-review` / human sign-off.

Single source: `governance/design/visual-qa.md`. Pair with `kael-frontend-test`, `kael-design-review`, and the design router `governance/design/runtime.md`.
