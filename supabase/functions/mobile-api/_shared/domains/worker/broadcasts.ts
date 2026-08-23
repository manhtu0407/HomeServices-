import {
  asString,
  asStringArray,
  nullableNumber,
  nullableRecord,
  nullableString,
  relatedJob,
} from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { secondsRemaining } from "../../platform/domain-utils.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { BroadcastStatus, ServiceType } from "../../../../_shared/domain.ts";
import { estimateWorkerNet } from "../payment/commission.ts";
import {
  parseOriginalScopePriceQuote,
  projectOriginalScopePriceQuote,
} from "../matching/original-scope-price-quote.ts";
import { projectMatchingDelivery } from "../matching/delivery.ts";
import type { EdgeWorkerMatchingProposalInput } from "../contracts/broadcast.ts";
import type { EdgeQuoteMode } from "../../../../_shared/contracts/stage1-reliability.ts";

export async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const client = db(ctx);
  const workflowClient = workflowDb(ctx);
  const now = new Date();
  const expired = await dbQuery(
    workflowClient.rpc("expire_worker_matching_deliveries", {
      p_worker_id: ctx.user.id,
      p_now: now.toISOString(),
    }),
  );
  if (expired.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật yêu cầu hết hạn", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, original_scope_price_quote, matching_recipient_deliveries(id, broadcast_id, job_id, operation_id, status, expires_at, delivered_at, seen_at, accepted_at), jobs(status, service_type, quote_mode, problem_chips, description, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)",
      )
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .gt("expires_at", now.toISOString())
      .order("sent_at", { ascending: false })
      .limit(20),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu", 500);
  return {
    broadcasts: (result.data ?? []).map((row) => {
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
          workerId: ctx.user.id,
        },
      );
      const commissionTier = quote
        ? { level: quote.commissionLevel, rateBps: quote.commissionRateBps }
        : null;
      const deliveryRow = relatedDelivery(row.matching_recipient_deliveries);
      const mode = quoteMode(job.quote_mode);
      return {
        broadcast_id: broadcastId,
        job_id: jobId,
        status: row.status as BroadcastStatus,
        service_type: job.service_type as ServiceType,
        quote_mode: mode,
        proposal_action: mode === "rfq"
          ? "submit_rfq_proposal" as const
          : mode === "inspection_only"
          ? "submit_inspection_scope" as const
          : "accept_priced_offer" as const,
        problem_summary: asStringArray(job.problem_chips)[0] ??
          nullableString(job.kael_problem_identified),
        scope_summary: nullableString(job.description),
        district: nullableString(job.address_district),
        estimated_price_min: min,
        estimated_price_max: max,
        estimated_earning_min: commissionTier ? estimateWorkerNet(min, commissionTier) : null,
        estimated_earning_max: commissionTier ? estimateWorkerNet(max, commissionTier) : null,
        media_count: asStringArray(job.photo_urls).length,
        worker_brief_core: nullableRecord(job.kael_worker_brief_core),
        scheduled_at: nullableString(job.scheduled_at),
        sent_at: nullableString(row.sent_at),
        expires_at: nullableString(row.expires_at),
        seconds_remaining: secondsRemaining(
          nullableString(row.expires_at),
          now,
        ),
        original_scope_price_quote: quote ? projectOriginalScopePriceQuote(quote) : null,
        ...(deliveryRow ? { delivery_receipt: projectMatchingDelivery(deliveryRow, now) } : {}),
      };
    }).filter((broadcast): broadcast is NonNullable<typeof broadcast> =>
      broadcast !== null
    ),
  };
}

export async function submitWorkerMatchingProposal(
  ctx: MobileApiContext,
  broadcastId: string,
  input: EdgeWorkerMatchingProposalInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("submit_worker_matching_proposal_atomic", {
      p_broadcast_id: broadcastId,
      p_worker_id: ctx.user.id,
      p_scope_summary: input.scope_summary,
      p_price_min: input.price_min ?? null,
      p_price_max: input.price_max ?? null,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể gửi đề xuất phạm vi", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi đề xuất phạm vi", 500);
  if (row.ok !== true) {
    const errorCode = nullableString(row.error_code);
    if (errorCode === "DELIVERY_NOT_ACTIVE") {
      apiFailure("INVALID_STATUS", "Yêu cầu này đã hết hạn hoặc không còn dành cho bạn", 409);
    }
    if (errorCode === "PRICE_REQUIRED") {
      apiFailure("VALIDATION", "Yêu cầu báo giá cần có khoảng giá tối thiểu và tối đa", 400);
    }
    if (errorCode === "PRICE_NOT_ALLOWED") {
      apiFailure("VALIDATION", "Yêu cầu khảo sát chưa cho phép gửi giá", 400);
    }
    if (errorCode === "SCOPE_INVALID") {
      apiFailure("VALIDATION", "Phạm vi đề xuất không hợp lệ", 400);
    }
    apiFailure("INVALID_STATUS", "Đề xuất này đã được xử lý", 409);
  }
  const candidateId = nullableString(row.candidate_id);
  const proposalId = nullableString(row.proposal_id);
  if (!candidateId || !proposalId) {
    apiFailure("DB_ERROR", "Dữ liệu đề xuất phạm vi không hợp lệ", 500);
  }
  return {
    broadcast_id: broadcastId,
    candidate_id: candidateId,
    proposal_id: proposalId,
    status: "candidate_ready" as const,
    already_applied: row.already_applied === true,
  };
}

export async function recordWorkerMatchingHeartbeat(ctx: MobileApiContext) {
  const now = new Date();
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("record_worker_matching_heartbeat", {
      p_worker_id: ctx.user.id,
      p_observed_at: now.toISOString(),
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể ghi nhận trạng thái trực tuyến", 500);
  return {
    server_time: nullableString(row.server_time) ?? now.toISOString(),
    active_until: nullableString(row.active_until),
  };
}

export async function markWorkerBroadcastSeen(
  ctx: MobileApiContext,
  broadcastId: string,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("mark_matching_delivery_seen", {
      p_broadcast_id: broadcastId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể cập nhật trạng thái yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu đang hoạt động", 404);
  return { delivery_receipt: projectMatchingDelivery(row) };
}

function relatedDelivery(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && !Array.isArray(first)
      ? first as Record<string, unknown>
      : null;
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function quoteMode(value: unknown): EdgeQuoteMode | null {
  return value === "kael_auto_quote" || value === "rfq" ||
      value === "inspection_only" || value === "blocked"
    ? value
    : null;
}
