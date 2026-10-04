import {
  asNumber,
  asServiceTypeArray,
  asString,
  asStringArray,
  asWorkerVerificationStatus,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { blankWorkerProfile, clampServiceRadius, maskBankAccount } from "../../platform/domain-utils.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  resolveWorkerOwnProfileAvatarUrl,
  resolveWorkerAvatarUrl,
} from "./avatar.ts";
import {
  activeServiceTypesForWorker,
  isWorkerServiceQualityLocked,
  selectedServiceTypesForWorker,
} from "./service-preferences.ts";

export async function getWorkerProfile(ctx: MobileApiContext) {
  const client = db(ctx);
  const [result, account, qualityResult] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client
        .from("worker_profiles")
        .select(
          "id, verification_status, is_available, is_approved, is_suspended, service_types, selected_service_types, active_service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url, app_active_minutes, app_last_active_minute",
        )
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("profiles").select("avatar_url").eq("id", ctx.user.id).maybeSingle(),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("worker_service_quality_status")
        .select(
          "worker_id, service_type, review_count, average_rating, locked_until, is_locked",
        )
        .eq("worker_id", ctx.user.id),
    ),
  ]);
  if (result.error || account.error || qualityResult.error) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ", 500);
  }
  if (!result.data) {
    return {
      ...blankWorkerProfile(ctx.user.id),
      avatar_url: await resolveWorkerAvatarUrl(ctx.supabase, account.data?.avatar_url),
    };
  }
  const worker = result.data;
  const avatarUrl = await resolveWorkerOwnProfileAvatarUrl(
    ctx.supabase,
    account.data?.avatar_url,
    worker.selfie_url,
    ctx.user.id,
  );
  const serviceTypes = asServiceTypeArray(worker.service_types);
  const selectedServiceTypes = selectedServiceTypesForWorker(worker);
  const serviceQuality = (qualityResult.data ?? []).flatMap((row) => {
    const serviceType = asServiceTypeArray([row.service_type])[0];
    if (!serviceType) return [];
    return [{
      average_rating: nullableNumber(row.average_rating),
      locked_until: nullableString(row.locked_until),
      review_count: Math.max(0, Math.trunc(asNumber(row.review_count))),
      service_type: serviceType,
      status: isWorkerServiceQualityLocked(row)
        ? "quality_locked" as const
        : "available" as const,
    }];
  });
  const qualityLockedServices = new Set(
    serviceQuality
      .filter((quality) => quality.status === "quality_locked")
      .map((quality) => quality.service_type),
  );
  const activeServiceTypes = activeServiceTypesForWorker(worker).filter(
    (serviceType) => !qualityLockedServices.has(serviceType),
  );
  return {
    id: asString(worker.id),
    avatar_url: avatarUrl,
    active_minutes: Math.min(600_000, Math.max(0, Math.trunc(asNumber(worker.app_active_minutes)))),
    last_active_at: nullableString(worker.app_last_active_minute),
    verification_status: asWorkerVerificationStatus(worker.verification_status),
    is_available: Boolean(worker.is_available),
    is_approved: Boolean(worker.is_approved),
    is_suspended: Boolean(worker.is_suspended),
    service_types: serviceTypes,
    active_service_types: activeServiceTypes,
    selected_service_types: selectedServiceTypes,
    service_quality: serviceQuality,
    districts: asStringArray(worker.districts),
    home_lat: nullableNumber(worker.home_lat),
    home_lng: nullableNumber(worker.home_lng),
    service_radius_km: clampServiceRadius(worker.service_radius_km),
    problem_specializations: asStringArray(worker.problem_specializations),
    years_experience: asNumber(worker.years_experience),
    rating: asNumber(worker.rating),
    total_jobs: asNumber(worker.total_jobs),
    legal_name: nullableString(worker.legal_name),
    date_of_birth: nullableString(worker.date_of_birth),
    gender: nullableString(worker.gender),
    bank_account_masked: maskBankAccount(nullableString(worker.bank_account)),
    bank_name: nullableString(worker.bank_name),
    has_cccd: Boolean(worker.cccd_front_url && worker.cccd_back_url),
    has_cccd_front: Boolean(worker.cccd_front_url),
    has_cccd_back: Boolean(worker.cccd_back_url),
    has_selfie: Boolean(worker.selfie_url),
  };
}

export async function recordWorkerAppActiveMinute(ctx: MobileApiContext) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("record_worker_app_active_minute", {
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể ghi nhận thời gian hoạt động", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("NOT_FOUND", "Vui lòng hoàn tất hồ sơ thợ trước", 404);
  }
  return {
    worker_id: asString(row.worker_id),
    active_minutes: Math.min(600_000, Math.max(0, Math.trunc(asNumber(row.active_minutes)))),
    last_active_at: asString(row.last_active_at),
    incremented: Boolean(row.incremented),
  };
}
