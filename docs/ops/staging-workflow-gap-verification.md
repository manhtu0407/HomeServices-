# Staging Workflow Gap Verification

Status: safe verification path for the remaining Plan.md workflow gaps. This document does not approve production migrations or production secret changes.

## Scope

Use this checklist to verify the current staging workflow after Google Maps and geo matching work:

- Edge `/places/autocomplete` can read `GOOGLE_MAPS_API_KEY` from Supabase Edge secrets.
- Customer address suggestions work without bundling a Google key into mobile.
- Worker verification stores a service-area anchor and radius through the existing `/workers/register` wrapper.
- Geo matching remains safe when coordinates are missing.
- Device push delivery is tested on a real build before claiming production readiness.

Rating penalty remains excluded by Tu's instruction.

## Preconditions

- Target project is staging `xyylanuyflrjzbjzhqfl`.
- `mobile-api` is deployed to staging after the latest Edge changes.
- `.env.local` contains public staging mobile config and a short-lived authenticated staging user token:

```text
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_BASE_URL=
STAGING_ACCESS_TOKEN=
```

Do not put `GOOGLE_MAPS_API_KEY` in `.env.local` for the mobile app. It belongs in Supabase Edge secrets only.

## Non-Mutating Smoke

Run from the repo root:

```powershell
.\scripts\staging-mobile-api-smoke.ps1
```

Expected result:

```text
PASS: /services count=3; /places/autocomplete suggestions=<n>; fallback_used=false
```

If `fallback_used=true`, the Edge route is alive but Maps is not verified. Check staging Edge secrets, enabled Google APIs, quota, and the deployed Edge function version.

## Worker Service-Area UI Check

Use a staging worker account that has already been promoted to `profiles.role='worker'`.

1. Open Worker Profile.
2. In the verification form, choose one service-area district chip.
3. Adjust the radius with `-`, `+`, or a preset.
4. Fill required identity, service, bank, and document fields.
5. Submit through the existing mobile workflow action.

Expected database result on staging:

```text
worker_profiles.districts includes the chosen HCMC district
worker_profiles.home_lat is not null
worker_profiles.home_lng is not null
worker_profiles.service_radius_km is between 1 and 30
```

## Mutating Geo Workflow Check

Run only with disposable staging customer/worker accounts and clean up afterwards.

1. Customer starts Kael chat with an HCMC address selected through Edge autocomplete.
2. Customer confirms the estimate and creates a job.
3. Verify the job row stores:

```text
jobs.address_label is set
jobs.address_lat/address_lng are set when Google geocoding succeeds
jobs.geo_source='google_maps'
```

4. If Google fails or quota is exhausted, verify:

```text
jobs.geo_source='fallback'
jobs.address_lat/address_lng are null
matching still falls back to district
```

## Push Delivery Check

Push is not complete until a real TestFlight or internal Android build is used.

1. Install a fresh native build containing `expo-notifications`.
2. Sign in as customer and worker on real devices.
3. Accept OS notification permission.
4. Confirm `POST /notifications/device-token` stores enabled device tokens.
5. Trigger a staging broadcast and scope-change event.
6. Verify push opens only role-safe deep links:

```text
/(worker)/jobs?broadcast_id=...
/(customer)/history?scope_change=...
```

Push body must not contain full address, unit number, phone number, raw problem text, CCCD, bank data, or API keys.

## Production Promotion Gate

Do not promote this set to production until:

- Staging non-mutating smoke passes.
- Staging mutating geo workflow uses disposable rows and is cleaned up.
- Real-device push delivery is verified.
- Production `GOOGLE_MAPS_API_KEY` is set as an Edge secret by Tu.
- Production migration/deploy follows `docs/ops/production-migration-checklist.md` with explicit approval.
