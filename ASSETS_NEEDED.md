# Assets Needed For NestScout / Kael Rebuild

Status: Phase 1 inventory. `KaelMascot` now has a typed shell and renders approved transparent crops from the official `02_mascot_motion@2x.png` handoff board for all 20 states and 10 emotions. Customer, worker, auth, booking, and Agentic Center production surfaces use the official mascot/component shells for the audited high-traffic slots instead of direct ad hoc images or controls.

Remaining missing assets should be exported as standalone transparent PNG/WebP or Lottie/Rive files only when a higher-fidelity source is needed. Production already uses Tu-approved crops for logo 01, the Kael Orb, and the Kael mascot state/emotion system from the handoff boards.

## Brand And App Shell

| Needed asset | Suggested path | Use |
|---|---|---|
| Optional higher-fidelity NestScout logo 01 source | `apps/mobile/assets/brand/nestscout-logo-mark.png` | Optional replacement for the approved transparent contour crop now used by `nestscout-logo-mark.png`, app icon, adaptive icon, splash icon, and favicon. |
| Optional higher-fidelity Kael K orb source | `apps/mobile/assets/kael/kael-orb-k.png` | Optional replacement for the approved board crop now used by separated dock Orb actions. |
| Apple system typography | Code/API policy in `apps/mobile/design/theme.ts`, `apps/mobile/design/tokens.json`, and `apps/mobile/app/_layout.tsx` | Kael Sans exports are no longer needed. Typography resolves through platform system APIs: iOS uses the installed Apple system font, Android falls back to `System`, and web preview uses the system stack without `@font-face` or bundled font files. |

## Kael Mascot States

Production now uses approved transparent board crops under `apps/mobile/assets/kael-states/`. Optional higher-fidelity standalone or animated exports can replace these files later.

| State ID | State name | Suggested path |
|---|---|---|
| 01 | Chao mung / Welcome | `apps/mobile/assets/kael-states/kael-state-welcome.png` |
| 02 | Lang nghe / Listening | `apps/mobile/assets/kael-states/kael-state-listening.png` |
| 03 | Suy nghi / Thinking | `apps/mobile/assets/kael-states/kael-state-thinking.png` |
| 04 | Phan tich / Analyzing | `apps/mobile/assets/kael-states/kael-state-analyzing.png` |
| 05 | Dang xu ly / Processing | `apps/mobile/assets/kael-states/kael-state-processing.png` |
| 06 | Hieu roi / Understood | `apps/mobile/assets/kael-states/kael-state-understood.png` |
| 07 | De xuat / Suggesting | `apps/mobile/assets/kael-states/kael-state-proposing.png` |
| 08 | Thanh cong / Success | `apps/mobile/assets/kael-states/kael-state-success.png` |
| 09 | Canh bao / Warning | `apps/mobile/assets/kael-states/kael-state-warning.png` |
| 10 | Gap su co / Error | `apps/mobile/assets/kael-states/kael-state-error.png` |
| 11 | Dang nhap lieu / Typing | `apps/mobile/assets/kael-states/kael-state-typing.png` |
| 12 | Dang ghi am / Recording | `apps/mobile/assets/kael-states/kael-state-recording.png` |
| 13 | Xem anh / File | `apps/mobile/assets/kael-states/kael-state-fileReview.png` |
| 14 | Dinh vi / Map | `apps/mobile/assets/kael-states/kael-state-locationMap.png` |
| 15 | Tim kiem tho / Finding worker | `apps/mobile/assets/kael-states/kael-state-findingWorker.png` |
| 16 | Kiem tra gia / Price check | `apps/mobile/assets/kael-states/kael-state-priceCheck.png` |
| 17 | So sanh lua chon / Compare options | `apps/mobile/assets/kael-states/kael-state-compareOptions.png` |
| 18 | Tao bao cao / Report | `apps/mobile/assets/kael-states/kael-state-report.png` |
| 19 | Nhac nho / Reminder | `apps/mobile/assets/kael-states/kael-state-reminder.png` |
| 20 | An mung nho / Mini celebration | `apps/mobile/assets/kael-states/kael-state-miniCelebration.png` |

If animation is available, use matching `.lottie` or `.riv` files under:

```text
apps/mobile/assets/kael/animations/
```

## True Kael 3D / Rive / Lottie Motion Assets

Status: not present in the final handoff zip or current repo. The current `apps/mobile/assets/lottie/kael-bow-welcome.json` is treated as a motion-guide JSON only; it does not replace an exact exported Kael model/rig. Onboarding 1.2 currently uses the approved Kael welcome PNG as a static image shell with safe contain/scale crop.

To switch `KaelMotionRenderer` from the current approved image rig fallback to true production Rive/Lottie playback, export one exact Kael rig using the same silhouette, outfit, and scale as the approved mascot states.

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

## Kael Emotion Variants

Production now uses approved transparent board crops under `apps/mobile/assets/kael-emotions/`. Optional higher-fidelity standalone or animated exports can replace these files later.

| Emotion | Suggested path |
|---|---|
| Vui ve / Happy | `apps/mobile/assets/kael-emotions/kael-emotion-happy.png` |
| Tap trung / Focused | `apps/mobile/assets/kael-emotions/kael-emotion-focused.png` |
| Ngac nhien / Surprised | `apps/mobile/assets/kael-emotions/kael-emotion-surprised.png` |
| To mo / Curious | `apps/mobile/assets/kael-emotions/kael-emotion-curious.png` |
| Tu tin / Confident | `apps/mobile/assets/kael-emotions/kael-emotion-confident.png` |
| Lo lang / Concerned | `apps/mobile/assets/kael-emotions/kael-emotion-concerned.png` |
| Boi roi / Confused | `apps/mobile/assets/kael-emotions/kael-emotion-confused.png` |
| That vong / Disappointed | `apps/mobile/assets/kael-emotions/kael-emotion-disappointed.png` |
| Gian du / Angry | `apps/mobile/assets/kael-emotions/kael-emotion-angry.png` |
| Met moi / Tired | `apps/mobile/assets/kael-emotions/kael-emotion-tired.png` |

## Icons And Profile Visuals

| Needed asset | Suggested path | Notes |
|---|---|---|
| Optional native voice recorder icon | `apps/mobile/assets/client-image-icons/client-voice.png` | Only needed if Tu later provides a standalone microphone asset and native recording is enabled. The official Icon Images board does not include a separate mic icon; current voice UI uses `KaelVoiceInputCapsule`, stays honest-unavailable, and the `job-media` backend is audio-ready. |
| Optional standalone high-fidelity status icon exports | `apps/mobile/assets/status/status-pending.png`, `status-approved.png`, `status-completed.png`, `status-warning.png` | Production now uses approved crops from the official Icon Images board. Standalone exports are optional if Tu wants sharper source files later. |
| Worker level medal/badge set 1-10 | `apps/mobile/assets/profile/worker-level-01.png` ... `worker-level-10.png` | Needed if profile level journey uses images. |
| Customer rank badge set 1-5 | `apps/mobile/assets/profile/customer-rank-01.png` ... `customer-rank-05.png` | Needed if customer ranking uses images. |
| Money protection gauge art | `apps/mobile/assets/profile/money-protection-gauge.png` | Can also be built as vector UI if Tu approves. |
| Radar chart style asset | `apps/mobile/assets/profile/performance-radar-frame.png` | Can also be built as vector UI if Tu approves. |

## Placeholder Policy

Implementation should create placeholders only when code needs to render a missing slot:

```text
apps/mobile/assets/placeholders/
```

Placeholder names should match the final slot, for example:

```text
apps/mobile/assets/placeholders/kael-15-finding-worker-placeholder.png
```

The placeholder must be visually obvious during QA and must not silently look like a final official asset.
