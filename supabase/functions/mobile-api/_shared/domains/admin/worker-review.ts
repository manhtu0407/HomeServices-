import { apiFailure } from "../../platform/api-failure.ts";
import { asServiceTypeArray, asString, asStringArray, asWorkerVerificationStatus, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  AdminWorkerProfileDecisionInput,
  AdminWorkerProfileDecisionResponse,
  AdminWorkerReviewDetail,
} from "../contracts/admin-control.ts";
import { getAdminWorkerApplication, requireAdminCapability } from "./control.ts";
import { scopeQueryToRealTraffic } from "../../platform/synthetic-cohort.ts";
import { requireWorkerReviewReceipt } from "./control-validation.ts";

type Row = Record<string, unknown>;
type WorkerPiiClient = DbClient & {
  auth: { admin: { getUserById(userId: string): Promise<{
    data: { user: { email?: string; phone?: string } | null };
    error: unknown;
  }> } };
  storage: { from(bucket: string): { createSignedUrl(path: string, expires: number): Promise<{
    data: { signedUrl: string } | null;
    error: unknown;
  }> } };
};

export async function getAdminWorkerReviewDetail(
  ctx: MobileApiContext,
  applicationId: string,
): Promise<AdminWorkerReviewDetail> {
  await requireAdminCapability(ctx, "workers.read");
  const application = await getAdminWorkerApplication(ctx, applicationId);
  const client = db(ctx);
  const piiClient = ctx.supabase as WorkerPiiClient;
  const [profileResult, workerResult, historyResult, authResult] = await Promise.all([
    dbQuery<Row>(client.from("profiles").select("id,full_name,phone,created_at").eq("id", application.worker_id).maybeSingle()),
    dbQuery<Row>(scopeQueryToRealTraffic(client.from("worker_profiles").select(
      "id,updated_at,legal_name,date_of_birth,gender,service_types,years_experience,districts,service_radius_km,problem_specializations,cccd_front_url,cccd_back_url,selfie_url,bank_account,bank_name",
    ).eq("id", application.worker_id)).maybeSingle()),
    dbQuery<Row[]>(client.from("admin_worker_application_reviews").select(
      "review_stage,decision,reason,decided_by,decided_at",
    ).eq("worker_id", application.worker_id).order("decided_at", { ascending: false })),
    piiClient.auth.admin.getUserById(application.worker_id),
  ]);
  if (profileResult.error || workerResult.error || historyResult.error || authResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chi tiết hồ sơ thợ", 500);
  }

  const reviewerIds = [...new Set((historyResult.data ?? [])
    .map((row) => nullableString(row.decided_by))
    .filter((id): id is string => Boolean(id)))];
  const reviewers = reviewerIds.length
    ? await dbQuery<Row[]>(client.from("profiles").select("id,full_name").in("id", reviewerIds))
    : { data: [] as Row[], error: null };
  if (reviewers.error) apiFailure("DB_ERROR", "Không thể tải lịch sử xác minh", 500);
  const reviewerNames = new Map((reviewers.data ?? []).map((row) => [asString(row.id), nullableString(row.full_name)]));
  const worker = workerResult.data;
  const documents = worker
    ? await createDocumentLinks(piiClient, worker)
    : { cccd_front_url: null, cccd_back_url: null, selfie_url: null, expires_at: null };

  const audit = await dbQuery(client.from("kael_permission_audit").insert({
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    purpose: "admin_worker_pii_view",
    action: "view",
    topic: "worker_profile",
    decision: "allow",
    reason_code: "worker_review_detail_opened",
    safe_metadata: { application_id: applicationId, worker_id: application.worker_id },
  }));
  if (audit.error) apiFailure("AUDIT_FAILED", "Không thể mở dữ liệu nhận dạng an toàn", 500);

  return {
    application,
    login_gates: {
      email: authResult.data.user?.email ?? null,
      phone: nullableString(profileResult.data?.phone) ?? authResult.data.user?.phone ?? null,
      full_name: nullableString(profileResult.data?.full_name),
      created_at: nullableString(profileResult.data?.created_at),
    },
    profile: worker ? {
      updated_at: nullableString(worker.updated_at),
      legal_name: nullableString(worker.legal_name),
      date_of_birth: nullableString(worker.date_of_birth),
      gender: nullableString(worker.gender),
      service_types: asServiceTypeArray(worker.service_types),
      years_experience: nullableNumber(worker.years_experience) ?? 0,
      districts: asStringArray(worker.districts),
      service_radius_km: nullableNumber(worker.service_radius_km),
      problem_specializations: asStringArray(worker.problem_specializations),
      bank_account: nullableString(worker.bank_account),
      bank_name: nullableString(worker.bank_name),
      documents,
    } : null,
    history: (historyResult.data ?? []).flatMap((row) => {
      const stage = row.review_stage === "profile" ? "profile" : "access";
      const decision = row.decision;
      const decidedAt = nullableString(row.decided_at);
      if ((decision !== "approve" && decision !== "request_changes" && decision !== "reject") || !decidedAt) return [];
      return [{
        stage,
        decision,
        reason: nullableString(row.reason),
        decided_at: decidedAt,
        decided_by_name: reviewerNames.get(nullableString(row.decided_by) ?? "") ?? null,
      }];
    }),
  };
}

export async function decideAdminWorkerProfile(
  ctx: MobileApiContext,
  applicationId: string,
  input: AdminWorkerProfileDecisionInput,
): Promise<AdminWorkerProfileDecisionResponse> {
  await requireAdminCapability(ctx, "workers.review");
  const accessQueue = await dbQuery<Row>(scopeQueryToRealTraffic(db(ctx).from("kael_admin_queue")
    .select("actor_id").eq("id", applicationId).eq("queue_type", "worker_application_review")).maybeSingle());
  const workerId = nullableString(accessQueue.data?.actor_id);
  if (accessQueue.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ", 500);
  if (!workerId) apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  const queueId = input.profile_review_queue_id;
  const result = await dbQuery<Row[]>(db(ctx).rpc("admin_review_worker_profile_snapshot_atomic", {
    p_queue_id: queueId,
    p_admin_id: ctx.user.id,
    p_application_id: applicationId,
    p_expected_profile_updated_at: input.expected_profile_updated_at,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
  }));
  if (result.error) apiFailure("DB_ERROR", "Không thể lưu quyết định xác minh", 500);
  const row = requireWorkerReviewReceipt(result.data, queueId, input.decision, workerId);
  if (row.ok !== true) mapProfileDecisionError(nullableString(row.error_code));
  const verificationStatus = asWorkerVerificationStatus(row.verification_status);
  if (verificationStatus !== row.verification_status) apiFailure("DB_ERROR", "Biên nhận xác minh không hợp lệ", 500);
  return {
    ok: true,
    application_id: applicationId,
    worker_id: asString(row.worker_id),
    decision: input.decision,
    verification_status: verificationStatus,
    decided_at: asString(row.decided_at),
  };
}

async function createDocumentLinks(client: WorkerPiiClient, worker: Row) {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  const refs = [worker.cccd_front_url, worker.cccd_back_url, worker.selfie_url].map(nullableString);
  const links = await Promise.all(refs.map(async (ref) => {
    if (!ref?.startsWith("supabase://worker-verification/")) return null;
    const path = ref.slice("supabase://worker-verification/".length);
    const result = await client.storage.from("worker-verification").createSignedUrl(path, 300);
    return result.error || !result.data ? null : result.data.signedUrl;
  }));
  return {
    cccd_front_url: links[0] ?? null,
    cccd_back_url: links[1] ?? null,
    selfie_url: links[2] ?? null,
    expires_at: links.some(Boolean) ? expiresAt : null,
  };
}

function mapProfileDecisionError(code: string | null): never {
  if (code === "STALE_REVIEW") apiFailure("STALE_REVIEW", "Hồ sơ đã thay đổi. Hãy tải lại và kiểm tra trước khi quyết định", 409);
  if (code === "IDEMPOTENCY_CONFLICT") apiFailure("IDEMPOTENCY_CONFLICT", "Lần xác minh này đã có quyết định khác. Hãy tải lại lịch sử", 409);
  if (code === "WORKERS_REVIEW_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền xác minh thợ", 403);
  if (code === "APPLICATION_NOT_FOUND" || code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  if (code === "PROFILE_INCOMPLETE" || code === "VERIFICATION_FILES_INVALID") apiFailure("CONFLICT", "Hồ sơ hoặc giấy tờ xác minh chưa đầy đủ", 409);
  if (code === "ALREADY_REVIEWED") apiFailure("ALREADY_REVIEWED", "Hồ sơ đã có quyết định khác", 409);
  if (code === "INVALID_DECISION") apiFailure("VALIDATION", "Quyết định xác minh không hợp lệ", 400);
  apiFailure("REVIEW_FAILED", "Không thể lưu quyết định xác minh", 409);
}
