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
  acquireDependencyPermit,
  recordDependencyResult,
  type ReliabilityClient,
} from "../../../../_shared/harness/reliability.ts";
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
import {
  AutocompleteResultCache,
  autocompleteCacheKey,
  firstUsefulAutocomplete,
  normalizeAutocompleteQuery,
  rankSuggestionsForQuery,
} from "./autocomplete-support.ts";

export const CONFIRMED_MATCHING_GEOCODE_BUDGET_MS = 1_500;

type GeocodeProvider<T> = (timeoutMs: number) => Promise<T | null>;

const AUTOCOMPLETE_PERMIT_TTL_MS = 10_000;
const AUTOCOMPLETE_HEDGE_DELAY_MS = 700;
const autocompleteCache = new AutocompleteResultCache();
let autocompletePermitAllowedUntil = 0;

/** Drops the isolate-local suggestion cache and permit reuse; tests need a cold start per case. */
export function resetAutocompleteStateForTests(): void {
  autocompleteCache.clear();
  autocompletePermitAllowedUntil = 0;
}

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

export async function placesAutocomplete(
  ctx: MobileApiContext,
  input: PlacesAutocompleteInput,
  secrets: EdgeAiSecrets,
): Promise<PlacesAutocompleteResponse> {
  const cacheKey = autocompleteCacheKey(input.input);
  const cached = autocompleteCache.get(cacheKey);
  if (cached) return cached;

  // Typing fires a request per pause, so the breaker permit is reused for a few seconds
  // instead of costing a database round trip (and failing closed when the database is busy).
  let control: MapsControl | null = null;
  if (Date.now() >= autocompletePermitAllowedUntil) {
    control = await mapsPermit(ctx.privilegedSupabase ?? ctx.supabase, ctx.environment, ctx.releaseId, secrets);
    if (!control.permit.allowed) return { suggestions: [], fallback_used: true };
    if (control.permit.state === "closed") autocompletePermitAllowedUntil = Date.now() + AUTOCOMPLETE_PERMIT_TTL_MS;
  }

  const providerInput = { ...input, input: normalizeAutocompleteQuery(input.input) };
  const vietmapApiKey = readVietmapApiKey(secrets);
  const googleApiKey = readGoogleMapsApiKey(secrets);
  const attempts: Array<Promise<PlacesAutocompleteResponse>> = [];
  if (vietmapApiKey) attempts.push(vietmapPlacesAutocomplete(providerInput, vietmapApiKey));
  if (googleApiKey) {
    // Google starts at once when VietMap is not configured, otherwise only when VietMap is slow or empty.
    const primary = attempts[0];
    const startGoogle = primary
      ? Promise.race([primary.then((result) => result.suggestions.length > 0 && !result.fallback_used), delay(AUTOCOMPLETE_HEDGE_DELAY_MS)])
        .then((vietmapUseful) => vietmapUseful === true ? null : googlePlacesAutocomplete(providerInput, googleApiKey))
      : googlePlacesAutocomplete(providerInput, googleApiKey);
    attempts.push(startGoogle.then((result) => result ?? { suggestions: [], fallback_used: false }));
  }

  const settled = await firstUsefulAutocomplete(attempts);
  const result = settled
    ? { ...settled, suggestions: rankSuggestionsForQuery(input.input, settled.suggestions) }
    : { suggestions: [], fallback_used: true };
  autocompleteCache.set(cacheKey, result);
  if (control) {
    // The breaker only needs the outcome eventually; the resident is not kept waiting for it.
    void recordMapsResult(
      control,
      !result.fallback_used,
      attempts.length === 0 ? "MAPS_PROVIDER_UNAVAILABLE" : null,
    ).catch((error) => {
      console.warn("mobile-api places autocomplete result record failed", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    });
  }
  return result;
}

export async function placesResolve(
  ctx: MobileApiContext,
  input: PlacesResolveInput,
  secrets: EdgeAiSecrets,
): Promise<EdgePlacesResolveResult> {
  const control = await mapsPermit(ctx.privilegedSupabase ?? ctx.supabase, ctx.environment, ctx.releaseId, secrets);
  if (!control.permit.allowed) return placesFallback(input);
  const vietmapApiKey = readVietmapApiKey(secrets);
  if (vietmapApiKey) {
    const result = await vietmapPlacesResolve(input, vietmapApiKey);
    if (result) {
      await recordMapsResult(control, true);
      return result;
    }
  }

  const googleApiKey = readGoogleMapsApiKey(secrets);
  if (googleApiKey) {
    const result = await googlePlacesResolve(input, googleApiKey);
    if (result) {
      await recordMapsResult(control, true);
      return result;
    }
  }

  await recordMapsResult(control, false, "MAPS_RESOLVE_FAILED");
  return placesFallback(input);
}

function placesFallback(input: PlacesResolveInput): EdgePlacesResolveResult {
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
  options: { providerBudgetMs?: number } = {},
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

  const control = await mapsPermit(client, secrets.harnessTrace?.environment, secrets.harnessTrace?.releaseId, secrets);
  if (!control.permit.allowed) {
    await updateJobGeo(client, jobId, fallbackUpdate);
    return;
  }
  const providers: Array<GeocodeProvider<Awaited<ReturnType<typeof geocodeWithVietmap>>>> = [];
  if (vietmapApiKey) {
    providers.push((timeoutMs) => geocodeWithVietmap(address, vietmapApiKey, jobId, timeoutMs));
  }
  if (googleApiKey) {
    providers.push((timeoutMs) => geocodeWithGoogleMaps(address, googleApiKey, jobId, timeoutMs));
  }
  const result = await firstProviderResultWithinBudget(
    options.providerBudgetMs ?? 5_000,
    providers,
  );

  await recordMapsResult(control, result !== null, result ? null : "MAPS_GEOCODE_FAILED");
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
  }, secrets, { providerBudgetMs: CONFIRMED_MATCHING_GEOCODE_BUDGET_MS });
}

export async function firstProviderResultWithinBudget<T>(
  budgetMs: number,
  providers: Array<GeocodeProvider<T>>,
  now: () => number = () => performance.now(),
): Promise<T | null> {
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 5_000) {
    throw new Error("MATCHING_GEOCODE_BUDGET_INVALID");
  }
  const deadline = now() + budgetMs;
  for (const provider of providers) {
    const remaining = Math.floor(deadline - now());
    if (remaining < 1) return null;
    const result = await provider(remaining);
    if (result !== null) return result;
  }
  return null;
}

type MapsControl = {
  client: ReliabilityClient | null;
  environment: string;
  releaseId: string;
  permit: Awaited<ReturnType<typeof acquireDependencyPermit>>;
};

async function mapsPermit(
  client: unknown,
  environment: string | undefined,
  releaseId: string | undefined,
  secrets: EdgeAiSecrets,
): Promise<MapsControl> {
  const resolvedEnvironment = environment ?? secrets.harnessTrace?.environment ?? "local";
  const reliabilityClient = client as ReliabilityClient | null;
  return {
    client: reliabilityClient,
    environment: resolvedEnvironment,
    releaseId: releaseId ?? secrets.harnessTrace?.releaseId ?? "unreleased",
    permit: await acquireDependencyPermit(reliabilityClient, {
      dependency: "maps",
      environment: resolvedEnvironment,
    }),
  };
}

async function recordMapsResult(
  control: MapsControl,
  success: boolean,
  errorCode: string | null = null,
) {
  await recordDependencyResult(control.client, {
    dependency: "maps",
    environment: control.environment,
    releaseId: control.releaseId,
    success,
    errorCode,
    probeToken: control.permit.probeToken,
  });
}
