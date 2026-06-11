# Assets Needed For NestScout / Kael Rebuild

Status: Phase 1 inventory. `KaelMascot` now has a typed shell and renders existing fallback images until these official exports are provided.

Do not crop these from PDF or flow boards. Please export them as standalone transparent PNG/WebP or Lottie/Rive files.

## Brand And App Shell

| Needed asset | Suggested path | Use |
|---|---|---|
| Final NestScout logo option 01, 02, or 08 | `apps/mobile/assets/brand/nestscout-logo.png` | Splash, welcome, app header. |
| Final app icon foreground | `apps/mobile/assets/icon.png` or replacement set | Expo app icon. |
| Final adaptive icon foreground | `apps/mobile/assets/adaptive-icon.png` | Android adaptive icon. |
| Final splash image | `apps/mobile/assets/splash-icon.png` | Expo splash. |
| Official Kael K orb | `apps/mobile/assets/kael/kael-orb-k.png` | Center action in bottom nav. |

## Kael Mascot States

Existing fallback only:

- `apps/mobile/assets/kael-model-8a.png`
- `apps/mobile/assets/kael-model-8a-head.png`

Needed official state exports:

| State ID | State name | Suggested path |
|---|---|---|
| 01 | Chao mung / Welcome | `apps/mobile/assets/kael/states/kael-01-welcome.png` |
| 02 | Lang nghe / Listening | `apps/mobile/assets/kael/states/kael-02-listening.png` |
| 03 | Suy nghi / Thinking | `apps/mobile/assets/kael/states/kael-03-thinking.png` |
| 04 | Phan tich / Analyzing | `apps/mobile/assets/kael/states/kael-04-analyzing.png` |
| 05 | Dang xu ly / Processing | `apps/mobile/assets/kael/states/kael-05-processing.png` |
| 06 | Hieu roi / Understood | `apps/mobile/assets/kael/states/kael-06-understood.png` |
| 07 | De xuat / Suggesting | `apps/mobile/assets/kael/states/kael-07-suggesting.png` |
| 08 | Thanh cong / Success | `apps/mobile/assets/kael/states/kael-08-success.png` |
| 09 | Canh bao / Warning | `apps/mobile/assets/kael/states/kael-09-warning.png` |
| 10 | Gap su co / Error | `apps/mobile/assets/kael/states/kael-10-error.png` |
| 11 | Dang nhap lieu / Typing | `apps/mobile/assets/kael/states/kael-11-typing.png` |
| 12 | Dang ghi am / Recording | `apps/mobile/assets/kael/states/kael-12-recording.png` |
| 13 | Xem anh / File | `apps/mobile/assets/kael/states/kael-13-file-review.png` |
| 14 | Dinh vi / Map | `apps/mobile/assets/kael/states/kael-14-location-map.png` |
| 15 | Tim kiem tho / Finding worker | `apps/mobile/assets/kael/states/kael-15-finding-worker.png` |
| 16 | Kiem tra gia / Price check | `apps/mobile/assets/kael/states/kael-16-price-check.png` |
| 17 | So sanh lua chon / Compare options | `apps/mobile/assets/kael/states/kael-17-compare-options.png` |
| 18 | Tao bao cao / Report | `apps/mobile/assets/kael/states/kael-18-report.png` |
| 19 | Nhac nho / Reminder | `apps/mobile/assets/kael/states/kael-19-reminder.png` |
| 20 | An mung nho / Mini celebration | `apps/mobile/assets/kael/states/kael-20-mini-celebration.png` |

If animation is available, use matching `.lottie` or `.riv` files under:

```text
apps/mobile/assets/kael/animations/
```

## Kael Emotion Variants

| Emotion | Suggested path |
|---|---|
| Vui ve / Happy | `apps/mobile/assets/kael/emotions/kael-happy.png` |
| Tap trung / Focused | `apps/mobile/assets/kael/emotions/kael-focused.png` |
| Ngac nhien / Surprised | `apps/mobile/assets/kael/emotions/kael-surprised.png` |
| To mo / Curious | `apps/mobile/assets/kael/emotions/kael-curious.png` |
| Tu tin / Confident | `apps/mobile/assets/kael/emotions/kael-confident.png` |
| Lo lang / Concerned | `apps/mobile/assets/kael/emotions/kael-concerned.png` |
| Boi roi / Confused | `apps/mobile/assets/kael/emotions/kael-confused.png` |
| That vong / Disappointed | `apps/mobile/assets/kael/emotions/kael-disappointed.png` |
| Gian du / Angry | `apps/mobile/assets/kael/emotions/kael-angry.png` |
| Met moi / Tired | `apps/mobile/assets/kael/emotions/kael-tired.png` |

## Icons And Profile Visuals

| Needed asset | Suggested path | Notes |
|---|---|---|
| Voice input / microphone 3D icon | `apps/mobile/assets/client-image-icons/client-voice.png` | Only if voice UI remains visible. |
| Official status accepted shield/check | `apps/mobile/assets/status/status-accepted.png` | Existing shield can be fallback. |
| Official warning bell | `apps/mobile/assets/status/status-warning.png` | Existing bell can be fallback. |
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
