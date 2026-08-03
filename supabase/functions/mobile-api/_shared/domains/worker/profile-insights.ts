import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import {
  calculateKaelWorkResponseScore,
  isWorkerPerformanceResolvedIncidentCase,
  type WorkerPerformanceInsightIncidentCaseRow,
  type WorkerPerformanceInsightReviewRow,
} from "./performance-policy.ts";

type WorkerPerformanceInsightBroadcastRow = {
  broadcast_at: string | null;
  responded_at: string | null;
  sent_at: string | null;
  status: string;
};
type WorkerPerformanceInsightJobRow = {
  arrived_at: string | null;
  completed_at: string | null;
  final_price: number | null;
  paid_at: string | null;
  reviewed_at: string | null;
  scheduled_at: string | null;
  status: string;
};
type WorkerPerformanceInsightInput = {
  broadcasts: WorkerPerformanceInsightBroadcastRow[];
  incidentCases: WorkerPerformanceInsightIncidentCaseRow[];
  jobs: WorkerPerformanceInsightJobRow[];
  reviews: WorkerPerformanceInsightReviewRow[];
  workerId: string;
  workerProfile: {
    is_approved: boolean;
    is_available: boolean;
    is_suspended: boolean;
    rating: number;
    total_jobs: number;
    verification_status: string;
  } | null;
};

type WorkerPerformanceInsightsResponse = {
  worker_id: string;
  completed_job_count: number;
  review_count: number;
  average_rating: number | null;
  response_rate_percent: number | null;
  average_response_minutes: number | null;
  on_time_rate_percent: number | null;
  total_broadcast_count: number;
  responded_broadcast_count: number;
  accepted_broadcast_count: number;
  scheduled_arrival_job_count: number;
  on_time_job_count: number;
  paid_job_count: number;
  reconciled_earnings_vnd: number | null;
  work_response_review_count: number;
  resolved_incident_case_count: number;
  incident_rank_bonus: number;
  performance_score: number | null;
  badges: Array<{
    id: "verified_profile" | "fast_responder" | "reliable_arrival" | "trusted_by_customers" | "steady_earner";
    status: "earned" | "locked";
  }>;
  performance_axes: Array<{
    id: "rating" | "response" | "arrival" | "completion" | "earnings" | "work_response" | "incident_handling";
    score: number | null;
  }>;
};

type WorkerPerformanceInsightAggregate = {
  acceptedBroadcastCount: number;
  averageResponseMinutes: number | null;
  averageReviewRating: number | null;
  completedJobCount: number;
  onTimeJobCount: number;
  paidJobCount: number;
  reconciledEarningsVnd: number;
  resolvedIncidentCaseCount: number;
  respondedBroadcastCount: number;
  reviewCount: number;
  scheduledArrivalJobCount: number;
  totalBroadcastCount: number;
  workResponseReviewCount: number;
  workResponseScore: number | null;
  workerId: string;
  workerProfile: WorkerPerformanceInsightInput["workerProfile"];
};

export async function getWorkerPerformanceInsights(ctx: MobileApiContext) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("get_worker_performance_insights_aggregate", {
      p_worker_id: ctx.user.id,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Không thể tải thống kê hiệu suất thợ", 500);
  }
  const profileExists = requiredAggregateBoolean(row, "profile_exists");

  return buildWorkerPerformanceInsightsFromAggregate({
    acceptedBroadcastCount: requiredAggregateInteger(row, "accepted_broadcast_count"),
    averageResponseMinutes: nullableAggregateNumber(row, "average_response_minutes"),
    averageReviewRating: nullableAggregateNumber(row, "average_review_rating", 5),
    completedJobCount: requiredAggregateInteger(row, "completed_job_count"),
    onTimeJobCount: requiredAggregateInteger(row, "on_time_job_count"),
    paidJobCount: requiredAggregateInteger(row, "paid_job_count"),
    reconciledEarningsVnd: requiredAggregateInteger(row, "reconciled_earnings_vnd"),
    resolvedIncidentCaseCount: requiredAggregateInteger(row, "resolved_incident_case_count"),
    respondedBroadcastCount: requiredAggregateInteger(row, "responded_broadcast_count"),
    reviewCount: requiredAggregateInteger(row, "review_count"),
    scheduledArrivalJobCount: requiredAggregateInteger(row, "scheduled_arrival_job_count"),
    totalBroadcastCount: requiredAggregateInteger(row, "total_broadcast_count"),
    workResponseReviewCount: requiredAggregateInteger(row, "work_response_review_count"),
    workResponseScore: nullableAggregateNumber(row, "work_response_score", 100),
    workerId: ctx.user.id,
    workerProfile: profileExists
      ? {
        is_approved: requiredAggregateBoolean(row, "is_approved"),
        is_available: requiredAggregateBoolean(row, "is_available"),
        is_suspended: requiredAggregateBoolean(row, "is_suspended"),
        rating: requiredAggregateNumber(row, "profile_rating", 5),
        total_jobs: requiredAggregateInteger(row, "profile_total_jobs"),
        verification_status: requiredAggregateString(row, "verification_status"),
      }
      : null,
  });
}

function requiredAggregateInteger(
  row: Record<string, unknown>,
  key: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = requiredAggregateNumber(row, key, max);
  if (!Number.isSafeInteger(value)) {
    apiFailure("DB_ERROR", "Dữ liệu thống kê không hợp lệ", 500);
  }
  return value;
}

function requiredAggregateNumber(
  row: Record<string, unknown>,
  key: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = row[key];
  const value = typeof raw === "number"
    ? raw
    : typeof raw === "string" && raw.trim().length > 0
    ? Number(raw)
    : Number.NaN;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    apiFailure("DB_ERROR", "Dữ liệu thống kê không hợp lệ", 500);
  }
  return value;
}

function nullableAggregateNumber(
  row: Record<string, unknown>,
  key: string,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  if (row[key] === null) return null;
  return requiredAggregateNumber(row, key, max);
}

function requiredAggregateBoolean(
  row: Record<string, unknown>,
  key: string,
): boolean {
  if (typeof row[key] !== "boolean") {
    apiFailure("DB_ERROR", "Dữ liệu thống kê không hợp lệ", 500);
  }
  return row[key];
}

function requiredAggregateString(
  row: Record<string, unknown>,
  key: string,
): string {
  const value = nullableString(row[key]);
  if (!value?.trim()) {
    apiFailure("DB_ERROR", "Dữ liệu thống kê không hợp lệ", 500);
  }
  return value;
}

const WORKER_PERFORMANCE_TOTAL_BROADCAST_STATUSES = new Set([
  "sent",
  "accepted",
  "declined",
  "expired",
  "cancelled",
  "reassigned",
]);
const WORKER_PERFORMANCE_RESPONSE_STATUSES = new Set(["accepted", "declined"]);
const WORKER_PERFORMANCE_COMPLETED_STATUSES = new Set([
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const WORKER_PERFORMANCE_PAID_STATUSES = new Set(["paid", "reviewed"]);
const WORKER_PERFORMANCE_ON_TIME_GRACE_MS = 5 * 60 * 1000;

export function buildWorkerPerformanceInsights(
  input: WorkerPerformanceInsightInput,
): WorkerPerformanceInsightsResponse {
  const broadcasts = input.broadcasts.filter(isWorkerPerformanceDeliveredBroadcast);
  const respondedBroadcasts = broadcasts.filter(isWorkerPerformanceRespondedBroadcast);
  const responseDurations = respondedBroadcasts
    .map(workerPerformanceResponseDurationMs)
    .filter((duration): duration is number => duration !== null);
  const averageResponseMinutes = responseDurations.length > 0
    ? Math.round(responseDurations.reduce((total, duration) => total + duration, 0) / responseDurations.length / 60_000)
    : null;
  const completedJobs = input.jobs.filter(isWorkerPerformanceCompletedJob);
  const scheduledArrivalJobs = input.jobs.filter((job) => Boolean(job.scheduled_at && job.arrived_at));
  const onTimeJobs = scheduledArrivalJobs.filter(isWorkerPerformanceOnTimeJob);
  const paidJobs = input.jobs.filter(isWorkerPerformancePaidJob);
  const reconciledEarningsVnd = sumPositiveMoney(paidJobs.map((job) => job.final_price));
  const reviewRatings = input.reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating) && rating > 0 && rating <= 5);
  const workResponse = calculateKaelWorkResponseScore(input.reviews);
  const resolvedIncidentCaseCount = input.incidentCases.filter(isWorkerPerformanceResolvedIncidentCase).length;

  return buildWorkerPerformanceInsightsFromAggregate({
    acceptedBroadcastCount: broadcasts.filter((row) => row.status === "accepted").length,
    averageResponseMinutes,
    averageReviewRating: reviewRatings.length > 0
      ? roundToOneDecimal(reviewRatings.reduce((total, rating) => total + rating, 0) / reviewRatings.length)
      : null,
    completedJobCount: completedJobs.length,
    onTimeJobCount: onTimeJobs.length,
    paidJobCount: paidJobs.length,
    reconciledEarningsVnd,
    resolvedIncidentCaseCount,
    respondedBroadcastCount: respondedBroadcasts.length,
    reviewCount: input.reviews.length,
    scheduledArrivalJobCount: scheduledArrivalJobs.length,
    totalBroadcastCount: broadcasts.length,
    workResponseReviewCount: workResponse.reviewCount,
    workResponseScore: workResponse.score,
    workerId: input.workerId,
    workerProfile: input.workerProfile,
  });
}

function buildWorkerPerformanceInsightsFromAggregate(
  input: WorkerPerformanceInsightAggregate,
): WorkerPerformanceInsightsResponse {
  const responseRatePercent = input.totalBroadcastCount > 0
    ? Math.round((input.respondedBroadcastCount / input.totalBroadcastCount) * 100)
    : null;
  const onTimeRatePercent = input.scheduledArrivalJobCount > 0
    ? Math.round((input.onTimeJobCount / input.scheduledArrivalJobCount) * 100)
    : null;
  const averageRating = input.averageReviewRating !== null
    ? roundToOneDecimal(input.averageReviewRating)
    : input.workerProfile && input.workerProfile.total_jobs > 0 && input.workerProfile.rating > 0
    ? roundToOneDecimal(Math.min(5, Math.max(1, input.workerProfile.rating)))
    : null;
  const ratingScore = averageRating === null ? null : Math.round((averageRating / 5) * 100);
  const resolvedIncidentCaseCount = input.resolvedIncidentCaseCount;
  const incidentHandlingScore = resolvedIncidentCaseCount > 0
    ? Math.min(100, resolvedIncidentCaseCount * 25)
    : null;
  const incidentRankBonus = Math.min(20, resolvedIncidentCaseCount * 5);
  const completionScore = input.respondedBroadcastCount > 0
    ? Math.min(100, Math.round((input.completedJobCount / input.respondedBroadcastCount) * 100))
    : input.completedJobCount > 0
    ? 100
    : null;
  const earningsScore = input.paidJobCount > 0 ? Math.min(100, input.paidJobCount * 20) : null;
  const performance_axes: WorkerPerformanceInsightsResponse["performance_axes"] = [
    { id: "rating", score: ratingScore },
    { id: "response", score: responseRatePercent },
    { id: "arrival", score: onTimeRatePercent },
    { id: "completion", score: completionScore },
    { id: "earnings", score: earningsScore },
    { id: "work_response", score: input.workResponseScore },
    { id: "incident_handling", score: incidentHandlingScore },
  ];
  const routineAxisScores = performance_axes
    .filter((axis) => axis.id !== "incident_handling")
    .map((axis) => axis.score)
    .filter((score): score is number => score !== null);
  const performanceScore = routineAxisScores.length > 0
    ? Math.min(100, Math.round(routineAxisScores.reduce((total, score) => total + score, 0) / routineAxisScores.length) + incidentRankBonus)
    : null;

  return {
    worker_id: input.workerId,
    completed_job_count: input.completedJobCount,
    review_count: input.reviewCount,
    average_rating: averageRating,
    response_rate_percent: responseRatePercent,
    average_response_minutes: input.averageResponseMinutes,
    on_time_rate_percent: onTimeRatePercent,
    total_broadcast_count: input.totalBroadcastCount,
    responded_broadcast_count: input.respondedBroadcastCount,
    accepted_broadcast_count: input.acceptedBroadcastCount,
    scheduled_arrival_job_count: input.scheduledArrivalJobCount,
    on_time_job_count: input.onTimeJobCount,
    paid_job_count: input.paidJobCount,
    reconciled_earnings_vnd: input.reconciledEarningsVnd > 0 ? input.reconciledEarningsVnd : null,
    work_response_review_count: input.workResponseReviewCount,
    resolved_incident_case_count: resolvedIncidentCaseCount,
    incident_rank_bonus: incidentRankBonus,
    performance_score: performanceScore,
    badges: workerPerformanceBadges({
      averageRating,
      averageResponseMinutes: input.averageResponseMinutes,
      onTimeRatePercent,
      paidJobCount: input.paidJobCount,
      reconciledEarningsVnd: input.reconciledEarningsVnd,
      respondedBroadcastCount: input.respondedBroadcastCount,
      responseRatePercent,
      reviewCount: input.reviewCount,
      scheduledArrivalJobCount: input.scheduledArrivalJobCount,
      workerProfile: input.workerProfile,
    }),
    performance_axes,
  };
}

function sumPositiveMoney(values: Array<number | null>): number {
  return values.reduce<number>(
    (total, value) => total + (value && Number.isFinite(value) && value > 0 ? Math.round(value) : 0),
    0,
  );
}

function isWorkerPerformanceDeliveredBroadcast(row: WorkerPerformanceInsightBroadcastRow) {
  return WORKER_PERFORMANCE_TOTAL_BROADCAST_STATUSES.has(row.status) || Boolean(row.sent_at || row.broadcast_at);
}

function isWorkerPerformanceRespondedBroadcast(row: WorkerPerformanceInsightBroadcastRow) {
  return WORKER_PERFORMANCE_RESPONSE_STATUSES.has(row.status) && Boolean(row.responded_at);
}

function workerPerformanceResponseDurationMs(row: WorkerPerformanceInsightBroadcastRow) {
  const started = timestampMs(row.sent_at ?? row.broadcast_at);
  const responded = timestampMs(row.responded_at);
  if (started === null || responded === null || responded < started) return null;
  return responded - started;
}

function isWorkerPerformanceCompletedJob(row: WorkerPerformanceInsightJobRow) {
  return WORKER_PERFORMANCE_COMPLETED_STATUSES.has(row.status) || Boolean(row.completed_at || row.paid_at || row.reviewed_at);
}

function isWorkerPerformancePaidJob(row: WorkerPerformanceInsightJobRow) {
  return (WORKER_PERFORMANCE_PAID_STATUSES.has(row.status) || Boolean(row.paid_at)) && (row.final_price ?? 0) > 0;
}

function isWorkerPerformanceOnTimeJob(row: WorkerPerformanceInsightJobRow) {
  const scheduled = timestampMs(row.scheduled_at);
  const arrived = timestampMs(row.arrived_at);
  if (scheduled === null || arrived === null) return false;
  return arrived <= scheduled + WORKER_PERFORMANCE_ON_TIME_GRACE_MS;
}

function workerPerformanceBadges(input: {
  averageRating: number | null;
  averageResponseMinutes: number | null;
  onTimeRatePercent: number | null;
  paidJobCount: number;
  reconciledEarningsVnd: number;
  respondedBroadcastCount: number;
  responseRatePercent: number | null;
  reviewCount: number;
  scheduledArrivalJobCount: number;
  workerProfile: WorkerPerformanceInsightInput["workerProfile"];
}): WorkerPerformanceInsightsResponse["badges"] {
  const approved = Boolean(
    input.workerProfile?.is_approved ||
      input.workerProfile?.verification_status === "approved",
  );
  return [
    { id: "verified_profile", status: approved ? "earned" : "locked" },
    {
      id: "fast_responder",
      status: input.respondedBroadcastCount >= 2 &&
          (input.responseRatePercent ?? 0) >= 80 &&
          (input.averageResponseMinutes ?? Number.POSITIVE_INFINITY) <= 15
        ? "earned"
        : "locked",
    },
    {
      id: "reliable_arrival",
      status: input.scheduledArrivalJobCount >= 2 &&
          (input.onTimeRatePercent ?? 0) >= 90
        ? "earned"
        : "locked",
    },
    {
      id: "trusted_by_customers",
      status: input.reviewCount >= 3 && (input.averageRating ?? 0) >= 4.8
        ? "earned"
        : "locked",
    },
    {
      id: "steady_earner",
      status: input.paidJobCount > 0 && input.reconciledEarningsVnd > 0
        ? "earned"
        : "locked",
    },
  ];
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
