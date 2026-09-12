import { apiFailure } from "../../platform/api-failure.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { insertUserNotification } from "../notification/notifications.ts";
import { resolveWorkerAvatarUrl } from "../worker/avatar.ts";
import {
  parseOriginalScopePriceQuote,
  projectOriginalScopePriceQuote,
} from "./original-scope-price-quote.ts";
import {
  requiredCandidateInteger,
  requiredCandidateString,
  safeCandidateBirthYear,
  safeCandidateGender,
} from "./candidate-profile.ts";

export async function notifyCustomerCandidateReady(
  client: DbClient,
  jobId: string,
  candidateId: string,
) {
  const owner = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).maybeSingle(),
  );
  if (owner.error) {
    console.warn("mobile-api candidate notification owner lookup failed", {
      jobId,
      errorCode: owner.error.code,
    });
    return;
  }
  const customerId = owner.data ? nullableString(owner.data.customer_id) : null;
  if (!customerId) return;
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_candidate_ready",
    title: "Có thợ đang chờ bạn xác nhận",
    body: "Kael đã tìm thấy thợ phù hợp. Hãy xem thông tin đã xác minh và quyết định.",
    metadata: { candidate_id: candidateId },
  });
}

export async function loadSafeWorkerCandidateView(
  client: DbClient,
  jobId: string,
  candidateId: string,
  customerId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("job_worker_candidates")
      .select("id, job_id, worker_id, broadcast_id, status, proposed_at, expires_at, customer_decided_at, original_scope_price_quote, worker_matching_proposals(id, scope_summary, price_min, price_max, status)")
      .eq("id", candidateId).eq("job_id", jobId).maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy thợ đang chờ xác nhận", 404);
  }
  return buildSafeWorkerCandidateView(client, result.data, customerId);
}

export async function buildSafeWorkerCandidateView(
  client: DbClient,
  candidate: Record<string, unknown>,
  customerId: string,
) {
  const workerId = nullableString(candidate.worker_id);
  if (!workerId) apiFailure("DB_ERROR", "Dữ liệu thợ đề xuất không hợp lệ", 500);
  const [worker, profile, favorite] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client.from("worker_profiles")
        .select("id, rating, total_jobs, years_experience, verification_status, date_of_birth, gender")
        .eq("id", workerId).maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("profiles").select("full_name, avatar_url").eq("id", workerId).maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("customer_favorite_workers").select("worker_id")
        .eq("customer_id", customerId).eq("worker_id", workerId).maybeSingle(),
    ),
  ]);
  if (worker.error || profile.error || favorite.error || !worker.data || !profile.data) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ đề xuất", 500);
  }
  const status = nullableString(candidate.status);
  if (
    status !== "proposed" && status !== "customer_confirmed" &&
    status !== "customer_declined" && status !== "expired" && status !== "withdrawn"
  ) {
    apiFailure("DB_ERROR", "Trạng thái thợ đề xuất không hợp lệ", 500);
  }
  const candidateId = requiredCandidateString(candidate.id);
  const proposedAt = requiredCandidateString(candidate.proposed_at);
  const totalJobs = requiredCandidateInteger(worker.data.total_jobs);
  const yearsExperience = requiredCandidateInteger(worker.data.years_experience);
  const verificationStatus = requiredCandidateString(
    worker.data.verification_status,
  );
  const rating = nullableNumber(worker.data.rating);
  if (worker.data.rating !== null && worker.data.rating !== undefined &&
    (rating === null || rating < 0 || rating > 5)) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  const avatarUrl = await resolveWorkerAvatarUrl(client, profile.data.avatar_url);
  const broadcastId = nullableString(candidate.broadcast_id);
  const jobId = nullableString(candidate.job_id);
  const priceQuote = broadcastId && jobId
    ? parseOriginalScopePriceQuote(candidate.original_scope_price_quote, {
      broadcastId,
      jobId,
      requireWorkerConfirmation: true,
      workerId,
    })
    : null;
  const workerProposal = projectWorkerMatchingProposal(
    relatedWorkerMatchingProposal(candidate.worker_matching_proposals),
  );
  if (status === "proposed" && !priceQuote && !workerProposal) {
    apiFailure(
      "PRICE_CONFIRMATION_REQUIRED",
      "Báo giá chính xác của thợ chưa sẵn sàng. Vui lòng tải lại.",
      409,
    );
  }
  return {
    candidate_id: candidateId,
    worker_id: workerId,
    status: status as "proposed" | "customer_confirmed" | "customer_declined" | "expired" | "withdrawn",
    display_name: nullableString(profile.data.full_name),
    avatar_url: avatarUrl,
    rating: totalJobs > 0 && rating !== null && rating > 0 ? rating : null,
    total_jobs: totalJobs,
    years_experience: yearsExperience,
    birth_year: safeCandidateBirthYear(worker.data.date_of_birth),
    gender: safeCandidateGender(worker.data.gender),
    verification_status: verificationStatus,
    is_favorite: favorite.data !== null,
    proposed_at: proposedAt,
    expires_at: nullableString(candidate.expires_at),
    customer_decided_at: nullableString(candidate.customer_decided_at),
    original_scope_price_quote: priceQuote
      ? projectOriginalScopePriceQuote(priceQuote)
      : null,
    worker_proposal: workerProposal,
  };
}

function relatedWorkerMatchingProposal(value: unknown): Record<string, unknown> | null {
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

function projectWorkerMatchingProposal(value: Record<string, unknown> | null) {
  if (!value) return null;
  const proposalId = nullableString(value.id);
  const scopeSummary = nullableString(value.scope_summary);
  const priceMin = nullableNumber(value.price_min);
  const priceMax = nullableNumber(value.price_max);
  const status = nullableString(value.status);
  if (
    !proposalId || !scopeSummary ||
    (priceMin === null) !== (priceMax === null) ||
    priceMin !== null && (priceMin <= 0 || priceMax === null || priceMax < priceMin) ||
    status !== "proposed" && status !== "customer_confirmed" &&
      status !== "customer_declined" && status !== "expired" && status !== "withdrawn"
  ) {
    apiFailure("DB_ERROR", "Dữ liệu đề xuất phạm vi không hợp lệ", 500);
  }
  return {
    proposal_id: proposalId,
    scope_summary: scopeSummary,
    price_min: priceMin,
    price_max: priceMax,
    status: status as "proposed" | "customer_confirmed" | "customer_declined" | "expired" | "withdrawn",
  };
}


export function mapWorkerCandidateDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy thợ đang chờ xác nhận", 404);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "STATUS_CHANGED" || errorCode === "EXPIRED") {
    apiFailure("INVALID_STATUS", "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure("WORKER_NOT_ELIGIBLE", "Thợ này không còn sẵn sàng. Vui lòng chọn tìm thợ khác.", 409);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật thợ đề xuất", 500);
}

export function candidateHasExpired(value: unknown) {
  const expiresAt = nullableString(value);
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}
