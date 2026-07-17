// Input parsing for the admin-only Kael learning-queue routes. Kept apart from the general
// value parsers because it is a permission boundary, not a shape concern.

import type { ComplexityLevel, LearningCandidateStatus, ServiceType } from "../../../_shared/domain.ts";
import { LEARNING_CANDIDATE_STATUSES } from "../../../_shared/domain.ts";
import type {
  KaelBatchResultsProcessInput,
  KaelLearningCandidateListInput,
  KaelLearningCandidateReviewInput,
  KaelLearningMonitorInput,
  KaelLearningQueueProcessInput,
  MarketCacheInvalidateInput,
} from "./contracts.ts";
import { apiFailure } from "./api-failure.ts";
import {
  assertAllowedKeys,
  optionalBoolean,
  optionalBoundedText,
  optionalPositiveInt,
  optionalPositiveIntQuery,
  requiredBoundedText,
} from "./value-parsers.ts";

export function optionalSafeText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  return trimmed.toLowerCase();
}

export function marketCacheInvalidateInput(input: unknown): MarketCacheInvalidateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const cacheId = optionalSafeText(record.cache_id, 80);
  const districtCode = optionalSafeText(record.district_code, 80);
  const problemSlug = optionalSafeText(record.problem_slug, 120);
  const serviceType = record.service_type;
  const complexity = record.complexity;

  if (
    serviceType !== undefined &&
    serviceType !== "electrical" &&
    serviceType !== "plumbing" &&
    serviceType !== "cleaning"
  ) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (
    complexity !== undefined &&
    complexity !== "small" &&
    complexity !== "medium" &&
    complexity !== "large"
  ) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (!cacheId && !districtCode && !problemSlug && !serviceType && !complexity) {
    apiFailure("VALIDATION", "Cần ít nhất một bộ lọc cache", 400);
  }

  return {
    ...(cacheId ? { cache_id: cacheId } : {}),
    ...(districtCode ? { district_code: districtCode } : {}),
    ...(problemSlug ? { problem_slug: problemSlug } : {}),
    ...(serviceType ? { service_type: serviceType as ServiceType } : {}),
    ...(complexity ? { complexity: complexity as ComplexityLevel } : {}),
  };
}

export function kaelLearningQueueProcessInput(input: unknown): KaelLearningQueueProcessInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  assertAllowedKeys(record, ["limit", "force_realtime"]);
  return {
    limit: optionalPositiveInt(record.limit, 1, 100),
    force_realtime: optionalBoolean(record.force_realtime),
  };
}

export function kaelBatchResultsProcessInput(input: unknown): KaelBatchResultsProcessInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  assertAllowedKeys(record, ["limit", "force_poll"]);
  return {
    limit: optionalPositiveInt(record.limit, 1, 50),
    force_poll: optionalBoolean(record.force_poll),
  };
}

export function kaelLearningMonitorInput(input: unknown): KaelLearningMonitorInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  assertAllowedKeys(record, ["limit"]);
  return {
    limit: optionalPositiveInt(record.limit, 1, 100),
  };
}

export function kaelLearningCandidateListInput(url: URL): KaelLearningCandidateListInput {
  const state = learningCandidateStatusParam(url.searchParams.get("state")) ??
    "manual_review";
  return {
    state,
    limit: optionalPositiveIntQuery(url.searchParams.get("limit"), 1, 100),
  };
}

export function learningCandidateStatusParam(
  value: string | null,
): LearningCandidateStatus | null {
  if (value === null || value === "") return null;
  const normalized = value.trim().toLowerCase();
  return LEARNING_CANDIDATE_STATUSES.includes(normalized as LearningCandidateStatus)
    ? normalized as LearningCandidateStatus
    : apiFailure("VALIDATION", "Dữ liệu ứng viên learning không hợp lệ", 400);
}

export function kaelLearningCandidateReviewInput(
  input: unknown,
  action: "approve" | "reject",
): KaelLearningCandidateReviewInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu review learning không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  if (action === "approve") {
    assertAllowedKeys(record, ["review_note"]);
    return {
      review_note: optionalBoundedText(record.review_note, 1000),
    };
  }
  assertAllowedKeys(record, ["reason"]);
  return {
    reason: requiredBoundedText(record.reason, 200),
  };
}

