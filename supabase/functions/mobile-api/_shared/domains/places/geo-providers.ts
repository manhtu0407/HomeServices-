import {
  asRecord,
  nullableNumber,
  nullableRecord,
} from "../../platform/coercions.ts";
import {
  type DbClient,
  dbQuery,
  fetchJsonWithTimeout,
  MAPS_PROVIDER_MAX_RESPONSE_BYTES,
} from "../../platform/db.ts";
import { readResponseJsonBounded } from "../../../../_shared/network.ts";
import { districtLabel } from "../../platform/labels.ts";
import type {
  EdgePlacesResolveResult,
  PlacesAutocompleteResponse,
} from "../contracts/catalog.ts";
import type {
  PlacesAutocompleteInput,
  PlacesResolveInput,
} from "../../../../_shared/domain.ts";
import {
  boundedProviderIdentifier,
  boundedProviderText,
} from "../../platform/provider-boundary.ts";

export type MapsGeoSource = "vietmap" | "google_maps";
export type GeocodeResult = {
  lat: number;
  lng: number;
  geoSource: MapsGeoSource;
};
const VIETMAP_AUTOCOMPLETE_URL = "https://maps.vietmap.vn/api/autocomplete/v4";
const VIETMAP_SEARCH_URL = "https://maps.vietmap.vn/api/search/v4";
const VIETMAP_PLACE_URL = "https://maps.vietmap.vn/api/place/v4";
const GOOGLE_GEOCODING_URL =
  "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const HCMC_MAP_FOCUS = "10.776889,106.700806";
const VIETMAP_HCMC_CITY_ID = "12";

export async function vietmapPlacesAutocomplete(
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

    const body = await readResponseJsonBounded(
      response,
      MAPS_PROVIDER_MAX_RESPONSE_BYTES,
    );
    if (!Array.isArray(body)) {
      throw new Error("Invalid VietMap autocomplete response");
    }
    const rows = body;
    const suggestions = rows
      .map(vietmapAutocompleteSuggestion)
      .filter((
        item,
      ): item is PlacesAutocompleteResponse["suggestions"][number] =>
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

export async function googlePlacesAutocomplete(
  input: PlacesAutocompleteInput,
  apiKey: string,
): Promise<PlacesAutocompleteResponse> {
  try {
    const response = await fetchJsonWithTimeout(
      GOOGLE_PLACES_AUTOCOMPLETE_URL,
      {
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
      },
    );
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        provider: "google_maps",
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = nullableRecord(
      await readResponseJsonBounded(
        response,
        MAPS_PROVIDER_MAX_RESPONSE_BYTES,
      ),
    );
    if (!body) throw new Error("Invalid Google autocomplete response");
    const rows = body.suggestions;
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new Error("Invalid Google autocomplete suggestions");
    }
    const suggestions = (rows ?? [])
      .map((value) => {
        const suggestion = nullableRecord(value);
        const prediction = nullableRecord(suggestion?.placePrediction);
        const label = boundedProviderText(
          nullableRecord(prediction?.text)?.text,
          240,
        );
        const placeId = boundedProviderIdentifier(prediction?.placeId, 256);
        if (!label || !placeId) return null;
        const structured = nullableRecord(prediction?.structuredFormat);
        return {
          place_id: placeId,
          label,
          main_text: boundedProviderText(
            nullableRecord(structured?.mainText)?.text,
            160,
          ) || label,
          secondary_text: boundedProviderText(
            nullableRecord(structured?.secondaryText)?.text,
            240,
          ) || null,
        };
      })
      .filter((
        item,
      ): item is PlacesAutocompleteResponse["suggestions"][number] =>
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

export async function vietmapPlacesResolve(
  input: PlacesResolveInput,
  apiKey: string,
): Promise<EdgePlacesResolveResult | null> {
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

    const body = nullableRecord(
      await readResponseJsonBounded(
        response,
        MAPS_PROVIDER_MAX_RESPONSE_BYTES,
      ),
    );
    if (!body) throw new Error("Invalid VietMap place response");
    const lat = nullableNumber(body.lat);
    const lng = nullableNumber(body.lng);
    if (lat === null || lng === null || !validCoordinates(lat, lng)) {
      return null;
    }
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

export async function googlePlacesResolve(
  input: PlacesResolveInput,
  apiKey: string,
): Promise<EdgePlacesResolveResult | null> {
  try {
    const url = `${GOOGLE_GEOCODING_URL}?place_id=${
      encodeURIComponent(input.place_id)
    }&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api places resolve failed", {
        provider: "google_maps",
        status: response.status,
      });
      return null;
    }

    const body = nullableRecord(
      await readResponseJsonBounded(
        response,
        MAPS_PROVIDER_MAX_RESPONSE_BYTES,
      ),
    );
    if (!body) throw new Error("Invalid Google place response");
    const results = body.results;
    if (body.status !== "OK" || !Array.isArray(results)) return null;
    const first = nullableRecord(results[0]);
    const location = nullableRecord(nullableRecord(first?.geometry)?.location);
    const lat = nullableNumber(location?.lat);
    const lng = nullableNumber(location?.lng);
    if (lat === null || lng === null || !validCoordinates(lat, lng)) {
      return null;
    }
    return {
      fallback_used: false,
      label: boundedProviderText(first?.formatted_address, 240) ||
        input.label || null,
      location: { lat, lng },
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

export async function geocodeWithVietmap(
  address: string,
  apiKey: string,
  jobId: string,
  timeoutBudgetMs = 5_000,
): Promise<GeocodeResult | null> {
  const deadline = performance.now() + timeoutBudgetMs;
  try {
    const searchUrl = buildVietmapUrl(VIETMAP_SEARCH_URL, apiKey, {
      text: address,
      focus: HCMC_MAP_FOCUS,
      display_type: "6",
      cityId: VIETMAP_HCMC_CITY_ID,
    });
    const searchTimeout = remainingTimeoutMs(deadline);
    if (searchTimeout === null) return null;
    const searchResponse = await fetchJsonWithTimeout(
      searchUrl,
      { method: "GET" },
      searchTimeout,
    );
    if (!searchResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "search",
        jobId,
        status: searchResponse.status,
      });
      return null;
    }

    const searchBody = await readResponseJsonBounded(
      searchResponse,
      MAPS_PROVIDER_MAX_RESPONSE_BYTES,
    );
    const refId = firstVietmapRefId(searchBody);
    if (!refId) return null;

    const placeUrl = buildVietmapUrl(VIETMAP_PLACE_URL, apiKey, {
      refid: refId,
    });
    const placeTimeout = remainingTimeoutMs(deadline);
    if (placeTimeout === null) return null;
    const placeResponse = await fetchJsonWithTimeout(
      placeUrl,
      { method: "GET" },
      placeTimeout,
    );
    if (!placeResponse.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "vietmap",
        stage: "place",
        jobId,
        status: placeResponse.status,
      });
      return null;
    }

    const placeBody = nullableRecord(
      await readResponseJsonBounded(
        placeResponse,
        MAPS_PROVIDER_MAX_RESPONSE_BYTES,
      ),
    );
    if (!placeBody) throw new Error("Invalid VietMap geocode response");
    const lat = nullableNumber(placeBody.lat);
    const lng = nullableNumber(placeBody.lng);
    if (lat === null || lng === null || !validCoordinates(lat, lng)) {
      return null;
    }
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

export async function geocodeWithGoogleMaps(
  address: string,
  apiKey: string,
  jobId: string,
  timeoutBudgetMs = 5_000,
): Promise<GeocodeResult | null> {
  try {
    const url = `${GOOGLE_GEOCODING_URL}?address=${
      encodeURIComponent(address)
    }&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(
      url,
      { method: "GET" },
      timeoutBudgetMs,
    );
    if (!response.ok) {
      console.warn("mobile-api geocoding failed", {
        provider: "google_maps",
        jobId,
        status: response.status,
      });
      return null;
    }
    const body = nullableRecord(
      await readResponseJsonBounded(
        response,
        MAPS_PROVIDER_MAX_RESPONSE_BYTES,
      ),
    );
    if (!body) throw new Error("Invalid Google geocode response");
    const results = body.results;
    if (body.status !== "OK" || !Array.isArray(results)) return null;
    const first = nullableRecord(results[0]);
    const location = nullableRecord(nullableRecord(first?.geometry)?.location);
    const lat = nullableNumber(location?.lat);
    const lng = nullableNumber(location?.lng);
    if (lat === null || lng === null || !validCoordinates(lat, lng)) {
      return null;
    }
    return { lat, lng, geoSource: "google_maps" };
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      provider: "google_maps",
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

function remainingTimeoutMs(deadline: number): number | null {
  const remaining = Math.floor(deadline - performance.now());
  return remaining >= 1 ? remaining : null;
}

export function buildGeocodingAddress(
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
  const placeId = boundedProviderIdentifier(record.ref_id, 256);
  const label = vietmapDisplayText(record);
  if (!placeId || !label) return null;

  const mainText = boundedProviderText(record.name, 160) || label;
  const secondaryText = boundedProviderText(record.address, 240) || null;
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
    const refId = boundedProviderIdentifier(record.ref_id, 256);
    if (refId) return refId;
  }
  return null;
}

function vietmapDisplayText(record: Record<string, unknown>): string {
  const display = boundedProviderText(record.display, 240);
  if (display) return display;
  const parts = [
    boundedProviderText(record.name, 160),
    boundedProviderText(record.address, 240),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" ").slice(0, 240).trim();
}

function validCoordinates(
  lat: number,
  lng: number,
): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

export async function updateJobGeo(
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
