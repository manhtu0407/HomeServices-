import { asJobStatus, asString, asServiceType, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  resolveSyntheticActorScope,
  scopeQueryToSyntheticActor,
} from "../../platform/synthetic-cohort.ts";
import { resolveWorkerAvatarUrl } from "../worker/avatar.ts";

const CUSTOMER_SERVICE_HISTORY_STATUSES = ["paid", "reviewed", "cancelled"];

export async function listCustomerServiceHistory(ctx: MobileApiContext) {
  const client = db(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const jobsQuery = client
    .from("jobs")
    .select("id, service_type, status, worker_id, final_price, completed_at, paid_at, reviewed_at, cancelled_at, created_at")
    .eq("customer_id", ctx.user.id)
    .in("status", CUSTOMER_SERVICE_HISTORY_STATUSES);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    scopeQueryToSyntheticActor(jobsQuery, actorScope)
      .order("updated_at", { ascending: false }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử dịch vụ", 500);
  }
  const jobs = result.data ?? [];
  const workerIds = Array.from(new Set(
    jobs.map((job) => nullableString(job.worker_id)).filter((workerId): workerId is string => Boolean(workerId)),
  ));
  if (workerIds.length === 0) {
    return { service_history: projectCustomerServiceHistoryRows(jobs, new Map(), new Set()) };
  }
  const [profileResult, favoriteResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client.from("profiles").select("id, full_name, avatar_url").in("id", workerIds),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      scopeQueryToSyntheticActor(
        client.from("customer_favorite_workers").select("worker_id").eq("customer_id", ctx.user.id).in("worker_id", workerIds),
        actorScope,
      ),
    ),
  ]);
  if (profileResult.error || favoriteResult.error) {
    apiFailure("DB_ERROR", "Không thể tải thông tin thợ trong lịch sử", 500);
  }
  const signedProfiles: Array<Record<string, unknown>> = await Promise.all(
    (profileResult.data ?? []).map(async (profile): Promise<Record<string, unknown>> => ({
      ...profile,
      avatar_url: await resolveWorkerAvatarUrl(client, profile.avatar_url),
    })),
  );
  const profilesByWorkerId = new Map(
    signedProfiles.map((profile) => [asString(profile.id), profile]),
  );
  const favoriteWorkerIds = new Set(
    (favoriteResult.data ?? []).map((favorite) => asString(favorite.worker_id)),
  );
  return {
    service_history: projectCustomerServiceHistoryRows(jobs, profilesByWorkerId, favoriteWorkerIds),
  };
}

export function projectCustomerServiceHistoryRows(
  jobs: Array<Record<string, unknown>>,
  profilesByWorkerId: Map<string, Record<string, unknown>>,
  favoriteWorkerIds: Set<string>,
) {
  return jobs.map((job) => {
    const status = asJobStatus(job.status);
    const createdAt = asString(job.created_at);
    const endedAt = status === "cancelled"
      ? nullableString(job.cancelled_at) ?? createdAt
      : nullableString(job.reviewed_at) ?? nullableString(job.paid_at) ?? nullableString(job.completed_at) ?? createdAt;
    const workerId = nullableString(job.worker_id);
    const workerProfile = workerId ? profilesByWorkerId.get(workerId) : undefined;
    return {
      id: asString(job.id),
      service_type: asServiceType(job.service_type),
      status,
      ended_at: endedAt,
      final_price: nullableNumber(job.final_price),
      worker: workerId
        ? {
            id: workerId,
            display_name: nullableString(workerProfile?.full_name),
            avatar_url: nullableString(workerProfile?.avatar_url),
            is_favorite: favoriteWorkerIds.has(workerId),
          }
        : null,
    };
  });
}
