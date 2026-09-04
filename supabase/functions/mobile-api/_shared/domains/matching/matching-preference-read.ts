import { asServiceType, asString, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { resolveWorkerAvatarUrl } from "../worker/avatar.ts";
import { queryEligibleWorkers } from "./broadcast-workers.ts";
import { buildMatchingReceipt, type MatchingReceipt } from "./matching-receipt.ts";
import { requireMatchingDistrict } from "./matching-preference-shared.ts";
import {
  resolveSyntheticActorScope,
  scopeQueryToSyntheticActor,
} from "../../platform/synthetic-cohort.ts";

export async function listFavoriteWorkersForMatching(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, service_type, address_district",
  });
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const district = requireMatchingDistrict(job.address_district);
  const favoritesQuery = client
    .from("customer_favorite_workers")
    .select("worker_id")
    .eq("customer_id", ctx.user.id);
  const favorites = await dbQuery<Array<Record<string, unknown>>>(
    scopeQueryToSyntheticActor(favoritesQuery, actorScope)
      .order("created_at", { ascending: false })
      .limit(20),
  );
  if (favorites.error) apiFailure("DB_ERROR", "Không thể tải danh sách thợ đã lưu", 500);
  const workerIds = (favorites.data ?? [])
    .map((row) => nullableString(row.worker_id))
    .filter((value): value is string => Boolean(value));
  if (workerIds.length === 0) return { job_id: jobId, workers: [] };
  const [profiles, workers, eligible] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client.from("profiles").select("id, full_name, avatar_url").in("id", workerIds),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      scopeQueryToSyntheticActor(
        client.from("worker_profiles").select("id, rating, total_jobs").in("id", workerIds),
        actorScope,
      ),
    ),
    queryEligibleWorkers(
      client,
      asServiceType(job.service_type),
      district,
      workerIds.length,
      { candidateWorkerIds: workerIds, jobId },
    ),
  ]);
  if (profiles.error || workers.error || !eligible.success) {
    apiFailure("DB_ERROR", "Không thể kiểm tra thợ đã lưu cho yêu cầu này", 500);
  }
  const profilesById = new Map((profiles.data ?? []).map((profile) => [asString(profile.id), profile]));
  const workersById = new Map((workers.data ?? []).map((worker) => [asString(worker.id), worker]));
  const eligibleIds = new Set(eligible.workers.map((worker) => worker.id));
  const summaries = await Promise.all(workerIds.map(async (workerId) => {
    const profile = profilesById.get(workerId);
    const worker = workersById.get(workerId);
    const available = eligibleIds.has(workerId);
    return {
      id: workerId,
      avatar_url: await resolveWorkerAvatarUrl(client, profile?.avatar_url),
      display_name: nullableString(profile?.full_name),
      rating: nullableRating(worker?.rating),
      total_jobs: Math.max(0, Math.trunc(nullableNumber(worker?.total_jobs) ?? 0)),
      availability: available ? "available" as const : "unavailable" as const,
      availability_reason: available ? null : "not_available_for_this_request" as const,
    };
  }));
  return { job_id: jobId, workers: summaries };
}

export async function hasEligibleFavoriteWorker(ctx: MobileApiContext, jobId: string) {
  const result = await listFavoriteWorkersForMatching(ctx, jobId);
  return result.workers.some((worker) => worker.availability === "available");
}

export async function hasSavedWorker(ctx: MobileApiContext) {
  const client = db(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const result = await dbQuery<Array<Record<string, unknown>>>(
    scopeQueryToSyntheticActor(client
      .from("customer_favorite_workers")
      .select("worker_id")
      .eq("customer_id", ctx.user.id)
      .limit(1), actorScope),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể kiểm tra thợ đã lưu", 500);
  return (result.data ?? []).some((row) => Boolean(nullableString(row.worker_id)));
}

export async function isCustomerFavoriteWorker(ctx: MobileApiContext, workerId: string) {
  const client = db(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const result = await dbQuery<Record<string, unknown>>(
    scopeQueryToSyntheticActor(client
      .from("customer_favorite_workers")
      .select("worker_id")
      .eq("customer_id", ctx.user.id)
      .eq("worker_id", workerId), actorScope)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể kiểm tra thợ đã lưu", 500);
  return Boolean(result.data);
}

export async function getMatchingState(
  client: DbClient,
  jobId: string,
  status: string,
): Promise<MatchingReceipt | null> {
  const preference = await dbQuery<Record<string, unknown>>(
    client.from("job_matching_preferences")
      .select("strategy, auto_general, fallback_at")
      .eq("job_id", jobId)
      .maybeSingle(),
  );
  if (preference.error) {
    apiFailure("DB_ERROR", "Không thể tải biên nhận tìm thợ", 500);
  }
  if (!preference.data) return null;
  const [broadcasts, events] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client.from("job_broadcasts")
        .select("batch_id, broadcast_at, expires_at, status")
        .eq("job_id", jobId)
        .order("broadcast_at", { ascending: true })
        .limit(50),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client.from("job_events")
        .select("event_type, created_at, safe_metadata")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(60),
    ),
  ]);
  if (broadcasts.error || events.error) {
    apiFailure("DB_ERROR", "Không thể tải biên nhận tìm thợ", 500);
  }
  return buildMatchingReceipt({
    broadcasts: (broadcasts.data ?? []).map((broadcast) => ({
      batch_id: nullableString(broadcast.batch_id),
      broadcast_at: nullableString(broadcast.broadcast_at),
      expires_at: nullableString(broadcast.expires_at),
      status: nullableString(broadcast.status),
    })),
    events: (events.data ?? []).map((event) => ({
      created_at: nullableString(event.created_at),
      event_type: nullableString(event.event_type),
      safe_metadata: event.safe_metadata,
    })),
    preference: {
      auto_general: preference.data.auto_general === true,
      fallback_at: nullableString(preference.data.fallback_at),
      strategy: nullableString(preference.data.strategy),
    },
    status,
  });
}

function nullableRating(value: unknown) {
  const rating = nullableNumber(value);
  return rating !== null && rating >= 0 && rating <= 5 ? rating : null;
}
