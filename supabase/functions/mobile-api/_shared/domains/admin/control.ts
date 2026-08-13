import {
  asBoolean,
  asServiceTypeArray,
  asString,
  asStringArray,
  asWorkerVerificationStatus,
  nullableNumber,
  nullableRecord,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  ADMIN_CONTROL_CAPABILITIES,
  type AdminActor,
  type AdminControlCapability,
  type AdminManagerNominationCancellationResponse,
  type AdminManagerNominationResponse,
  type AdminManagerNominationSummary,
  type AdminOperationsResponse,
  type AdminSubAdminAccessInput,
  type AdminSubAdminAccessResponse,
  type AdminSubAdminAccountCandidate,
  type AdminSubAdminAccountSearchInput,
  type AdminSubAdminAccountSearchResponse,
  type AdminSubAdminListResponse,
  type AdminSubAdminSummary,
  type AdminWorkerAccessInput,
  type AdminWorkerAccessResponse,
  type AdminWorkerApplicationDecisionInput,
  type AdminWorkerApplicationDecisionResponse,
  type AdminWorkerApplicationListInput,
  type AdminWorkerApplicationListResponse,
  type AdminWorkerApplicationStatus,
  type AdminWorkerApplicationSummary,
  type AdminWorkerChecklist,
  type AdminWorkerReviewStage,
} from "../contracts/admin-control.ts";
import {
  emptyRows,
  escapeLikePattern,
  maskPhone,
  matchesWorkerApplicationQuery,
} from "./control-formatters.ts";
import { serializeProvisioning } from "./operator-provisioning.ts";
const WORKER_APPLICATION_SELECT =
  "id,actor_id,status,safe_metadata,created_at,updated_at";
const WORKER_PROFILE_SELECT =
  "id,verification_status,is_approved,is_suspended,service_types,districts,legal_name,date_of_birth,years_experience,service_radius_km,cccd_front_url,cccd_back_url,selfie_url,bank_account,bank_name";
const OPERATOR_ACCOUNT_SELECT =
  "user_id,baseline_role,capabilities,status,granted_at,updated_at";
const MANAGER_NOMINATION_SELECT =
  "id,target_user_id,baseline_role,nominated_at";
type Row = Record<string, unknown>;
export async function getAdminOperations(
  ctx: MobileApiContext,
): Promise<AdminOperationsResponse> {
  const actor = await requireAdminCapability(ctx, "operations.read");
  const result = await dbQuery<unknown>(
    db(ctx).rpc("admin_operations_snapshot", { p_actor_id: ctx.user.id }),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể tải tình hình vận hành", 500);
  }
  return serializeOperationsSnapshot(result.data, actor);
}

export async function listAdminWorkerApplications(
  ctx: MobileApiContext,
  input: AdminWorkerApplicationListInput,
): Promise<AdminWorkerApplicationListResponse> {
  await requireAdminCapability(ctx, "workers.read");
  const effectiveOffset = input.cursor ? Number.parseInt(input.cursor, 10) : input.offset;
  const needsPostFilter = Boolean(input.query || input.stage);
  const scanLimit = needsPostFilter
    ? Math.min(500, Math.max(100, effectiveOffset + input.limit + 1))
    : effectiveOffset + input.limit + 1;
  let queueQuery = db(ctx)
    .from("kael_admin_queue")
    .select(WORKER_APPLICATION_SELECT, { count: "exact" })
    .eq("queue_type", "worker_application_review")
    .order("created_at", { ascending: false })
    .range(needsPostFilter ? 0 : effectiveOffset, (needsPostFilter ? 0 : effectiveOffset) + scanLimit - 1);
  if (input.status !== "all") queueQuery = queueQuery.eq("status", input.status);

  const result = await dbQuery<Row[]>(queueQuery);
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách hồ sơ thợ", 500);
  }
  const summaries = await buildWorkerApplicationSummaries(ctx, result.data ?? []);
  const filtered = summaries.filter((summary) =>
    (!input.query || matchesWorkerApplicationQuery(summary, input.query)) &&
    (!input.stage || input.stage === "all" || summary.stage === input.stage)
  );
  const page = needsPostFilter
    ? filtered.slice(effectiveOffset, effectiveOffset + input.limit + 1)
    : filtered;
  const hasMore = page.length > input.limit;
  const applications = page.slice(0, input.limit);

  return {
    applications,
    has_more: hasMore,
    next_offset: hasMore ? effectiveOffset + applications.length : null,
    next_cursor: hasMore ? String(effectiveOffset + applications.length) : null,
    total_count: needsPostFilter ? null : nonNegativeInteger(result.count),
  };
}

export async function getAdminWorkerApplication(
  ctx: MobileApiContext,
  applicationId: string,
): Promise<AdminWorkerApplicationSummary> {
  await requireAdminCapability(ctx, "workers.read");
  const result = await dbQuery<Row>(
    db(ctx)
      .from("kael_admin_queue")
      .select(WORKER_APPLICATION_SELECT)
      .eq("id", applicationId)
      .eq("queue_type", "worker_application_review")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  }
  const [summary] = await buildWorkerApplicationSummaries(ctx, [result.data]);
  if (!summary) {
    apiFailure("NOT_FOUND", "Không tìm thấy tài khoản thợ", 404);
  }
  return summary;
}

export async function decideAdminWorkerApplication(
  ctx: MobileApiContext,
  applicationId: string,
  input: AdminWorkerApplicationDecisionInput,
): Promise<AdminWorkerApplicationDecisionResponse> {
  await requireAdminCapability(ctx, "workers.review");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_review_worker_application_atomic", {
      p_queue_id: applicationId,
      p_admin_id: ctx.user.id,
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu quyết định hồ sơ thợ", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Không thể lưu quyết định hồ sơ thợ", 500);
  }
  if (row.ok !== true) mapWorkerApplicationDecisionError(nullableString(row.error_code));

  const role = asUserRole(row.role_out);
  const status = asDecisionStatus(row.status_out);
  if (!role || !status || !row.decided_at) {
    apiFailure("DB_ERROR", "Quyết định hồ sơ thợ chưa có biên nhận hợp lệ", 500);
  }
  return {
    ok: true,
    application_id: asString(row.queue_id) || applicationId,
    worker_id: asString(row.worker_id),
    decision: input.decision,
    status,
    role,
    verification_status: row.verification_status_out == null
      ? null
      : asWorkerVerificationStatus(row.verification_status_out),
    decided_at: asString(row.decided_at),
  };
}

export async function setAdminWorkerAccess(
  ctx: MobileApiContext,
  workerId: string,
  input: AdminWorkerAccessInput,
): Promise<AdminWorkerAccessResponse> {
  await requireAdminCapability(ctx, "workers.manage");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_set_worker_access_atomic", {
      p_actor_id: ctx.user.id,
      p_worker_id: workerId,
      p_action: input.action,
      p_reason: input.reason,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật quyền hoạt động của thợ", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật quyền hoạt động của thợ", 500);
  if (row.ok !== true) mapWorkerAccessError(nullableString(row.error_code));
  const verificationStatus = asWorkerVerificationStatus(row.verification_status_out);
  const decidedAt = asString(row.decided_at);
  if (!decidedAt) apiFailure("DB_ERROR", "Cập nhật quyền hoạt động chưa có biên nhận hợp lệ", 500);
  return {
    ok: true,
    worker_id: asString(row.worker_id) || workerId,
    verification_status: verificationStatus,
    is_suspended: asBoolean(row.is_suspended_out),
    decided_at: decidedAt,
  };
}

export async function listAdminSubAdmins(
  ctx: MobileApiContext,
): Promise<AdminSubAdminListResponse> {
  const actor = await requireAdminCapability(ctx, "team.read");
  const accountsResult = await dbQuery<Row[]>(
    db(ctx)
      .from("admin_operator_accounts")
      .select(OPERATOR_ACCOUNT_SELECT)
      .order("updated_at", { ascending: false }),
  );
  const nominationsResult = actor.access_level === "owner"
    ? await dbQuery<Row[]>(
      db(ctx)
        .from("admin_manager_nominations")
        .select(MANAGER_NOMINATION_SELECT)
        .eq("status", "pending")
        .eq("nominated_by", ctx.user.id)
        .order("nominated_at", { ascending: false }),
    )
    : await emptyRows();
  if (accountsResult.error || nominationsResult.error) apiFailure("DB_ERROR", "Không thể tải danh sách Sub Admin", 500);
  const provisioningResult = actor.access_level === "owner"
    ? await dbQuery<Row[]>(db(ctx).from("admin_operator_provisioning").select("id,full_name,email,status,capabilities,created_at,updated_at")
      .eq("created_by", ctx.user.id).in("status", ["pending_password_change", "failed"]).order("updated_at", { ascending: false }))
    : await emptyRows();
  if (provisioningResult.error) apiFailure("DB_ERROR", "Không thể tải tài khoản chờ kích hoạt", 500);
  const accounts = accountsResult.data ?? [];
  const nominationRows = nominationsResult.data ?? [];
  const userIds = uniqueStrings([
    ...accounts.map((account) => nullableString(account.user_id)),
    ...nominationRows.map((nomination) => nullableString(nomination.target_user_id)),
  ]);
  const [profilesResult, activityResult] = await Promise.all([
    userIds.length
      ? dbQuery<Row[]>(
        db(ctx).from("profiles").select("id,full_name,phone").in("id", userIds),
      )
      : emptyRows(),
    userIds.length
      ? dbQuery<Row[]>(
        db(ctx)
          .from("kael_permission_audit")
          .select("actor_id,created_at")
          .in("actor_id", userIds)
          .order("created_at", { ascending: false }),
      )
      : emptyRows(),
  ]);
  if (profilesResult.error || activityResult.error) {
    apiFailure("DB_ERROR", "Không thể tải thông tin Sub Admin", 500);
  }
  const profileById = indexById(profilesResult.data ?? []);
  const activityByActorId = new Map<string, string>();
  for (const activity of activityResult.data ?? []) {
    const id = nullableString(activity.actor_id);
    const occurredAt = nullableString(activity.created_at);
    if (id && occurredAt && !activityByActorId.has(id)) activityByActorId.set(id, occurredAt);
  }
  const members = accounts.flatMap((account) => {
    const userId = nullableString(account.user_id);
    const baselineRole = asBaselineRole(account.baseline_role);
    const status = asOperatorStatus(account.status);
    const grantedAt = nullableString(account.granted_at);
    const updatedAt = nullableString(account.updated_at);
    if (!userId || !baselineRole || !status || !grantedAt || !updatedAt) return [];
    const profile = profileById.get(userId);
    return [{
      user_id: userId,
      full_name: nullableString(profile?.full_name),
      phone_masked: maskPhone(nullableString(profile?.phone)),
      baseline_role: baselineRole,
      status,
      capabilities: asCapabilities(account.capabilities),
      granted_at: grantedAt,
      updated_at: updatedAt,
      last_activity_at: activityByActorId.get(userId) ?? null,
    } satisfies AdminSubAdminSummary];
  });
  const nominations = nominationRows.flatMap((nomination) => {
    const id = nullableString(nomination.id);
    const userId = nullableString(nomination.target_user_id);
    const role = asBaselineRole(nomination.baseline_role);
    const nominatedAt = nullableString(nomination.nominated_at);
    if (!id || !userId || !role || !nominatedAt) return [];
    const profile = profileById.get(userId);
    return [{
      id,
      user_id: userId,
      full_name: nullableString(profile?.full_name),
      phone_masked: maskPhone(nullableString(profile?.phone)),
      role,
      nominated_at: nominatedAt,
    } satisfies AdminManagerNominationSummary];
  });
  const pendingAccounts = (provisioningResult.data ?? []).flatMap((row) => {
    const account = serializeProvisioning(row); return account ? [account] : [];
  });
  return { actor, members, nominations, pending_accounts: pendingAccounts };
}
export async function searchAdminSubAdminAccounts(
  ctx: MobileApiContext,
  input: AdminSubAdminAccountSearchInput,
): Promise<AdminSubAdminAccountSearchResponse> {
  requireAdminOwner(ctx);
  const safeQuery = escapeLikePattern(input.query);
  if (safeQuery.length < 2) {
    apiFailure("VALIDATION", "Từ khóa tìm tài khoản không hợp lệ", 400);
  }
  const digits = input.query.replace(/\D/g, "");
  const client = db(ctx);
  const searchResult = await dbQuery<Row[]>(
    client
      .from("profiles")
      .select("id,full_name,phone,role")
      .in("role", ["customer", "worker"])
      .or(`full_name.ilike.%${safeQuery}%,phone.ilike.%${digits || safeQuery}%`)
      .limit(10),
  );
  if (searchResult.error) {
    apiFailure("DB_ERROR", "Không thể tìm tài khoản để cấp quyền", 500);
  }
  const candidates = new Map<string, AdminSubAdminAccountCandidate>();
  for (const profile of searchResult.data ?? []) {
    const userId = nullableString(profile.id);
    const role = asBaselineRole(profile.role);
    if (!userId || !role || candidates.has(userId)) continue;
    candidates.set(userId, {
      user_id: userId,
      full_name: nullableString(profile.full_name),
      phone_masked: maskPhone(nullableString(profile.phone)),
      role,
    });
    if (candidates.size >= 10) break;
  }
  return { accounts: [...candidates.values()] };
}
export async function nominateAdminManager(
  ctx: MobileApiContext,
  userId: string,
): Promise<AdminManagerNominationResponse> {
  requireAdminOwner(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_nominate_manager_atomic", {
      p_owner_id: ctx.user.id,
      p_target_id: userId,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể đề cử quản lý", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể đề cử quản lý", 500);
  if (row.ok !== true) mapManagerNominationError(nullableString(row.error_code));
  const nominationId = nullableString(row.nomination_id);
  const role = asBaselineRole(row.baseline_role_out);
  const nominatedAt = nullableString(row.nominated_at_out);
  if (!nominationId || !role || !nominatedAt) {
    apiFailure("DB_ERROR", "Đề cử quản lý chưa có biên nhận hợp lệ", 500);
  }
  return {
    ok: true,
    nomination: {
      id: nominationId,
      user_id: asString(row.user_id) || userId,
      full_name: null,
      phone_masked: null,
      role,
      nominated_at: nominatedAt,
    },
  };
}
export async function cancelAdminManagerNomination(
  ctx: MobileApiContext,
  nominationId: string,
): Promise<AdminManagerNominationCancellationResponse> {
  requireAdminOwner(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_cancel_manager_nomination_atomic", {
      p_owner_id: ctx.user.id,
      p_nomination_id: nominationId,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể hủy đề cử quản lý", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể hủy đề cử quản lý", 500);
  if (row.ok !== true) mapManagerNominationError(nullableString(row.error_code));
  return { ok: true, nomination_id: asString(row.nomination_id) || nominationId };
}
export async function setAdminSubAdminAccess(
  ctx: MobileApiContext,
  userId: string,
  input: AdminSubAdminAccessInput,
): Promise<AdminSubAdminAccessResponse> {
  requireAdminOwner(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_set_sub_admin_access_atomic", {
      p_owner_id: ctx.user.id,
      p_target_id: userId,
      p_action: input.action,
      p_capabilities: input.capabilities,
      p_reason: input.reason ?? null,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể cập nhật quyền Sub Admin", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật quyền Sub Admin", 500);
  if (row.ok !== true) mapSubAdminAccessError(nullableString(row.error_code));
  const status = asOperatorStatus(row.status_out);
  const role = asUserRole(row.role_out);
  const updatedAt = nullableString(row.updated_at_out);
  if (!status || !role || !updatedAt) {
    apiFailure("DB_ERROR", "Cập nhật quyền Sub Admin chưa có biên nhận hợp lệ", 500);
  }
  return {
    ok: true,
    user_id: asString(row.user_id) || userId,
    status,
    role,
    capabilities: asCapabilities(row.capabilities_out),
    updated_at: updatedAt,
  };
}

async function buildWorkerApplicationSummaries(
  ctx: MobileApiContext,
  queueRows: Row[],
): Promise<AdminWorkerApplicationSummary[]> {
  const actorIds = uniqueStrings(queueRows.map((row) => nullableString(row.actor_id)));
  const queueIds = uniqueStrings(queueRows.map((row) => nullableString(row.id)));
  const client = db(ctx);
  const [profiles, workers, reviews, profileQueues] = await Promise.all([
    actorIds.length
      ? dbQuery<Row[]>(client.from("profiles").select("id,role,full_name,phone").in("id", actorIds))
      : emptyRows(),
    actorIds.length
      ? dbQuery<Row[]>(client.from("worker_profiles").select(WORKER_PROFILE_SELECT).in("id", actorIds))
      : emptyRows(),
    queueIds.length
      ? dbQuery<Row[]>(
        client
          .from("admin_worker_application_reviews")
          .select("queue_id,decision,reason,decided_by,decided_at")
          .in("queue_id", queueIds),
      )
      : emptyRows(),
    actorIds.length
      ? dbQuery<Row[]>(
        client.from("kael_admin_queue")
          .select("id,actor_id,status,created_at")
          .eq("queue_type", "worker_profile_verification")
          .in("actor_id", actorIds)
          .order("created_at", { ascending: false }),
      )
      : emptyRows(),
  ]);
  if (profiles.error || workers.error || reviews.error || profileQueues.error) {
    apiFailure("DB_ERROR", "Không thể tải dữ liệu tài khoản thợ", 500);
  }
  const reviewerIds = uniqueStrings((reviews.data ?? []).map((review) => nullableString(review.decided_by)));
  const reviewerProfiles = reviewerIds.length
    ? await dbQuery<Row[]>(client.from("profiles").select("id,full_name").in("id", reviewerIds))
    : await emptyRows();
  if (reviewerProfiles.error) apiFailure("DB_ERROR", "Không thể tải thông tin người duyệt", 500);
  const profileById = indexById(profiles.data ?? []);
  const workerById = indexById(workers.data ?? []);
  const reviewByQueueId = indexById(reviews.data ?? [], "queue_id");
  const reviewerById = indexById(reviewerProfiles.data ?? []);
  const profileQueueByWorker = new Map<string, Row>();
  for (const queue of profileQueues.data ?? []) {
    const workerId = nullableString(queue.actor_id);
    if (workerId && !profileQueueByWorker.has(workerId)) profileQueueByWorker.set(workerId, queue);
  }
  return queueRows.flatMap((row) => {
    const workerId = nullableString(row.actor_id);
    if (!workerId) return [];
    return [serializeWorkerApplication(
      row,
      profileById.get(workerId),
      workerById.get(workerId),
      reviewByQueueId.get(asString(row.id)),
      reviewerById,
      profileQueueByWorker.get(workerId),
    )];
  });
}

function serializeWorkerApplication(
  row: Row,
  profile: Row | undefined,
  worker: Row | undefined,
  review: Row | undefined,
  reviewerById: Map<string, Row>,
  profileQueue: Row | undefined,
): AdminWorkerApplicationSummary {
  const metadata = nullableRecord(row.safe_metadata) ?? {};
  const reviewDecision = asReviewDecision(review?.decision);
  const reviewDecidedAt = nullableString(review?.decided_at);
  const reviewer = reviewerById.get(nullableString(review?.decided_by) ?? "");
  const checklist = buildWorkerChecklist(worker);
  const stage = workerReviewStage(row, profile, worker);
  return {
    id: asString(row.id),
    worker_id: asString(row.actor_id),
    status: asWorkerApplicationStatus(row.status) ?? "open",
    submitted_at: asString(row.created_at),
    updated_at: nullableString(row.updated_at) ?? asString(row.created_at),
    contact_type: metadata.contact_type === "phone" || metadata.contact_type === "email"
      ? metadata.contact_type
      : "unknown",
    contact_suffix: nullableString(metadata.contact_suffix),
    source: nullableString(metadata.source),
    language: metadata.language === "vi" || metadata.language === "en"
      ? metadata.language
      : null,
    account_role: asUserRole(profile?.role),
    full_name: nullableString(profile?.full_name),
    phone_masked: maskPhone(nullableString(profile?.phone)),
    stage,
    checklist,
    profile_review_queue_id: nullableString(profileQueue?.id),
    worker_profile: worker
      ? {
        verification_status: asWorkerVerificationStatus(worker.verification_status),
        is_approved: asBoolean(worker.is_approved),
        is_suspended: asBoolean(worker.is_suspended),
        service_types: asServiceTypeArray(worker.service_types),
        districts: asStringArray(worker.districts),
        has_cccd: Boolean(worker.cccd_front_url && worker.cccd_back_url),
        has_selfie: Boolean(worker.selfie_url),
      }
      : null,
    review: review && reviewDecision && reviewDecidedAt
      ? {
        decision: reviewDecision,
        reason: nullableString(review.reason),
        decided_at: reviewDecidedAt,
        decided_by_name: nullableString(reviewer?.full_name),
      }
      : null,
  };
}

function buildWorkerChecklist(worker: Row | undefined): AdminWorkerChecklist {
  const requirements: Array<[string, boolean]> = [
    ["legal_name", Boolean(nullableString(worker?.legal_name))],
    ["date_of_birth", Boolean(nullableString(worker?.date_of_birth))],
    ["service_types", asServiceTypeArray(worker?.service_types).length > 0],
    ["years_experience", worker !== undefined && nullableNumber(worker.years_experience) !== null],
    ["districts", asStringArray(worker?.districts).length > 0],
    ["service_radius_km", nullableNumber(worker?.service_radius_km) !== null],
    ["cccd_front", Boolean(nullableString(worker?.cccd_front_url))],
    ["cccd_back", Boolean(nullableString(worker?.cccd_back_url))],
    ["selfie", Boolean(nullableString(worker?.selfie_url))],
    ["bank_name", Boolean(nullableString(worker?.bank_name))],
    ["bank_account", Boolean(nullableString(worker?.bank_account))],
  ];
  const missing = requirements.filter(([, complete]) => !complete).map(([key]) => key);
  return {
    completed_count: requirements.length - missing.length,
    total_count: requirements.length,
    missing,
  };
}

function workerReviewStage(
  queue: Row,
  profile: Row | undefined,
  worker: Row | undefined,
): AdminWorkerReviewStage {
  const queueStatus = asWorkerApplicationStatus(queue.status);
  if (asUserRole(profile?.role) !== "worker" || queueStatus === "open" || queueStatus === "acknowledged") {
    return "pending_access";
  }
  if (!worker || worker.verification_status === "draft" || worker.verification_status === "rejected") {
    return "missing_profile";
  }
  if (worker.verification_status === "submitted" || worker.verification_status === "under_review") {
    return "ready_verification";
  }
  return "verified";
}
function serializeOperationsSnapshot(value: unknown, actor: AdminActor): AdminOperationsResponse {
  const snapshot = nullableRecord(value);
  if (!snapshot) apiFailure("DB_ERROR", "Dữ liệu vận hành không hợp lệ", 500);
  const attention = asRecordArray(snapshot.attention).flatMap((item) => {
    const key = item.key;
    const target = item.target_section;
    const count = nonNegativeInteger(item.count);
    if (
      (key !== "worker_applications" && key !== "payment_attention" && key !== "open_disputes" && key !== "other_admin_queue") ||
      (target !== "operations" && target !== "workers" && target !== "transactions") ||
      count === null
    ) return [];
    return [{ key, target_section: target, count } as AdminOperationsResponse["attention"][number]];
  });
  const flow = asRecordArray(snapshot.flow).flatMap((item) => {
    const status = nullableString(item.status);
    const count = nonNegativeInteger(item.count);
    return status && count !== null ? [{ status, count }] : [];
  });
  const quality = asRecordArray(snapshot.quality).flatMap((item) => {
    const key = item.key;
    const count = nonNegativeInteger(item.count);
    if ((key !== "workers_suspended" && key !== "workers_in_verification") || count === null) return [];
    return [{ key, count } as AdminOperationsResponse["quality"][number]];
  });
  const auditEvents = asRecordArray(snapshot.audit_events).flatMap((item) => {
    const id = nullableString(item.id);
    const actorRole = nullableString(item.actor_role);
    const action = nullableString(item.action);
    const decision = nullableString(item.decision);
    const occurredAt = nullableString(item.occurred_at);
    if (!id || !actorRole || !action || !decision || !occurredAt) return [];
    return [{
      id,
      actor_id: nullableString(item.actor_id),
      actor_name: nullableString(item.actor_name),
      actor_role: actorRole,
      action,
      topic: nullableString(item.topic),
      decision,
      occurred_at: occurredAt,
    }];
  });
  const generatedAt = nullableString(snapshot.generated_at);
  if (!generatedAt) apiFailure("DB_ERROR", "Dữ liệu vận hành chưa có thời điểm hợp lệ", 500);
  return { actor, generated_at: generatedAt, attention, flow, quality, audit_events: auditEvents };
}
export async function requireAdminCapability(
  ctx: MobileApiContext,
  capability: AdminControlCapability,
): Promise<AdminActor> {
  if (ctx.role === "admin") {
    return { access_level: "owner", capabilities: [...ADMIN_CONTROL_CAPABILITIES] };
  }
  if (ctx.role !== "admin_operator") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản không có quyền vào khu vực quản trị", 403);
  }
  const result = await dbQuery<Row>(
    db(ctx)
      .from("admin_operator_accounts")
      .select("capabilities,status")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error || !result.data || result.data.status !== "active") {
    apiFailure("AUTH_FORBIDDEN", "Quyền Sub Admin hiện không còn hiệu lực", 403);
  }
  const storedCapabilities = asCapabilities(result.data.capabilities);
  const capabilities = storedCapabilities.includes("finance.read")
    ? storedCapabilities
    : [...storedCapabilities, "finance.read" as const];
  if (!capabilities.includes(capability)) {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa được cấp quyền cho thao tác này", 403);
  }
  return { access_level: "operator", capabilities };
}
function requireAdminOwner(ctx: MobileApiContext): void {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin mới có thể thay đổi quyền Sub Admin", 403);
  }
}
function mapWorkerApplicationDecisionError(code: string | null): never {
  if (code === "APPLICATION_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  if (code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản thợ", 404);
  if (code === "ADMIN_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền duyệt hồ sơ thợ", 403);
  if (code === "INVALID_DECISION" || code === "REASON_REQUIRED") {
    apiFailure("VALIDATION", "Quyết định hồ sơ thợ không hợp lệ", 400);
  }
  if (code === "ALREADY_REVIEWED") apiFailure("ALREADY_REVIEWED", "Hồ sơ thợ đã có quyết định khác", 409);
  apiFailure("REVIEW_FAILED", "Không thể lưu quyết định hồ sơ thợ", 409);
}
function mapWorkerAccessError(code: string | null): never {
  if (code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản thợ", 404);
  if (code === "WORKER_MANAGE_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền quản lý thợ", 403);
  if (code === "WORKER_NOT_APPROVED") apiFailure("CONFLICT", "Chỉ có thể tạm dừng thợ đã được duyệt", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Thông tin thay đổi quyền thợ không hợp lệ", 400);
  apiFailure("WORKER_ACCESS_FAILED", "Không thể cập nhật quyền hoạt động của thợ", 409);
}

function mapSubAdminAccessError(code: string | null): never {
  if (code === "TARGET_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản cần cấp quyền", 404);
  if (code === "OWNER_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin có thể thay đổi quyền Sub Admin", 403);
  if (code === "INVALID_TARGET" || code === "OWNER_CANNOT_BE_OPERATOR" || code === "INVALID_TARGET_ROLE") {
    apiFailure("VALIDATION", "Tài khoản này không thể trở thành Sub Admin", 400);
  }
  if (code === "OPERATOR_NOT_FOUND" || code === "OPERATOR_NOT_ACTIVE") {
    apiFailure("NOT_FOUND", "Không tìm thấy Sub Admin đang hoạt động", 404);
  }
  if (code === "NOMINATION_REQUIRED") {
    apiFailure("CONFLICT", "Tài khoản cần được Owner đề cử trước khi cấp quyền", 409);
  }
  if (code === "INVALID_INPUT" || code === "INVALID_ACTION") {
    apiFailure("VALIDATION", "Thông tin quyền Sub Admin không hợp lệ", 400);
  }
  apiFailure("SUB_ADMIN_ACCESS_FAILED", "Không thể cập nhật quyền Sub Admin", 409);
}

function mapManagerNominationError(code: string | null): never {
  if (code === "TARGET_NOT_FOUND" || code === "NOMINATION_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tài khoản hoặc đề cử quản lý", 404);
  }
  if (code === "OWNER_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin có thể quản lý đề cử", 403);
  }
  if (code === "INVALID_TARGET" || code === "INVALID_TARGET_ROLE") {
    apiFailure("VALIDATION", "Tài khoản này không thể được đề cử quản lý", 400);
  }
  if (code === "ALREADY_OPERATOR") {
    apiFailure("CONFLICT", "Tài khoản này đã là quản trị viên phụ", 409);
  }
  if (code === "NOMINATION_EXISTS") {
    apiFailure("CONFLICT", "Tài khoản này đang chờ được cấp quyền", 409);
  }
  if (code === "NOMINATION_OWNED_BY_ANOTHER_OWNER") {
    apiFailure("CONFLICT", "Tài khoản này đang có đề cử quản lý khác", 409);
  }
  if (code === "NOMINATION_NOT_PENDING") {
    apiFailure("CONFLICT", "Đề cử này không còn chờ cấp quyền", 409);
  }
  apiFailure("MANAGER_NOMINATION_FAILED", "Không thể cập nhật đề cử quản lý", 409);
}

function asWorkerApplicationStatus(value: unknown): AdminWorkerApplicationStatus | null {
  return value === "open" || value === "acknowledged" || value === "resolved" || value === "cancelled"
    ? value
    : null;
}

function asDecisionStatus(
  value: unknown,
): Exclude<AdminWorkerApplicationStatus, "cancelled"> | null {
  return value === "open" || value === "acknowledged" || value === "resolved"
    ? value
    : null;
}

function asReviewDecision(value: unknown): "approve" | "request_changes" | "reject" | null {
  return value === "approve" || value === "request_changes" || value === "reject" ? value : null;
}

function asUserRole(value: unknown): "customer" | "worker" | "admin" | "admin_operator" | null {
  return value === "customer" || value === "worker" || value === "admin" || value === "admin_operator"
    ? value
    : null;
}

function asBaselineRole(value: unknown): "customer" | "worker" | null {
  return value === "customer" || value === "worker" ? value : null;
}

function asOperatorStatus(value: unknown): "active" | "revoked" | null {
  return value === "active" || value === "revoked" ? value : null;
}

function asCapabilities(value: unknown): AdminControlCapability[] {
  const allowed = new Set<string>(ADMIN_CONTROL_CAPABILITIES);
  return Array.from(new Set(asStringArray(value).filter((capability): capability is AdminControlCapability => allowed.has(capability))));
}

function asRecordArray(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const record = nullableRecord(item);
      return record ? [record] : [];
    })
    : [];
}

function nonNegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

function requiredExactCount(value: unknown, subject: string): number {
  const count = nonNegativeInteger(value);
  if (count === null) apiFailure("DB_ERROR", `Không thể xác định tổng số ${subject}`, 500);
  return count;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function indexById(rows: Row[], key = "id") {
  return new Map(rows.flatMap((row) => {
    const id = nullableString(row[key]);
    return id ? [[id, row] as const] : [];
  }));
}
