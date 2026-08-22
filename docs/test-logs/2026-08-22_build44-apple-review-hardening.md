# Build 44 Apple Review Hardening Evidence

Date: 2026-08-22
Branch: `codex/build44-apple-review-fix-20260822`
Base: `9236e2197435dd6b81a5c0bd99ec2866aa516b6b`
Release: `0.1.0 (44)`

## Decision

Current decision: **NO-GO because Build 44 has not been created or processed, the new job-media cleanup migration is awaiting target deployment proof, and the native iPhone/iPad matrix is pending.**

The target EAS project is now `@nestscout/home-services` (`c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b`). Its dashboard showed 0 of 15 included iOS builds used before Build 44, so EAS billing is not the current blocker. iOS credential import, Build 44 processing, target deployment, and native verification still remain. App Review resubmission remains user-controlled and must not happen until Build 44 exists and every unchecked native item below passes.

## Apple rejection closure

- Camera permission is requested only after a user presses a camera action.
- The first denial ends without a custom prompt asking the user to reconsider.
- A later user-initiated retry may show a neutral `Cancel` / `Open Settings` choice only when iOS reports the permission as blocked.
- Existing-photo actions open the iOS system picker directly and do not request broad photo-library access.
- The shared behavior covers profile avatars, Customer and Worker Kael media, arrival evidence, lobby check-in, scope change, worker registration, and completion evidence.
- iOS push registration is disabled for Build 44; in-app notifications remain available.
- Background audio is disabled and the resolved iOS config has no background modes.

## Account deletion closure

- `POST /me/account-deletion` accepts Customer and Worker actors with the same idempotent request contract.
- Recent sign-in, explicit data-loss acknowledgement, and the exact confirmation phrase are required.
- Active jobs, disputes, pending payments, withdrawals, collateral, and cash-settlement obligations block deletion with explicit codes.
- Customer and Worker profile PII, optional Kael media references, push tokens, Kael memory, and voice transcripts are scrubbed; required transaction records remain de-identified and cannot restore login access.
- Worker deletion is initiated and confirmed in-app; Support is no longer a mandatory redirect.
- A stale sign-in returns a localized error plus an explicit `Đăng nhập lại` / `Sign in again` action for both roles; it never starts deletion or signs out automatically.
- Job media cleanup is actor-scoped through `job_media_assets.owner_id` and `job_media_upload_intents.owner_id`; the opposite job participant's media is excluded. Attached `before`, `after`, `cancellation_evidence`, and `scope_change_evidence` records are retained, while only disposable or unattached media is collected for removal. Malformed Storage paths fail closed before Auth deletion.
- Staging and production received the three Build 44 migrations `20260822193000`, `20260822194500`, and `20260822195500`. Staging also replayed the already-recorded `20260729210000` customer foundation because its migration history said applied while the table/RPC were absent; no duplicate history marker was added. No existing user was modified because the new RPCs run only after a user-owned request.
- `mobile-api` was deployed to staging project `xyylanuyflrjzbjzhqfl` and production project `iwevizmsedyqozxlawwl`.
- A real Postgres transaction fixture passed on both projects and rolled back its two disposable database identities.
- The additive migration `20260822211500_account_deletion_job_media_cleanup.sql` is not yet deployed. Its updated transaction fixture passed the GitHub CI Postgres matrix and must still pass on the intended Supabase targets before GO.

## Verification ledger

| Evidence | Result |
|---|---|
| `pnpm type-check:mobile` | PASS |
| `pnpm test:mobile -- --runInBand` | PASS — 16 suites, 93 tests |
| `pnpm type-check:api` | PASS |
| `pnpm test:api` | PASS — 22 suites, 595 tests |
| `pnpm type-check:shared` | PASS |
| `pnpm test:shared` | PASS — 3 files, 98 tests |
| OAuth targeted tests | PASS — 98 tests; known React `act` console warnings only |
| Customer deletion targeted UI test | PASS — exact confirmation and authenticated request path |
| Dormant Customer Profile suite | PARTIAL — deletion case passed; 3 legacy permission expectations fail because they still expect the removed broad-library/coercive denial behavior |
| `pnpm lint:comments` | PASS |
| `pnpm lint:structure` | PASS — 1,047 files |
| `pnpm lint:workplan` | PASS — 18 follow-up files inside the declared read window |
| Harness assurance verification | PASS — 173 routes, 130 tables, 202 functions, 287 migrations |
| `pnpm harness:pillars:check` | PASS — 42 unique pillars |
| `pnpm doctor:react:changed` | PASS — 0 issues |
| Expo prebuild config inspection | PASS — `0.1.0 (44)`, no entitlements, no background modes, push disabled |
| `eas metadata:lint` | PASS |
| Staging SQL transaction test | PASS — Customer/Worker prepare, idempotency, PII scrub, ACL; rollback |
| Production SQL transaction test | PASS — same matrix; rollback |
| Staging/production unauthenticated Edge smoke | PASS — HTTP 401 from custom auth boundary |
| Public Privacy/Support page | PASS — HTTP 200 at the configured URL, commit `593f662` live |
| Local Docker SQL/Edge check | NOT RUN — Docker doctor measured 1.47 GB available RAM, below the 4 GB floor; CI equivalent required |
| GitHub CI | PASS — 9/9 checks on head `8b91a762`; SQL/reset/generated-types job passed in run [`32579813067`](https://github.com/manhtu0407/HomeServices-/actions/runs/32579813067) |
| EAS production build + auto-submit | PENDING — target project has iOS allowance; credentials/import and merged green commit are required first |

## App Store screenshot handoff

- Replace all five existing Introduction screenshots in App Store Connect with the six new PNG sources supplied on 2026-08-22; do not mix old and new assets.
- Source order received: `21_43_49`, `21_43_41`, `21_41_37`, `21_41_30`, `21_41_18`, `21_41_09`.
- All six source files are distinct and readable at `853 × 1844`. Validate the exact App Store device slot and export dimensions before upload; do not upload a stretched or non-compliant rendition.
- Keep the original source files outside Git. Verify all six uploaded previews visually before saving App Store Connect metadata.

## EAS status and resume command

- Latest EAS iOS binary remains `0.1.0 (43)`, build ID `9dfc4572-ef98-4a1e-8135-ef36e25ee52b`.
- The old `tshine` attempt uploaded the project and computed its fingerprint but stopped before creating a build record.
- The intended target is `@nestscout/home-services`; its dashboard showed 15 included iOS builds remaining before Build 44. App Store Connect itself does not impose that EAS monthly build allowance.
- Team ID `7S4723Q8LP` is explicit in the EAS submit profile. The target EAS project still needs a verified iOS distribution credential/provisioning profile and App Store Connect authentication before non-interactive submission.
- After the PR is merged, CI is green, and target credentials are verified, rerun from `apps/mobile`:

  `pnpm dlx eas-cli@22.0.0 build -p ios --profile production --auto-submit --non-interactive`

## Resolved iOS configuration

- App version: `0.1.0`
- iOS build number: `44`
- Bundle identifier: `com.phanmanhtu.homeservices`
- `UIBackgroundModes`: absent
- Push registration feature flag: `false`
- `expo-audio.enableBackgroundPlayback`: `false`
- Camera, Photos, Location, Microphone, and Speech purpose strings: present and specific
- Store release mode: manual
- Store content flags: `messagingAndChat: true`, `userGeneratedContent: true`

## App Privacy handoff

Declare data actually used by the app:

- Contact information: name, email, phone number.
- Service address and precise location when route/location data is sent to the backend.
- User content: photos, videos, messages, support conversations, and editable voice transcripts.
- Identifiers: user, device, and push-token identifiers.
- Financial information: payment, refund, payout, and transaction information.

Do not declare tracking or advertising only after the processed archive scan confirms no tracking SDK/domain behavior. The privacy page is live at `https://manhtu0407.github.io/nestscout-privacy-policy/` and is also the configured Support URL.

## Native matrix — must pass before GO

- [ ] Fresh-install Customer avatar: camera grant, denial, blocked retry, photo selection/cancel.
- [ ] Fresh-install Worker avatar/registration: same matrix.
- [ ] Customer Kael and Worker Kael media: denial has no reconsideration prompt and causes no upload.
- [ ] Arrival evidence, lobby check-in, scope change, and completion evidence: same denial behavior.
- [ ] Location denial preserves workflow with route-preview fallback.
- [ ] Microphone denial preserves text input.
- [ ] Login does not trigger the iOS notification permission prompt.
- [ ] Sign in with Apple succeeds on fresh install and is offered alongside Google.
- [ ] Customer disposable account deletion completes and the session cannot be restored.
- [ ] Worker disposable account deletion completes and the session cannot be restored.
- [ ] iPhone compatibility run passes.
- [ ] iPad compatibility run passes.
- [ ] Processed archive has no unresolved privacy-manifest, entitlement, or App Store validation warning.

Never use the App Review demo account for deletion testing.

## App Review reply draft

> Hello App Review Team,
>
> Thank you for the feedback regarding Guideline 5.1.1(iv). In build 0.1.0 (44), we removed all custom messages that ask users to reconsider immediately after denying Camera or Photos access. Existing-photo actions now use the iOS system picker without requesting broad photo-library access. Camera permission is requested only after the user explicitly selects a camera action. If the user later initiates the action again and iOS reports that access is blocked, the app presents a neutral Cancel / Open Settings choice and never opens Settings automatically. We verified this behavior across all production media surfaces on iPhone and iPad compatibility modes.
>
> We also disabled the unused iOS push registration and background-audio capability for this build, synchronized the privacy disclosures with the app's real chat/media behavior, and added direct in-app account deletion for both customers and workers.

Only keep the final verification sentence after the native matrix is actually complete.

## User-controlled App Store Connect steps

1. Select Build 44 instead of Build 43 for version `0.1.0`.
2. Save, then choose Add for Review.
3. Update App Privacy, age rating, Support URL, demo credentials, and Review Notes from this ledger.
4. Paste the review reply after removing any claim not proven by the native matrix.
5. Confirm the processed archive has no unresolved warning.
6. Tu personally clicks **Resubmit to App Review**.

Do not resubmit Build 43.
