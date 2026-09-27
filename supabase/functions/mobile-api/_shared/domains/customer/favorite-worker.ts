// Customer-owned favorite-worker mutation boundary. Matching may read these
// preferences, but only the owning customer can create or remove one.

import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import {
  resolveSyntheticActorScope,
  scopeQueryToSyntheticActor,
} from "../../platform/synthetic-cohort.ts";

export async function saveCustomerFavoriteWorker(
  ctx: MobileApiContext,
  workerId: string,
) {
  // Service client end to end: a customer cannot read worker_profiles, and the upsert is
  // INSERT .. ON CONFLICT DO UPDATE, which needs UPDATE on a table authenticated may only
  // insert into and delete from. The row is keyed to ctx.user.id and the worker is checked here.
  const client = workflowDb(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const workerQuery = client.from("worker_profiles")
    .select("id")
    .eq("id", workerId)
    .eq("is_approved", true)
    .eq("is_suspended", false);
  const worker = await dbQuery<Record<string, unknown>>(
    scopeQueryToSyntheticActor(workerQuery, actorScope)
      .maybeSingle(),
  );
  if (worker.error) apiFailure("DB_ERROR", "Không thể kiểm tra hồ sơ thợ", 500);
  if (!worker.data || workerId === ctx.user.id) {
    apiFailure("NOT_FOUND", "Không tìm thấy thợ có thể lưu", 404);
  }

  const saved = await dbQuery(
    client.from("customer_favorite_workers").upsert({
      customer_id: ctx.user.id,
      worker_id: workerId,
    }),
  );
  if (saved.error) apiFailure("DB_ERROR", "Không thể lưu thợ yêu thích", 500);
  return { worker_id: workerId, is_favorite: true as const };
}

export async function removeCustomerFavoriteWorker(
  ctx: MobileApiContext,
  workerId: string,
) {
  const client = db(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const removed = await dbQuery(
    scopeQueryToSyntheticActor(client.from("customer_favorite_workers")
      .delete()
      .eq("customer_id", ctx.user.id)
      .eq("worker_id", workerId), actorScope),
  );
  if (removed.error) apiFailure("DB_ERROR", "Không thể bỏ lưu thợ yêu thích", 500);
  return { worker_id: workerId, is_favorite: false as const };
}
