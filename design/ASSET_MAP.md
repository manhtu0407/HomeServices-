# NestScout / Kael Asset Map

Status: Phase 0 inventory. This file maps official handoff UI slots to existing repo assets or needed exports.

Rule: do not crop assets from the PDF or flow boards. Use existing repo assets when they match; otherwise use a clearly named placeholder during implementation and log the needed export in `ASSETS_NEEDED.md`.

## Existing Asset Inventory

| Asset family | Existing files |
|---|---|
| App shell | `apps/mobile/assets/icon.png`, `apps/mobile/assets/adaptive-icon.png`, `apps/mobile/assets/splash-icon.png`, `apps/mobile/assets/favicon.png` |
| Kael mascot | `apps/mobile/assets/kael-model-8a.png`, `apps/mobile/assets/kael-model-8a-head.png` |
| Common role icons | `apps/mobile/assets/common-image-icons/common-role-home.png`, `apps/mobile/assets/common-image-icons/common-role-repair.png` |
| Client services | `apps/mobile/assets/client-image-icons/client-service-electrical.png`, `client-service-plumbing.png`, `client-service-cleaning.png` |
| Worker services | `apps/mobile/assets/worker-image-icons/service-electrical.png`, `service-plumbing.png`, `service-cleaning.png` |
| Client nav/utility | `client-home.png`, `client-booking.png`, `client-activity.png`, `client-profile.png`, `client-kael.png`, `client-address.png`, `client-payment.png`, `client-evidence.png`, `client-feedback.png`, `client-language.png`, `client-privacy.png`, `client-theme.png`, `client-phone-v2.png`, `client-logout-v2.png`, `client-password.png`, `client-request.png`, `client-external.png`, `client-identity.png` |
| Worker nav/utility | `nav-home.png`, `nav-jobs.png`, `nav-earnings.png`, `nav-profile.png`, `utility-calendar.png`, `utility-map.png`, `utility-identity.png`, `utility-wallet.png`, `utility-shield.png`, `utility-camera.png`, `utility-bell.png`, `utility-clock.png`, `utility-chat.png`, `utility-document.png`, `utility-tools.png`, `utility-evidence-core.png`, `utility-scope-core.png`, `utility-earnings-wallet-core.png`, `utility-earnings-ledger-core.png`, `setting-language.png`, `setting-theme.png` |
| Worker profile | `profile-avatar-core.png`, `profile-identity.png`, `profile-service-area.png`, `profile-skills.png`, `profile-verified.png` |

All listed PNG image assets are 256x256 except app shell icons/splash and Kael model images.

## UI Slot Mapping

| UI slot | Existing asset to use | Status |
|---|---|---|
| Splash logo/icon | `apps/mobile/assets/splash-icon.png` | Exists, but may not match NestScout logo. Needs brand decision. |
| App icon | `apps/mobile/assets/icon.png`, `adaptive-icon.png` | Exists, but may not match NestScout logo. Needs brand decision. |
| Welcome/auth Kael head | `apps/mobile/assets/kael-model-8a-head.png` | Exists as generic/static mascot. |
| Full Kael mascot | `apps/mobile/assets/kael-model-8a.png` | Exists as generic/static mascot. |
| `KaelMascot` typed state shell | Fallback: `apps/mobile/assets/kael-model-8a.png`, `apps/mobile/assets/kael-model-8a-head.png` | Component exists; official state/emotion exports still needed. |
| Customer role card | `apps/mobile/assets/client-image-icons/client-home.png` | Tracked fallback equivalent to the untracked common role icon. |
| Worker role card | `apps/mobile/assets/worker-image-icons/utility-tools.png` | Tracked fallback equivalent to the untracked common role icon. |
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
| Kael orb visual | Current: `kael-model-8a-head.png` or `client-kael.png` | Exists as fallback, but official K orb asset missing. |
| Address/map | `client-address.png`, `utility-map.png` | Exists. |
| Media/photo/evidence | `client-evidence.png`, `utility-camera.png`, `utility-evidence-core.png` | Exists. |
| Payment/wallet | `client-payment.png`, `utility-wallet.png`, `utility-earnings-wallet-core.png` | Exists. |
| Verification/security/shield | `utility-shield.png`, `profile-verified.png`, `client-privacy.png` | Exists. |
| Language/theme/settings | `client-language.png`, `client-theme.png`, `setting-language.png`, `setting-theme.png` | Exists. |
| Chat/messages | `client-kael.png`, `utility-chat.png` | Exists. |
| Documents/report | `utility-document.png`, `utility-earnings-ledger-core.png` | Exists as partial fit. |
| Tools/scope change | `utility-tools.png`, `utility-scope-core.png` | Exists. |
| Worker avatar | `profile-avatar-core.png` | Exists as generic asset; real user avatar should use backend profile data when available. |

## Missing Official Asset Slots

See `ASSETS_NEEDED.md` for exact export requests. Main gaps:

- Final NestScout logo direction and app/splash icon set.
- Official Kael orb K asset.
- 20 official Kael mascot state images or Lottie/Rive files.
- Emotion detail variants from mascot page.
- Profile badge/medal/radar/gauge/chart assets if these are not built as vector UI.
- Voice input / microphone 3D icon if voice remains visible.
