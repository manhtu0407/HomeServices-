// Edge service workers domain (C4 6a, services/* split): worker profile, availability, broadcast
// inbox, earnings, registration, and the worker job list. Imported directly by services.ts.

import {
  asNumber,
  asServiceTypeArray,
  asString,
  asStringArray,
  asWorkerVerificationStatus,
  nullableNumber,
  nullableRecord,
  nullableString,
  relatedJob,
} from "./coercions.ts";
import { db, dbQuery, normalizeWorkerDistricts } from "./db.ts";
import { blankWorkerProfile, clampServiceRadius, compactMetadata, mapAvailabilityError, maskBankAccount, secondsRemaining } from "./_shared.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import type {
  EdgeEarningsResponse,
  EdgeWorkerJobListResponse,
} from "../router/dtos.ts";
import { normalizeIsoTimestamp } from "../iso-timestamp.ts";
import { PLATFORM_FEE_WORKER } from "../../../_shared/domain.ts";
import type {
  BroadcastStatus,
  JobStatus,
  ServiceType,
  WorkerApplicationSubmitInput,
  WorkerRegisterInput,
  WorkerServiceAreaUpdateInput,
  WorkerVerificationStatus,
} from "../../../_shared/domain.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../rate-limit.ts";
import { projectAddressAccess } from "./apartment-access.service.ts";
import { buildWorkerBriefOutput } from "../kael/index.ts";
import { resolveWorkerAvatarUrl } from "./worker-avatar.service.ts";

export async function registerWorker(
  ctx: MobileApiContext,
  input: WorkerRegisterInput,
) {
  const rateCheck = checkRateLimit(
    `worker_register:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  if (
    !isOwnedWorkerVerificationRef(input.cccd_front_url, ctx.user.id, "cccd-front") ||
    !isOwnedWorkerVerificationRef(input.cccd_back_url, ctx.user.id, "cccd-back") ||
    !isOwnedWorkerVerificationRef(input.selfie_url, ctx.user.id, "selfie")
  ) {
    apiFailure(
      "INVALID_MEDIA_REF",
      "File xác minh không thuộc tài khoản hiện tại",
      400,
    );
  }
  const result = await dbQuery<Array<WorkerRegistrationRpcRow>>(
    db(ctx).rpc("submit_worker_registration_atomic", {
      p_actor_id: ctx.user.id,
      p_worker_id: ctx.user.id,
      p_legal_name: input.legal_name,
      p_date_of_birth: input.date_of_birth,
      p_gender: input.gender ?? null,
      p_service_types: input.service_types,
      p_years_experience: input.years_experience,
      p_districts: districts,
      p_home_lat: input.home_lat ?? null,
      p_home_lng: input.home_lng ?? null,
      p_service_radius_km: input.service_radius_km ?? 8,
      p_problem_specializations: input.problem_specializations ?? [],
      p_cccd_front_url: input.cccd_front_url,
      p_cccd_back_url: input.cccd_back_url,
      p_selfie_url: input.selfie_url,
      p_bank_account: input.bank_account,
      p_bank_name: input.bank_name,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    console.warn("mobile-api worker registration RPC failed", {
      userId: ctx.user.id,
      errorCode: result.error?.code,
    });
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  if (!row.ok) mapWorkerRegistrationError(nullableString(row.error_code));
  if (
    !row.worker_id_out || !row.verification_status_out ||
    !row.submitted_at_ts
  ) {
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  return {
    worker_id: row.worker_id_out,
    verification_status: asWorkerVerificationStatus(
      row.verification_status_out,
    ),
    submitted_at: row.submitted_at_ts,
  };
}

function isOwnedWorkerVerificationRef(
  value: string,
  workerId: string,
  folder: "cccd-front" | "cccd-back" | "selfie",
) {
  const prefix = `supabase://worker-verification/${workerId}/${folder}/`;
  if (!value.startsWith(prefix)) return false;
  const fileName = value.slice(prefix.length);
  return fileName.length > 0 && fileName.length <= 180 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fileName);
}

type WorkerRegistrationRpcRow = {
  ok: boolean;
  error_code: string | null;
  worker_id_out: string | null;
  verification_status_out: WorkerVerificationStatus | null;
  submitted_at_ts: string | null;
  idempotent_out: boolean;
};

function mapWorkerRegistrationError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  }
  if (errorCode === "WRONG_ROLE") {
    apiFailure("WRONG_ROLE", "Tài khoản này không phải tài khoản thợ", 403);
  }
  if (errorCode === "NOT_OWNER") {
    apiFailure("NOT_OWNER", "Bạn chỉ có thể gửi hồ sơ của chính mình", 403);
  }
  if (errorCode === "ALREADY_FINALIZED") {
    apiFailure(
      "ALREADY_FINALIZED",
      "Hồ sơ đang được xem xét, đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.",
      409,
    );
  }
  if (errorCode === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Dữ liệu hồ sơ không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
}

export async function submitWorkerApplication(
  ctx: MobileApiContext,
  input: WorkerApplicationSubmitInput,
) {
  const now = new Date().toISOString();
  const client = db(ctx);
  if (input.client_request_id) {
    const existing = await findExistingWorkerApplication(
      client,
      ctx.user.id,
      input.source,
      input.client_request_id,
    );
    if (existing) return serializeWorkerApplication(existing, now);
  }

  const result = await dbQuery<WorkerApplicationQueueRow>(
    client
      .from("kael_admin_queue")
      .insert({
        actor_id: ctx.user.id,
        actor_role: ctx.role,
        escalation_level: "soft",
        priority: "medium",
        queue_type: "worker_application_review",
        reason_code: "worker_application_submitted",
        response_summary: "worker_application_submitted",
        safe_metadata: compactMetadata({
          ...workerApplicationContactMetadata(input.contact),
          actor_id: ctx.user.id,
          client_request_id: input.client_request_id ?? null,
          language: input.language,
          source: input.source,
        }),
        status: "open",
      })
      .select(WORKER_APPLICATION_QUEUE_SELECT)
      .single(),
  );
  if (result.error?.code === "23505" && input.client_request_id) {
    const existing = await findExistingWorkerApplication(
      client,
      ctx.user.id,
      input.source,
      input.client_request_id,
    );
    if (existing) return serializeWorkerApplication(existing, now);
  }
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi hồ sơ ứng tuyển", 500);
  }
  return serializeWorkerApplication(result.data, now);
}

const WORKER_APPLICATION_QUEUE_SELECT = "id, status, created_at, safe_metadata";

type WorkerApplicationQueueRow = {
  id?: unknown;
  status?: unknown;
  created_at?: unknown;
  safe_metadata?: unknown;
};

async function findExistingWorkerApplication(
  client: ReturnType<typeof db>,
  actorId: string,
  source: WorkerApplicationSubmitInput["source"],
  clientRequestId: string,
) {
  const existing = await dbQuery<WorkerApplicationQueueRow>(
    client
      .from("kael_admin_queue")
      .select(WORKER_APPLICATION_QUEUE_SELECT)
      .eq("actor_id", actorId)
      .eq("queue_type", "worker_application_review")
      .eq("reason_code", "worker_application_submitted")
      .eq("safe_metadata->>source", source)
      .eq("safe_metadata->>client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (existing.error) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ ứng tuyển", 500);
  }
  return existing.data ?? null;
}

function serializeWorkerApplication(
  row: WorkerApplicationQueueRow,
  fallbackSubmittedAt: string,
) {
  return {
    application_id: asString(row.id),
    status: "open" as const,
    submitted_at: nullableString(row.created_at) ?? fallbackSubmittedAt,
  };
}

export async function getWorkerProfile(ctx: MobileApiContext) {
  const client = db(ctx);
  const [result, account] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client
        .from("worker_profiles")
        .select(
          "id, verification_status, is_available, is_approved, is_suspended, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url, app_active_minutes, app_last_active_minute",
        )
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("profiles").select("avatar_url").eq("id", ctx.user.id).maybeSingle(),
    ),
  ]);
  if (result.error || account.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ", 500);
  const avatarUrl = await resolveWorkerAvatarUrl(ctx.supabase, account.data?.avatar_url);
  if (!result.data) {
    return { ...blankWorkerProfile(ctx.user.id), avatar_url: avatarUrl };
  }
  const worker = result.data;
  return {
    id: asString(worker.id),
    avatar_url: avatarUrl,
    active_minutes: Math.min(600_000, Math.max(0, Math.trunc(asNumber(worker.app_active_minutes)))),
    last_active_at: nullableString(worker.app_last_active_minute),
    verification_status: asWorkerVerificationStatus(worker.verification_status),
    is_available: Boolean(worker.is_available),
    is_approved: Boolean(worker.is_approved),
    is_suspended: Boolean(worker.is_suspended),
    service_types: asServiceTypeArray(worker.service_types),
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

export async function updateWorkerServiceArea(
  ctx: MobileApiContext,
  input: WorkerServiceAreaUpdateInput,
) {
  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  const update: Record<string, unknown> = {
    districts,
    updated_at: new Date().toISOString(),
  };
  if ("home_lat" in input) update.home_lat = input.home_lat ?? null;
  if ("home_lng" in input) update.home_lng = input.home_lng ?? null;
  if ("service_radius_km" in input) {
    update.service_radius_km = input.service_radius_km ?? null;
  }

  const result = await dbQuery<{ id: string }>(
    db(ctx)
      .from("worker_profiles")
      .update(update)
      .eq("id", ctx.user.id)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật khu vực làm việc", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  }
  return getWorkerProfile(ctx);
}

export async function updateWorkerAvailability(
  ctx: MobileApiContext,
  input: { is_available: boolean },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("set_worker_availability_atomic", {
      p_worker_id: ctx.user.id,
      p_is_available: input.is_available,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  const row = availabilityRpcRow(result.data?.[0]);
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  if (!row.ok) mapAvailabilityError(nullableString(row.error_code));
  if (
    typeof row.is_available !== "boolean" ||
    typeof row.updated_at_ts !== "string" ||
    normalizeIsoTimestamp(row.updated_at_ts) === null
  ) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }

  return {
    worker_id: ctx.user.id,
    is_available: row.is_available,
    updated_at: row.updated_at_ts,
  };
}

function availabilityRpcRow(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.ok !== "boolean" ||
    (row.error_code !== null && typeof row.error_code !== "string") ||
    (row.is_available !== null && typeof row.is_available !== "boolean") ||
    (row.updated_at_ts !== null && typeof row.updated_at_ts !== "string")
  ) return null;
  return row;
}

export async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const now = new Date();
  const expired = await dbQuery(
    db(ctx)
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
    db(ctx)
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core)",
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
      return {
        broadcast_id: asString(row.id),
        job_id: asString(row.job_id),
        status: row.status as BroadcastStatus,
        service_type: job.service_type as ServiceType,
        problem_summary: nullableString(job.kael_problem_identified),
        district: nullableString(job.address_district),
        estimated_price_min: min,
        estimated_price_max: max,
        estimated_earning_min: min === null
          ? null
          : Math.round(min * (1 - PLATFORM_FEE_WORKER)),
        estimated_earning_max: max === null
          ? null
          : Math.round(max * (1 - PLATFORM_FEE_WORKER)),
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

export async function getWorkerEarnings(
  ctx: MobileApiContext,
  range: { from?: string; to?: string },
): Promise<EdgeEarningsResponse> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("get_worker_earnings_summary", {
      p_worker_id: ctx.user.id,
      p_from: range.from ?? null,
      p_to: range.to ?? null,
      p_platform_fee_rate: PLATFORM_FEE_WORKER,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    console.warn("mobile-api earnings query failed", {
      errorCode: result.error?.code,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }
  let aggregate: ReturnType<typeof parseWorkerEarningsAggregate>;
  try {
    aggregate = parseWorkerEarningsAggregate(row, ctx.user.id);
  } catch {
    console.warn("mobile-api earnings aggregate response invalid", {
      userId: ctx.user.id,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }

  return {
    worker_id: ctx.user.id,
    ...aggregate,
    from_date: range.from ?? null,
    to_date: range.to ?? null,
  };
}

const MAX_DAILY_EARNINGS_ROWS = 366;

function parseWorkerEarningsAggregate(
  row: Record<string, unknown>,
  expectedWorkerId: string,
): Omit<EdgeEarningsResponse, "worker_id" | "from_date" | "to_date"> {
  if (row.worker_id !== expectedWorkerId) {
    throw new Error("INVALID_EARNINGS_OWNER");
  }
  return {
    total_jobs_paid: nonnegativeSafeInteger(row.total_jobs_paid),
    gross_earnings: nonnegativeSafeInteger(row.gross_earnings),
    platform_fee_total: nonnegativeSafeInteger(row.platform_fee_total),
    net_earnings: nonnegativeSafeInteger(row.net_earnings),
    pending_payment_count: nonnegativeSafeInteger(row.pending_payment_count),
    pending_payment_amount: nonnegativeSafeInteger(row.pending_payment_amount),
    daily_earnings: parseDailyEarnings(row.daily_earnings),
  };
}

function parseDailyEarnings(
  value: unknown,
): EdgeEarningsResponse["daily_earnings"] {
  if (!Array.isArray(value) || value.length > MAX_DAILY_EARNINGS_ROWS) {
    throw new Error("INVALID_DAILY_EARNINGS");
  }

  let previousDate: string | null = null;
  return value.map((entry) => {
    if (!isRecord(entry) || !isIsoDate(entry.date)) {
      throw new Error("INVALID_DAILY_EARNINGS");
    }
    if (previousDate !== null && entry.date >= previousDate) {
      throw new Error("INVALID_DAILY_EARNINGS");
    }
    previousDate = entry.date;

    return {
      date: entry.date,
      gross_earnings: nonnegativeSafeInteger(entry.gross_earnings),
      platform_fee_total: nonnegativeSafeInteger(entry.platform_fee_total),
      net_earnings: nonnegativeSafeInteger(entry.net_earnings),
      paid_job_count: nonnegativeSafeInteger(entry.paid_job_count),
    };
  });
}

function nonnegativeSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("INVALID_EARNINGS_AGGREGATE");
  }
  return value;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listWorkerJobs(ctx: MobileApiContext) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("jobs")
      .select(
        "id, display_code, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, scheduled_at, kael_price_min, kael_price_max, kael_worker_brief_guidance, final_price, payment_status, payment_provider, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, photo_urls, completion_notes, completion_photo_urls, created_at, matched_at, completed_at",
      )
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách công việc", 500);
  }
  return {
    jobs: (result.data ?? []).map((row) => {
      const finalPrice = nullableNumber(row.final_price);
      const max = finalPrice ?? nullableNumber(row.kael_price_max);
      const min = nullableNumber(row.kael_price_min);
      const addressProjection = projectAddressAccess(row, "worker");
      const fallbackBrief = buildWorkerBriefOutput({
        stage: "guidance",
        serviceType: row.service_type as ServiceType,
        problemSummary:
          nullableString(row.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
        district: nullableString(row.address_district),
        fullAddress: addressProjection.fullAddress,
        estimatedEarningMin: min === null
          ? null
          : Math.round(min * (1 - PLATFORM_FEE_WORKER)),
        estimatedEarningMax: max === null
          ? null
          : Math.round(max * (1 - PLATFORM_FEE_WORKER)),
      }).brief;
      return {
        id: asString(row.id),
        display_code: nullableString(row.display_code),
        status: row.status as JobStatus,
        service_type: row.service_type as ServiceType,
        problem_summary: nullableString(row.kael_problem_identified),
        address_building: addressProjection.fullAddress.building,
        address_unit: addressProjection.fullAddress.unit,
        address_floor: addressProjection.fullAddress.floor,
        district: addressProjection.fullAddress.district,
        address_access: addressProjection.addressAccess,
        final_price: finalPrice,
        estimated_earning: finalPrice
          ? Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER))
          : null,
        payment_status: parseWorkerJobPaymentStatus(row.payment_status),
        payment_provider: nullableString(row.payment_provider),
        payment_code: nullableString(row.payment_code),
        payment_transfer_content: nullableString(row.payment_transfer_content),
        payment_qr_image_url: nullableString(row.payment_qr_image_url),
        payment_expires_at: nullableString(row.payment_expires_at),
        payment_received_at: nullableString(row.payment_received_at),
        payment_amount_received: nullableNumber(row.payment_amount_received),
        gross_amount: nullableNumber(row.gross_amount),
        platform_fee: nullableNumber(row.platform_fee),
        worker_net: nullableNumber(row.worker_net),
        photo_urls: asStringArray(row.photo_urls),
        completion_notes: nullableString(row.completion_notes),
        completion_photo_urls: asStringArray(row.completion_photo_urls),
        worker_brief_guidance:
          nullableRecord(row.kael_worker_brief_guidance) ?? fallbackBrief,
        scheduled_at: nullableString(row.scheduled_at),
        created_at: asString(row.created_at),
        matched_at: nullableString(row.matched_at),
        completed_at: nullableString(row.completed_at),
      };
    }),
  };
}

function parseWorkerJobPaymentStatus(
  value: unknown,
): EdgeWorkerJobListResponse["jobs"][number]["payment_status"] {
  if (value === null || value === undefined) return null;
  if (
    value === "not_started" ||
    value === "code_requested" ||
    value === "vietqr_ready" ||
    value === "pending" ||
    value === "received" ||
    value === "amount_mismatch" ||
    value === "expired" ||
    value === "failed" ||
    value === "reconciled"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái thanh toán không hợp lệ", 500);
}

function workerApplicationContactMetadata(contact: string) {
  const normalized = contact.trim().toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 9) {
    return {
      contact_suffix: digits.slice(-4),
      contact_type: "phone",
    };
  }
  const localPart = normalized.split("@")[0] ?? normalized;
  return {
    contact_suffix: localPart.slice(-2),
    contact_type: "email",
  };
}
