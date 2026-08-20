# Design Reference — Visual QA

> A spoke of the `design.md` system. `critical.md` is highest authority; `design/runtime.md` routes here; the `kael-visual-qa` skill points here. This is the **contract** for visual capture, naming, and diff review — the matrix and the naming scheme. Building the actual screenshot / E2E tooling is a separate task (plan §44.5 / P5); this spoke does not stand up tooling.

## 0. Role

A visual change is not verified by type-check + Jest alone — those do not render glass, motion, dark mode, dynamic type, or a real device. Visual QA defines **what to capture, how to name it, and how to read a diff** so a change is checked on the surfaces that actually differ. RN reality: capture on **native iOS + Android**, never an Expo-web stand-in.

## 1. Capture matrix

Capture the axes that can change the render. Not every screen needs every cell — capture the axes the change can affect, and say which you skipped.

Two kinds of axis. **Only the first needs a device** — the second is assertable in a pillar test and
belongs in CI, where it runs on every push instead of waiting for a human.

Needs eyes on a real build:

| Axis | Values |
|---|---|
| platform | iOS native · Android native |
| width (dp) | 320 · 375–390 · 430 · 600–768 |
| orientation / input | portrait · landscape · keyboard-open |
| material / motion | glass and blur rendering · real animation timing |

Provable without a camera — write or extend a `*-pillar-test.tsx` rather than queueing a screenshot:

| Axis | Values | Proven by |
|---|---|---|
| theme | light · dark · increased-contrast | P27 `theme-token-resolution` |
| text scale | 100% · 135% · 160% · 200% | P28 `text-scale-reflow` |
| locale | VI · EN | existing pillars |
| accessibility | Reduce Motion · Reduce Transparency | existing pillars |
| state | loading · empty · error · success · retry · confirmation | existing pillars |

A screenshot of a second column axis proves less than the pillar does and costs a human's time. If
one is uncovered, the fix is a pillar, not a capture.

Priority when the full grid is too large: the two platforms × light/dark × VI/EN × the affected states first; then the widths and text scales the layout is sensitive to.

## 2. Naming scheme

One deterministic name per shot, so a baseline and a candidate line up:

```text
<flow>__<screen>__<platform-os>__<window>__<theme>__<text-scale>__<state>__<locale>.png
```

Example: `booking__price-check__ios-17__390w__dark__135__confirmation__vi.png`. Lowercase, `__` between axes, no spaces.

## 3. Reading a diff

Classify every visual diff before acting:

- **intended** — the change we made; update the baseline.
- **platform-render** — a legitimate iOS vs Android difference; not a bug, note it.
- **flaky-data** — the diff is seeded/mock data, a timestamp, or animation phase; stabilize the fixture, not the UI.
- **regression** — an unintended change; fix the code.
- **baseline-update** — an intended change to a previously-approved shot; update deliberately, not silently.

Taste ("does it look premium / on-brand") is **not** a pixel-diff decision — it needs human sign-off (see `design-review.md`). A green pixel-diff is not aesthetic approval.

## 4. Rules

- Native only — no Expo-web screenshots stand in for device render (glass and motion render only on native).
- Deterministic fixtures — freeze data / time / animation for capture so diffs mean something.
- No fabricated states — capture the honest empty / error state, never a mock-populated fake.
- Record what was skipped — an unshot axis is a stated gap, not silent coverage.

## 5. Checklist

```text
[ ] Captured the axes the change can affect (platforms × theme × locale × affected states first).
[ ] Names follow the scheme; baseline and candidate align.
[ ] Every diff classified (intended / platform-render / flaky-data / regression / baseline-update).
[ ] Taste deferred to human sign-off, not decided by pixel-diff.
[ ] Native capture; deterministic fixtures; skipped axes stated.
```
