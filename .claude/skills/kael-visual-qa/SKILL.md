---
name: kael-visual-qa
description: Visual QA contract for the NestScout Expo React Native app — screenshot capture matrix, baseline naming, and diff review. Use when taking screenshots, setting a baseline, checking a visual regression or diff, or planning a device matrix for a UI change. Native iOS + Android only (no Expo-web); classifies every diff; defers taste to human sign-off. Captures are MANUAL — this skill carries no automation; building the screenshot / E2E tooling is a separate task.
---

# kael-visual-qa

## Preconditions

| Needs | Check | If absent |
|---|---|---|
| A running iOS or Android build a human can drive | ask Tu, or look for a live simulator / device session | Stop. Produce the capture matrix and the baseline names as a checklist for Tu to run, and say plainly that no shot was taken. Never describe a screenshot you did not see. |

There is no capture command: this skill is the contract for shots taken by hand, and building the
screenshot / E2E automation is a separate task (plan §44.5 / P5).

Thin wrapper. The capture matrix, naming scheme, and diff classification are canonical in
`governance/design/visual-qa.md` — do not duplicate them here.

When this fires:

1. Capture the axes the change can affect — platform (iOS + Android native) × width × orientation / keyboard × theme × text scale × locale × accessibility × state. State which axes you skipped.
2. Name each shot `<flow>__<screen>__<platform-os>__<window>__<theme>__<text-scale>__<state>__<locale>.png` so baseline and candidate align.
3. Classify every diff: intended / platform-render / flaky-data / regression / baseline-update. Stabilize fixtures, don't mask a bug.
4. Native capture only (no Expo-web); a green pixel-diff is not aesthetic approval — defer taste to `kael-design-review` / human sign-off.

## Close

```text
Surface:
Capture matrix:
Captured:
Not captured:
Baseline:
Diff verdict:
```

Capture is device-gated. Without a real screenshot there is no visual verdict — report `not captured`, never `looks correct`.

Single source: `governance/design/visual-qa.md`. Pair with `kael-frontend-test`, `kael-design-review`, and the design router `governance/design/runtime.md`.
