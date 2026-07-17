import type { EdgeAiSecrets } from "../kael/index.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import type { WorkerRouteOrigin } from "../router/contracts.ts";
import { projectAddressAccess } from "./apartment-access.service.ts";
import { nullableNumber } from "./_runtime/coercions.ts";
import {
  db,
  dbQuery,
  fetchJsonWithTimeout,
  MAPS_PROVIDER_MAX_RESPONSE_BYTES,
} from "./_runtime/db.ts";
import { readVietmapApiKey } from "./_runtime/shared.ts";
import {
  readResponseJsonBounded,
  ResponseBodyTooLargeError,
} from "../../../_shared/network.ts";

const VIETMAP_ROUTE_URL = "https://maps.vietmap.vn/api/route";
const VIETMAP_STATIC_MAP_URL = "https://maps.vietmap.vn/api/maps/statics/tm";
const VIETMAP_ATTEMPTS = 2;

type WorkerRouteDestination = {
  latitude: number;
  longitude: number;
};

type VietmapRouteResponse = {
  code?: string;
  paths?: Array<{
    distance?: number;
    time?: number;
  }>;
};

export async function getWorkerRoutePreview(
  ctx: MobileApiContext,
  jobId: string,
  origin: WorkerRouteOrigin,
  secrets: EdgeAiSecrets,
) {
  const destination = await workerRouteDestination(ctx, jobId);
  const apiKey = requireVietmapApiKey(secrets);
  const url = new URL(VIETMAP_ROUTE_URL);
  url.searchParams.set("api-version", "1.1");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.append("point", `${origin.latitude},${origin.longitude}`);
  url.searchParams.append("point", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("vehicle", "motorcycle");
  url.searchParams.set("points_encoded", "true");

  const response = await vietmapFetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    apiFailure("ROUTE_UNAVAILABLE", "Chưa thể tính lộ trình lúc này", 502);
  }
  const payload = await readVietmapRouteResponse(response);
  const path = payload.code === "OK" ? payload.paths?.[0] : null;
  const distance = positiveFiniteNumber(path?.distance);
  const duration = positiveFiniteNumber(path?.time);
  if (distance === null || duration === null) {
    apiFailure("ROUTE_UNAVAILABLE", "Chưa có quãng đường phù hợp", 502);
  }
  return {
    distance_meters: Math.round(distance),
    duration_seconds: Math.max(1, Math.round(duration / 1000)),
  };
}

async function readVietmapRouteResponse(response: Response): Promise<VietmapRouteResponse> {
  let payload: unknown;
  try {
    payload = await readResponseJsonBounded(
      response,
      MAPS_PROVIDER_MAX_RESPONSE_BYTES,
    );
  } catch {
    return invalidVietmapRouteResponse("INVALID_JSON");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return invalidVietmapRouteResponse("INVALID_SHAPE");
  }
  return payload as VietmapRouteResponse;
}

function invalidVietmapRouteResponse(errorCode: string): never {
  console.warn("mobile-api VietMap route response invalid", { errorCode });
  apiFailure("ROUTE_UNAVAILABLE", "Chưa thể đọc dữ liệu lộ trình lúc này", 502);
}

function positiveFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export async function getWorkerRouteMap(
  ctx: MobileApiContext,
  jobId: string,
  origin: WorkerRouteOrigin | null,
  secrets: EdgeAiSecrets,
) {
  const destination = await workerRouteDestination(ctx, jobId);
  const apiKey = requireVietmapApiKey(secrets);
  const center = origin
    ? {
      latitude: (origin.latitude + destination.latitude) / 2,
      longitude: (origin.longitude + destination.longitude) / 2,
    }
    : destination;
  const form = new FormData();
  form.set("apikey", apiKey);
  form.set("lat", center.latitude.toFixed(6));
  form.set("lng", center.longitude.toFixed(6));
  form.set("size", "600x400");
  form.set("zoom", String(routeMapZoom(origin, destination)));

  const response = await vietmapFetch(VIETMAP_STATIC_MAP_URL, {
    body: form,
    method: "POST",
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
    apiFailure("MAP_UNAVAILABLE", "Chưa thể tải bản đồ lúc này", 502);
  }
  return new Response(response.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-type": response.headers.get("content-type") ?? "image/png",
    },
    status: 200,
  });
}

async function workerRouteDestination(
  ctx: MobileApiContext,
  jobId: string,
): Promise<WorkerRouteDestination> {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("jobs")
      .select("id, status, worker_id, address_lat, address_lng, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state")
      .eq("id", jobId)
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải điểm đến", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy công việc", 404);

  const access = projectAddressAccess(result.data, "worker").addressAccess;
  // A worker needs the building destination to travel. Unit/floor remain protected
  // until the later customer-handoff release.
  if (access.release_stage === "area_only") {
    apiFailure("ADDRESS_PROTECTED", "Điểm đến chưa được mở cho thợ", 403);
  }
  const latitude = nullableNumber(result.data.address_lat);
  const longitude = nullableNumber(result.data.address_lng);
  if (latitude === null || longitude === null || !isHcmcCoordinate(latitude, longitude)) {
    apiFailure("DESTINATION_UNAVAILABLE", "Điểm đến chưa có tọa độ đã xác thực", 409);
  }
  return { latitude, longitude };
}

function requireVietmapApiKey(secrets: EdgeAiSecrets) {
  const apiKey = readVietmapApiKey(secrets);
  if (!apiKey) apiFailure("MAP_UNAVAILABLE", "Dịch vụ bản đồ chưa sẵn sàng", 503);
  return apiKey;
}

function isHcmcCoordinate(latitude: number, longitude: number) {
  return latitude >= 10.4 && latitude <= 11.2 && longitude >= 106.4 && longitude <= 107.1;
}

function routeMapZoom(origin: WorkerRouteOrigin | null, destination: WorkerRouteDestination) {
  if (!origin) return 15;
  const delta = Math.max(Math.abs(origin.latitude - destination.latitude), Math.abs(origin.longitude - destination.longitude));
  if (delta < 0.008) return 15;
  if (delta < 0.02) return 14;
  if (delta < 0.05) return 13;
  return 12;
}

async function vietmapFetch(url: string, init: RequestInit) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < VIETMAP_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchJsonWithTimeout(url, init);
      if (response.ok || response.status < 500 || attempt === VIETMAP_ATTEMPTS - 1) return response;
    } catch (error) {
      lastError = error;
      if (error instanceof ResponseBodyTooLargeError) break;
    }
  }
  if (lastError) apiFailure("MAP_UNAVAILABLE", "Dịch vụ bản đồ chưa phản hồi", 502);
  apiFailure("MAP_UNAVAILABLE", "Dịch vụ bản đồ chưa phản hồi", 502);
}
