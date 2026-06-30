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

## Missing Official Asset Slots

See `ASSETS_NEEDED.md` for exact export requests. Main gaps:

- Optional standalone logo 01 source export if Tu wants a higher-fidelity file than the approved board crop.
- Optional standalone official Kael orb K export if Tu wants a higher-fidelity file than the approved board crop.
- Optional standalone or animated Kael mascot state exports if Tu wants higher-fidelity files than the approved board crops.
- Optional standalone or animated emotion detail exports if Tu wants higher-fidelity files than the approved board crops.
- Profile badge/medal/radar/gauge/chart assets if these are not built as vector UI.
- Optional native voice recorder icon only if Tu later provides a standalone microphone asset and native recording is enabled. The official Icon Images board has no separate mic asset; current voice UI uses `KaelVoiceInputCapsule`, stays honest-unavailable, and the `job-media` backend is audio-ready.
