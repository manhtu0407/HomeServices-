// Edge service places-geo domain (C4 6a, services/* split): Vietmap/Google places-autocomplete
// + address geocoding (write-back to jobs) + the maps URL consts. Imported directly by services.ts.

import { asRecord, nullableNumber, nullableString } from "./coercions.ts";
import { dbQuery, fetchJsonWithTimeout, type DbClient } from "./db.ts";
import { compactMetadata, districtLabel, readGoogleMapsApiKey, readVietmapApiKey } from "./_shared.ts";
import {
  apiFailure,
  type MobileApiContext,
  type PlacesAutocompleteResponse,
} from "../router.ts";
import {
  normalizeServiceAreaDistrict,
  type PlacesAutocompleteInput,
  type PlacesResolveInput,
} from "../../../_shared/domain.ts";
import type { EdgeAiSecrets } from "../kael/index.ts";
import { persistApartmentAccessProfileFromMetadata, sanitizeApartmentAccessProfile } from "./apartment-access.service.ts";

type MapsGeoSource = "vietmap" | "google_maps";
type GeocodeResult = { lat: number; lng: number; geoSource: MapsGeoSource };
type PlacesResolveResponse = {
  fallback_used: boolean;
  label: string | null;
  location: { lat: number; lng: number } | null;
  place_id: string;
  provider: "vietmap" | "google_maps" | "fallback";
};

const VIETMAP_AUTOCOMPLETE_URL = "https://maps.vietmap.vn/api/autocomplete/v4";
const VIETMAP_SEARCH_URL = "https://maps.vietmap.vn/api/search/v4";
const VIETMAP_PLACE_URL = "https://maps.vietmap.vn/api/place/v4";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const HCMC_MAP_FOCUS = "10.776889,106.700806";
const VIETMAP_HCMC_CITY_ID = "12";

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
): Promise<PlacesResolveResponse> {
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

async function vietmapPlacesAutocomplete(
  input: PlacesAutocompleteInput,
  apiKey: string,
): Promise<PlacesAutocompleteResponse> {
  try {
    const url = buildVietmapUrl(VIETMAP_AUTOCOMPLETE_URL, apiKey, {
      text: input.input,
      focus: HCMC_MAP_FOCUS,
      display_type: "6",
      cityId: VIETMAP_HCMC_CITY_ID,
    });
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        provider: "vietmap",
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = await response.json().catch(() => []) as unknown;
    const rows = Array.isArray(body) ? body : [];
    const suggestions = rows
      .map(vietmapAutocompleteSuggestion)
      .filter((item): item is PlacesAutocompleteResponse["suggestions"][number] =>
        item !== null
      )
      .slice(0, 5);

    return { suggestions, fallback_used: false };
  } catch (error) {
    console.warn("mobile-api places autocomplete threw", {
      provider: "vietmap",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { suggestions: [], fallback_used: true };
  }
}

async function googlePlacesAutocomplete(
  input: PlacesAutocompleteInput,
  apiKey: string,
): Promise<PlacesAutocompleteResponse> {
  try {
    const response = await fetchJsonWithTimeout(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: input.input,
        languageCode: "vi",
        regionCode: "VN",
        includedRegionCodes: ["vn"],
        sessionToken: input.session_token,
        locationBias: {
          rectangle: {
            low: { latitude: 10.65, longitude: 106.55 },
            high: { latitude: 10.91, longitude: 106.85 },
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        provider: "google_maps",
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = await response.json().catch(() => ({})) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    };
    const suggestions = (body.suggestions ?? [])
      .map((suggestion) => {
        const prediction = suggestion.placePrediction;
        const label = prediction?.text?.text?.trim() ?? "";
        const placeId = prediction?.placeId?.trim() ?? "";
        if (!label || !placeId) return null;
        return {
          place_id: placeId,
          label,
          main_text: prediction?.structuredFormat?.mainText?.text?.trim() ??
            label,
          secondary_text:
            prediction?.structuredFormat?.secondaryText?.text?.trim() ?? null,
        };
      })
      .filter((item): item is PlacesAutocompleteResponse["suggestions"][number] =>
        item !== null
      )
      .slice(0, 5);

    return { suggestions, fallback_used: false };
  } catch (error) {
    console.warn("mobile-api places autocomplete threw", {
      provider: "google_maps",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { suggestions: [], fallback_used: true };
  }
}

async function vietmapPlacesResolve(
  input: PlacesResolveInput,
  apiKey: string,
): Promise<PlacesResolveResponse | null> {
  try {
    const url = buildVietmapUrl(VIETMAP_PLACE_URL, apiKey, {
      refid: input.place_id,
    });
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api places resolve failed", {
        provider: "vietmap",
        status: response.status,
      });
      return null;
    }

    const body = asRecord(await response.json().catch(() => ({})));
    const lat = nullableNumber(body.lat);
    const lng = nullableNumber(body.lng);
    if (lat === null || lng === null) return null;
    return {
      fallback_used: false,
      label: vietmapDisplayText(body) || input.label || null,
      location: { lat, lng },
      place_id: input.place_id,
      provider: "vietmap",
    };
  } catch (error) {
    console.warn("mobile-api places resolve threw", {
      provider: "vietmap",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function googlePlacesResolve(
  input: PlacesResolveInput,
  apiKey: string,
): Promise<PlacesResolveResponse | null> {
  try {
    const url =
      `${GOOGLE_GEOCODING_URL}?place_id=${encodeURIComponent(input.place_id)}&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api places resolve failed", {
        provider: "google_maps",
        status: response.status,
      });
      return null;
    }

    const body = await response.json().catch(() => ({})) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const first = body.results?.[0];
    const location = first?.geometry?.location;
    if (
      body.status !== "OK" ||
      typeof location?.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      return null;
    }
    return {
      fallback_used: false,
      label: first?.formatted_address?.trim() || input.label || null,
      location: { lat: location.lat, lng: location.lng },
      place_id: input.place_id,
      provider: "google_maps",
    };
  } catch (error) {
    console.warn("mobile-api places resolve threw", {
      provider: "google_maps",
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function geocodeWithVietmap(
  address: string,
  apiKey: string,
  jobId: string,
): Promise<GeocodeResult | null> {
  try {
    const searchUrl = buildVietmapUrl(VIETMAP_SEARCH_URL, apiKey, {
      text: address,
      focus: HCMC_MAP_FOCUS,
      display_type: "6",
      cityId: VIETMAP_HCMC_CITY_ID,
    });
    const searchResponse = await fetchJsonWithTimeout(searchUrl, {
      method: "GET",
    });
    if (!searchResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "search",
        jobId,
        status: searchResponse.status,
      });
      return null;
    }

    const searchBody = await searchResponse.json().catch(() => []) as unknown;
    const refId = firstVietmapRefId(searchBody);
    if (!refId) return null;

    const placeUrl = buildVietmapUrl(VIETMAP_PLACE_URL, apiKey, {
      refid: refId,
    });
    const placeResponse = await fetchJsonWithTimeout(placeUrl, { method: "GET" });
    if (!placeResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "place",
        jobId,
        status: placeResponse.status,
      });
      return null;
    }

    const placeBody = asRecord(await placeResponse.json().catch(() => ({})));
    const lat = nullableNumber(placeBody.lat);
    const lng = nullableNumber(placeBody.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng, geoSource: "vietmap" };
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      provider: "vietmap",
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

async function geocodeWithGoogleMaps(
  address: string,
  apiKey: string,
  jobId: string,
): Promise<GeocodeResult | null> {
  try {
    const url =
      `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(address)}&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "google_maps",
        jobId,
        status: response.status,
      });
      return null;
    }
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const location = body.results?.[0]?.geometry?.location;
    if (
      body.status !== "OK" ||
      typeof location?.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      return null;
    }
    return { lat: location.lat, lng: location.lng, geoSource: "google_maps" };
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      provider: "google_maps",
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

function buildGeocodingAddress(
  addressLabel: string | null,
  district: string | null,
) {
  const parts = [
    addressLabel?.trim(),
    district ? districtLabel(district) : null,
    "Ho Chi Minh City",
    "Vietnam",
  ].filter((part): part is string => Boolean(part));
  return Array.from(new Set(parts)).join(", ");
}

function vietmapAutocompleteSuggestion(
  value: unknown,
): PlacesAutocompleteResponse["suggestions"][number] | null {
  const record = asRecord(value);
  const placeId = nullableString(record.ref_id)?.trim() ?? "";
  const label = vietmapDisplayText(record);
  if (!placeId || !label) return null;

  const mainText = nullableString(record.name)?.trim() || label;
  const secondaryText = nullableString(record.address)?.trim() || null;
  return {
    place_id: placeId,
    label,
    main_text: mainText,
    secondary_text: secondaryText,
  };
}

function firstVietmapRefId(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const record = asRecord(item);
    const refId = nullableString(record.ref_id)?.trim();
    if (refId) return refId;
  }
  return null;
}

function vietmapDisplayText(record: Record<string, unknown>): string {
  const display = nullableString(record.display)?.trim();
  if (display) return display;
  const parts = [
    nullableString(record.name)?.trim(),
    nullableString(record.address)?.trim(),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ");
}

function buildVietmapUrl(
  baseUrl: string,
  apiKey: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function updateJobGeo(
  client: DbClient,
  jobId: string,
  value: Record<string, unknown>,
) {
  const update = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(value)
      .eq("id", jobId)
      .select("id")
      .maybeSingle(),
  );
  if (update.error) {
    console.warn("mobile-api job geo update failed", {
      jobId,
      errorCode: update.error.code,
    });
  }
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
