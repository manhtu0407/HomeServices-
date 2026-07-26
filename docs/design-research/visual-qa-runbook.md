# Visual QA Runbook (recommendation + process)

Companion to the contract `governance/design/visual-qa.md` (capture matrix, naming, diff classification) and the `kael-visual-qa` skill. This runbook **recommends a tool and documents the process**; it does **not** stand up tooling. Nothing here has been run — capturing screenshots needs a simulator / device / CI this environment does not have, and the tool choice is Tu's to approve (plan §44.5).

## 0. Status (honest)

- **Not installed, not run.** No E2E / visual dep is in `apps/mobile` today (verified: no detox / maestro / owl / image-snapshot).
- The app is **managed Expo** (SDK `~54.0.36`, RN `0.81.5`, no committed `ios/` / `android/`), with **EAS already configured** (`apps/mobile/eas.json`).
- Glass (`expo-glass-effect` / `expo-blur`) and motion (`react-native-reanimated`) render **only on native** — a jsdom / Expo-web snapshot cannot verify the signature. This rules out any node-only pixel tool for the real need.

## 1. Tool comparison (for Tu to choose — not decided here)

| Tool | Fit (managed Expo SDK 54) | Native needs | CI | Maintenance | Risk |
|---|---|---|---|---|---|
| **Maestro** | High — YAML flows, no native code, runs on a simulator/device or an EAS build; has `takeScreenshot` | a running build (simulator / device / EAS build) | Maestro Cloud, EAS Workflows, or GH Actions + emulator | Low — does not hook RN internals; survives RN/SDK bumps | pixel-diff needs Maestro Cloud or a self-hosted diff step; flow-based, not component-isolated |
| Detox | Medium — gray-box; needs prebuild + a config plugin in the (generated) native project | native build + Detox config | GH Actions with a built app (heavier) | High — native config; tends to break on SDK / RN upgrades | managed CNG friction; real setup + upkeep cost |
| react-native-owl | Medium-Low — RN visual-regression, needs native build hookup | native build | custom | Medium-High — younger project | maturity / long-term maintenance |
| jest-image-snapshot (+ RNTL) | Low for this need | none (node / jsdom) | trivial | Low | **does not render native glass / motion** — fails the "native only" contract |
| Storybook RN + capture | Low-Medium — component isolation, but capture needs a host renderer | web or native host | heavy | High | still not native glass on web; heavy for a store-bound app |
| EAS Build + manual device capture | High — reuses existing EAS | device / simulator | EAS | Low-Medium (manual) | manual, no automated diff |

## 2. Recommendation

**Maestro** for capture + flow, run against a local simulator or an **EAS-built dev/preview client** (reusing the EAS setup already in the repo). Rationale:

- It is the only low-maintenance option that (a) fits **managed** Expo without committing/maintaining native projects, (b) captures **real native render** (glass + motion), and (c) does not couple to RN internals, so an SDK 54 → 57 upgrade is unlikely to break it.
- It matches what `protocols/frontend-test.md` already names as the intended E2E direction ("Maestro/Detox is not set up yet").
- **Detox** is the fallback if gray-box speed / determinism is later needed, accepting the native-config maintenance cost.
- **Open sub-decision for Tu:** the pixel-diff mechanism — Maestro Cloud (managed baselines + diff) vs a self-hosted diff step (Maestro `takeScreenshot` + an image-diff lib in CI). Recommend starting with Maestro Cloud to avoid building a diff pipeline.

## 3. Process (once a tool is approved + a device/CI exists)

1. **Deterministic fixtures.** Freeze anything that changes between runs, or a diff is meaningless:
   - data: a seeded fixture / test account, not live data;
   - time: a fixed clock (inject a frozen "now") so timestamps don't move;
   - animation: enable Reduce Motion (or a capture flag) so motion settles before the shot;
   - locale + theme + text scale: set explicitly per shot, never "device default".
2. **Capture the matrix** from `visual-qa.md` §1 — priority first: iOS + Android × light/dark × VI/EN × the affected states; then the widths and text scales the change is sensitive to. State the axes you skip.
3. **Name each shot** exactly per `visual-qa.md` §2: `<flow>__<screen>__<platform-os>__<window>__<theme>__<text-scale>__<state>__<locale>.png`.
4. **Baseline convention.** Store approved baselines under `apps/mobile/visual-baselines/<flow>/` (or the Maestro Cloud project). A baseline enters only after human review; it is never overwritten silently.
5. **Diff + classify** every change per `visual-qa.md` §3: intended / platform-render / flaky-data / regression / baseline-update. Taste is **not** a pixel decision — defer to `kael-design-review` / human sign-off.

## 4. CI shape (proposed)

A visual-QA CI job (EAS Workflows or GH Actions) would: build the app (EAS), boot a simulator/emulator (or use Maestro Cloud devices), run the Maestro flows with frozen fixtures, capture the named shots, diff against baselines, and fail on an **unclassified** or **regression** diff — never auto-update baselines.

## 5. Deferred (needs Tu + device/CI)

Installing the tool, adding scripts/config, capturing the first baselines, and wiring the CI job are all **out of scope here** and wait on Tu's tool approval and a device/CI environment. This runbook is the plan, not a run.
