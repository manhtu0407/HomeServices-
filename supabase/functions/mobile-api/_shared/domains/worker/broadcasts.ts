import {
  asString,
  asStringArray,
  nullableNumber,
  nullableRecord,
  nullableString,
  relatedJob,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { secondsRemaining } from "../../platform/domain-utils.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { BroadcastStatus, ServiceType } from "../../../../_shared/domain.ts";
import { estimateWorkerNet, getWorkerCommissionTier } from "../payment/commission.ts";

export async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const client = db(ctx);
  const now = new Date();
  const commissionTierRequest = getWorkerCommissionTier(client, ctx.user.id);
  const expired = await dbQuery(
    client
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: now.toISOString() })
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .lte("expires_at", now.toISOString()),
  );
  if (expired.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật yêu cầu hết hạn", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)",
      )
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .gt("expires_at", now.toISOString())
      .order("sent_at", { ascending: false })
      .limit(20),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu", 500);
  const commissionTier = await commissionTierRequest;
  return {
    broadcasts: (result.data ?? []).map((row) => {
      const job = relatedJob(row.jobs);
      if (!job || job.status !== "broadcasting") return null;
      const min = nullableNumber(job.kael_price_min);
      const max = nullableNumber(job.kael_price_max);
      return {
        broadcast_id: asString(row.id),
        job_id: asString(row.job_id),
        status: row.status as BroadcastStatus,
        service_type: job.service_type as ServiceType,
        problem_summary: nullableString(job.kael_problem_identified),
        district: nullableString(job.address_district),
        estimated_price_min: min,
        estimated_price_max: max,
        estimated_earning_min: estimateWorkerNet(min, commissionTier),
        estimated_earning_max: estimateWorkerNet(max, commissionTier),
        media_count: asStringArray(job.photo_urls).length,
        worker_brief_core: nullableRecord(job.kael_worker_brief_core),
        scheduled_at: nullableString(job.scheduled_at),
        sent_at: nullableString(row.sent_at),
        expires_at: nullableString(row.expires_at),
        seconds_remaining: secondsRemaining(
          nullableString(row.expires_at),
          now,
        ),
      };
    }).filter((broadcast): broadcast is NonNullable<typeof broadcast> =>
      broadcast !== null
    ),
  };
}
