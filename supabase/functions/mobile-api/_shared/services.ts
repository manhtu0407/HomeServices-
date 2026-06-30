

import { listNotifications, markNotificationRead, registerDevicePushToken, notifyCustomerScopeChangeRequested } from "./services/notifications.service.ts";
import { listServices } from "./services/catalog.service.ts";
import { placesAutocomplete } from "./services/places-geo.service.ts";
import {
  getMyKaelMemory,
  getWorkerKaelMemory,
  deleteMyKaelMemory,
  updateMyKaelMemory,
} from "./services/kael-memory.service.ts";
import {
  registerWorker,
  getWorkerProfile,
  updateWorkerAvailability,
  listWorkerBroadcasts,
  getWorkerEarnings,
  listWorkerJobs,
} from "./services/workers.service.ts";
import { projectAddressAccess, authorizeApartmentAccess } from "./services/apartment-access.service.ts";

import {
  openDispute,
  submitDisputeCounterStatement,
  decideDispute,
} from "./services/dispute.service.ts";

import { decideScopeChange, requestScopeChange } from "./services/scope-change.service.ts";
import { confirmCompletion, submitReview } from "./services/completion-review.service.ts";
import { listJobMessages, listMyThreads, sendJobMessage } from "./services/chat.service.ts";
import { createKaelChat, getKaelChat, getKaelChatProgress, sendKaelChatTurn } from "./services/kael-chat.service.ts";
import { askKaelForWorker, createWorkerKaelChat, getWorkerKaelChat, listWorkerKaelChats, sendWorkerKaelChatTurn } from "./services/worker-kael-chat.service.ts";
import { streamKaelChatTurn, streamWorkerKaelChatTurn } from "./services/kael-chat-stream.ts";
import { approveKaelLearningCandidateAdmin, evaluatePriceSynthesisAbCaseAdmin, invalidateMarketCache, listKaelLearningCandidatesAdmin, monitorKaelLearningRulesAdmin, processKaelBatchResultsAdmin, processKaelLearningQueueAdmin, rejectKaelLearningCandidateAdmin } from "./services/admin-learning.service.ts";
import { getWorkerKaelTrainingConsent, setWorkerKaelTrainingConsent, submitCustomerKaelFeedback, submitWorkerKaelFeedback } from "./services/kael-feedback.service.ts";
import { attachJobMedia } from "./services/job-media.service.ts";
import { getJob, listCustomerActiveJobs, listMyPendingDecisions } from "./services/job-read.service.ts";
import { cancelJob, requestCustomerCancellation } from "./services/customer-cancellation.service.ts";
import { decideWorkerCancellation, requestWorkerCancellation } from "./services/worker-cancellation.service.ts";
import { acceptBroadcast, confirmSearch, declineBroadcast } from "./services/matching.service.ts";
import { createJob } from "./services/job-create.service.ts";
import { updateJobStatus } from "./services/job-status.service.ts";
import { confirmKaelChat } from "./services/kael-chat-confirm.service.ts";

import { type MobileApiServices } from "./router.ts";

import { type EdgeAiSecrets, getPublicKaelCharter } from "./kael/index.ts";

export function createEdgeServices(secrets: EdgeAiSecrets): MobileApiServices {
  return {
    listServices,
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, secrets),
    getJob,
    listCustomerActiveJobs,
    createKaelChat: (ctx, input) => createKaelChat(ctx, input, secrets),
    getKaelChat,
    getKaelChatProgress,
    streamKaelChatTurn: (ctx, sessionId, input) =>
      streamKaelChatTurn(ctx, sessionId, input, secrets),
    sendKaelChatTurn: (ctx, sessionId, input) =>
      sendKaelChatTurn(ctx, sessionId, input, secrets),
    confirmKaelChat: (ctx, sessionId) => confirmKaelChat(ctx, sessionId, secrets),
    confirmSearch,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    updateJobStatus,
    authorizeApartmentAccess,
    requestScopeChange: (ctx, jobId, input) =>
      requestScopeChange(ctx, jobId, input, secrets),
    askKaelForWorker,
    createWorkerKaelChat: (ctx, input) =>
      createWorkerKaelChat(ctx, input, secrets),
    listWorkerKaelChats,
    getWorkerKaelChat,
    sendWorkerKaelChatTurn: (ctx, sessionId, input) =>
      sendWorkerKaelChatTurn(ctx, sessionId, input, secrets),
    streamWorkerKaelChatTurn: (ctx, sessionId, input) =>
      streamWorkerKaelChatTurn(ctx, sessionId, input, secrets),
    submitWorkerKaelFeedback,
    getWorkerKaelTrainingConsent,
    setWorkerKaelTrainingConsent,
    requestCustomerCancellation,
    requestWorkerCancellation,
    openDispute,
    submitDisputeCounterStatement,
    decideDispute,
    attachJobMedia,
    listJobMessages,
    sendJobMessage,
    decideWorkerCancellation,
    decideScopeChange,
    confirmCompletion,
    submitReview,
    submitCustomerKaelFeedback,
    getKaelCharter,
    registerWorker,
    getMyKaelMemory,
    getWorkerKaelMemory,
    deleteMyKaelMemory,
    updateMyKaelMemory,
    listMyPendingDecisions,
    listMyThreads,
    getWorkerProfile,
    updateWorkerAvailability,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerEarnings,
    invalidateMarketCache,
    evaluatePriceSynthesisAbCase: (ctx, input) =>
      evaluatePriceSynthesisAbCaseAdmin(ctx, input, secrets),
    processKaelLearningQueue: (ctx, input) =>
      processKaelLearningQueueAdmin(ctx, input, secrets),
    processKaelBatchResults: (ctx, input) =>
      processKaelBatchResultsAdmin(ctx, input, secrets),
    monitorKaelLearningRules: (ctx, input) =>
      monitorKaelLearningRulesAdmin(ctx, input),
    listKaelLearningCandidates: (ctx, input) =>
      listKaelLearningCandidatesAdmin(ctx, input),
    approveKaelLearningCandidate: (ctx, candidateId, input) =>
      approveKaelLearningCandidateAdmin(ctx, candidateId, input),
    rejectKaelLearningCandidate: (ctx, candidateId, input) =>
      rejectKaelLearningCandidateAdmin(ctx, candidateId, input),
    listNotifications,
    markNotificationRead,
    registerDevicePushToken,
  };
}

function getKaelCharter() {
  return getPublicKaelCharter();
}

type CustomerProfileInsightJobRow = {
  id: string;
  status: string;
  service_type: string;
  created_at: string | null;
  completed_at: string | null;
  confirmed_at?: string | null;
  paid_at: string | null;
  reviewed_at: string | null;
  final_price: number | null;
  kael_price_min: number | null;
  kael_price_max: number | null;
};

type CustomerProfileInsightReviewRow = {
  job_id: string | null;
  rating: number | null;
};

type CustomerProfileInsightDisputeRow = {
  job_id: string | null;
  status: string | null;
};

type CustomerProfileInsightInput = {
  accountProfile?: { created_at: string | null } | null;
  customerId: string;
  customerProfile: {
    building_name: string | null;
    created_at: string | null;
    district: string | null;
    floor: string | null;
    unit_number: string | null;
  } | null;
  disputes: CustomerProfileInsightDisputeRow[];
  jobs: CustomerProfileInsightJobRow[];
  kaelInteractionCount: number;
  reviews: CustomerProfileInsightReviewRow[];
  savedAddressCount: number;
};

type CustomerProfileInsightsResponse = {
  customer_id: string;
  member_since: string | null;
  kael_interaction_count: number;
  completed_service_count: number;
  saved_address_count: number;
  preferred_service_count: number;
  active_streak_days: number;
  positive_review_rate_percent: number;
  price_savings_vnd: number;
  total_spend_vnd: number;
  usage_rank_level: number;
  usage_rank_points: number;
  fair_price_service_count: number;
  money_protection_score: number;
  protected_value_vnd: number;
  protected_transaction_count: number;
  total_transaction_count: number;
  dispute_free_rate_percent: number;
  fair_price_status: "verified" | "mixed" | "pending" | null;
};

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

type WorkerPerformanceInsightReviewRow = {
  rating: number | null;
};

type WorkerPerformanceInsightInput = {
  broadcasts: WorkerPerformanceInsightBroadcastRow[];
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
  performance_score: number | null;
  badges: Array<{
    id: "verified_profile" | "fast_responder" | "reliable_arrival" | "trusted_by_customers" | "steady_earner";
    status: "earned" | "locked";
  }>;
  performance_axes: Array<{
    id: "rating" | "response" | "arrival" | "completion" | "earnings";
    score: number | null;
  }>;
};

const CUSTOMER_PROFILE_COMPLETED_STATUSES = new Set([
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const CUSTOMER_PROFILE_TRANSACTION_STATUSES = new Set([
  "confirmed_by_customer",
  "payment_pending",
  "paid",
  "reviewed",
]);
const CUSTOMER_PROFILE_USAGE_RANK_STEP = 200;
const CUSTOMER_PROFILE_USAGE_RANK_MAX = 5;
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

export function buildCustomerProfileInsights(
  input: CustomerProfileInsightInput,
): CustomerProfileInsightsResponse {
  const jobs = input.jobs.filter((job) => Boolean(job.id));
  const completedJobs = jobs.filter(isCustomerProfileCompletedJob);
  const transactionJobs = jobs.filter(isCustomerProfileTransactionJob);
  const protectedJobs = transactionJobs.filter(isCustomerProfileFairPriceTransaction);
  const fairPriceJobs = transactionJobs.filter(isCustomerProfileFairPriceTransaction);
  const disputedJobIds = new Set(
    input.disputes
      .filter(isCountedCustomerProfileDispute)
      .map((dispute) => dispute.job_id)
      .filter((jobId): jobId is string => Boolean(jobId)),
  );
  const disputedTransactionCount = transactionJobs.filter((job) => disputedJobIds.has(job.id)).length;
  const totalTransactionCount = transactionJobs.length;
  const disputeFreeRatePercent = totalTransactionCount > 0
    ? Math.round(((totalTransactionCount - disputedTransactionCount) / totalTransactionCount) * 100)
    : 0;
  const protectedTransactionCount = protectedJobs.length;
  const protectedValueVnd = sumPositiveMoney(protectedJobs.map((job) => job.final_price));
  const totalSpendVnd = sumPositiveMoney(transactionJobs.map((job) => job.final_price));
  const priceSavingsVnd = sumPositiveMoney(
    fairPriceJobs.map((job) => Math.max(0, (job.kael_price_max ?? 0) - (job.final_price ?? 0))),
  );
  const kaelInteractionCount = Number.isFinite(input.kaelInteractionCount)
    ? Math.max(0, Math.floor(input.kaelInteractionCount))
    : 0;
  const usageRankPoints = customerProfileUsageRankPoints({
    completedCount: completedJobs.length,
    fairPriceCount: fairPriceJobs.length,
    kaelInteractionCount,
    protectedCount: protectedTransactionCount,
    reviewedCount: completedJobs.filter(isCustomerProfileReviewedJob).length,
  });

  return {
    customer_id: input.customerId,
    member_since: customerProfileMemberSince(input.accountProfile, input.customerProfile, jobs),
    kael_interaction_count: kaelInteractionCount,
    completed_service_count: completedJobs.length,
    saved_address_count: customerProfileSavedAddressCount(input.customerProfile, input.savedAddressCount),
    preferred_service_count: new Set(
      completedJobs
        .map((job) => job.service_type)
        .filter((serviceType) => serviceType === "electrical" || serviceType === "plumbing" || serviceType === "cleaning"),
    ).size,
    active_streak_days: customerProfileActiveStreakDays(completedJobs),
    positive_review_rate_percent: customerProfilePositiveReviewRatePercent(input.reviews),
    price_savings_vnd: priceSavingsVnd,
    total_spend_vnd: totalSpendVnd,
    usage_rank_level: usageRankPoints <= 0
      ? 0
      : Math.min(CUSTOMER_PROFILE_USAGE_RANK_MAX, Math.max(1, Math.floor(usageRankPoints / CUSTOMER_PROFILE_USAGE_RANK_STEP) + 1)),
    usage_rank_points: usageRankPoints,
    fair_price_service_count: fairPriceJobs.length,
    money_protection_score: customerProfileMoneyProtectionScore({
      disputedTransactionCount,
      protectedTransactionCount,
      totalTransactionCount,
    }),
    protected_value_vnd: protectedValueVnd,
    protected_transaction_count: protectedTransactionCount,
    total_transaction_count: totalTransactionCount,
    dispute_free_rate_percent: disputeFreeRatePercent,
    fair_price_status: customerProfileFairPriceStatus({
      disputeFreeRatePercent,
      fairPriceCount: fairPriceJobs.length,
      totalTransactionCount,
    }),
  };
}

export function buildWorkerPerformanceInsights(
  input: WorkerPerformanceInsightInput,
): WorkerPerformanceInsightsResponse {
  const broadcasts = input.broadcasts.filter(isWorkerPerformanceDeliveredBroadcast);
  const respondedBroadcasts = broadcasts.filter(isWorkerPerformanceRespondedBroadcast);
  const responseDurations = respondedBroadcasts
    .map(workerPerformanceResponseDurationMs)
    .filter((duration): duration is number => duration !== null);
  const responseRatePercent = broadcasts.length > 0
    ? Math.round((respondedBroadcasts.length / broadcasts.length) * 100)
    : null;
  const averageResponseMinutes = responseDurations.length > 0
    ? Math.round(responseDurations.reduce((total, duration) => total + duration, 0) / responseDurations.length / 60_000)
    : null;
  const completedJobs = input.jobs.filter(isWorkerPerformanceCompletedJob);
  const scheduledArrivalJobs = input.jobs.filter((job) => Boolean(job.scheduled_at && job.arrived_at));
  const onTimeJobs = scheduledArrivalJobs.filter(isWorkerPerformanceOnTimeJob);
  const onTimeRatePercent = scheduledArrivalJobs.length > 0
    ? Math.round((onTimeJobs.length / scheduledArrivalJobs.length) * 100)
    : null;
  const paidJobs = input.jobs.filter(isWorkerPerformancePaidJob);
  const reconciledEarningsVnd = sumPositiveMoney(paidJobs.map((job) => job.final_price));
  const reviewRatings = input.reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating) && rating > 0 && rating <= 5);
  const averageRating = reviewRatings.length > 0
    ? roundToOneDecimal(reviewRatings.reduce((total, rating) => total + rating, 0) / reviewRatings.length)
    : input.workerProfile && input.workerProfile.total_jobs > 0 && input.workerProfile.rating > 0
    ? roundToOneDecimal(Math.min(5, Math.max(1, input.workerProfile.rating)))
    : null;
  const ratingScore = averageRating === null ? null : Math.round((averageRating / 5) * 100);
  const completionScore = respondedBroadcasts.length > 0
    ? Math.min(100, Math.round((completedJobs.length / respondedBroadcasts.length) * 100))
    : completedJobs.length > 0
    ? 100
    : null;
  const earningsScore = paidJobs.length > 0 ? Math.min(100, paidJobs.length * 20) : null;
  const performance_axes: WorkerPerformanceInsightsResponse["performance_axes"] = [
    { id: "rating", score: ratingScore },
    { id: "response", score: responseRatePercent },
    { id: "arrival", score: onTimeRatePercent },
    { id: "completion", score: completionScore },
    { id: "earnings", score: earningsScore },
  ];
  const axisScores = performance_axes
    .map((axis) => axis.score)
    .filter((score): score is number => score !== null);
  const performanceScore = axisScores.length > 0
    ? Math.round(axisScores.reduce((total, score) => total + score, 0) / axisScores.length)
    : null;

  return {
    worker_id: input.workerId,
    completed_job_count: completedJobs.length,
    review_count: input.reviews.length,
    average_rating: averageRating,
    response_rate_percent: responseRatePercent,
    average_response_minutes: averageResponseMinutes,
    on_time_rate_percent: onTimeRatePercent,
    total_broadcast_count: broadcasts.length,
    responded_broadcast_count: respondedBroadcasts.length,
    accepted_broadcast_count: broadcasts.filter((row) => row.status === "accepted").length,
    scheduled_arrival_job_count: scheduledArrivalJobs.length,
    on_time_job_count: onTimeJobs.length,
    paid_job_count: paidJobs.length,
    reconciled_earnings_vnd: reconciledEarningsVnd > 0 ? reconciledEarningsVnd : null,
    performance_score: performanceScore,
    badges: workerPerformanceBadges({
      averageRating,
      averageResponseMinutes,
      onTimeRatePercent,
      paidJobCount: paidJobs.length,
      reconciledEarningsVnd,
      respondedBroadcastCount: respondedBroadcasts.length,
      responseRatePercent,
      reviewCount: input.reviews.length,
      scheduledArrivalJobCount: scheduledArrivalJobs.length,
      workerProfile: input.workerProfile,
    }),
    performance_axes,
  };
}

function isCustomerProfileCompletedJob(job: CustomerProfileInsightJobRow) {
  return CUSTOMER_PROFILE_COMPLETED_STATUSES.has(job.status) ||
    Boolean(job.completed_at || job.confirmed_at || job.paid_at || job.reviewed_at);
}

function isCustomerProfileTransactionJob(job: CustomerProfileInsightJobRow) {
  return CUSTOMER_PROFILE_TRANSACTION_STATUSES.has(job.status) && (job.final_price ?? 0) > 0;
}

function isCustomerProfileFairPriceTransaction(job: CustomerProfileInsightJobRow) {
  const price = job.final_price ?? 0;
  const max = job.kael_price_max ?? 0;
  return price > 0 && max > 0 && price <= max;
}

function isCustomerProfileReviewedJob(job: CustomerProfileInsightJobRow) {
  return job.status === "reviewed" || Boolean(job.reviewed_at);
}

function isCountedCustomerProfileDispute(dispute: CustomerProfileInsightDisputeRow) {
  const status = dispute.status?.trim().toLowerCase() ?? "";
  return Boolean(dispute.job_id) && status !== "cancelled" && status !== "withdrawn";
}

function customerProfileMemberSince(
  accountProfile: CustomerProfileInsightInput["accountProfile"],
  profile: CustomerProfileInsightInput["customerProfile"],
  jobs: CustomerProfileInsightJobRow[],
) {
  if (accountProfile?.created_at) return accountProfile.created_at;
  if (profile?.created_at) return profile.created_at;
  return jobs
    .map((job) => job.created_at)
    .filter((createdAt): createdAt is string => Boolean(createdAt))
    .sort()[0] ?? null;
}

function customerProfileSavedAddressCount(
  profile: CustomerProfileInsightInput["customerProfile"],
  savedAddressMemoryCount: number,
) {
  const memoryCount = Number.isFinite(savedAddressMemoryCount)
    ? Math.max(0, Math.floor(savedAddressMemoryCount))
    : 0;
  const hasPrimaryAddress = Boolean(
    profile &&
      [profile.building_name, profile.unit_number, profile.floor, profile.district]
        .some((value) => Boolean(value?.trim())),
  );
  return Math.max(hasPrimaryAddress ? 1 : 0, memoryCount);
}

function customerProfileActiveStreakDays(jobs: CustomerProfileInsightJobRow[]) {
  const days = Array.from(
    new Set(
      jobs
        .map(customerProfileActivityDateKey)
        .filter((day): day is string => Boolean(day)),
    ),
  ).sort((a, b) => b.localeCompare(a));
  if (days.length === 0) return 0;
  let streak = 1;
  let expectedPreviousDay = previousIsoDateKey(days[0]);
  for (const day of days.slice(1)) {
    if (day === expectedPreviousDay) {
      streak += 1;
      expectedPreviousDay = previousIsoDateKey(day);
      continue;
    }
    if (day < expectedPreviousDay) break;
  }
  return streak;
}

function customerProfileActivityDateKey(job: CustomerProfileInsightJobRow) {
  const value = job.reviewed_at ?? job.paid_at ?? job.completed_at ?? job.confirmed_at ?? job.created_at;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function previousIsoDateKey(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function customerProfilePositiveReviewRatePercent(
  reviews: CustomerProfileInsightReviewRow[],
) {
  const ratings = reviews
    .map((review) => review.rating)
    .filter((rating): rating is number => typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5);
  if (ratings.length === 0) return 0;
  return Math.round((ratings.filter((rating) => rating >= 4).length / ratings.length) * 100);
}

function customerProfileUsageRankPoints(input: {
  completedCount: number;
  fairPriceCount: number;
  kaelInteractionCount: number;
  protectedCount: number;
  reviewedCount: number;
}) {
  const points =
    input.completedCount * 25 +
    input.fairPriceCount * 15 +
    input.protectedCount * 5 +
    input.reviewedCount * 10 +
    Math.min(input.kaelInteractionCount, 50) * 2;
  return Math.min(1000, Math.max(0, points));
}

function customerProfileMoneyProtectionScore(input: {
  disputedTransactionCount: number;
  protectedTransactionCount: number;
  totalTransactionCount: number;
}) {
  if (!input.totalTransactionCount) return 0;
  const protectedRatio = input.protectedTransactionCount / input.totalTransactionCount;
  const disputeFreeRatio = (input.totalTransactionCount - input.disputedTransactionCount) / input.totalTransactionCount;
  return Math.max(0, Math.round(protectedRatio * disputeFreeRatio * 100));
}

function customerProfileFairPriceStatus(input: {
  disputeFreeRatePercent: number;
  fairPriceCount: number;
  totalTransactionCount: number;
}): CustomerProfileInsightsResponse["fair_price_status"] {
  if (!input.totalTransactionCount) return null;
  if (input.fairPriceCount === input.totalTransactionCount && input.disputeFreeRatePercent === 100) {
    return "verified";
  }
  if (input.fairPriceCount > 0) return "mixed";
  return "pending";
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

// X2 (Plan.md §27.5 — 2026-05-29): idempotent Kael chat session helpers.

// X2 (Plan.md §27.5 — 2026-05-29): idempotent job creation helpers.

// X1 (Plan.md §27.4 — 2026-05-29): shared boundary entry point used by both
// createKaelChat and sendKaelChatTurn. Returns true when the message was
// declined (caller skips downstream processing); false otherwise.

// Smart clarification (2026-06-04): build a compact, PII-scrubbed conversation
// context from recent turns and count prior Kael clarification questions so the
// pipeline can cap re-asks (STRUCTURES.md A4 "ask 0-2 questions").

// X4 (Plan.md §27.7 — 2026-05-29): F-17 fix. Customer mobile must resume an
// active job from the backend after a refresh / cold start instead of showing
// "Chưa có yêu cầu". Returns the customer's most-recent non-terminal job (same
// shape as GET /jobs/:id) or null when none is active.

// Compact the schema-validated vision result into a short
// findings line for the worker-assist context. Bounded length; no PII (these
// are Kael's own image observations about the physical problem).

// A scope-change changes the price of the
// deal, so it is ALWAYS confirmed by the customer — even low-risk. Kael only
// computes and proposes the new price; it never self-approves a scope change.
//
// This disable is intentionally UNCONDITIONAL and independent of
// KAEL_AUTONOMY_FULL_ENABLED (which still gates completion/payment/dispute/
// cancellation). Re-enabling auto-approve is a product decision, not a flag
// flip. The customer-decide path is unchanged: request_scope_change keeps the
// job in scope_change_pending, the caller routes null here to
// notifyCustomerScopeChangeRequested, and the customer's explicit decision goes
// through decide_scope_change_atomic. Signature kept stable so the single caller
// needs no change and re-enabling is a localized edit.

// Persist Kael's computed scope-change estimate +
// log the API call. Stored in scope_change_requests.kael_review (full payload)
// and scope_change_requests.kael_computed_min/max + price_min/max (numeric
// authoritative source). Customer A11 modal reads kael_computed_*.

// Self-check the demanding-customer response text
// before it reaches a user, so "self-check before every egress" holds for case-2 too
// (not only worker-assist). Template responses pass through unchanged; if the text ever
// becomes LLM-phrased and trips the guard, fall back to a neutral acknowledgement.

// Edit the user-owned subset of their own Kael memory.
// Customer can set language + a PII-scrubbed preference note; worker can set
// language only (worker_kael_memory has no preference_summary). Kael-computed
// fields stay untouched. Upsert so a not-yet-created memory row is fine.

// The customer's pending Kael decisions. Under Kael Autonomy v2 the only thing
// that genuinely waits on the customer is a scope-change (it changes the deal
// price, so it is always customer-confirmed). Scoped to this customer's own jobs.

// Cross-job message inbox for the customer. No realtime/RPC —
// list recent jobs, fold in the latest message + unread count per thread. A job
// with no messages yet is not surfaced as a thread.

// A worker lobby check-in records arrival but does NOT release the
// exact unit — it waits for the customer to tap "Cho thợ lên" (authorizeApartmentAccess).
// Nudge the customer the moment the worker checks in so they authorize promptly instead
// of leaving the worker waiting in the lobby. Best-effort: never blocks the status update.

// §32.6: matching consumes the disintermediation risk signal as a SOFT ranking
// penalty — never an exclusion ("không nuke worker khan hiếm vì tín hiệu yếu").
// Threshold 2 = a single weak signal has no effect; the 15-point penalty ranks a
// flagged worker below an equal-rating clean worker (~1.5 rating stars) without
// removing them from the pool.

// Keep Kael-owned scope-change price failures user-visible instead of DB_ERROR.

// A geofence check-in must be within this radius of
// the job's geocoded building before the exact unit is released. ~150 m absorbs HCMC
// apartment-tower GPS drift while still blocking a release from across town. Tune here
// if field recordings show a different real-world drift.

// The customer authorizes "Cho thợ lên" — this is the
// only path that releases the exact unit, and only after the worker has checked in.
// Route POST /jobs/:id/access/authorize is gated to the customer (+ admin) role.

// A worker check-in records arrival but does NOT
// release the exact unit. exact_unit_released stays false (projectAddressAccess keeps the
// worker at building_released) until the CUSTOMER authorizes via
// POST /jobs/:id/access/authorize. This closes the "worker self-reports arrival and the
// app reveals the unit with no customer consent" gap.

// The customer authorizing entry releases the exact
// unit — only reachable after a worker check-in (enforced in authorizeApartmentAccess).
