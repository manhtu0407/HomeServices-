import {
  asString,
  asStringArray,
  asServiceTypeArray,
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
import { estimateWorkerNet } from "../payment/commission.ts";
import {
  parseOriginalScopePriceQuote,
  projectOriginalScopePriceQuote,
} from "../matching/original-scope-price-quote.ts";
import type { WorkerOpportunityAssistContext } from "../../kael/contracts/types.ts";
import { scrubSensitiveForLLM } from "../../kael/pipeline/utils.ts";
import { selectedServiceTypesForWorker } from "./service-preferences.ts";

type WorkerBroadcastProjection = {
  broadcast_id?: unknown;
  job_id?: unknown;
  service_type?: unknown;
  problem_summary?: unknown;
  scope_summary?: unknown;
  district?: unknown;
  scheduled_at?: unknown;
  expires_at?: unknown;
  media_count?: unknown;
};

export function projectWorkerOpportunityAssistContext(
  broadcasts: readonly WorkerBroadcastProjection[],
): WorkerOpportunityAssistContext[] {
  return broadcasts.flatMap((broadcast) => {
    const broadcastId = nullableString(broadcast.broadcast_id);
    const jobId = nullableString(broadcast.job_id);
    const serviceType = asServiceTypeArray([broadcast.service_type])[0];
    const expiresAt = nullableString(broadcast.expires_at);
    if (!broadcastId || !jobId || !serviceType || !expiresAt) return [];
    return [{
      broadcast_id: broadcastId,
      job_id: jobId,
      service_type: serviceType,
      problem_summary: scrubWorkerOpportunitySummary(broadcast.problem_summary, 240),
      scope_summary: scrubWorkerOpportunitySummary(broadcast.scope_summary, 480),
      district: scrubWorkerOpportunitySummary(broadcast.district, 120),
      scheduled_at: nullableString(broadcast.scheduled_at),
      expires_at: expiresAt,
      media_count: Math.max(0, Math.trunc(nullableNumber(broadcast.media_count) ?? 0)),
    }];
  });
}

function scrubWorkerOpportunitySummary(value: unknown, maxLength: number) {
  const text = nullableString(value);
  if (!text) return null;
  const scrubbed = scrubSensitiveForLLM(text).trim().slice(0, maxLength);
  return scrubbed || null;
}

export async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const client = db(ctx);
  const now = new Date();
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

  const broadcasts = await readActiveWorkerBroadcasts(client, ctx.user.id, now);
  return {
    broadcasts,
  };
}

export async function readWorkerOpportunityAssistContext(
  ctx: MobileApiContext,
) {
  const client = db(ctx);
  const now = new Date();
  const [broadcasts, profileResult] = await Promise.all([
    readActiveWorkerBroadcasts(client, ctx.user.id, now),
    dbQuery<Record<string, unknown>>(
      client
        .from("worker_profiles")
        .select("service_types, selected_service_types, active_service_types, districts")
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ),
  ]);
  if (profileResult.error) {
    apiFailure("DB_ERROR", "Không thể tải ngữ cảnh cơ hội", 500);
  }
  const profile = profileResult.data ?? {};
  return {
    opportunities: projectWorkerOpportunityAssistContext(broadcasts),
    preferences: {
      service_types: selectedServiceTypesForWorker(profile),
      districts: asStringArray(profile.districts),
    },
  };
}

async function readActiveWorkerBroadcasts(
  client: ReturnType<typeof db>,
  workerId: string,
  now: Date,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, original_scope_price_quote, jobs(status, service_type, problem_chips, description, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)",
      )
      .eq("worker_id", workerId)
      .eq("status", "sent")
      .gt("expires_at", now.toISOString())
      .order("expires_at", { ascending: true })
      .order("sent_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(20),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu", 500);
  return projectWorkerBroadcastRows(result.data ?? [], workerId, now);
}

export function projectWorkerBroadcastRows(
  rows: readonly Record<string, unknown>[],
  workerId: string,
  now: Date,
) {
  return rows.map((row) => {
    const broadcastExpiresAt = nullableString(row.expires_at);
    const broadcastExpiresAtMs = Date.parse(broadcastExpiresAt ?? "");
    if (
      nullableString(row.status) !== "sent" ||
      !Number.isFinite(broadcastExpiresAtMs) ||
      broadcastExpiresAtMs <= now.getTime()
    ) return null;
    const job = relatedJob(row.jobs);
    if (!job || job.status !== "broadcasting") return null;
    const min = nullableNumber(job.kael_price_min);
    const max = nullableNumber(job.kael_price_max);
    const broadcastId = asString(row.id);
    const jobId = asString(row.job_id);
    const quote = parseOriginalScopePriceQuote(
      row.original_scope_price_quote,
      {
        broadcastId,
        jobId,
        requireWorkerConfirmation: false,
        workerId,
      },
    );
    const quoteExpiresAtMs = Date.parse(quote?.expiresAt ?? "");
    if (!quote || !Number.isFinite(quoteExpiresAtMs) || quoteExpiresAtMs <= now.getTime()) return null;
    const commissionTier = {
      level: quote.commissionLevel,
      rateBps: quote.commissionRateBps,
    };
    return {
      broadcast_id: broadcastId,
      job_id: jobId,
      status: row.status as BroadcastStatus,
      service_type: job.service_type as ServiceType,
      problem_summary: asStringArray(job.problem_chips)[0] ??
        nullableString(job.kael_problem_identified),
      scope_summary: nullableString(job.description),
      district: nullableString(job.address_district),
      estimated_price_min: min,
      estimated_price_max: max,
      estimated_earning_min: estimateWorkerNet(min, commissionTier),
      estimated_earning_max: estimateWorkerNet(max, commissionTier),
      media_count: asStringArray(job.photo_urls).length,
      worker_brief_core: nullableRecord(job.kael_worker_brief_core),
      scheduled_at: nullableString(job.scheduled_at),
      sent_at: nullableString(row.sent_at),
      expires_at: broadcastExpiresAt,
      seconds_remaining: secondsRemaining(broadcastExpiresAt, now),
      original_scope_price_quote: projectOriginalScopePriceQuote(quote),
    };
  }).filter((broadcast): broadcast is NonNullable<typeof broadcast> =>
    broadcast !== null
  ).sort((left, right) => {
    const expiryOrder = Date.parse(left.expires_at ?? "") - Date.parse(right.expires_at ?? "");
    if (expiryOrder !== 0) return expiryOrder;
    const sentOrder = Date.parse(right.sent_at ?? "") - Date.parse(left.sent_at ?? "");
    return sentOrder !== 0
      ? sentOrder
      : left.broadcast_id.localeCompare(right.broadcast_id);
  });
}
