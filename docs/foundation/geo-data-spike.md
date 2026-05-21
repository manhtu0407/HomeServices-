# Geo Data Spike — 2026-05-20

Status: execution input for workflow enhancement. This is not a production rollout approval.

## Decision

Use Google Maps Geocoding on the server side only when the workflow needs latitude/longitude ranking. Phase 0 matching continues to work with the existing canonical HCMC district slugs, so missing geocoding must not block job creation or worker matching.

Primary source:
- https://developers.google.com/maps/documentation/geocoding/overview

## Current Code State

- Customer jobs already require a concrete HCMC district through `normalizeServiceAreaDistrict()`.
- Worker matching currently filters approved, available, non-suspended workers by `service_types` and district slug.
- There are no job/customer/worker `lat`/`lng` columns in the current schema.
- Exact apartment address is sensitive PII and must not be logged.

## Proposed Data Shape

Add coordinates only when the product is ready for geo-ranked matching:

```text
jobs
-
|- latitude numeric(9,6) null
|- longitude numeric(9,6) null
|- geo_source text null check in ('google_geocoding', 'district_fallback')
|- geo_precision text null check in ('rooftop', 'range_interpolated', 'geometric_center', 'approximate')

worker_profiles
-
|- base_latitude numeric(9,6) null
|- base_longitude numeric(9,6) null
|- geo_source text null check in ('admin_verified', 'district_fallback')
```

Keep HCMC district slugs as the required matching fallback even after geo columns exist.

## Server Boundary

Google Maps API key must stay in Supabase Edge / server environment only. React Native must never receive or call the key.

Geocoding input should use the minimum needed address context:

```text
building + district + Ho Chi Minh City + Vietnam
```

Do not send unit number, floor, phone, customer name, worker bank data, or raw free-form notes to Google.

## Fallback Behavior

- If Google returns no result, use district-only matching.
- If Google errors or times out, log safe metadata only: job id, district slug, error code.
- Never fabricate coordinates.
- Never show exact map location before worker accept.

## Matching Rule

Safe initial ranking after geo exists:

```text
eligible workers:
  approved AND available AND not suspended
  service_types contains job.service_type
  districts contains job.address_district OR hcmc_all
  not already active on another job

order:
  distance_km ASC when both sides have coordinates
  rating DESC
  total_jobs DESC
```

No worker rating penalty or auto-suspension is part of this execution scope.

## Verification Required Later

- Unit: distance calculation with known HCMC coordinates.
- Unit: district fallback when coordinates are missing.
- Security: no address/unit/phone appears in logs.
- Integration: job with coordinates ranks nearer worker ahead of farther worker with equal rating.
- Integration: geocoding failure still broadcasts by district.

