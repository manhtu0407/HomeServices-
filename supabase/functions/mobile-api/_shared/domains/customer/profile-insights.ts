import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { SERVICE_TYPES } from "../../../../_shared/domain.ts";
import { nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";

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
type CustomerProfileInsightReviewRow = { job_id: string | null; rating: number | null };
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
    default_address: string | null;
    district: string | null;
    floor: string | null;
    unit_number: string | null;
  } | null;
  disputes: CustomerProfileInsightDisputeRow[];
  jobs: CustomerProfileInsightJobRow[];
  kaelInteractionCount: number;
  membershipPoints: number;
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
  active_service_days: number;
  active_streak_days: number;
  reviewed_service_count: number;
  positive_review_rate_percent: number;
  price_savings_vnd: number;
  total_spend_vnd: number;
  usage_rank_level: number;
  usage_rank_points: number;
  usage_rank_level_floor_points: number;
  usage_rank_next_level_points: number | null;
  fair_price_service_count: number;
  money_protection_score: number;
  protected_value_vnd: number;
  protected_transaction_count: number;
  total_transaction_count: number;
  dispute_free_rate_percent: number;
  fair_price_status: "verified" | "mixed" | "pending" | null;
};
type CustomerProfileInsightAggregate = {
  activeServiceDays: number;
  activeStreakDays: number;
  completedServiceCount: number;
  customerId: string;
  disputedTransactionCount: number;
  fairPriceServiceCount: number;
  kaelInteractionCount: number;
  memberSince: string | null;
  membershipPoints: number;
  positiveReviewRatePercent: number;
  preferredServiceCount: number;
  priceSavingsVnd: number;
  protectedTransactionCount: number;
  protectedValueVnd: number;
  reviewedServiceCount: number;
  savedAddressCount: number;
  totalSpendVnd: number;
  totalTransactionCount: number;
};

export async function getCustomerProfileInsights(ctx: MobileApiContext) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền thực hiện hành động này", 403);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("get_customer_profile_insights_aggregate", {
      p_customer_id: ctx.user.id,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Không thể tải thống kê hồ sơ khách", 500);
  }
  // The usage rank reads the membership ledger, which only paid in-app orders can move.
  const membership = await dbQuery<Record<string, unknown>>(
    workflowDb(ctx).rpc("get_customer_membership_summary", { p_customer_id: ctx.user.id }),
  );
  if (membership.error || !membership.data || typeof membership.data !== "object") {
    apiFailure("DB_ERROR", "Không thể tải điểm thành viên", 500);
  }

  return buildCustomerProfileInsightsFromAggregate({
    activeServiceDays: requiredAggregateInteger(row, "active_service_days"),
    activeStreakDays: requiredAggregateInteger(row, "active_streak_days"),
    completedServiceCount: requiredAggregateInteger(row, "completed_service_count"),
    customerId: ctx.user.id,
    disputedTransactionCount: requiredAggregateInteger(row, "disputed_transaction_count"),
    fairPriceServiceCount: requiredAggregateInteger(row, "fair_price_service_count"),
    kaelInteractionCount: requiredAggregateInteger(row, "kael_interaction_count"),
    memberSince: nullableString(row.member_since),
    membershipPoints: requiredAggregateInteger(membership.data, "points"),
    positiveReviewRatePercent: requiredAggregateInteger(
      row,
      "positive_review_rate_percent",
      100,
    ),
    preferredServiceCount: requiredAggregateInteger(row, "preferred_service_count"),
    priceSavingsVnd: requiredAggregateInteger(row, "price_savings_vnd"),
    protectedTransactionCount: requiredAggregateInteger(row, "protected_transaction_count"),
    protectedValueVnd: requiredAggregateInteger(row, "protected_value_vnd"),
    reviewedServiceCount: requiredAggregateInteger(row, "reviewed_service_count"),
    savedAddressCount: requiredAggregateBoolean(row, "has_primary_address") ? 1 : 0,
    totalSpendVnd: requiredAggregateInteger(row, "total_spend_vnd"),
    totalTransactionCount: requiredAggregateInteger(row, "total_transaction_count"),
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
const CUSTOMER_PROFILE_SUPPORTED_SERVICES = new Set<string>(SERVICE_TYPES);

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
  const protectedTransactionCount = protectedJobs.length;
  const protectedValueVnd = sumPositiveMoney(protectedJobs.map((job) => job.final_price));
  const totalSpendVnd = sumPositiveMoney(transactionJobs.map((job) => job.final_price));
  const priceSavingsVnd = sumPositiveMoney(
    fairPriceJobs.map((job) => Math.max(0, (job.kael_price_max ?? 0) - (job.final_price ?? 0))),
  );
  const kaelInteractionCount = Number.isFinite(input.kaelInteractionCount)
    ? Math.max(0, Math.floor(input.kaelInteractionCount))
    : 0;

  return buildCustomerProfileInsightsFromAggregate({
    activeServiceDays: customerProfileActivityDays(completedJobs).length,
    activeStreakDays: customerProfileActiveStreakDays(completedJobs),
    completedServiceCount: completedJobs.length,
    customerId: input.customerId,
    disputedTransactionCount,
    fairPriceServiceCount: fairPriceJobs.length,
    kaelInteractionCount,
    memberSince: customerProfileMemberSince(input.accountProfile, input.customerProfile, jobs),
    membershipPoints: input.membershipPoints,
    positiveReviewRatePercent: customerProfilePositiveReviewRatePercent(input.reviews),
    preferredServiceCount: new Set(
      completedJobs
        .map((job) => job.service_type)
        .filter((serviceType) => CUSTOMER_PROFILE_SUPPORTED_SERVICES.has(serviceType)),
    ).size,
    priceSavingsVnd,
    protectedTransactionCount,
    protectedValueVnd,
    reviewedServiceCount: completedJobs.filter(isCustomerProfileReviewedJob).length,
    savedAddressCount: customerProfileSavedAddressCount(input.customerProfile, input.savedAddressCount),
    totalSpendVnd,
    totalTransactionCount,
  });
}

function buildCustomerProfileInsightsFromAggregate(
  input: CustomerProfileInsightAggregate,
): CustomerProfileInsightsResponse {
  const disputeFreeRatePercent = input.totalTransactionCount > 0
    ? Math.round(
      ((input.totalTransactionCount - input.disputedTransactionCount) /
        input.totalTransactionCount) * 100,
    )
    : 0;
  const usageRankPoints = input.membershipPoints;
  const usageRankLevel = usageRankPoints <= 0
    ? 0
    : Math.min(CUSTOMER_PROFILE_USAGE_RANK_MAX, Math.floor(usageRankPoints / CUSTOMER_PROFILE_USAGE_RANK_STEP) + 1);

  return {
    customer_id: input.customerId,
    member_since: input.memberSince,
    kael_interaction_count: input.kaelInteractionCount,
    completed_service_count: input.completedServiceCount,
    saved_address_count: input.savedAddressCount,
    preferred_service_count: input.preferredServiceCount,
    active_service_days: input.activeServiceDays,
    active_streak_days: input.activeStreakDays,
    reviewed_service_count: input.reviewedServiceCount,
    positive_review_rate_percent: input.positiveReviewRatePercent,
    price_savings_vnd: input.priceSavingsVnd,
    total_spend_vnd: input.totalSpendVnd,
    usage_rank_level: usageRankLevel,
    usage_rank_points: usageRankPoints,
    usage_rank_level_floor_points: usageRankLevel <= 1 ? 0 : (usageRankLevel - 1) * CUSTOMER_PROFILE_USAGE_RANK_STEP,
    usage_rank_next_level_points: usageRankLevel >= CUSTOMER_PROFILE_USAGE_RANK_MAX
      ? null
      : Math.max(1, usageRankLevel) * CUSTOMER_PROFILE_USAGE_RANK_STEP,
    fair_price_service_count: input.fairPriceServiceCount,
    money_protection_score: customerProfileMoneyProtectionScore({
      disputedTransactionCount: input.disputedTransactionCount,
      protectedTransactionCount: input.protectedTransactionCount,
      totalTransactionCount: input.totalTransactionCount,
    }),
    protected_value_vnd: input.protectedValueVnd,
    protected_transaction_count: input.protectedTransactionCount,
    total_transaction_count: input.totalTransactionCount,
    dispute_free_rate_percent: disputeFreeRatePercent,
    fair_price_status: customerProfileFairPriceStatus({
      disputeFreeRatePercent,
      fairPriceCount: input.fairPriceServiceCount,
      totalTransactionCount: input.totalTransactionCount,
    }),
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
      [profile.building_name, profile.unit_number, profile.floor, profile.district, profile.default_address]
        .some((value) => Boolean(value?.trim())),
  );
  return Math.max(hasPrimaryAddress ? 1 : 0, memoryCount);
}

function customerProfileActiveStreakDays(jobs: CustomerProfileInsightJobRow[]) {
  const days = customerProfileActivityDays(jobs);
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

function customerProfileActivityDays(jobs: CustomerProfileInsightJobRow[]) {
  return Array.from(
    new Set(
      jobs
        .map(customerProfileActivityDateKey)
        .filter((day): day is string => Boolean(day)),
    ),
  ).sort((a, b) => b.localeCompare(a));
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
