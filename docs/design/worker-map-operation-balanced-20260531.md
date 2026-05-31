# Worker Map Operation Balanced Direction

Status: accepted prototype direction from May 31, 2026. Production work should port this direction with real React Native/SVG surfaces, not screenshot assets.

## Goal

Make the worker map feel operational and Google Maps-like enough for future VietMap integration while staying privacy-safe before the worker accepts a job.

## Production Direction

Use the Balanced direction:

- Map preview card stays calm and compact.
- Small preview shows only high-signal controls such as recenter and layer.
- Large/expanded map can show full map controls.
- Use vector/SVG road anatomy, not raster screenshots.
- Show route, ETA, road hierarchy, and route-step copy only when the workflow state allows it.
- Before accept, show district/area/radius only. Do not show full address, unit, exact pin, or exact route.
- After accept, route details may show public road-level guidance and the released meeting-point state from backend data.

## Visual Anatomy

- Neutral map base with subtle blocks, water/park hints, and clear main roads.
- Main route uses a casing stroke plus blue or mint route stroke.
- Traffic signal is a short colored segment, never a decorative stripe.
- Markers are simple and balanced, with consistent size.
- Preview map should not include text labels over route lines or markers.
- Route details live below the map or in a bottom sheet, like a map app.

## Production Guardrails

- Do not bundle Google/VietMap keys into mobile.
- Do not hardcode fake exact coordinates, exact addresses, prices, workers, ratings, or queue counts.
- Do not replace the map with a mock image.
- Keep test IDs that guard worker privacy states:
  - `worker-map-waiting-area-marker`
  - `worker-map-address-locked-before-accept`
  - `worker-map-route-after-accept`
- Map UI must degrade to area/radius mode when coordinates or route provider data are unavailable.

## Implementation Target

Owner surface: `apps/mobile/components/worker/worker-surfaces.tsx`

Relevant components:

- `WorkerMapStage`
- `CompactWorkerPresenceMap`
- `MapLineField`
- `WorkerMapRouteLine`

Verification should include mobile type-check, mobile tests, and the shared mobile wiring tests that guard prototype isolation and worker map privacy states.
