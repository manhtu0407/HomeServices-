import {
  asComplexityOrNull,
  asJobStatus,
  asRecord,
  asServiceType,
  asString,
  nullableNumber,
  nullableString,
  positiveNumberFrom,
} from "../../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { PRICE_DISCLAIMER } from "../../../kael/index.ts";

export async function findExistingJobByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<string | null> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .select("id")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  return result.data.id;
}

export async function buildExistingJobCreateResponse(
  ctx: MobileApiContext,
  jobId: string,
) {
  const client = db(ctx);
  const job = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, display_code, status, service_type, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, final_price",
      )
      .eq("id", jobId)
      .single(),
  );
  if (job.error || !job.data) {
    apiFailure("DB_ERROR", "Không thể tải lại yêu cầu đã tạo", 500);
  }
  const displayCode = nullableString(job.data.display_code);
  const cardV3 = asRecord(job.data.kael_estimate_card_v3);
  const cardEstimate = asRecord(cardV3.estimate);
  const complexity = asComplexityOrNull(job.data.kael_complexity) ??
    asComplexityOrNull(cardEstimate.complexity);
  const confidence = nullableNumber(cardEstimate.confidence);
  const problemCategory = nullableString(cardEstimate.problem_category);
  const problemSummary = nullableString(job.data.kael_problem_identified);
  const priceMin = positiveNumberFrom(job.data.kael_price_min) ??
    positiveNumberFrom(cardEstimate.price_min);
  const priceMax = positiveNumberFrom(job.data.kael_price_max) ??
    positiveNumberFrom(cardEstimate.price_max);
  if (!complexity || priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure(
      "JOB_PENDING",
      "Yêu cầu đang được Kael phân tích. Vui lòng thử lại sau.",
      409,
    );
  }
  if (
    confidence === null || confidence < 0 || confidence > 1 ||
    !problemCategory?.trim() || !problemSummary?.trim()
  ) {
    apiFailure("DB_ERROR", "Dữ liệu yêu cầu đã tạo không hợp lệ", 500);
  }
  const estimate = {
    service_type: asServiceType(job.data.service_type),
    problem_category: problemCategory,
    problem_summary: problemSummary,
    complexity,
    price_min: priceMin,
    price_max: priceMax,
    confidence,
    advisory: nullableString(job.data.kael_advisory),
    disclaimer: PRICE_DISCLAIMER,
  };
  return {
    job_id: asString(job.data.id),
    ...(displayCode ? { display_code: displayCode } : {}),
    status: asJobStatus(job.data.status),
    estimate,
    estimate_card_v3: Object.keys(cardV3).length > 0
      ? (cardV3 as Record<string, unknown>)
      : undefined,
    final_price: nullableNumber(job.data.final_price),
    fallback_used: false,
  };
}
