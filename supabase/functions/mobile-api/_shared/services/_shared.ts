import type { ComplexityLevel, JobMediaAttachInput, JobStatus, ServiceType } from "../../../_shared/domain.ts";
import { HCMC_DISTRICTS, kaelChatProgressSchema, normalizeDistrict } from "../../../_shared/domain.ts";
import type { EstimatePriceSource, PipelineStageLog } from "../kael/index.ts";
import type { KaelChatNextAction, KaelChatStatus } from "../../../_shared/contracts.ts";
import { PRICE_DISCLAIMER } from "../kael/index.ts";
import { apiFailure } from "../router.ts";
import type { MobileApiContext } from "../router.ts";
import type { EdgeAiSecrets } from "../kael/index.ts";
import {
  asBoolean,
  asComplexity,
  asKaelChatStatus,
  asKaelContentType,
  asKaelTurnRole,
  asMessageSender,
  asNumber,
  asRecord,
  asServiceType,
  asString,
  asStringArray,
  nullableRecord,
  nullableString,
} from "./coercions.ts";
export * from "./coercions.ts";
export * from "./db.ts";
export * from "./audit.ts";

export const KAEL_CHAT_HARD_COST_CAP_USD = 1;
const STAGING_PROJECT_REF = "xyylanuyflrjzbjzhqfl";
const KAEL_SCOPE_PRICE_ERRORS = new Set(["KAEL_PRICE_MISSING", "KAEL_REVIEW_MISSING"]);

// Cross-cutting Edge service helpers (C4 6a, services/* split): error mappers, serializers,
// formatters, and utils. Value coercions live in ./coercions.ts (re-exported above).















export function mapConfirmKaelChatError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "ALREADY_CONFIRMED") {
    apiFailure(
      "INVALID_STATUS",
      "Phiên Kael chưa sẵn sàng hoặc đã được xác nhận",
      409,
    );
  }
  if (errorCode === "MISSING_ESTIMATE") {
    apiFailure("INVALID_STATUS", "Kael chưa có ước tính để đặt thợ", 409);
  }
  if (errorCode === "NO_DISTRICT") {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
}

export function mapAcceptError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (errorCode === "BROADCAST_NOT_ACTIVE") {
    apiFailure(
      "BROADCAST_NOT_ACTIVE",
      "Yêu cầu này đã được xử lý hoặc đã hết hạn",
      409,
    );
  }
  if (errorCode === "EXPIRED") {
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }
  if (errorCode === "ALREADY_TAKEN") {
    apiFailure("ALREADY_TAKEN", "Yêu cầu đã được thợ khác nhận trước", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure(
      "WORKER_NOT_ELIGIBLE",
      "Tài khoản thợ chưa đủ điều kiện nhận việc",
      403,
    );
  }
  apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
}

export function mapAvailabilityError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Vui lòng hoàn tất đăng ký trước", 404);
  }
  if (errorCode === "NOT_APPROVED") {
    apiFailure("NOT_APPROVED", "Hồ sơ thợ chưa sẵn sàng nhận việc", 403);
  }
  if (errorCode === "WORKER_BUSY") {
    apiFailure(
      "WORKER_BUSY",
      "Bạn đang có công việc chưa kết thúc nên chưa thể bật nhận việc",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
}

export function mapCancelError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chỉ có thể hủy trước khi thợ nhận việc", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
}

export function mapWorkerCancellationRequestError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc phù hợp", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái công việc chưa thể yêu cầu hủy", 409);
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang chờ Kael/Admin duyệt", 409);
  }
  if (errorCode === "RATE_LIMITED") {
    apiFailure("RATE_LIMITED", "Thợ đã hủy quá nhiều lần trong 24 giờ", 429);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần lý do hủy rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
}

export function mapCustomerCancellationError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu chưa thể hủy theo Case 4", 409);
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang được xử lý", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần chọn lý do hủy hợp lệ", 400);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure("STATUS_CHANGED", "Trạng thái đã thay đổi, vui lòng tải lại", 409);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy", 500);
}

export function mapDisputeOpenError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền mở tranh chấp này", 403);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái công việc chưa thể mở tranh chấp", 409);
  }
  if (errorCode === "ALREADY_OPEN") {
    apiFailure("ALREADY_OPEN", "Tranh chấp đang được xử lý", 409);
  }
  if (errorCode === "DEFERRED_PHASE0") {
    apiFailure("DEFERRED_PHASE0", "Thanh toán đang được hoãn trong Phase 0", 409);
  }
  apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
}

export function mapDisputeCounterError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền phản hồi tranh chấp này", 403);
  }
  if (errorCode === "ALREADY_SUBMITTED") {
    apiFailure("ALREADY_SUBMITTED", "Phản hồi đã được ghi nhận", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Tranh chấp không còn nhận phản hồi", 409);
  }
  apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
}

export function mapDisputeDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tranh chấp", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được quyết định tranh chấp", 403);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Tranh chấp đã có quyết định", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái tranh chấp không hợp lệ", 409);
  }
  apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
}

export function mapWorkerCancellationDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu hủy", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được duyệt yêu cầu hủy", 403);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu hủy đã được xử lý", 409);
  }
  if (errorCode === "JOB_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "JOB_NOT_CANCELLABLE") {
    apiFailure("STATUS_CHANGED", "Công việc đã qua giai đoạn có thể duyệt hủy", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể xử lý yêu cầu hủy việc", 500);
}

export function mapScopeRequestError(errorCode: string | null): never {
  if (KAEL_SCOPE_PRICE_ERRORS.has(errorCode ?? "")) {
    apiFailure("KAEL_PRICE_MISSING", "Kael chua tinh duoc gia phat sinh hop le", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_PRICE_RANGE") {
    apiFailure("VALIDATION", "Khoảng giá không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
}

export function mapScopeDecisionError(errorCode: string | null): never {
  if (errorCode === "KAEL_PRICE_MISSING") {
    apiFailure("KAEL_PRICE_MISSING", "Kael chua chot gia phat sinh nen chua the duyet", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu thay đổi", 404);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu này đã được xử lý", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
}

export function mapReviewError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "ALREADY_REVIEWED") {
    apiFailure("ALREADY_REVIEWED", "Yêu cầu này đã được đánh giá", 409);
  }
  if (errorCode === "INVALID_RATING") {
    apiFailure("VALIDATION", "Đánh giá phải từ 1 đến 5 sao", 400);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chưa thể đánh giá yêu cầu này", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
}


















export function serializeKaelTurn(row: Record<string, unknown>) {
  const metadata = asRecord(row.safe_metadata);
  const contentType = asKaelContentType(row.content_type);
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    turn_index: asNumber(row.turn_index),
    role: asKaelTurnRole(row.role),
    content_type: contentType,
    text_content: nullableString(row.text_content),
    media_refs: asStringArray(row.media_refs),
    estimate: serializeKaelEstimate(metadata.estimate, metadata.estimate_card_v3),
    // Surface what Kael still needs so the mobile
    // thread can render slot-hint chips. Drawn from the missing-info artifact proposal.
    clarification: serializeKaelClarification(contentType, metadata.artifact_proposal),
    created_at: asString(row.created_at),
  };
}

export function serializeKaelClarification(
  contentType: string,
  artifactProposal: unknown,
): { question: string | null; missing_slots: string[] } | null {
  if (contentType !== "clarification") return null;
  const proposal = asRecord(artifactProposal);
  const question = nullableString(proposal.recommended_next_question);
  const missingSlots = asStringArray(proposal.missing_fields);
  if (!question && missingSlots.length === 0) return null;
  return { question, missing_slots: missingSlots };
}

export function serializeKaelSession(
  row: Record<string, unknown>,
  estimate: ReturnType<typeof serializeKaelEstimate>,
  turns: Array<ReturnType<typeof serializeKaelTurn>>,
) {
  const status = asKaelChatStatus(row.status);
  const lastTurn = turns[turns.length - 1];
  const totalCostUsd = asNumber(row.total_cost_usd);
  return {
    id: asString(row.id),
    job_id: nullableString(row.job_id),
    customer_id: asString(row.customer_id),
    service_type: asServiceType(row.service_type),
    status,
    estimate,
    started_at: asString(row.started_at),
    estimate_ready_at: nullableString(row.estimate_ready_at),
    total_turns: asNumber(row.total_turns),
    total_cost_usd: totalCostUsd,
    next_action: kaelNextAction(status, lastTurn?.content_type, totalCostUsd),
  };
}

export function serializeKaelEstimate(value: unknown, cardV3?: unknown) {
  const estimate = asRecord(value);
  if (Object.keys(estimate).length === 0) return null;
  // Surface the honesty fields the engine already computed in
  // estimate_card_v3 (output-pipeline forces needs_inspection/price_source when
  // confidence is low) so the customer estimate card can show "cần kiểm tra
  // hiện trường" instead of an over-confident price. When no card is present
  // (older turns / non-estimate), needs_inspection is honestly false.
  const card = asRecord(cardV3);
  const reasoning = asRecord(card.kael_reasoning);
  return {
    service_type: asServiceType(estimate.service_type),
    problem_category: asString(estimate.problem_category),
    problem_summary: asString(estimate.problem_summary),
    complexity: asComplexity(estimate.complexity),
    price_min: asNumber(estimate.price_min),
    price_max: asNumber(estimate.price_max),
    confidence: asNumber(estimate.confidence),
    advisory: nullableString(estimate.advisory),
    disclaimer: nullableString(estimate.disclaimer) ?? PRICE_DISCLAIMER,
    needs_inspection: card.needs_inspection === true,
    price_source: nullableString(card.price_source),
    needs_inspection_reason: nullableString(reasoning.needs_inspection_reason),
  };
}

export function serializeJobMessage(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    sender_id: nullableString(row.sender_id),
    sender_role: asMessageSender(row.sender_role),
    content: asString(row.content),
    is_read: asBoolean(row.is_read),
    created_at: asString(row.created_at),
  };
}

export function kaelNextAction(
  status: KaelChatStatus,
  lastContentType: string | undefined,
  totalCostUsd: number,
): KaelChatNextAction {
  if (status === "confirmed") return "confirmed";
  if (status === "unsupported") return "unsupported";
  if (totalCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) return "budget_exceeded";
  if (status === "estimate_ready") return "estimate_ready";
  if (lastContentType === "photo_request") return "ask_photo";
  if (lastContentType === "video_request") return "ask_video";
  if (lastContentType === "error") return "unsupported";
  return "await_input";
}

export function compactMetadata(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.filter((item) => typeof item === "string");
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function formatKaelEstimateText(estimate: {
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  advisory: string | null;
  disclaimer: string;
}) {
  const advisory = estimate.advisory ? ` Lưu ý: ${estimate.advisory}` : "";
  return `Kael đã có ước tính: ${estimate.problem_summary}. Mức độ ${estimate.complexity}, khoảng ${estimate.price_min.toLocaleString("vi-VN")}-${estimate.price_max.toLocaleString("vi-VN")} đ. ${estimate.disclaimer}${advisory}`;
}

export function secondsRemaining(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - now.getTime()) / 1000),
  );
}

export function maskBankAccount(account: string | null): string | null {
  if (!account || account.length < 4) return null;
  return `****${account.slice(-4)}`;
}

export function blankWorkerProfile(workerId: string) {
  return {
    id: workerId,
    verification_status: "draft" as const,
    is_available: false,
    is_approved: false,
    is_suspended: false,
    service_types: [],
    districts: [],
    home_lat: null,
    home_lng: null,
    service_radius_km: null,
    problem_specializations: [],
    years_experience: 0,
    rating: 0,
    total_jobs: 0,
    legal_name: null,
    date_of_birth: null,
    gender: null,
    bank_account_masked: null,
    bank_name: null,
    has_cccd: false,
    has_selfie: false,
  };
}

export function clampServiceRadius(value: unknown): number {
  const radius = Math.round(asNumber(value) || 8);
  return Math.min(30, Math.max(1, radius));
}

export function kaelServiceLabelVi(service: string): string {
  return service === "electrical"
    ? "sửa điện"
    : service === "plumbing"
    ? "sửa nước"
    : "vệ sinh nhà";
}


export function serviceLabel(serviceType: ServiceType): string {
  if (serviceType === "electrical") return "Sửa điện";
  if (serviceType === "plumbing") return "Sửa nước";
  return "Vệ sinh";
}

export function districtLabel(district: string): string {
  const slug = normalizeDistrict(district);
  return HCMC_DISTRICTS[slug] ?? HCMC_DISTRICTS.hcmc_all;
}

export function sourceTrustSecretsForRequest(
  secrets: EdgeAiSecrets,
  ctx: MobileApiContext,
): EdgeAiSecrets {
  if (secrets.sourceTrustPerplexityFilterEnabled === true) return secrets;
  if (secrets.sourceTrustPerplexityFilterExplicit === true) return secrets;
  if (!isStagingSourceTrustRequest(secrets, ctx)) return secrets;
  return { ...secrets, sourceTrustPerplexityFilterEnabled: true };
}

export function isStagingSourceTrustRequest(
  secrets: EdgeAiSecrets,
  ctx: MobileApiContext,
): boolean {
  return [
    secrets.supabaseUrl,
    ctx.requestProjectRef,
    ctx.requestHost,
    ctx.requestUrl,
  ].some((value) =>
    typeof value === "string" && value.includes(STAGING_PROJECT_REF)
  );
}

export function validateJobMediaPath(
  jobId: string,
  stage: JobMediaAttachInput["assets"][number]["stage"],
  objectPath: string,
) {
  const expectedPrefix = `${jobId}/${stage}/`;
  const safePathPattern =
    /^[0-9a-fA-F-]{36}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence|access_check_in)\/[A-Za-z0-9._-]+$/;
  if (
    !objectPath.startsWith(expectedPrefix) ||
    objectPath.includes("..") ||
    objectPath.includes("//") ||
    !safePathPattern.test(objectPath)
  ) {
    apiFailure("VALIDATION", "Đường dẫn media không hợp lệ", 400);
  }
}

export function canAttachJobMediaStage(
  stage: JobMediaAttachInput["assets"][number]["stage"],
  isCustomer: boolean,
  isWorker: boolean,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  if (stage === "before" || stage === "kael_reference") return isCustomer;
  return isWorker;
}

export function storageRef(objectPath: string) {
  return `supabase://job-media/${objectPath}`;
}

export function mergeLimitedRefs(existing: string[], incoming: string[], limit: number) {
  return Array.from(new Set([...existing, ...incoming])).slice(0, limit);
}

export function readGoogleMapsApiKey(secrets: EdgeAiSecrets): string | null {
  if (secrets.googleMapsApiKey) return secrets.googleMapsApiKey;
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.("GOOGLE_MAPS_API_KEY") ?? denoGet?.("GOOGLE_MAP_KEY") ??
    null; // Deno.env.get("GOOGLE_MAPS_API_KEY")
}

export function readVietmapApiKey(secrets: EdgeAiSecrets): string | null {
  if (secrets.vietmapApiKey) return secrets.vietmapApiKey;
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.("VIETMAP_API_KEY") ?? denoGet?.("VIETMAP_MAPS_API_KEY") ??
    null;
}

export function readEdgeEnvNumber(name: string): number | null {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  const value = denoGet?.(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Anti-disintermediation contact guard (C4 6a): pure detector for off-app contact/payment
// asks in job-chat + apartment-access free text. Cross-cutting (chat + apartment-access).
export type JobChatContactGuard = {
  flagged: boolean;
  redactedContent: string;
  signals: string[];
};

const JOB_CHAT_CONTACT_REDACTED =
  "Kael đã ẩn nội dung có dấu hiệu xin liên hệ hoặc thanh toán ngoài app.";

const JOB_CHAT_CONTACT_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "phone", pattern: /\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/i },
  { id: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { id: "sdt", pattern: /\b(?:sdt|số điện thoại|so dien thoai)\b/i },
  { id: "zalo", pattern: /\b(?:zalo|za lo)\b/i },
  { id: "call_direct", pattern: /\b(?:gọi em|goi em|gọi anh|goi anh|gọi riêng|goi rieng|số riêng|so rieng)\b/i },
  { id: "cash", pattern: /\b(?:tiền mặt|tien mat|cash)\b/i },
  { id: "off_app", pattern: /\b(?:khỏi qua app|khoi qua app|không qua app|khong qua app|ngoài app|ngoai app|trực tiếp|truc tiep|ra ngoài app|ra ngoai app)\b/i },
];

export function evaluateJobChatContactGuard(content: string): JobChatContactGuard {
  const normalized = normalizeGuardText(content);
  const signals = JOB_CHAT_CONTACT_PATTERNS
    .filter((entry) => entry.pattern.test(content) || entry.pattern.test(normalized))
    .map((entry) => entry.id);
  return {
    flagged: signals.length > 0,
    redactedContent: JOB_CHAT_CONTACT_REDACTED,
    signals,
  };
}

export function normalizeGuardText(content: string) {
  return content
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// Shared job-status sets + selects (C4 6a): used across jobs/status/chat/apartment-access.
export const ACTIVE_WORKER_JOB_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
];

export const JOB_CHAT_SEND_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
];

export const JOB_DETAIL_SELECT =
  "id, status, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, kael_worker_brief_core, kael_worker_brief_guidance, kael_progress, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at, reviewed_at";

export const DEFAULT_WORKER_CANDIDATE_POOL_SIZE = 50;

export function parseKaelProgressSnapshot(raw: unknown, contextId: string) {
  const rawProgress = nullableRecord(raw);
  const parsedProgress = rawProgress
    ? kaelChatProgressSchema.safeParse(rawProgress)
    : null;
  if (parsedProgress && !parsedProgress.success) {
    console.warn("mobile-api Kael progress invalid", { contextId });
  }
  return parsedProgress?.success
    ? {
      ...parsedProgress.data,
      failure_reason: parsedProgress.data.failure_reason ?? null,
    }
    : null;
}

export function estimatePriceSourceFromStageLogs(
  logs: PipelineStageLog[],
): EstimatePriceSource {
  const market = logs.find((stage) => stage.stage === "market");
  if (market?.success && !market.fallbackUsed) return "perplexity_validated";
  if (market?.success) return "baseline_with_market";
  return "baseline_only";
}
