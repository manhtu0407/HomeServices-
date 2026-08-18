# NestScout / Kael Asset Map

Status: active. This map preserves the existing non-Kael asset inventory and records the Core v9 replacement.

Rule: the non-Kael asset inventory remains unchanged. Kael Core v9 remains the general assistant visual source; the approved Navigation artwork is isolated to the Customer/Worker Navigation accessory, both user-supplied.

## Existing Asset Inventory

| Asset family | Existing files |
|---|---|
| App shell | `apps/mobile/assets/nestscout-logo-mark.png`, `icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png` |
| Kael Core v9 + Motion v11 | Sources: `apps/mobile/assets/kael/Kael-Core-v9-Codex-Rebuild.html` and `Kael-Motion-Clip-v11-Codex-Rebuild.html`; runtime: `apps/mobile/components/ui/kael-core-v9.tsx` |
| Kael Navigation artwork | Customer: `apps/mobile/assets/kael/navigation/kael-customer-navigation-monocle.png`; Worker: `apps/mobile/assets/kael/navigation/kael-worker-navigation-monocle.png`; runtime: `apps/mobile/components/ui/kael-navigation-accessory.tsx` |
| Common role icons | Not used for production mapping in this session because `apps/mobile/assets/common-image-icons/` is untracked prototype trash. Use tracked client/worker equivalents below. |
| Client services | `apps/mobile/assets/client-image-icons/client-service-electrical.png`, `client-service-plumbing.png`, `client-service-cleaning.png` |
| Worker services | `apps/mobile/assets/worker-image-icons/service-electrical.png`, `service-plumbing.png`, `service-cleaning.png` |
| Client nav/utility | `client-home.png`, `client-booking.png`, `client-activity.png`, `client-profile.png`, `client-address.png`, `client-payment.png`, `client-evidence.png`, `client-feedback.png`, `client-language.png`, `client-privacy.png`, `client-theme.png`, `client-phone-v2.png`, `client-logout-v2.png`, `client-password.png`, `client-request.png`, `client-external.png`, `client-identity.png` |
| Worker nav/utility | `nav-home.png`, `nav-jobs.png`, `nav-earnings.png`, `nav-profile.png`, `utility-calendar.png`, `utility-map.png`, `utility-identity.png`, `utility-wallet.png`, `utility-shield.png`, `utility-camera.png`, `utility-bell.png`, `utility-clock.png`, `utility-chat.png`, `utility-document.png`, `utility-tools.png`, `utility-evidence-core.png`, `utility-scope-core.png`, `utility-earnings-wallet-core.png`, `utility-earnings-ledger-core.png`, `setting-language.png`, `setting-theme.png` |
| Worker profile | `profile-avatar-core.png`, `profile-identity.png`, `profile-service-area.png`, `profile-skills.png`, `profile-verified.png` |
| Kael status icons | Removed. Kael does not communicate product status through visual variants. |
| Typography tokens | `apps/mobile/design/theme.ts`, `apps/mobile/design/tokens.json`, `apps/mobile/app/_layout.tsx` | Apple system typography is wired through `KaelText` and high-traffic auth/customer/worker typography anchors; production Auth, Admin dashboard, Customer matching score, Kael chat archive/live-performance labels, BookingWizard media/chip labels, shared floating tab bar labels, customer v21 surfaces, rebuild surfaces, and active prototype routes no longer carry hardcoded 800/900 weights. Kael Sans exports are no longer needed because the source of truth is code/API based: no bundled font files, no `@font-face`, iOS resolves to the installed Apple system font, Android falls back to `System`, and web preview uses the system stack. |
| Component primitives | `apps/mobile/components/ui/kael-primitives.tsx` | `KaelButton`, `KaelText`, `KaelCard`, `KaelChip`, `KaelTextField`, `KaelSegmentedControl`, `KaelInlineStepper`, `KaelVoiceInputCapsule`, `KaelMediaUploadTray`, `KaelSwitch`, `KaelBadge`, `KaelProgressPill`, `KaelRatingCapsule`, and `KaelAlertBadge` now cover the handoff Component System board. `KaelButton` supports explicit `accessibilityState` overrides for truthful busy/disabled production actions. Production call sites include Auth login/register/onboarding/recovery/sign-out inputs and actions, the Auth worker application review contact form and submit CTA, customer auth choice buttons with icon adornments, Kael chat orchestration/retry actions and composers, the `(customer)/kael` Agentic Center action buttons/cards/text/mascot shell, the A11 scope-change hard-stop modal actions, Customer Profile editor/feedback/password inputs and sheet actions, Customer Profile real-data progress pills, AddressAutocomplete and Kael chat address/location inputs, Customer home/history/Kael chat composers, the reusable GlassSearchBar input shell, the real Customer Home unread notification badge, Worker Home availability switch, Worker CTA wrapper buttons, Worker Kael parity/feedback actions, Worker reputation badge/rating capsule, Worker verification/KYC/bank/action-note/Kael-feedback/chat inputs, Admin learning note input, and BookingWizard CTA/chip/description/media/voice controls. |

All listed non-Kael PNG image assets are 256x256 except app shell icons/splash.

Production wrappers retain these tracked non-Kael PNG families for customer/worker service, nav, language, and theme slots. Small control glyphs such as chevrons, menu, filter, plus/minus, and send remain vector controls until official image exports exist.

## UI Slot Mapping

| UI slot | Existing asset to use | Status |
|---|---|---|
| NestScout logo mark | `apps/mobile/assets/nestscout-logo-mark.png` | Tu approved logo 01 Aurora Nest. Cropped from the official handoff logo board as a transparent contour mark with no white board background and no lockup text. |
| Splash logo/icon | `apps/mobile/assets/splash-icon.png` | Uses the approved logo 01 transparent contour mark. |
| App icon | `apps/mobile/assets/icon.png`, `adaptive-icon.png`, `favicon.png` | Uses the approved logo 01 transparent contour mark. |
| Kael Core v9 | `Kael-Core-v9-Codex-Rebuild.html` preserved as source; `KaelCoreV9` is the native inline-SVG runtime. | One Obsidian Pearl, two pill eyes, one monocle; no raster state, emotion, or accessory variants. |
| Kael Navigation accessory | `apps/mobile/assets/kael/navigation/kael-customer-navigation-monocle.png` or `kael-worker-navigation-monocle.png` | Approved role-specific Navigation artwork. Customer defaults to Cánh mở lời; Worker defaults to Điểm tựa; Kính đơn is the shipped finish. |
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
| Kael visual | `KaelCoreV9` native inline SVG outside Navigation; `KaelNavigationAccessory` in Navigation | The source HTML is preserved but not imported into React Native. Navigation artwork is a bounded role-specific exception, not workflow status. |
| Address/map | `client-address.png`, `utility-map.png` | Exists. |
| Media/photo/evidence | `client-evidence.png`, `utility-camera.png`, `utility-evidence-core.png` | Exists. |
| Payment/wallet | `client-payment.png`, `utility-wallet.png`, `utility-earnings-wallet-core.png` | Exists. |
| Verification/security/shield | `utility-shield.png`, `profile-verified.png`, `client-privacy.png` | Exists. |
| Language/theme/settings | `client-language.png`, `client-theme.png`, `setting-language.png`, `setting-theme.png` | Exists. |
| Chat/messages | `KaelCoreV9` for Kael identity, `utility-chat.png` for worker chat utility | Kael stays static outside direct user interaction. |
| Documents/report | `utility-document.png`, `utility-earnings-ledger-core.png` | Exists as partial fit. |
| Tools/scope change | `utility-tools.png`, `utility-scope-core.png` | Exists. |
| Worker avatar | `profile-avatar-core.png` | Exists as generic asset; real user avatar should use backend profile data when available. |
| Kael status | No Kael status asset | Do not use Kael to imply pending, approved, completed, warning, progress, or outcome. |

## Optional Export Requests

The rebuild no longer needs a root `ASSETS_NEEDED.md`. Remaining asset asks live here so the rebuild stays under the design governance topic.

Kael Core v9 is used across customer, worker, auth, booking, and Agentic Center slots that previously rendered old Kael images. Navigation uses the two approved role-specific raster artworks only in the bottom Navigation accessory. Only the customer Home hero plays the one-time 3800 ms Motion v11 clip; no visual state represents workflow truth and no Kael rendering has a ground shadow.

### Brand And App Shell

| Needed asset | Suggested path | Use |
|---|---|---|
| Optional higher-fidelity NestScout logo 01 source | `apps/mobile/assets/brand/nestscout-logo-mark.png` | Optional replacement for the approved transparent contour crop now used by `nestscout-logo-mark.png`, app icon, adaptive icon, splash icon, and favicon. |
| Apple system typography | Code/API policy in `apps/mobile/design/theme.ts`, `apps/mobile/design/tokens.json`, and `apps/mobile/app/_layout.tsx` | Kael Sans exports are no longer needed. Typography resolves through platform system APIs: iOS uses the installed Apple system font, Android falls back to `System`, and web preview uses the system stack without bundled font files. |

### Kael Core v9

Kael has two preserved source assets (Core v9 and Motion v11) and one native inline-SVG runtime, plus the approved Navigation artwork from the 2026-08-18 handoff. Core v9 uses the Obsidian Pearl orb, two white pill eyes, one monocle, a one-time 3800 ms Home clip, and a single 1220 ms respectful bow on direct interaction. Navigation uses static role-specific artwork with a short press lift; Reduced Motion removes that lift and disables the Home clip. No Kael rendering communicates workflow truth or uses a ground shadow.

### Icons And Profile Visuals

| Needed asset | Suggested path | Notes |
|---|---|---|
| Optional native voice recorder icon | `apps/mobile/assets/client-image-icons/client-voice.png` | Only needed if Tu later provides a standalone microphone asset and native recording is enabled. The official Icon Images board does not include a separate mic icon; current voice UI uses `KaelVoiceInputCapsule`, stays honest-unavailable, and the `job-media` backend is audio-ready. |
| Kael status icon exports | Removed by design. Use truthful non-Kael UI copy and controls for real workflow states. |
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
apps/mobile/assets/placeholders/service-photo-placeholder.png
```

The placeholder must be visually obvious during QA and must not silently look like a final official asset.
