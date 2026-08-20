---
name: kael-visual-qa
description: Visual QA contract for the NestScout Expo React Native app — screenshot capture matrix, baseline naming, and diff review. Use when taking screenshots, setting a baseline, checking a visual regression or diff, or planning a device matrix for a UI change. Native iOS + Android only (no Expo-web); classifies every diff; defers taste to human sign-off. Captures are MANUAL — this skill carries no automation; building the screenshot / E2E tooling is a separate task.
---

# kael-visual-qa

## Preconditions

| Needs | Check | If absent |
|---|---|---|
| A running iOS or Android build a human can drive | ask Tu, or look for a live simulator / device session | Run the degraded lane. Never describe a screenshot you did not see. |

There is no capture command: this skill is the contract for shots taken by hand, and building the
screenshot / E2E automation is a separate task (plan §44.5 / P5).

## Degraded lane

No device attached is the normal case in an agent shell, so this is the lane that runs most of the
time — and it produces a real deliverable, not an apology.

First, shrink the list: any axis in the second table of `governance/design/visual-qa.md` §1 is
provable in a pillar test, so it never belongs on a human's checklist. Write or extend the pillar
instead and say you did.

Then derive the capture matrix for what genuinely needs a device and hand back a checklist Tu can
execute in one sitting: every shot named with the full scheme below, grouped so one pass through the
app covers a whole group, and ordered so the axes most likely to break come first. Say which axes you
excluded and why — an honest four-shot matrix beats a thorough one nobody runs.

Name the visual risk you are asking to be checked, in words, per shot group: what would a regression
look like here? That is what makes the checklist worth a human's time rather than a naming exercise.

The lane ends with `Diff verdict: not captured`. It never ends with an opinion about how the surface
looks.

Thin wrapper. The capture matrix, naming scheme, and diff classification are canonical in
`governance/design/visual-qa.md` — do not duplicate them here.

When this fires:

1. Capture only the device-bound axes — platform (iOS + Android native) × width × orientation / keyboard × material and motion rendering. Theme, text scale, locale, accessibility flags, and state are provable in a `*-pillar-test.tsx`; send those to a pillar instead of a screenshot. State which axes you skipped.
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
