# Dynamic Notifications sandbox

This isolated Expo app adapts the pinned [`rit3zh/expo-dynamic-notifications`](https://github.com/rit3zh/expo-dynamic-notifications) source at `5de059a5cbefbe28c14efbe785166665a7c70bc5`. The full unmodified archive and extracted tree remain under `docs/design-research/corpus/upstream/expo-dynamic-notifications/`; the original MIT license is included here too. This sandbox is separate from `apps/mobile` and must not be imported into product code.

It is an **in-app overlay demo**. It does not send push notifications, integrate iOS Live Activities, deliver system notifications, call a backend, or represent a business queue. All visible notification content is synthetic and test-only.

## Run the sandbox

Install dependencies into this directory without adding them to the NestScout app workspace, then run the checks and choose a native device/emulator:

```powershell
corepack pnpm install --dir sandbox/agent/dynamic-notifications --ignore-workspace
corepack pnpm --dir sandbox/agent/dynamic-notifications test
corepack pnpm --dir sandbox/agent/dynamic-notifications type-check
corepack pnpm --dir sandbox/agent/dynamic-notifications bundle:android
corepack pnpm --dir sandbox/agent/dynamic-notifications bundle:ios
corepack pnpm --dir sandbox/agent/dynamic-notifications start
```

`bundle:ios` is a JavaScript/native-module bundler check; it is not an iOS build or device test. Use `pnpm start` and open the project on a real Android/iOS device or emulator to verify native rendering. Expo web is not native evidence.

## Adaptation map

| Sandbox file | Change from upstream |
|---|---|
| `src/hooks/use-content-blur.ts` | Animates opacity only; it no longer drives BlurView intensity. |
| `src/components/dynamic-notifications/content.tsx` | Uses fixed intensity blur, honors Reduce Transparency with an opaque card, and exposes an announcement plus screen-reader dismiss action. |
| `src/components/dynamic-notifications/gooey.tsx` | Uses a stable, solid island/card treatment when Reduce Transparency is enabled. |
| `src/components/dynamic-notifications/root.tsx` and `src/hooks/use-notification-timeline.ts` | Follow system Reduce Motion, allow explicit test control, settle transitions immediately when enabled, retain duration/replace/dismiss behavior, and clean up timers/animations. |
| `src/components/ui/notification-body.tsx` | Allows text to scale and wrap; provider geometry grows with the system font scale. |
| `src/app/index.tsx` | Replaces the upstream social-feed demo with a clearly marked synthetic test surface, VI/EN, light/dark, reduced-motion/transparency, duration, replacement, custom-render, callback and dismiss controls. |
| `src/app/_layout.tsx` | Keeps only the standalone Expo Router stack. |

The source package API remains available: `trigger`, `dismiss`, root/per-item duration including `null`, `onDismiss`, per-item `onPress`, custom `render`, geometry/color parameters, and the motion driver shared values. Its replacement model has one current item and one replaceable pending item; this is preserved and not promoted into a durable queue. The demo contains manual controls for checking these behaviors; static contract checks do not substitute for running them on device.

## Native verification checklist

Record the device/OS, build SHA, steps, observed result, and capture for every tested cell. Use **UNVERIFIED** where no native device/emulator evidence exists.

| Check | Status |
|---|---|
| Trigger, tap callback, gesture dismiss, explicit dismiss, and `onDismiss` | UNVERIFIED until exercised on device |
| Finite duration, `duration: null`, and per-item override | UNVERIFIED until exercised on device |
| Rapid replacement and latest pending item | UNVERIFIED until exercised on device |
| Custom render, screen-reader label/action, VoiceOver and TalkBack | UNVERIFIED until exercised on native screen readers |
| Safe-area top inset, narrow/wide dimensions and rotation | UNVERIFIED until exercised on device |
| Light/dark, VI/EN, large dynamic type | UNVERIFIED until exercised on device |
| System Reduce Motion plus demo override | UNVERIFIED until exercised on device |
| Reduce Transparency solid surfaces | UNVERIFIED until exercised on device |
| Responsiveness/frame pacing and unmount cleanup | UNVERIFIED until profiled/exercised on device |

The sandbox type-check, static contract test, and platform bundle checks can pass independently of this native matrix. Upstream images/fonts remain sandbox-only; check separate third-party rights before redistributing them.
