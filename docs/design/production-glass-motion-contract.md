# Production Glass Motion Contract

## Direction

The production direction is Balanced glassmorphism for the existing XanhSM-inspired Home Services mobile UI. The app should feel premium, mint, calm, and tactile without becoming a motion graphics demo.

The supplied videos and prompt are design references. During this implementation pass, YouTube frames were not reliably accessible from the local environment, so the written brief is the source of truth. No timestamp-specific claims should be made unless frames are inspected directly later.

## Official Expo Basis

- Expo SDK 54 `expo-glass-effect`: https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/
- Expo SDK 54 `expo-blur`: https://docs.expo.dev/versions/v54.0.0/sdk/blur-view/
- Expo SDK 54 changelog: https://expo.dev/changelog/sdk-54
- `GlassView` is iOS 26+ and falls back to a regular `View` on unsupported platforms, so production UI must not depend on glass for readability.
- `BlurView` is appropriate for navigation bars, tab bars, and modals, but should not sit before dynamic list content; repeated scroll content should stay opaque or lightly tinted.

## Options

- Safe: glass only on navigation, sheets, and primary buttons. This is the lowest performance risk but does not deliver enough visual enhancement for this pass.
- Balanced: glass accents on navigation, primary controls, modal/sheet shells, and one hero/summary surface per section. Repeated rows and dense forms stay opaque or lightly tinted. This is the selected production direction.
- Bold: richer edge highlights, hero sweeps, and stronger depth. Rejected for this production pass because the current Expo Go feedback already shows lag risk.

## Production Rules

- Glass is an accent layer, not the content layer.
- Main text, forms, chat messages, job rows, history rows, and ledger rows remain readable and mostly opaque.
- No screen should rely on more than 2-3 visible glass layers at once.
- Motion uses opacity, small y-offset, and press scale. It does not animate blur radius.
- Decorative looping motion is disabled unless it communicates loading or status.
- Reduce Motion removes parallax, sweep, and scale-heavy effects.
- Reduce Transparency falls back to stronger opaque/tinted surfaces.
- Native Liquid Glass and blur packages are installed for Expo SDK 54: `expo-glass-effect@~0.1.10` and `expo-blur@~15.0.8`. The shared `GlassSurface` uses `GlassView` only when `isLiquidGlassAvailable()` returns true, falls back to low-intensity `BlurView`, and uses a mostly opaque `View` when Reduce Transparency is enabled.

## Performance Budget

- Preserve smooth scroll first; visual polish is secondary.
- Avoid `backdropFilter`, `filter: blur`, custom real-time blur, and heavy shadow stacks in scroll-heavy content.
- Use restrained shadows only for floating controls, sheets, and hero surfaces.
- Repeated rows use opaque/tinted backgrounds with borders, not glass sheens.
- Static risk counts for glass/motion terms should be lower after migration, and any remaining loops must be justified by real loading/status behavior.
