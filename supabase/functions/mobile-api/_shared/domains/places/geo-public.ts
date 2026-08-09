import { asRecord, nullableString } from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import {
  readGoogleMapsApiKey,
  readVietmapApiKey,
} from "../../platform/edge-env.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  EdgePlacesResolveResult,
  PlacesAutocompleteResponse,
} from "../contracts/catalog.ts";
import {
  normalizeServiceAreaDistrict,
  type PlacesAutocompleteInput,
  type PlacesResolveInput,
} from "../../../../_shared/domain.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import {
  persistApartmentAccessProfileFromMetadata,
  sanitizeApartmentAccessProfile,
} from "../worker/apartment-access.ts";
import {
  buildGeocodingAddress,
  geocodeWithGoogleMaps,
  geocodeWithVietmap,
  googlePlacesAutocomplete,
  googlePlacesResolve,
  updateJobGeo,
  vietmapPlacesAutocomplete,
  vietmapPlacesResolve,
} from "./geo-providers.ts";

export async function placesAutocomplete(
  ctx: MobileApiContext,
  input: PlacesAutocompleteInput,
  secrets: EdgeAiSecrets,
): Promise<PlacesAutocompleteResponse> {
  void ctx;
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (vietmapApiKey) {
    const result = await vietmapPlacesAutocomplete(input, vietmapApiKey);
    if (!result.fallback_used) return result;
  }

  const googleApiKey = readGoogleMapsApiKey(secrets);
  if (googleApiKey) return googlePlacesAutocomplete(input, googleApiKey);

  return { suggestions: [], fallback_used: true };
}

export async function placesResolve(
  ctx: MobileApiContext,
  input: PlacesResolveInput,
  secrets: EdgeAiSecrets,
): Promise<EdgePlacesResolveResult> {
  void ctx;
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (vietmapApiKey) {
    const result = await vietmapPlacesResolve(input, vietmapApiKey);
    if (result) return result;
  }

  const googleApiKey = readGoogleMapsApiKey(secrets);
  if (googleApiKey) {
    const result = await googlePlacesResolve(input, googleApiKey);
    if (result) return result;
  }

  return {
    fallback_used: true,
    label: input.label ?? null,
    location: null,
    place_id: input.place_id,
    provider: "fallback",
  };
}

export async function geocodeJobAddressForMatching(
  client: DbClient,
  jobId: string,
  input: { addressLabel: string | null; district: string | null },
  secrets: EdgeAiSecrets,
) {
  const district = normalizeServiceAreaDistrict(input.district);
  const address = buildGeocodingAddress(input.addressLabel, district);
  const fallbackUpdate = compactMetadata({
    address_building: input.addressLabel?.slice(0, 200) ?? null,
    geo_source: "fallback",
  });
  const vietmapApiKey = readVietmapApiKey(secrets);
  const googleApiKey = readGoogleMapsApiKey(secrets);
  if ((!vietmapApiKey && !googleApiKey) || !district || !address) {
    await updateJobGeo(client, jobId, fallbackUpdate);
    return;
  }

  const vietmapResult = vietmapApiKey
    ? await geocodeWithVietmap(address, vietmapApiKey, jobId)
    : null;
  const result = vietmapResult ??
    (googleApiKey
      ? await geocodeWithGoogleMaps(address, googleApiKey, jobId)
      : null);

  if (result) {
    await updateJobGeo(client, jobId, {
      ...fallbackUpdate,
      address_lat: result.lat,
      address_lng: result.lng,
      geo_source: result.geoSource,
    });
    return;
  }

  await updateJobGeo(client, jobId, fallbackUpdate);
}

export async function markJobGeocodeFallback(client: DbClient, jobId: string) {
  await updateJobGeo(client, jobId, { geo_source: "fallback" });
}

export async function geocodeConfirmedKaelJob(
  client: DbClient,
  sessionId: string,
  jobId: string,
  customerId: string,
  district: string | null,
  secrets: EdgeAiSecrets,
) {
  const session = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("safe_metadata")
      .eq("id", sessionId)
      .maybeSingle(),
  );
  if (session.error) {
    console.warn("mobile-api Kael geocode session lookup failed", {
      jobId,
      errorCode: session.error.code,
    });
    await markJobGeocodeFallback(client, jobId);
    return;
  }
  const metadata = asRecord(session.data?.safe_metadata);
  await persistApartmentAccessProfileFromMetadata(client, {
    customerId,
    jobId,
    addressLabel: nullableString(metadata.address_label),
    district,
    profile: sanitizeApartmentAccessProfile(metadata.apartment_access_profile),
  });
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: nullableString(metadata.address_label),
    district,
  }, secrets);
}
