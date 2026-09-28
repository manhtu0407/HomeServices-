import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import type {
  EdgeAppealDecisionInput,
  EdgeIdentityBlockLiftInput,
  EdgeViolationDecisionInput,
  EdgeViolationSuspendInput,
  EdgeWithdrawalHoldExtendInput,
  EdgeWorkerIdentityNumberInput,
} from "../../../../_shared/domain.ts";
import { requireAdminCapability } from "../admin/actor.ts";
import type {
  EdgeAdminViolationCaseDetail,
  EdgeAdminViolationCasesResponse,
  EdgeIdentityBlocksResponse,
  EdgeViolationCase,
  EdgeWorkerIdentityNumberResponse,
} from "../contracts/discipline.ts";
import { DISCIPLINE_EVIDENCE_BUCKET, failFromDisciplineRpc } from "./discipline.ts";
import { parseAdminCaseSummary, parseIdentityBlock, parseViolationCase } from "./discipline-parse.ts";
import { cccdDigest, emailDigest, phoneDigest } from "./identity-hmac.ts";
import { malformed, recordArray, requiredText } from "./parse.ts";

type AuthAdminClient = {
  auth: { admin: { getUserById(userId: string): Promise<{ data: { user: { email?: string; phone?: string } | null }; error: unknown }> } };
};

// The worker's phone and sign-in email, read with the service client. Neither value leaves
// this function except as a keyed digest.
async function contactDigests(ctx: MobileApiContext, workerId: string) {
  const client = workflowDb(ctx);
  const [profile, auth] = await Promise.all([
    dbQuery<Record<string, unknown>>(client.from("profiles").select("phone").eq("id", workerId).maybeSingle()),
    (client as unknown as AuthAdminClient).auth.admin.getUserById(workerId),
  ]);
  if (profile.error || auth.error) return null;
  return {
    phone: await phoneDigest(nullableString(profile.data?.phone) ?? auth.data.user?.phone ?? null),
    email: await emailDigest(auth.data.user?.email ?? null),
  };
}

type SignedReadStorage = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expires: number): Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
    };
  };
};

const CASE_STATUSES = ["proposed", "confirmed", "dismissed", "fabricated_report"];

export async function listAdminViolationCases(
  ctx: MobileApiContext,
  status: string | null,
): Promise<EdgeAdminViolationCasesResponse> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  if (status !== null && !CASE_STATUSES.includes(status)) {
    apiFailure("VALIDATION", "Trạng thái hồ sơ không hợp lệ", 400);
  }
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_list_violation_cases", { p_actor_id: ctx.user.id, p_status: status }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể tải hàng đợi vi phạm");
  if (!Array.isArray(result.data)) malformed("admin cases");
  return { cases: result.data.map(parseAdminCaseSummary) };
}

export async function getAdminViolationCase(
  ctx: MobileApiContext,
  caseId: string,
): Promise<EdgeAdminViolationCaseDetail> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const client = workflowDb(ctx);
  const result = await dbQuery<unknown>(
    client.rpc("admin_get_violation_case", { p_actor_id: ctx.user.id, p_case_id: caseId }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể tải hồ sơ vi phạm");
  const value = result.data;
  if (!isRecord(value)) malformed("admin case detail");
  if (typeof value.identity_recorded !== "boolean") malformed("case.identity_recorded");
  const appealRow = value.appeal;
  let appeal: EdgeAdminViolationCaseDetail["appeal"] = null;
  if (appealRow !== null && appealRow !== undefined) {
    if (!isRecord(appealRow) || !Array.isArray(appealRow.evidence_paths)) malformed("case.appeal");
    const status = appealRow.status;
    if (status !== "submitted" && status !== "upheld" && status !== "overturned") malformed("case.appeal.status");
    const storage = (client as unknown as SignedReadStorage).storage.from(DISCIPLINE_EVIDENCE_BUCKET);
    const evidence = await Promise.all(appealRow.evidence_paths.map(async (path) => {
      const text = requiredText(path, "case.appeal.evidence_path");
      const signed = await storage.createSignedUrl(text, 300);
      return { path: text, signed_url: signed.error ? null : signed.data?.signedUrl ?? null };
    }));
    appeal = {
      reason: requiredText(appealRow.reason, "case.appeal.reason"),
      evidence,
      status,
      submitted_at: requiredText(appealRow.submitted_at, "case.appeal.submitted_at"),
      decision_reason: nullableString(appealRow.decision_reason),
    };
  }
  return {
    ...parseAdminCaseSummary(value),
    customer_id: nullableString(value.customer_id),
    job_id: nullableString(value.job_id),
    evidence: isRecord(value.evidence) ? value.evidence : {},
    identity_recorded: value.identity_recorded,
    appeal,
    chat_evidence: recordArray(value.chat_evidence, "case.chat_evidence").map((row) => ({
      original_body: requiredText(row.original_body, "chat.original_body"),
      matched_rules: Array.isArray(row.matched_rules) ? row.matched_rules.filter((rule): rule is string => typeof rule === "string") : [],
      created_at: requiredText(row.created_at, "chat.created_at"),
    })),
    events: recordArray(value.events, "case.events").map((row) => ({
      event_kind: requiredText(row.event_kind, "event.event_kind"),
      actor_id: nullableString(row.actor_id),
      detail: isRecord(row.detail) ? row.detail : {},
      created_at: requiredText(row.created_at, "event.created_at"),
    })),
  };
}

// A confirmed harm case also blocks the worker's phone; its digest is computed here because
// the database never holds the key.
export async function decideAdminViolationCase(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeViolationDecisionInput,
): Promise<EdgeViolationCase> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const client = workflowDb(ctx);
  let blocklist: Array<{ kind: "phone" | "email"; value_hmac: string }> = [];
  if (input.decision === "confirm") {
    const detail = await getAdminViolationCase(ctx, caseId);
    if (detail.level === 5) {
      // Best effort: the digests recorded with the CCCD are blocked by the database anyway, so
      // a failed contact read must not hold up a ban.
      const digests = await contactDigests(ctx, detail.worker_id);
      if (!digests) console.warn("mobile-api discipline contact read failed", { caseId });
      if (digests?.phone) blocklist.push({ kind: "phone", value_hmac: digests.phone });
      if (digests?.email) blocklist.push({ kind: "email", value_hmac: digests.email });
    }
  }
  const result = await dbQuery<unknown>(
    client.rpc("admin_decide_violation_case", {
      p_actor_id: ctx.user.id,
      p_case_id: caseId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_clawback_vnd: input.clawback_vnd ?? 0,
      p_blocklist: blocklist,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể ghi quyết định");
  return parseViolationCase(result.data);
}

export async function suspendWorkerForCase(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeViolationSuspendInput,
): Promise<EdgeViolationCase> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_suspend_worker_for_case", {
      p_actor_id: ctx.user.id,
      p_case_id: caseId,
      p_reason: input.reason,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể đình chỉ thợ");
  return parseViolationCase(result.data);
}

export async function extendWithdrawalHold(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeWithdrawalHoldExtendInput,
): Promise<EdgeViolationCase> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_extend_withdrawal_hold", {
      p_actor_id: ctx.user.id,
      p_case_id: caseId,
      p_authority_reference: input.authority_reference,
      p_hold_until: input.hold_until,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gia hạn tạm giữ");
  return parseViolationCase(result.data);
}

export async function decideViolationAppeal(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeAppealDecisionInput,
): Promise<EdgeViolationCase> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_decide_violation_appeal", {
      p_actor_id: ctx.user.id,
      p_case_id: caseId,
      p_decision: input.decision,
      p_reason: input.reason,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể ghi quyết định khiếu nại");
  return parseViolationCase(result.data);
}

export async function setWorkerIdentityNumber(
  ctx: MobileApiContext,
  workerId: string,
  input: EdgeWorkerIdentityNumberInput,
): Promise<EdgeWorkerIdentityNumberResponse> {
  await requireAdminCapability(ctx, "workers.review");
  const cccd = await cccdDigest(input.cccd_number);
  const contact = await contactDigests(ctx, workerId);
  if (!contact) apiFailure("DB_ERROR", "Chưa thể đọc thông tin liên hệ của thợ", 500);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_set_worker_identity_number", {
      p_actor_id: ctx.user.id,
      p_worker_id: workerId,
      p_cccd_hmac: cccd,
      p_cccd_last4: input.cccd_number.slice(-4),
      p_phone_hmac: contact.phone,
      p_email_hmac: contact.email,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể lưu số CCCD");
  if (!isRecord(result.data)) malformed("identity");
  return {
    worker_id: requiredText(result.data.worker_id, "identity.worker_id"),
    cccd_last4: requiredText(result.data.cccd_last4, "identity.cccd_last4"),
  };
}

export async function listIdentityBlocks(ctx: MobileApiContext): Promise<EdgeIdentityBlocksResponse> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_list_identity_blocks", { p_actor_id: ctx.user.id }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể tải danh sách chặn");
  return { blocks: recordArray(result.data, "blocks").map(parseIdentityBlock) };
}

export async function liftIdentityBlock(
  ctx: MobileApiContext,
  blockId: string,
  input: EdgeIdentityBlockLiftInput,
): Promise<{ id: string; lifted: true }> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_lift_identity_block", {
      p_actor_id: ctx.user.id,
      p_block_id: blockId,
      p_reason: input.reason,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gỡ chặn");
  return { id: blockId, lifted: true };
}
