# NestScout Agent Rules

## Operating Context

NestScout is a real Expo / React Native service app, not a motion graphics demo. Every UI pass must move the product closer to a trustworthy first real transaction in Ho Chi Minh City apartments. **This file is the Codex / Claude Code workspace router plus the owned RN-rules card** — the glass / motion / performance / data-honesty / language / scope blocks below are the quick reference the frontend flow (`governance/protocols/frontend-test.md` G1, skill `kael-frontend-test`) points back to.

## Map Process - how to read this stack

Same three tiers as `CLAUDE.md`, so Codex and Claude Code enter a task through one map. **Tier 1 is unconditional. Tier 2 depends on the task. Tier 3 depends on Tier 2.** Read `.claude/MEMORY.md` last; it is the freshest session memory but never overrides hard rules, locked docs, or code. If two sources conflict, stop and surface it — do not silently choose the source that makes implementation easier.

### Tier 1 - always, whatever the task

- `governance/RULES.md` — hard product / security / AI / data / runtime / language rules.
- `governance/critical.md` — §5 preflight, §1 task-class index to choose Tier 2, §3 gates before reporting done.
- `governance/protocols/code-hygiene.md` — every line written (skill `kael-core-hygiene`; enforced by `pnpm lint:comments` and CI for both agents, plus a Stop hook in Claude Code only — Codex runs the command by hand).
- `.claude/MEMORY.md` — read last, write back at session close (see the memory row below and §3 Session Memory Gate).

### Tier 2 - by task and difficulty

| When your task involves... | Read |
|---|---|
| **Closing a session (always)** | full entry to `docs/memory/<YYYY-MM>.md` + one line to `.claude/MEMORY.md`. Claude Code: `/kael-mem`. Codex: no slash commands — follow `docs/memory/INDEX.md` directly, same steps, same show-before-write. Gate: `governance/critical.md` §3 |
| Where the product actually is today vs. still a plan | `governance/STRUCTURES.md` §1.5 (status by PR) |
| Workflow, taxonomy, state machines, backend contracts, "do not build now" | `governance/STRUCTURES.md` |
| Per-task execution protocol (diagnose, tdd, architecture, ai-boundary, supabase, security, ui, docs) | `governance/critical.md` §1 index -> `governance/protocols/*` (load only the selected protocol) |
| UI, motion, glass, mascot, design tokens, screen recipes | `governance/design/runtime.md` (upstream adapters -> existing wheel skill + gates), then `governance/design.md` (-> `governance/design/*`) |
| Coding behavior (assumptions, simplicity, surgical diffs) | `governance/skills.md` |
| Code enhancement / refactor (owner files per layer) | `docs/architecture/code-ownership-map.md` + skill `kael-codebase-memory` for which runtime owns a symbol and what its blast radius is |
| Frontend / UI testing on the Expo app | `governance/protocols/frontend-test.md` |
| Running the database or Edge toolchain locally (real Postgres, migrations, RLS/SQL checks, `deno check`) | `docker/INDEX.md` + skill `kael-docker`. Docker here is a **dev dependency, never a deployment target** |
| Continuing or deferred plan work | `governance/Plan.md` (referenced section only) |
| Where a doc lives; adding, moving, or naming docs (`README.md` is a LOCKED filename — use `INDEX.md`) | `docs/INDEX.md` (navigation map + conventions) |
| Teaching Kael a service — knowledge distillation, playbooks | `docs/playbooks/process-distillation.md` (the SOP) + `docs/playbooks/INDEX.md` (status board) |
| Cross-session lessons and gotchas | `docs/agent-lessons.md` |
| Progress history, durable decisions, feature contracts | `README.md`, `docs/**/*.md` (navigate from `docs/INDEX.md`) |
| Project identity, strategy, response modes | `CLAUDE.md` |

### Tier 3 - skills

Two groups, 34 total: **Everyday (23)** and **Design (11)**. The canonical list is `CLAUDE.md` Tier 3 — this is a pointer, not a second copy, so the two files cannot drift. Design work always enters through `kael-design-preflight`.

Each skill declares a readiness class in `config/harness/manifest.json` — 31 `autonomous`, 3 `gated`. Readiness picks a lane rather than switching the skill off: `autonomous` fires with no precondition check, and `gated` carries a `## Preconditions` block plus a `## Degraded lane` naming what it still does when the dependency is absent. Every skill also declares a `closeout` (`report` or `inline`) matching its `## Close` block. `pnpm skills:contracts` fails when body and declaration disagree. Classes and meanings: `CLAUDE.md` Tier 3.

Codex reads the mirrored copies in `.agents/skills/`; `.claude/skills/` is canonical and `scripts/check-skills-sync.mjs` enforces parity.

## Workspace Layout

Five agent-facing locations. Know which are tracked before writing anything into them.

| Path | Tracked | Holds | Rule |
|---|---|---|---|
| `.claude/` | yes, except `worktrees/`, `settings.local.json`, `.mcp.json` | canonical skills, slash commands, `Stop` hooks, `settings.json`, `MEMORY.md` | Claude Code config. Edit skills here, then `pnpm skills:sync`. |
| `.agents/skills/` | yes | the Codex mirror of `.claude/skills/` | Generated — never edit directly. `pnpm skills:check` fails on drift. |
| `sandbox/agent/` | yes | `@nestscout/sandbox`: throwaway agent experiments | Code, but never product code. Nothing here may be imported by `apps/` or `supabase/`. |
| `.scratch/` | no — gitignored and in both `.easignore` files | disposable workbench: downloaded design packages, prototype renders, tool logs, audit output | Nothing here is a source of truth. |
| `~/.codex/` | outside the repo | Codex CLI's own config home: `config.toml`, global `AGENTS.md`, skills, rules, sessions | User-level and machine-specific. No project state belongs here, and the repo must never contain a matching `.codex/`. |

### `.scratch/` rules

- **Nothing durable stays here.** A spec, decision, or test result that matters gets promoted into `docs/` (per `docs/INDEX.md`) in the same session that produced it. Content that exists only in `.scratch/` is content git cannot protect.
- **Never create git worktrees under it.** Worktrees belong in `.claude/worktrees/`, which is ignored and known. Six stale worktrees hidden in this folder reached 5.47 GB before anyone looked.
- **Check the size before closing a session.** `du -sh .scratch` — past a few hundred MB, something was left behind. On Windows, deleting a worktree that has `node_modules` needs `git worktree remove` first, then a robocopy mirror purge; `rm -rf` and `Remove-Item` both stall on MAX_PATH inside `node_modules/.pnpm/`, and `Remove-Item` reports success after a partial delete.

## Agent Lifecycle

Use the lightweight lifecycle **Define → Plan → Build → Verify → Review → Ship**. Canonical step definitions: `governance/critical.md` §0 (Agent-Skills Lifecycle) — single-sourced there.

Run `kael-subagent-orchestration` for every task or mission before decomposition. It requires an explicit decision to stay local or delegate; it does not require spawning subagents. When delegation is justified, use the smallest set of independent, non-overlapping slices and keep integration, final review, and the user-facing response with the main agent.

When alignment is unclear, ask one focused question at a time with a stated hypothesis and confidence level until Tu explicitly confirms. For non-trivial decisions, use a bounded doubt cycle: `CLAIM -> EXTRACT -> DOUBT -> RECONCILE -> STOP`.

## Execution Gates (parity with `governance/critical.md`)

Codex and Claude Code MUST run the same gates. This section is a pointer, not a second copy — `governance/critical.md` is the single source.

Before editing code:

- Run `kael-preflight` and state the pre-edit status (`governance/critical.md` §5).
- Classify the task (`governance/critical.md` §2), then load only the matching protocol file from `governance/protocols/` via the §1 index. `kael-preflight` (§5) and `kael-review` (§8) stay inline in `governance/critical.md`.
- Auto-trigger skills exist for the common protocols and live in both `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex): `kael-subagent-orchestration`, `kael-diagnose`, `kael-tdd`, `kael-ai-boundary`, `kael-supabase`, `kael-security-sweep`, `kael-design-preflight`, `kael-design-direction`, `kael-design-intelligence`, `kael-codebase-memory`, plus `karpathy-guidelines`. `kael-work-router` runs before the work starts — it classifies the task, assigns the smallest sufficient skills, and binds reading to the slice that uses it (canonical `governance/protocols/work-router.md`). `kael-core-hygiene` is always on for any code change (comments/headers/notes), enforced by `pnpm lint:comments` and CI for both agents and by the comment-hygiene Stop hook in Claude Code only — Codex has no hooks and runs the command itself.

Core quality gates (`governance/critical.md` §3) — do not bypass:

- **No False Completion**: never claim done if tests fail, build fails, verification did not run, or a required protocol was skipped.
- **Required Final Response**: end with `Changed: / Verification: / Risks/Limitations: / Next Step:`; verification lists only commands actually run and their real results.
- **Production-Ready** only when tests pass, build passes, `kael-review` passes, and no known critical limitation remains.
- **Git Rule**: never commit, push, open a PR, amend history, or run destructive git unless Tu asks in the current conversation.

After editing: run `kael-review` (`governance/critical.md` §8), then self-check against Forbidden Behaviors (`governance/critical.md` §24) and the Final Agent Checklist (`governance/critical.md` §25).

Before reporting the session complete: write session memory, or state why no entry is needed (`governance/critical.md` §3 Session Memory Gate). Memory is an output of the session, not only an input to it — reading `.claude/MEMORY.md` at the start does not discharge this.

`.agents/` mirrors `skills` only, so **Codex has no `/kael-mem` command**. Codex follows the procedure in `docs/memory/INDEX.md` by hand: draft the entry, show it to Tu, and only then write the period file plus the one-line Recall Index entry. The gate is identical for both agents; only the trigger differs.

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
- read Tier 1 in full — `governance/RULES.md`, `governance/critical.md`, `governance/protocols/code-hygiene.md`, `.claude/MEMORY.md` last. This is unconditional and does not scale with task size.
- then read **only the Tier 2 rows the task actually touches**, and say which ones before starting. Reading every important `.md` before every batch is the front-loading `kael-work-router` exists to stop: docs loaded first are furthest from the point of use and the first to be compacted away. Let the task pick the rows — `governance/protocols/work-router.md` holds the method, `CLAUDE.md` holds the row table.
- re-check relevant PR findings and the current touched files
- compare the intended UI work against the local recording and glass reference notes
- run React Doctor regularly after UI or React performance changes and treat reported issues as objective audit input

If the task becomes unclear, stop coding, reread the plan and the important docs, re-audit touched code, then continue.

## Frontend Testing Workflow

Canonical gated workflow + RN-reality detail: `governance/protocols/frontend-test.md` (skill: `kael-frontend-test`), gates G0–G6. This is a React Native store-bound app, not a web app — evidence must come from the RN runtime (jest-expo / React Native Testing Library and device/simulator), never a browser or Expo-web stand-in; glass and motion render only on native.

Static gate (real, enforced): `pnpm type-check:mobile` and `pnpm test:mobile` (wrappers for `@nestscout/mobile` type-check + jest-expo / React Native Testing Library; they dispatch through `scripts/run.mjs`, so they run on Windows, Linux, and macOS alike). The `Stop` hook (`.claude/hooks/verify-frontend-gates.mjs`) re-runs these when `apps/mobile` code changed and blocks a false "done" on a red gate — but it is wired in `.claude/settings.json`, so it fires for Claude Code only. Codex has no hook and MUST run both commands itself before claiming a frontend task done.

For every frontend change, first record the upstream-aware design preflight, then check: layout, responsive behavior, accessibility (roles/labels/state, Reduce Motion/Transparency), color contrast in both modes, motion quality (`kael-motion` / `governance/design/motion.md`), loading/empty/error/success states, performance budget (60fps; glass layer budget), and visual consistency with the glass-liquid signature (`governance/design/signature.md`). Do not claim completion without validation evidence (commands run + real results + states tested + states NOT tested). Avoid generic SaaS UI; preserve or improve the Glass/Liquid direction.

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
- session memory was written (Claude Code: `/kael-mem`; Codex: by hand per `docs/memory/INDEX.md`), or the Session Memory Gate was declared not applicable
