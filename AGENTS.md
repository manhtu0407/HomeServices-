# Home Services Agent Rules

## Operating Context

Home Services is a real Expo / React Native service app, not a motion graphics demo. Every UI pass must move the product closer to a trustworthy first real transaction in Ho Chi Minh City apartments.

Before any major implementation batch:
- rebuild the important `.md` manifest outside generated/vendor folders
- read every important `.md` file, including `critical.md`, `RULES.md`, `STRUCTURES.md`, `design.md`, `CLAUDE.md`, `MEMORY.md`, `skills.md`, `README.md`, and `docs/**/*.md`
- re-check relevant PR findings and the current touched files
- compare the intended UI work against the local recording and glass reference notes
- run React Doctor regularly after UI or React performance changes and treat reported issues as objective audit input

If the task becomes unclear, stop coding, reread the plan and the important docs, re-audit touched code, then continue.

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
1. `critical.md`
2. `RULES.md`
3. `STRUCTURES.md`
4. `design.md`
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
