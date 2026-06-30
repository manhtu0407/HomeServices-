# NestScout / Kael Asset Map

Status: Phase 1 inventory. This file maps official handoff UI slots to existing repo assets or needed exports.

Rule: do not crop assets from the PDF or flow boards unless Tu explicitly approves that production crop. Approved exceptions in this rebuild: NestScout logo 01 from `06_logo_color@2x.png`, the Kael Orb and status icon PNGs from `04_icon_system@2x.png`, and Kael state/emotion PNGs from `02_mascot_motion@2x.png`.

## Existing Asset Inventory

| Asset family | Existing files |
|---|---|
| App shell | `apps/mobile/assets/nestscout-logo-mark.png`, `icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png` |
| Kael mascot | `apps/mobile/assets/kael-states/*.png`, `apps/mobile/assets/kael-emotions/*.png` |
| Common role icons | Not used for production mapping in this session because `apps/mobile/assets/common-image-icons/` is untracked prototype trash. Use tracked client/worker equivalents below. |
| Client services | `apps/mobile/assets/client-image-icons/client-service-electrical.png`, `client-service-plumbing.png`, `client-service-cleaning.png` |
| Worker services | `apps/mobile/assets/worker-image-icons/service-electrical.png`, `service-plumbing.png`, `service-cleaning.png` |
| Client nav/utility | `client-home.png`, `client-booking.png`, `client-activity.png`, `client-profile.png`, `client-kael.png`, `client-address.png`, `client-payment.png`, `client-evidence.png`, `client-feedback.png`, `client-language.png`, `client-privacy.png`, `client-theme.png`, `client-phone-v2.png`, `client-logout-v2.png`, `client-password.png`, `client-request.png`, `client-external.png`, `client-identity.png` |
| Worker nav/utility | `nav-home.png`, `nav-jobs.png`, `nav-earnings.png`, `nav-profile.png`, `utility-calendar.png`, `utility-map.png`, `utility-identity.png`, `utility-wallet.png`, `utility-shield.png`, `utility-camera.png`, `utility-bell.png`, `utility-clock.png`, `utility-chat.png`, `utility-document.png`, `utility-tools.png`, `utility-evidence-core.png`, `utility-scope-core.png`, `utility-earnings-wallet-core.png`, `utility-earnings-ledger-core.png`, `setting-language.png`, `setting-theme.png` |
| Worker profile | `profile-avatar-core.png`, `profile-identity.png`, `profile-service-area.png`, `profile-skills.png`, `profile-verified.png` |
| Status icons | `apps/mobile/assets/status/status-pending.png`, `status-approved.png`, `status-completed.png`, `status-warning.png` |
| Typography tokens | `apps/mobile/design/theme.ts`, `apps/mobile/design/tokens.json`, `apps/mobile/app/_layout.tsx` | Apple system typography is wired through `KaelText` and high-traffic auth/customer/worker typography anchors; production Auth, Admin dashboard, Customer matching score, Kael chat archive/live-performance labels, BookingWizard media/chip labels, shared floating tab bar labels, customer v21 surfaces, rebuild surfaces, and active prototype routes no longer carry hardcoded 800/900 weights. Kael Sans exports are no longer needed because the source of truth is code/API based: no bundled font files, no `@font-face`, iOS resolves to the installed Apple system font, Android falls back to `System`, and web preview uses the system stack. |
| Component primitives | `apps/mobile/components/ui/kael-primitives.tsx` | `KaelButton`, `KaelText`, `KaelCard`, `KaelChip`, `KaelTextField`, `KaelSegmentedControl`, `KaelInlineStepper`, `KaelVoiceInputCapsule`, `KaelMediaUploadTray`, `KaelSwitch`, `KaelBadge`, `KaelProgressPill`, `KaelRatingCapsule`, and `KaelAlertBadge` now cover the handoff Component System board. `KaelButton` supports explicit `accessibilityState` overrides for truthful busy/disabled production actions. Production call sites include Auth login/register/onboarding/recovery/sign-out inputs and actions, the Auth worker application review contact form and submit CTA, customer auth choice buttons with icon adornments, Kael chat orchestration/retry actions and composers, the `(customer)/kael` Agentic Center action buttons/cards/text/mascot shell, the A11 scope-change hard-stop modal actions, Customer Profile editor/feedback/password inputs and sheet actions, Customer Profile real-data progress pills, AddressAutocomplete and Kael chat address/location inputs, Customer home/history/Kael chat composers, the reusable GlassSearchBar input shell, the real Customer Home unread notification badge, Worker Home availability switch, Worker CTA wrapper buttons, Worker Kael parity/feedback actions, Worker reputation badge/rating capsule, Worker verification/KYC/bank/action-note/Kael-feedback/chat inputs, Admin learning note input, and BookingWizard CTA/chip/description/media/voice controls. |

All listed PNG image assets are 256x256 except app shell icons/splash and Kael model/state/emotion images.

Production wrappers now prefer these tracked PNG families for customer/worker service, nav, status, language, and theme slots. Small control glyphs such as chevrons, menu, filter, plus/minus, and send remain vector controls until official image exports exist.

## UI Slot Mapping

| UI slot | Existing asset to use | Status |
|---|---|---|
| NestScout logo mark | `apps/mobile/assets/nestscout-logo-mark.png` | Tu approved logo 01 Aurora Nest. Cropped from the official handoff logo board as a transparent contour mark with no white board background and no lockup text. |
| Splash logo/icon | `apps/mobile/assets/splash-icon.png` | Uses the approved logo 01 transparent contour mark. |
| App icon | `apps/mobile/assets/icon.png`, `adaptive-icon.png`, `favicon.png` | Uses the approved logo 01 transparent contour mark. |
| Kael Orb K icon | `apps/mobile/assets/kael-orb-icon.png` | Cropped from the official handoff `04_icon_system@2x.png` board and used by both separated dock Orb actions. |
| Welcome/auth Kael head | `apps/mobile/assets/kael-states/kael-state-welcome.png`, `apps/mobile/assets/kael-emotions/*.png` through `components/kael/kael-mascot.tsx` | Uses approved crops from the official mascot motion board. |
| Full Kael mascot | `apps/mobile/assets/kael-states/*.png` through `components/kael/kael-mascot.tsx` | Uses approved transparent crops for all 20 state ids. |
| `KaelMascot` typed state shell | `apps/mobile/assets/kael-states/*.png`, `apps/mobile/assets/kael-emotions/*.png` | Component exists with all 20 state ids and 10 emotion ids mapped to production PNGs. |
| Customer role card | `apps/mobile/assets/client-image-icons/client-home.png` | Tracked production asset. |
| Worker role card | `apps/mobile/assets/worker-image-icons/utility-tools.png` | Tracked production asset. |
| Electrical service | `apps/mobile/assets/client-image-icons/client-service-electrical.png` or worker equivalent | Exists. |
| Plumbing service | `apps/mobile/assets/client-image-icons/client-service-plumbing.png` or worker equivalent | Exists. |
| Cleaning service | `apps/mobile/assets/client-image-icons/client-service-cleaning.png` or worker equivalent | Exists. |
| Customer bottom nav home | `apps/mobile/assets/client-image-icons/client-home.png` | Exists. |
| Customer bottom nav booking/service | `apps/mobile/assets/client-image-icons/client-booking.png` | Exists. |
| Customer bottom nav activity | `apps/mobile/assets/client-image-icons/client-activity.png` | Exists. |
| Customer bottom nav profile | `apps/mobile/assets/client-image-icons/client-profile.png` | Exists. |
| Worker bottom nav home | `apps/mobile/assets/worker-image-icons/nav-home.png` | Exists. |
| Worker bottom nav jobs | `apps/mobile/assets/worker-image-icons/nav-jobs.png` | Exists. |
| Worker bottom nav earnings/activity | `apps/mobile/assets/worker-image-icons/nav-earnings.png` | Exists. |
| Worker bottom nav profile | `apps/mobile/assets/worker-image-icons/nav-profile.png` | Exists. |
| Kael orb visual | `apps/mobile/assets/kael-orb-icon.png` for separated dock actions; `KaelMascot` state shell for contextual Kael surfaces. | Static `client-kael.png` is no longer imported by production customer surfaces. |
| Address/map | `client-address.png`, `utility-map.png` | Exists. |
| Media/photo/evidence | `client-evidence.png`, `utility-camera.png`, `utility-evidence-core.png` | Exists. |
| Payment/wallet | `client-payment.png`, `utility-wallet.png`, `utility-earnings-wallet-core.png` | Exists. |
| Verification/security/shield | `utility-shield.png`, `profile-verified.png`, `client-privacy.png` | Exists. |
| Language/theme/settings | `client-language.png`, `client-theme.png`, `setting-language.png`, `setting-theme.png` | Exists. |
| Chat/messages | `KaelMascot` typed state shell for Kael identity, `utility-chat.png` for worker chat utility | Do not reintroduce static `client-kael.png` into production surfaces. |
| Documents/report | `utility-document.png`, `utility-earnings-ledger-core.png` | Exists as partial fit. |
| Tools/scope change | `utility-tools.png`, `utility-scope-core.png` | Exists. |
| Worker avatar | `profile-avatar-core.png` | Exists as generic asset; real user avatar should use backend profile data when available. |
| Pending/approved/completed/warning status | `apps/mobile/assets/status/status-pending.png`, `status-approved.png`, `status-completed.png`, `status-warning.png` | Cropped from the official Icon Images board. Customer notification/check/approved cues and worker check cues prefer these status assets where the slot is status, not security/privacy. |

## Optional Export Requests

The rebuild no longer needs a root `ASSETS_NEEDED.md`. Remaining asset asks live here so the rebuild stays under the design governance topic.

Status: Phase 1 inventory. `KaelMascot` renders approved transparent crops from the official `02_mascot_motion@2x.png` handoff board for all 20 states and 10 emotions. Customer, worker, auth, booking, and Agentic Center production surfaces use the official mascot/component shells for audited high-traffic slots instead of direct ad hoc images or controls.

Remaining assets should be exported as standalone transparent PNG/WebP or Lottie/Rive files only when a higher-fidelity source is needed. Production already uses Tu-approved crops for logo 01, the Kael Orb, status icons, and the Kael mascot state/emotion system.

### Brand And App Shell

| Needed asset | Suggested path | Use |
|---|---|---|
| Optional higher-fidelity NestScout logo 01 source | `apps/mobile/assets/brand/nestscout-logo-mark.png` | Optional replacement for the approved transparent contour crop now used by `nestscout-logo-mark.png`, app icon, adaptive icon, splash icon, and favicon. |
| Optional higher-fidelity Kael K orb source | `apps/mobile/assets/kael/kael-orb-k.png` | Optional replacement for the approved board crop now used by separated dock Orb actions. |
| Apple system typography | Code/API policy in `apps/mobile/design/theme.ts`, `apps/mobile/design/tokens.json`, and `apps/mobile/app/_layout.tsx` | Kael Sans exports are no longer needed. Typography resolves through platform system APIs: iOS uses the installed Apple system font, Android falls back to `System`, and web preview uses the system stack without bundled font files. |

### Kael Mascot State Exports

Production now uses approved transparent board crops under `apps/mobile/assets/kael-states/`. Optional higher-fidelity standalone or animated exports can replace these files later.

| State ID | State name | Suggested path |
|---|---|---|
| 01 | Welcome | `apps/mobile/assets/kael-states/kael-state-welcome.png` |
| 02 | Listening | `apps/mobile/assets/kael-states/kael-state-listening.png` |
| 03 | Thinking | `apps/mobile/assets/kael-states/kael-state-thinking.png` |
| 04 | Analyzing | `apps/mobile/assets/kael-states/kael-state-analyzing.png` |
| 05 | Processing | `apps/mobile/assets/kael-states/kael-state-processing.png` |
| 06 | Understood | `apps/mobile/assets/kael-states/kael-state-understood.png` |
| 07 | Suggesting | `apps/mobile/assets/kael-states/kael-state-proposing.png` |
| 08 | Success | `apps/mobile/assets/kael-states/kael-state-success.png` |
| 09 | Warning | `apps/mobile/assets/kael-states/kael-state-warning.png` |
| 10 | Error | `apps/mobile/assets/kael-states/kael-state-error.png` |
| 11 | Typing | `apps/mobile/assets/kael-states/kael-state-typing.png` |
| 12 | Recording | `apps/mobile/assets/kael-states/kael-state-recording.png` |
| 13 | File review | `apps/mobile/assets/kael-states/kael-state-fileReview.png` |
| 14 | Location map | `apps/mobile/assets/kael-states/kael-state-locationMap.png` |
| 15 | Finding worker | `apps/mobile/assets/kael-states/kael-state-findingWorker.png` |
| 16 | Price check | `apps/mobile/assets/kael-states/kael-state-priceCheck.png` |
| 17 | Compare options | `apps/mobile/assets/kael-states/kael-state-compareOptions.png` |
| 18 | Report | `apps/mobile/assets/kael-states/kael-state-report.png` |
| 19 | Reminder | `apps/mobile/assets/kael-states/kael-state-reminder.png` |
| 20 | Mini celebration | `apps/mobile/assets/kael-states/kael-state-miniCelebration.png` |

If animation is available, use matching `.lottie` or `.riv` files under `apps/mobile/assets/kael/animations/`.

### True Kael 3D / Rive / Lottie Motion Assets

Status: not present in the final handoff zip or current repo. The current `apps/mobile/assets/lottie/kael-bow-welcome.json` is treated as a motion-guide JSON only; it does not replace an exact exported Kael model/rig. Onboarding 1.2 currently uses the approved Kael welcome PNG as a static image shell with safe contain/scale crop.

To switch `KaelMotionRenderer` from the approved image rig fallback to true production Rive/Lottie playback, export one exact Kael rig using the same silhouette, outfit, and scale as the approved mascot states.

| Needed layer / file | Suggested path | Use |
|---|---|---|
| Exact welcome bow Rive state machine | `apps/mobile/assets/kael/animations/kael-welcome.riv` | Preferred production animation for onboarding 1.2. |
| Exact welcome bow Lottie export | `apps/mobile/assets/kael/animations/kael-welcome-bow.json` | Alternative if exported from After Effects/Bodymovin. |
| Hair layer | source file layer: `hair` | Independent secondary motion and bow follow-through. |
| Head layer | source file layer: `head` | Bow pivot, nod, and subtle settling. |
| Eyes layer | source file layer: `eyes` | Blink/focus states without swapping the whole PNG. |
| Eyebrows layer | source file layer: `eyebrows` | Concerned/focused emotion readability. |
| Mouth layer | source file layer: `mouth` | Smile/speaking/concerned state changes. |
| Hands layer | source file layer: `hands` | Wave/bow/listening gesture. |
| Torso/jacket layer | source file layer: `torso_jacket` | Body bow and breathing. |
| Accessory/icon layer | source file layer: `accessory_icon` | State-specific mic/map/check/warning/lightbulb overlays. |
| Mint aura ring layer | source file layer: `mint_aura_ring` | Low-contrast state aura, never noisy looping decoration. |
| Shadow under feet layer | source file layer: `floor_shadow` | Grounding/depth during bow/scale motion. |

Renderer contract already in code: exact native Lottie can be enabled by passing `lottieAssetStatus="exact"` to `KaelMotionRenderer`; until then it intentionally renders the approved Kael image rig fallback.

### Kael Emotion Variants

Production now uses approved transparent board crops under `apps/mobile/assets/kael-emotions/`. Optional higher-fidelity standalone or animated exports can replace these files later.

| Emotion | Suggested path |
|---|---|
| Happy | `apps/mobile/assets/kael-emotions/kael-emotion-happy.png` |
| Focused | `apps/mobile/assets/kael-emotions/kael-emotion-focused.png` |
| Surprised | `apps/mobile/assets/kael-emotions/kael-emotion-surprised.png` |
| Curious | `apps/mobile/assets/kael-emotions/kael-emotion-curious.png` |
| Confident | `apps/mobile/assets/kael-emotions/kael-emotion-confident.png` |
| Concerned | `apps/mobile/assets/kael-emotions/kael-emotion-concerned.png` |
| Confused | `apps/mobile/assets/kael-emotions/kael-emotion-confused.png` |
| Disappointed | `apps/mobile/assets/kael-emotions/kael-emotion-disappointed.png` |
| Angry | `apps/mobile/assets/kael-emotions/kael-emotion-angry.png` |
| Tired | `apps/mobile/assets/kael-emotions/kael-emotion-tired.png` |

### Icons And Profile Visuals

| Needed asset | Suggested path | Notes |
|---|---|---|
| Optional native voice recorder icon | `apps/mobile/assets/client-image-icons/client-voice.png` | Only needed if Tu later provides a standalone microphone asset and native recording is enabled. The official Icon Images board does not include a separate mic icon; current voice UI uses `KaelVoiceInputCapsule`, stays honest-unavailable, and the `job-media` backend is audio-ready. |
| Optional standalone high-fidelity status icon exports | `apps/mobile/assets/status/status-pending.png`, `status-approved.png`, `status-completed.png`, `status-warning.png` | Production now uses approved crops from the official Icon Images board. Standalone exports are optional if Tu wants sharper source files later. |
| Worker level medal/badge set 1-10 | `apps/mobile/assets/profile/worker-level-01.png` ... `worker-level-10.png` | Needed only if profile level journey uses images. |
| Customer rank badge set 1-5 | `apps/mobile/assets/profile/customer-rank-01.png` ... `customer-rank-05.png` | Needed only if customer ranking uses images. |
| Money protection gauge art | `apps/mobile/assets/profile/money-protection-gauge.png` | Can also be built as vector UI if Tu approves. |
| Radar chart style asset | `apps/mobile/assets/profile/performance-radar-frame.png` | Can also be built as vector UI if Tu approves. |

### Placeholder Policy

Implementation should create placeholders only when code needs to render a missing slot:

```text
apps/mobile/assets/placeholders/
```

Placeholder names should match the final slot, for example:

```text
apps/mobile/assets/placeholders/kael-15-finding-worker-placeholder.png
```

The placeholder must be visually obvious during QA and must not silently look like a final official asset.
