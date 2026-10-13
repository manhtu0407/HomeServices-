// The worker's trip shared with the customer. The worker's app reports its position here while the
// job is worker_on_way; the server prices that position against the same VietMap route as the worker's
// own map (getWorkerRoutePreview), keeps the latest one, and the customer's job read returns it. One
// computation feeds both sides, so the two screens cannot disagree about distance or time.

import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, workflowDb, type DbClient } from "../../platform/db.ts";
import { decodePolyline5, thinPolyline } from "../../platform/polyline.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type { WorkerRouteOrigin } from "../contracts/worker.ts";
import type { EdgeJobWorkerTravel } from "../contracts/job-detail.ts";
import { getWorkerRoutePreview } from "./route.ts";

// A report younger than this is refused before any provider call, so a misbehaving client cannot spend
// route lookups. The worker's app reports at most every 30 seconds.
const MIN_REPORT_GAP_MS = 10_000;
const CUSTOMER_ROUTE_POINTS = 120;

export type EdgeWorkerTravelReportResponse = Awaited<ReturnType<typeof getWorkerRoutePreview>> & {
  shared_with_customer: boolean;
  reported_at: string | null;
};

export async function reportWorkerTravelPosition(
  ctx: MobileApiContext,
  jobId: string,
  origin: WorkerRouteOrigin,
  secrets: EdgeAiSecrets,
): Promise<EdgeWorkerTravelReportResponse> {
  if (ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ thợ được giao việc mới báo vị trí.", 403);
  }
  const client = workflowDb(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select: "id,status,worker_id",
  });
  if (job.status !== "worker_on_way") {
    apiFailure("INVALID_STATUS", "Chỉ báo vị trí khi bạn đang trên đường tới.", 409);
  }
  const last = await dbQuery<{ reported_at: string } | null>(
    client.from("job_worker_positions").select("reported_at").eq("job_id", jobId).maybeSingle(),
  );
  const lastAt = Date.parse(last.data?.reported_at ?? "");
  if (Number.isFinite(lastAt) && Date.now() - lastAt < MIN_REPORT_GAP_MS) {
    apiFailure("TRAVEL_REPORT_TOO_SOON", "Vị trí vừa được cập nhật. Vui lòng thử lại sau ít giây.", 429);
  }

  const preview = await getWorkerRoutePreview(ctx, jobId, origin, secrets);
  if (!preview.encoded_polyline) {
    return { ...preview, shared_with_customer: false, reported_at: null };
  }
  const recorded = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("record_worker_travel_position_atomic", {
      p_job_id: jobId,
      p_latitude: origin.latitude,
      p_longitude: origin.longitude,
      p_remaining_meters: preview.distance_meters,
      p_remaining_seconds: preview.duration_seconds,
      p_route_polyline: preview.encoded_polyline,
      p_worker_id: ctx.user.id,
    }),
  );
  if (recorded.error?.code === "P0001") apiFailure("NOT_FOUND", "Không tìm thấy công việc.", 404);
  const row = recorded.data?.[0];
  if (recorded.error || !row) {
    console.warn("mobile-api worker travel position not stored", { jobId });
    return { ...preview, shared_with_customer: false, reported_at: null };
  }
  if (row.recorded !== true && row.reason === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chỉ báo vị trí khi bạn đang trên đường tới.", 409);
  }
  return {
    ...preview,
    shared_with_customer: row.recorded === true,
    reported_at: typeof row.reported_at === "string" ? row.reported_at : null,
  };
}

// What the customer's job read shows while the worker is on the way. A trip nobody has reported on, or a
// position the database refuses to give, is null: the customer then sees the honest "no live update" note.
export async function readJobWorkerTravel(
  client: DbClient,
  jobId: string,
  customerId: string,
): Promise<EdgeJobWorkerTravel | null> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("get_job_worker_travel", { p_customer_id: customerId, p_job_id: jobId }),
  );
  if (result.error) {
    console.warn("mobile-api worker travel unavailable", { jobId });
    return null;
  }
  const row = result.data?.[0];
  if (!row) return null;
  const route = decodePolyline5(typeof row.route_polyline === "string" ? row.route_polyline : null);
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const total = Number(row.total_meters);
  const remaining = Number(row.remaining_meters);
  const seconds = Number(row.remaining_seconds);
  const reportedAt = typeof row.reported_at === "string" ? row.reported_at : null;
  if (
    !route || !reportedAt || ![latitude, longitude, total, remaining, seconds].every(Number.isFinite) ||
    remaining > total
  ) {
    console.warn("mobile-api worker travel row unusable", { jobId });
    return null;
  }
  return {
    updated_at: reportedAt,
    route: thinPolyline(route, CUSTOMER_ROUTE_POINTS),
    position: [latitude, longitude],
    total_meters: total,
    remaining_meters: remaining,
    remaining_seconds: seconds,
  };
}
