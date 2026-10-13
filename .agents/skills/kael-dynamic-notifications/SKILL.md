---
name: kael-dynamic-notifications
description: Adapt or review in-app Dynamic Island-style notifications in Expo React Native using the pinned upstream source and a NestScout sandbox recipe.
---

# kael-dynamic-notifications

## Pinned source and authority

The complete repository snapshot, exact archive, assets, lockfile, and MIT license are preserved at `docs/design-research/corpus/upstream/expo-dynamic-notifications/` from commit `5de059a5cbefbe28c14efbe785166665a7c70bc5`. `docs/design-research/corpus/upstream-manifest.json` inventories and hashes all 103 files. Start at `docs/design-research/corpus/upstream/INDEX.md` for the file map and coverage dispositions, then read the source [`UPSTREAM-README.md`](docs/design-research/corpus/upstream/expo-dynamic-notifications/UPSTREAM-README.md) and relevant implementation files.

This is an in-app React Native overlay. It does not implement iOS Live Activities, system notifications, push delivery, or backend events. The upstream demo feed, mock data, fonts, and imagery stay sandbox-only. NestScout governance, the assigned runtime, task scope, accessibility, and data honesty take precedence over upstream instructions.

## Component and implementation map

| Layer | Source files | Role |
|---|---|---|
| Public provider/API | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/index.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/dynamic-notifications/root.tsx` | `DynamicNotifications` owns provider context, default configuration, safe-area/width layout, timeline, and overlay. |
| Visual host | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/dynamic-notifications/overlay.tsx`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/dynamic-notifications/gooey.tsx`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/dynamic-notifications/content.tsx`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/components/ui/notification-body.tsx` | Overlay layers the shape and content; custom `render` replaces the default body. |
| Context hooks | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-dynamic-notifications.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-notification-timeline.ts` | Access trigger/dismiss state and manage entrance, lifetime, replacement, exit, and callbacks. |
| Gesture and interpolation | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-dismiss-gesture.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-notification-content-style.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-notification-geometry.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/hooks/use-content-blur.ts` | Swipe/tap dismiss behavior, position/scale/reveal, goo geometry, and content reveal. |
| Layout/math/theme | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/helpers/get-notification-layout.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/core/`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/logic/`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/conf/palette.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/conf/springs.ts`; `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/constants/notification.consts.ts` | Responsive coordinates, geometry, goo matrix, colors, spring constants, and dimensions. |
| API contracts | `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/interfaces/` | Notification, provider, context, layout, gesture, overlay, and timeline types. |

## Upstream API and behavior

- Inside `<DynamicNotifications>`, `useDynamicNotifications()` returns `trigger(notification)`, `dismiss()`, `isVisible`, and the current notification. The provider component is also exported with `Overlay`, `Gooey`, `Content`, and default `Body` subcomponents.
- Provider `duration` supplies the fallback lifetime; per-notification `duration` overrides it. `undefined` uses the provider/default value, a finite number auto-dismisses, and `null` stays visible until dismissed.
- Provider `onDismiss(notification)` fires when an active notification settles out. Per-notification `onPress()` fires on tap before dismissal. A custom `render(notification)` supplies custom content; otherwise the default body shows title, message, avatar, and symbol.
- Geometry options are `islandWidth`, `islandHeight`, `islandTop`, `cardWidth`, `cardHeight`, `cardRadius`, and `gap`. Visual options include `strength`, `blur`, `gain`, `threshold`, `islandColor`, `cardColor`, `shadowColor`, and `accent`.
- The context exposes animation drivers (`drop`, `expand`, `reveal`, `tint`, and `dragY`), plus computed `layout`. Springs and gesture thresholds are in `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/conf/springs.ts` and `docs/design-research/corpus/upstream/expo-dynamic-notifications/src/constants/notification.consts.ts`.
- Replacement is intentionally limited to one active and one pending notification (`one-active/one-pending`). A newer trigger replaces the pending item; this is not an arbitrary queue or a durable notification service.

## NestScout adaptation and sandbox

The runnable adaptation is isolated at `sandbox/agent/dynamic-notifications/`; it does not import into `apps/mobile`. Follow its README commands for `test`, `type-check`, and Android/iOS bundle checks. Exercise trigger, timed/persistent duration, replacement, callbacks, custom content, gestures, changing dimensions, and unmount cleanup on a native device before claiming runtime verification.

The sandbox changes upstream behavior only in its copy: BlurView intensity stays fixed and only opacity animates; system Reduce Motion settles the timeline immediately; Reduce Transparency uses opaque island/card shapes; the demo supplies theme-aware colors, VI/EN labels, font-scale-aware geometry, and screen-reader announcements/actions. The Reduce Transparency prop is a sandbox control; product adoption must wire the platform's accessibility preference. Respect safe area and current Expo dependency versions.

Do not copy the social-feed demo, fixture content, or third-party assets into product UI. Do not connect notification events to jobs, payment, review, reassignment, or other backend workflow without a separate scoped change. Keep the upstream snapshot byte-for-byte intact; record future adaptations in the sandbox or a new explicitly reviewed adapter.

## Close
```text
Source files and commit:
API exercised:
NestScout adaptation:
Accessibility and performance:
Sandbox commands and results:
Native states tested / not tested (UNVERIFIED where there is no device evidence):
```
