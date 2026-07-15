# NestScout Agent Rules

## Operating Context

NestScout is a real Expo / React Native service app, not a motion graphics demo. Every UI pass must move the product closer to a trustworthy first real transaction in Ho Chi Minh City apartments. **This file is the Codex / Claude Code workspace router plus the owned RN-rules card** — the glass / motion / performance / data-honesty / language / scope blocks below are the quick reference the frontend flow (`governance/protocols/frontend-test.md` G1, skill `kael-frontend-test`) points back to.

## Routing - read the spoke for your task

The docs are a supporting stack in authority order. Read only what the task needs, then read `MEMORY.md` last. `MEMORY.md` holds the freshest session memory but does not override hard rules, locked docs, or code. If two sources conflict, stop and surface it — do not silently choose the source that makes implementation easier.

| When your task involves... | Read (in order) |
|---|---|
| **Every task (always)** | this file -> `governance/critical.md` (preflight §5, gates §3, task index §1) -> `MEMORY.md` (last) |
| Hard product / security / AI / data / runtime / language rules | `governance/RULES.md` |
| Workflow, taxonomy, state machines, backend contracts, "do not build now" | `governance/STRUCTURES.md` |
| Per-task execution protocol (diagnose, tdd, architecture, ai-boundary, supabase, security, ui, docs) | `governance/critical.md` §1 index -> `governance/protocols/*` (load only the selected protocol) |
| UI, motion, glass, mascot, design tokens, screen recipes | `governance/design.md` (-> `governance/design/*`) |
| Coding behavior (assumptions, simplicity, surgical diffs) | `governance/skills.md` or the `karpathy-guidelines` skill |
| Writing code — comments, headers, notes (always on) | `governance/protocols/code-hygiene.md` (skill: `kael-core-hygiene`) |
| Code enhancement / refactor (owner files per layer) | `docs/architecture/code-ownership-map.md` |
| Frontend / UI testing on the Expo app | `governance/protocols/frontend-test.md` (skill: `kael-frontend-test`) |
| Continuing or deferred plan work | `governance/Plan.md` (referenced section only) |
| Where a doc lives; adding, moving, or naming docs (`README.md` is a LOCKED filename — use `INDEX.md`) | `docs/INDEX.md` (navigation map + conventions) |
| Teaching Kael a service — knowledge distillation, playbooks | `docs/playbooks/process-distillation.md` (the SOP) + `docs/playbooks/INDEX.md` (status board) |
| Cross-session lessons and gotchas | `docs/agent-lessons.md` |
| Progress history, durable decisions, feature contracts | `README.md`, `docs/**/*.md` (navigate from `docs/INDEX.md`) |
| Project identity, strategy, response modes | `CLAUDE.md` |

## Agent Lifecycle

Use the lightweight lifecycle **Define → Plan → Build → Verify → Review → Ship**. Canonical step definitions: `governance/critical.md` §0 (Agent-Skills Lifecycle) — single-sourced there.

When alignment is unclear, ask one focused question at a time with a stated hypothesis and confidence level until Tu explicitly confirms. For non-trivial decisions, use a bounded doubt cycle: `CLAIM -> EXTRACT -> DOUBT -> RECONCILE -> STOP`.

## Execution Gates (parity with `governance/critical.md`)

Codex and Claude Code MUST run the same gates. This section is a pointer, not a second copy — `governance/critical.md` is the single source.

Before editing code:

- Run `kael-preflight` and state the pre-edit status (`governance/critical.md` §5).
- Classify the task (`governance/critical.md` §2), then load only the matching protocol file from `governance/protocols/` via the §1 index. `kael-preflight` (§5) and `kael-review` (§8) stay inline in `governance/critical.md`.
- Auto-trigger skills exist for the common protocols and live in both `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex): `kael-diagnose`, `kael-tdd`, `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep`, plus `karpathy-guidelines`. `kael-core-hygiene` is always on for any code change (comments/headers/notes) and is enforced by `pnpm lint:comments`, the comment-hygiene Stop hook, and CI.

Core quality gates (`governance/critical.md` §3) — do not bypass:

- **No False Completion**: never claim done if tests fail, build fails, verification did not run, or a required protocol was skipped.
- **Required Final Response**: end with `Changed: / Verification: / Risks/Limitations: / Next Step:`; verification lists only commands actually run and their real results.
- **Production-Ready** only when tests pass, build passes, `kael-review` passes, and no known critical limitation remains.
- **Git Rule**: never commit, push, open a PR, amend history, or run destructive git unless Tu asks in the current conversation.

After editing: run `kael-review` (`governance/critical.md` §8), then self-check against Forbidden Behaviors (`governance/critical.md` §24) and the Final Agent Checklist (`governance/critical.md` §25).

## Runtime Boundary

The store-bound runtime is `Expo React Native -> Supabase Auth -> Supabase Edge Function mobile-api -> Supabase DB/RPC/Storage/Realtime -> server-side providers`.

- `apps/mobile` is the primary customer/worker product.
- `supabase/functions/mobile-api` is the production mobile API boundary.
- `apps/api` is reference/parity/admin/support unless Tu explicitly assigns a Next.js task.
- Mobile must not call AI providers directly, store server secrets, or bypass Edge for workflow-sensitive writes.

## Code Enhancement Checklist

Before enhancing, refactoring, reorganizing, or "cleaning up" code:

- open `docs/architecture/code-ownership-map.md`
- map the task to workflow step, owner route, UI surface, state/provider, runtime boundary, shared contract, and tests
- keep routes thin, surfaces visual, providers orchestration-focused, shared contracts centralized, and workflow-sensitive writes behind Edge
- search existing helpers before adding new ones
- do not move logic across layers without naming the reason and verification impact
- update or run the narrowest matching test/static gate when a boundary changes

Before any major implementation batch:
- rebuild the important `.md` manifest outside generated/vendor folders
- read every important `.md` file in authority order, including `governance/critical.md`, `governance/RULES.md`, `governance/STRUCTURES.md`, `governance/design.md` when relevant, `CLAUDE.md`, `governance/skills.md`, `docs/architecture/code-ownership-map.md` for code changes, `README.md`, `docs/INDEX.md` (docs map) then relevant `docs/**/*.md`, `docs/agent-lessons.md` for prior gotchas, relevant `governance/Plan.md` sections, and `MEMORY.md` last
- re-check relevant PR findings and the current touched files
- compare the intended UI work against the local recording and glass reference notes
- run React Doctor regularly after UI or React performance changes and treat reported issues as objective audit input

If the task becomes unclear, stop coding, reread the plan and the important docs, re-audit touched code, then continue.

## Frontend Testing Workflow

Canonical gated workflow + RN-reality detail: `governance/protocols/frontend-test.md` (skill: `kael-frontend-test`), gates G0–G6. This is a React Native store-bound app, not a web app — evidence must come from the RN runtime (jest-expo / React Native Testing Library and device/simulator), never a browser or Expo-web stand-in; glass and motion render only on native.

Static gate (real, enforced): `pnpm type-check:mobile` and `pnpm test:mobile` (wrappers for `@nestscout/mobile` type-check + jest-expo / React Native Testing Library that inject the bundled Node runtime when agent shells lack `node`). The `Stop` hook (`.claude/hooks/verify-frontend-gates.mjs`, wired in `.claude/settings.json`) re-runs these when `apps/mobile` code changed and blocks a false "done" on a red gate.

For every frontend change, check: layout, responsive behavior, accessibility (roles/labels/state, Reduce Motion/Transparency), color contrast in both modes, motion quality (`kael-motion` / `governance/design/motion.md`), loading/empty/error/success states, performance budget (60fps; glass layer budget), and visual consistency with the glass-liquid signature (`governance/design/signature.md`). Do not claim completion without validation evidence (commands run + real results + states tested + states NOT tested). Avoid generic SaaS UI; preserve or improve the Glass/Liquid direction.

## Visual References

Use the local session recording and these glassmorphism motion references as direction only. Translate their depth, light, and tactile motion into production Expo UI instead of copying cinematic motion:
- https://www.youtube.com/shorts/r5yn3RunfMk
- https://www.youtube.com/watch?v=irN4upA56YQ&pp=ygUTZ2xhc3NwaG9yaXNtIG1vdGlvbg%3D%3D
- https://www.youtube.com/watch?v=CXnLlMyZfnw&pp=ygUTZ2xhc3NwaG9yaXNtIG1vdGlvbg%3D%3D

## Product Scope

Supported services are only:
- electrical repair
- plumbing repair
- home cleaning / housekeeping
- air conditioning / indoor air service
- sofa, mattress, curtain, and carpet care
- minor repair and installation / handyman

Do not add unsupported service categories, future-service cards, fake provider data, fake prices, fake workers, fake earnings, fake ratings, or fake queue counts.

Kael remains a product/assistant brand name in both Vietnamese and English.

## Language Rules

Vietnamese is the default and primary language. English mode is allowed only through the intended VI/EN switch.

The app must not mix visible Vietnamese and English in one selected mode. Shared labels such as service, status, problem, complexity, workflow state, role, queue, rating, earnings, and profile settings must come from the same language system.

Avoid:
- "local", "deal", "Customer", "Worker profile", "Choose area" in Vietnamese mode
- unaccented Vietnamese
- English fallback copy leaking into Vietnamese screens
- Vietnamese fallback copy leaking into English screens

## Glassmorphism Rules

Use glass as an accent layer for:
- floating tab bars
- top controls
- search/location controls
- one hero or summary card per screen
- primary CTAs
- modal/sheet shells

Do not use glass for:
- every list row
- repeated scroll cells
- dense form fields
- chat bubbles
- long text blocks
- stacked overlays

No screen should show more than 2-3 glass layers at once. Repeated rows should stay opaque or lightly tinted.

## Motion Rules

Motion should feel soft, tactile, and production-ready.

Use:
- opacity
- small y-offset
- small scale on press
- spring-like timing
- one-shot entrance or selection motion

Avoid:
- animated blur radius
- decorative infinite loops
- glass-on-glass stacking
- large parallax
- spinning
- combining scale, rotation, blur, shadow, and opacity on the same element

Reduce Motion must remove parallax, sweep, depth motion, and scale-heavy effects. Reduce Transparency must switch glass to opaque/tinted surfaces.

## Performance Budget

Target smooth 60fps minimum. Scroll and tap responsiveness are more important than extra effects.

Avoid:
- real-time blur in long lists
- repeated `BlurView` / `GlassView` cells
- heavy shadow stacks in scroll-heavy views
- unnecessary masks, blend modes, and `drawingGroup`-style offscreen work
- nested scroll layouts that trap content behind the dock or keyboard

Stabilize dimensions for chips, tab labels, service cards, CTA rows, sheets, and dock items.

## Data Honesty

Use production-safe empty states when real data is unavailable. Do not display `0`, `--`, mock ratings, mock queue, fake payout, fake worker, fake price, "Sau này", "Sắp mở", or "Local" as visible product copy unless the state is genuinely supported and localized.

Visible UI notes, implementation reminders, debug annotations, or explanatory note blocks are not product content. Remove them from screens unless they are required form labels, validation messages, or real user-facing support content.

Payment, review, worker verification, notifications, media, cancellation, and reassignment must stay honest about what is implemented.

## PR Safety

Custom dock navigation must not call `push(item.path)` for tab switching. Use tab-safe replace/back behavior so repeated taps do not build a navigation stack.

If a PR finding conflicts with current docs, priority is:
1. `governance/critical.md`
2. `governance/RULES.md`
3. `governance/STRUCTURES.md`
4. `governance/design.md`
5. production glass contract
6. reference videos/curriculum
7. local implementation preference

## Completion

A UI/motion task is not complete until:
- important docs were read for the audit loop
- text remains readable in light/dark mode
- language mode does not mix visible copy
- Reduce Motion and Reduce Transparency are handled
- repeated rows avoid heavy blur
- static gates find no forbidden patterns introduced by the change
- targeted type-check/tests pass or failures are documented
- visual frames are compared against the recording when the task touches UI
