import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  asBoolean,
  asJobStatus,
  asServiceType,
  asString,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type {
  AdminWorkflowRecoveryActionInput,
  AdminWorkflowRecoveryActionReceipt,
  AdminWorkflowRecoveryActionResponse,
  AdminWorkflowRecoveryDetailResponse,
  AdminWorkflowRecoveryListInput,
  AdminWorkflowRecoveryListResponse,
  AdminWorkflowRecoveryStatus,
  AdminWorkflowRecoverySummary,
} from "../contracts/admin-control.ts";
import { requireAdminCapability } from "./actor.ts";

type Row = Record<string, unknown>;

const CASE_SELECT =
  "id,job_id,reason_code,detected_state,severity,status,first_detected_at,last_detected_at,last_activity_at,updated_at,version";

export async function listAdminWorkflowRecoveryCases(
  ctx: MobileApiContext,
  input: AdminWorkflowRecoveryListInput,
): Promise<AdminWorkflowRecoveryListResponse> {
  await requireAdminCapability(ctx, "operations.read");
  let query = db(ctx)
    .from("workflow_recovery_cases")
    .select(CASE_SELECT, { count: "exact" })
    .order("severity", { ascending: false })
    .order("last_activity_at", { ascending: true })
    .range(input.offset, input.offset + input.limit - 1);
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.severity !== "all") query = query.eq("severity", input.severity);
  const result = await dbQuery<Row[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải ca phục hồi workflow", 500);

  const records = result.data ?? [];
  const jobs = await recoveryJobMap(ctx, records.map((row) => asString(row.job_id)));
  return {
    generated_at: new Date().toISOString(),
    records: records.map((row) => serializeSummary(row, jobs.get(asString(row.job_id)))),
    total_count: nonNegativeInteger(result.count),
  };
}

export async function getAdminWorkflowRecoveryCase(
  ctx: MobileApiContext,
  recoveryCaseId: string,
): Promise<AdminWorkflowRecoveryDetailResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const recoveryResult = await dbQuery<Row>(db(ctx)
    .from("workflow_recovery_cases")
    .select(CASE_SELECT)
    .eq("id", recoveryCaseId)
    .maybeSingle());
  if (recoveryResult.error) apiFailure("DB_ERROR", "Không thể tải ca phục hồi workflow", 500);
  if (!recoveryResult.data) apiFailure("NOT_FOUND", "Không tìm thấy ca phục hồi workflow", 404);
  const recovery = recoveryResult.data;
  const jobId = asString(recovery.job_id);

  const [jobResult, matchingResult, capacityResult, actionResult] = await Promise.all([
    dbQuery<Row>(db(ctx).from("jobs").select("id,display_code,service_type,status")
      .eq("id", jobId).maybeSingle()),
    dbQuery<Row>(db(ctx).from("matching_operations").select("state,updated_at")
      .eq("job_id", jobId).order("updated_at", { ascending: false }).limit(1).maybeSingle()),
    dbQuery<Row[]>(db(ctx).from("matching_capacity_reservations")
      .select("status,expires_at").eq("job_id", jobId)),
    dbQuery<Row[]>(db(ctx).from("workflow_recovery_action_audit")
      .select("action,reason,actor_id,case_version,affected_reservation_count,observed_job_state,created_at")
      .eq("recovery_case_id", recoveryCaseId).order("created_at", { ascending: true })),
  ]);
  if (jobResult.error || !jobResult.data || matchingResult.error || capacityResult.error || actionResult.error) {
    apiFailure("DB_ERROR", "Dòng thời gian phục hồi workflow chưa đầy đủ", 500);
  }

  const actions = actionResult.data ?? [];
  const actorIds = [...new Set(actions.flatMap((row) => nullableString(row.actor_id) ? [nullableString(row.actor_id)!] : []))];
  const actorNames = await actorNameMap(ctx, actorIds);
  const now = Date.now();
  const capacity = capacityResult.data ?? [];
  const activeCapacity = capacity.filter((row) =>
    (row.status === "held" || row.status === "offered") && Date.parse(asString(row.expires_at)) > now
  ).length;
  const expiredCapacity = capacity.filter((row) =>
    row.status === "expired" ||
    ((row.status === "held" || row.status === "offered") && Date.parse(asString(row.expires_at)) <= now)
  ).length;

  return {
    generated_at: new Date().toISOString(),
    summary: serializeSummary(recovery, jobResult.data),
    current_job_status: asJobStatus(jobResult.data.status),
    matching_operation_state: nullableString(matchingResult.data?.state),
    active_capacity_reservations: activeCapacity,
    expired_capacity_reservations: expiredCapacity,
    actions: actions.map((row) => serializeAction(row, actorNames)),
  };
}

export async function applyAdminWorkflowRecoveryAction(
  ctx: MobileApiContext,
  recoveryCaseId: string,
  input: AdminWorkflowRecoveryActionInput,
): Promise<AdminWorkflowRecoveryActionResponse> {
  await requireAdminCapability(ctx, "operations.triage");
  const result = await dbQuery<Row[]>(db(ctx).rpc(
    "admin_apply_workflow_recovery_action_atomic",
    {
      p_recovery_case_id: recoveryCaseId,
      p_actor_id: ctx.user.id,
      p_action: input.action,
      p_reason: input.reason,
      p_idempotency_key: input.idempotency_key,
      p_expected_version: input.expected_version,
    },
  ));
  if (result.error) apiFailure("DB_ERROR", "Không thể áp dụng hành động phục hồi workflow", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Hành động phục hồi không có biên nhận", 500);
  if (row.ok !== true) mapActionError(nullableString(row.error_code));

  const status = recoveryStatus(row.status);
  const appliedAt = asString(row.applied_at);
  return {
    ok: true,
    recovery_case_id: asString(row.recovery_case_id),
    job_id: asString(row.job_id),
    status,
    version: positiveInteger(row.version, "recovery version"),
    affected_reservation_count: nonNegativeInteger(row.affected_reservation_count),
    already_applied: asBoolean(row.already_applied),
    applied_at: appliedAt,
  };
}

async function recoveryJobMap(ctx: MobileApiContext, jobIds: string[]) {
  const uniqueIds = [...new Set(jobIds)];
  if (uniqueIds.length === 0) return new Map<string, Row>();
  const result = await dbQuery<Row[]>(db(ctx).from("jobs")
    .select("id,display_code,service_type,status").in("id", uniqueIds));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải công việc của ca phục hồi", 500);
  return new Map((result.data ?? []).map((row) => [asString(row.id), row]));
}

async function actorNameMap(ctx: MobileApiContext, actorIds: string[]) {
  if (actorIds.length === 0) return new Map<string, string | null>();
  const result = await dbQuery<Row[]>(db(ctx).from("profiles").select("id,full_name").in("id", actorIds));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải người xử lý ca phục hồi", 500);
  return new Map((result.data ?? []).map((row) => [asString(row.id), nullableString(row.full_name)]));
}

function serializeSummary(row: Row, job: Row | undefined): AdminWorkflowRecoverySummary {
  if (!job) apiFailure("DB_ERROR", "Ca phục hồi không còn công việc tương ứng", 500);
  const severity = row.severity;
  if (severity !== "medium" && severity !== "high" && severity !== "critical") {
    apiFailure("DB_ERROR", "Mức độ ca phục hồi không hợp lệ", 500);
  }
  return {
    recovery_case_id: asString(row.id),
    job_id: asString(row.job_id),
    display_code: asString(job.display_code),
    service_type: asServiceType(job.service_type),
    reason_code: asString(row.reason_code),
    detected_state: asString(row.detected_state),
    severity,
    status: recoveryStatus(row.status),
    first_detected_at: asString(row.first_detected_at),
    last_detected_at: asString(row.last_detected_at),
    last_activity_at: asString(row.last_activity_at),
    updated_at: asString(row.updated_at),
    version: positiveInteger(row.version, "recovery version"),
  };
}

function serializeAction(row: Row, actorNames: Map<string, string | null>): AdminWorkflowRecoveryActionReceipt {
  const action = row.action;
  if (
    action !== "acknowledge" && action !== "mark_contact_required" &&
    action !== "reconcile_capacity" && action !== "resolve_verified" &&
    action !== "system_recovered"
  ) apiFailure("DB_ERROR", "Hành động phục hồi không hợp lệ", 500);
  const actorId = nullableString(row.actor_id);
  return {
    action,
    reason: asString(row.reason),
    actor_id: actorId,
    actor_name: actorId ? actorNames.get(actorId) ?? null : null,
    case_version: positiveInteger(row.case_version, "case version"),
    affected_reservation_count: nonNegativeInteger(row.affected_reservation_count),
    observed_job_state: asString(row.observed_job_state),
    created_at: asString(row.created_at),
  };
}

function recoveryStatus(value: unknown): AdminWorkflowRecoveryStatus {
  if (value === "open" || value === "acknowledged" || value === "action_required" || value === "resolved") {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái ca phục hồi không hợp lệ", 500);
}

function positiveInteger(value: unknown, field: string) {
  const parsed = nullableNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
    apiFailure("DB_ERROR", `${field} không hợp lệ`, 500);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function mapActionError(code: string | null): never {
  if (code === "NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy ca phục hồi workflow", 404);
  if (code === "VERSION_CONFLICT") apiFailure("CONFLICT", "Ca phục hồi đã được cập nhật", 409);
  if (code === "CASE_ALREADY_RESOLVED") apiFailure("CONFLICT", "Ca phục hồi đã được đóng", 409);
  if (code === "CASE_STILL_STUCK") apiFailure("RECOVERY_REQUIRED", "Workflow vẫn cần được xử lý trước khi đóng ca", 409);
  if (code === "OPERATIONS_TRIAGE_REQUIRED") apiFailure("FORBIDDEN", "Thiếu quyền xử lý ca phục hồi", 403);
  apiFailure("VALIDATION", "Hành động phục hồi không hợp lệ", 400);
}
