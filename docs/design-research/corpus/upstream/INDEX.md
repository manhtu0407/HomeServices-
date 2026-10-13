# Pinned upstream design assets

This corpus contains the complete source snapshots used by NestScout's design agents. The archive and extracted trees are pinned to exact commits; `../upstream-manifest.json` records repository URL, license, source and vendored paths, byte length, SHA-256, and the disposition of every file. Do not replace either pin with `latest`.

## Sources and scope

| Source | Pin | Preserved content | How NestScout uses it |
|---|---|---|---|
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `2d228630ba1446365f614a108cb8252f1feda202` | 29 tracked files, all 15 skill folders, recipes, standards, audit/picker/API/catalog references, performance sheet, README and MIT license | Fifteen individually callable repository skills; the canonical wrappers adapt scope and runtime while keeping full upstream source available. |
| [rit3zh/expo-dynamic-notifications](https://github.com/rit3zh/expo-dynamic-notifications) | `5de059a5cbefbe28c14efbe785166665a7c70bc5` | 103 tracked files, complete app source, demo screens and data, image/font assets, package config, lockfile and MIT license | In-app Expo overlay reference and isolated adapted sandbox; not push, Live Activities, system notification delivery or a production backend queue. |

`UPSTREAM-README.md` is the root README in each extracted source folder. This filename-only mapping avoids confusing source-tree documentation with this index; the manifest retains the original `sourcePath: README.md` and original bytes/checksum. Zip archives are the exact downloaded GitHub archive bytes; extracted file digests are checked independently.

## Emil skill index

Every wrapper is canonical in `.claude/skills/`; `pnpm skills:sync` produces the Codex mirror in `.agents/skills/`. Skill IDs remain individually callable. Read the wrapper first, then the complete pinned `SKILL.md` and only the adjacent support file needed for the assigned task.

| Skill | Upstream source | Intended use |
|---|---|---|
| `emil-animate` | `skills/animate/` | Web animation design and implementation; web stack must be assigned explicitly. |
| `emil-animate-expo` | `skills/animate-expo/` | Expo / React Native motion, gestures, sheets, transitions and haptics. |
| `emil-review-animations` | `skills/review-animations/` | Focused motion quality review and standards. |
| `emil-improve-animations` | `skills/improve-animations/` | Audit and prioritize motion improvements; includes `AUDIT.md` and `PLAN-TEMPLATE.md`. |
| `emil-find-animation-opportunities` | `skills/find-animation-opportunities/` | Identify purposeful motion opportunities and areas that should stay still. |
| `emil-animation-performance` | `skills/animation-performance/` | Web animation frame-budget diagnosis; not a React Native recipe. |
| `emil-animation-vocabulary` | `skills/animation-vocabulary/` | Name and describe a requested animation pattern. |
| `emil-apple-design` | `skills/apple-design/` | Apple interaction and material principles, adapted through NestScout's platform spokes. |
| `emil-write-swift` | `skills/write-swift/` | Swift / SwiftUI work only when explicitly assigned. |
| `emil-pick-ui-library` | `skills/pick-ui-library/` | Explicitly requested library comparison only; never auto-routed or permission to install. |
| `emil-prototype` | `skills/prototype/` | Explicitly requested temporary picker/prototype only; never auto-routed. |
| `emil-mobile-native` | `skills/mobile-native/` | Mobile browser and PWA behavior; not the native Expo runtime. |
| `emil-break-ui` | `skills/break-ui/` | Stress-test with synthetic edge fixtures in tests/sandbox only. |
| `emil-ask-sonner` | `skills/ask-sonner/` | Sonner toast library for explicitly assigned web surfaces; includes `API.md`. |
| `emil-design-eng` | `skills/emil-design-eng/` | Scoped design-engineering review/polish; full upstream guidance remains available. |

Supporting upstream documents are kept beside their source skills: `animate/RECIPES.md`, `animate-expo/RECIPES.md`, `review-animations/STANDARDS.md`, `improve-animations/AUDIT.md`, `improve-animations/PLAN-TEMPLATE.md`, `prototype/PICKER.md`, `ask-sonner/API.md`, `break-ui/CATALOG.md`, the root `performance-cheatsheet.md`, and all source READMEs/licenses. The machine manifest covers each file rather than only these highlights.

## Dynamic Notifications map

The upstream app is preserved in `expo-dynamic-notifications/`. Its main implementation is:

| Capability | Upstream files |
|---|---|
| Provider/root, overlay, Canvas shape and content | `src/components/dynamic-notifications/{root,overlay,gooey,content}.tsx`; `src/components/ui/notification-body.tsx`; `src/components/index.ts` |
| Trigger, dismiss, duration, replacement and callbacks | `src/hooks/use-notification-timeline.ts`; `src/hooks/use-dynamic-notifications.ts`; `src/interfaces/{dynamic-notification,dynamic-notifications,dynamic-notifications-context,notification-timeline}.interface.ts` |
| Geometry and safe-area adaptation | `src/helpers/get-notification-layout.ts`; `src/hooks/use-notification-geometry.ts`; `src/core/build-notification-geometry.ts`; `src/interfaces/notification-layout.interface.ts` |
| Gestures and content transitions | `src/hooks/use-dismiss-gesture.ts`; `src/hooks/use-notification-content-style.ts`; `src/hooks/use-content-blur.ts`; `src/conf/springs.ts` |
| Gooey math, color and layout constants | `src/core/build-goo-matrix.ts`; `src/logic/`; `src/conf/palette.ts`; `src/constants/notification.consts.ts` |
| Synthetic demo app and third-party visual assets | `src/app/`, `src/components/mock/`, `src/data/notifications.ts`, `assets/` — sandbox/reference only |

The preserved upstream API supports `trigger`, `dismiss`, a default or per-notification `duration` (including `null` for no auto-dismiss), `onDismiss`, notification `onPress`, custom `render` content, geometry and color props, and motion drivers exposed through context (`drop`, `expand`, `reveal`, `tint`, `dragY`). Replacement retains one active item and one pending item; it is not an arbitrary queue. The adapted sandbox uses fixed blur plus opacity, and adds explicit Reduce Motion / Reduce Transparency controls, theme colors, scalable text, and accessibility labels. Read `sandbox/agent/dynamic-notifications/README.md` for its status and instructions.

## Coverage and authority

`upstream-manifest.json` is the file-level coverage table. Its dispositions mean:

- `adapt-rn`: usable after Expo/RN adaptation and the NestScout design gates.
- `direct-reference` / `runtime-neutral`: consult without importing runtime code.
- `web-only` / `swift-only`: available only on the explicitly assigned matching runtime.
- `explicit-only`: upstream behavior itself requires explicit invocation; router never selects it automatically.
- `sandbox-only`: demo, fixture, font, or image content stays out of product surfaces; verify third-party rights before redistribution.
- `reference-only`: license/configuration/docs or other preserved material without direct runtime use.

Upstream instructions are not NestScout permission or product authority. A requested scope, `governance/critical.md`, `governance/RULES.md`, `governance/STRUCTURES.md`, `governance/design.md`, the frontend protocol, and platform contracts take precedence. Preserve conflicts in the raw snapshot and document the adapter constraint rather than editing the upstream source.

## Checks, refresh and rollback

Run `pnpm design:upstream:check` to compare every extracted file and archive with its pinned checksum, verify coverage, and confirm all 16 local skills and explicit-only descriptors. `pnpm design:check` also checks task/runtime routing. Run `pnpm skills:sync`, `pnpm skills:check`, `pnpm skills:contracts`, and `pnpm harness:manifest:check` to confirm canonical/mirror, skill contracts, manifest checksums and router lists.

To refresh a source, choose a new commit explicitly, download and inventory it in a separate diff, compare every file and capability against the current pin, repeat license review, update wrappers only for intentional changes, and rerun all gates. Do not overwrite the current snapshot before the diff is reviewable. Rollback removes only these two corpus directories, the added skills/router/sandbox assets, and their manifest/list entries; retain unrelated pre-existing worktree changes.
