# Kael Protocol — Frontend Testing (Expo React Native)

> New protocol (2026-05-29). Referenced from `AGENTS.md` → "Frontend Testing Workflow" and the `kael-frontend-test` skill. Not wired into `critical.md` §1 (locked); load it for frontend/UI testing on the Expo app. Pairs with `design.md` (visual/motion contract), `protocols/ui.md` (RN execution + Kael autonomy decision/audit rules), and `protocols/tdd.md` (test discipline).

Load for: building or verifying any UI on `apps/mobile` — screens, components, responsiveness, accessibility, motion, state coverage — and before claiming any frontend task done.

Core rule: this is a React Native store-bound app, not a web app. Evidence must come from the RN runtime (jest-expo / React Native Testing Library, and device/simulator), never a browser or Expo-web stand-in. Glass and motion render only on native.

## Gated workflow (G0–G6)

### G0 — Understand the current frontend (read-only)
No edits. Map the task with `docs/architecture/code-ownership-map.md`: route(s) under `apps/mobile/app/`, owning component/surface, design tokens (`components/ui/tokens.ts`, `constants/colors.ts`), state/provider, motion helpers (`components/ui/*motion*`), and the runtime boundary (Edge vs direct Supabase).

### G1 — Reuse existing standards (do NOT re-derive)
The frontend standards already exist — read them, do not regenerate:
- `design.md` + `design/*.md` (identity, palette/typography, motion grammar, screen recipes, glass-liquid signature),
- `AGENTS.md` (Glassmorphism / Motion / Performance / Data Honesty / Language rules),
- `STRUCTURES.md` (service taxonomy, workflow states, terms),
- `protocols/ui.md` (RN execution + money-impacting Kael decision/audit rules).

### G2 — Frontend test plan
Per surface, choose the layers that reduce real risk:
- Component (RNTL): render real product components, assert real behavior.
- Accessibility: role + accessible name, disabled/selected state, Reduce Motion and Reduce Transparency handling, touch-target size.
- Interaction: press, disabled (no accidental client action), and visible Kael decision/audit/appeal state for money-impacting steps (A7 matching, A11 scope-change hard-stop, A12 completion/payment, B2 accept — see `protocols/ui.md`).
- State coverage: loading, empty, error, success — with production-safe empty states (no fake `0`/`--`/mock data).
- Motion: run the `kael-motion` preflight; reject AI-slop motion; honor the Performance Budget.
- Visual: plan the capture with `kael-visual-qa` (matrix + naming in `design/visual-qa.md`); compare against device frames, not browser screenshots.

### G3 — Static validation (real, enforced)
Run and report real output:
- `pnpm type-check:mobile`
- `pnpm test:mobile`  (jest-expo + RNTL; config `apps/mobile/jest.config.js`, setup `apps/mobile/jest.setup.ts`)

These root aliases wrap `@nestscout/mobile` package scripts and dispatch through `scripts/run.mjs`, which selects the PowerShell runner on Windows and the bash mirror elsewhere, so they run on every platform an agent works from. The `Stop` hook (`.claude/hooks/verify-frontend-gates.mjs`) re-runs these whenever `apps/mobile` code or gate-relevant mobile config changed and blocks a false "done" on a red gate — but it is wired in `.claude/settings.json`, so it fires for Claude Code only. Codex has no hook and runs both commands by hand. Lint (`pnpm lint:mobile`, eslint-config-expo) is available for manual debt work but is **not** in the Stop hook yet - see Limitations.

### G4 — UI/UX validation (RN reality)
Verify on iOS and Android (simulator or device via `expo start`), not a browser:
- light and dark mode; text readable in both,
- Reduce Motion (removes parallax/sweep/scale) and Reduce Transparency (glass → opaque/tinted),
- language VI/EN with no mixed copy in one selected mode,
- glass used only as an accent (≤2–3 layers/screen; repeated rows stay opaque),
- touch targets and keyboard/scroll behavior (content not trapped behind dock/keyboard).

Glass (`expo-glass-effect`/`expo-blur`) only renders on native — never validate glass on Expo web.

For a **visual change**, after the static gates (G3) hand off to `kael-visual-qa`: capture per the `design/visual-qa.md` matrix + naming, classify each diff, and defer taste to human sign-off before calling it done. Automated visual capture is not set up — see the runbook `docs/design-research/visual-qa-runbook.md` (recommended tool Maestro, pending Tu's approval + a device/CI). Until then capture manually per the matrix and state the coverage honestly.

### G5 — User-flow validation
Cover key flows with component/integration tests plus a manual run on a simulator: Kael booking orchestration, scope-change hard-stop, completion/payment decision, worker accept. Confirm money-impacting steps never auto-advance from client-side UI without a validated Kael decision.

E2E + visual automation (Maestro/Detox) is not set up yet — see the recommendation + process in `docs/design-research/visual-qa-runbook.md`. Do not fake browser/Expo-web flow evidence; state the manual coverage honestly.

### G6 — Evidence before done
End with the required final response (`critical.md` §3): `Changed / Verification / Risks/Limitations / Next Step`. Verification lists only commands actually run + real results, which UI states were tested, which were NOT, and device screenshots where the change is visual. No evidence → not done.

## Output Format

```text
Surface(s):
Standards reused:
Test plan (layers):
Static validation (commands + results):
UI/UX validation (modes/devices/states):
User-flow validation:
States NOT covered:
Evidence (screenshots/logs):
```

## Failure Modes
- Browser/Expo-web screenshots presented as device evidence.
- Validating glass/motion where they do not render (web).
- Re-deriving standards instead of reading `design.md` / `AGENTS.md`.
- Claiming done with no real `type-check` / `test` output.
- Testing only the happy path; ignoring loading/empty/error states.

## Anti-Patterns
- `expect(true).toBe(true)` or existence-only checks used as proof.
- Snapshot spam instead of behavior assertions.
- Generic SaaS UI instead of the glass-liquid signature (`design/signature.md`).
- Auto-advancing money-impacting steps in tests or UI without a validated Kael decision state.

## Limitations (current, honest)
- Available now: static (`type-check`), component/unit (jest-expo + RNTL), and manual lint (`lint:mobile`, eslint-config-expo).
- ESLint is intentionally NOT a root `turbo lint` gate yet: pre-existing mobile lint debt must be cleaned first; only then expose a package `lint` script and add it to the Stop hook.
- Not set up: Maestro/Detox E2E and visual regression. The capture contract is `design/visual-qa.md` (skill `kael-visual-qa`); the tool recommendation + runbook is `docs/design-research/visual-qa-runbook.md` (recommends Maestro, pending Tu's approval + device/CI). Until then validate those dimensions manually and say so.
