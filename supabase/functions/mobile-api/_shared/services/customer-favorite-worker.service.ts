// Customer-owned favorite-worker mutation boundary. Matching may read these
// preferences, but only the owning customer can create or remove one.

import { apiFailure, type MobileApiContext } from "../router.ts";
import { db, dbQuery } from "./db.ts";

export async function saveCustomerFavoriteWorker(
  ctx: MobileApiContext,
  workerId: string,
) {
  const client = db(ctx);
  const worker = await dbQuery<Record<string, unknown>>(
    client.from("worker_profiles")
      .select("id")
      .eq("id", workerId)
      .eq("is_approved", true)
      .eq("is_suspended", false)
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
  const removed = await dbQuery(
    client.from("customer_favorite_workers")
      .delete()
      .eq("customer_id", ctx.user.id)
      .eq("worker_id", workerId),
  );
  if (removed.error) apiFailure("DB_ERROR", "Không thể bỏ lưu thợ yêu thích", 500);
  return { worker_id: workerId, is_favorite: false as const };
}
