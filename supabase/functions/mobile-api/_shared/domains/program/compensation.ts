// Compensation negotiation between a customer and a worker after a confirmed damage case. The
// database owns every rule (turns, deadlines, balance cover); this module checks the caller's
// role, passes the authenticated id as the actor, and reads the payload strictly.

import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";
import type {
  EdgeCompensationClaimInput,
  EdgeCompensationEvidenceUploadInput,
  EdgeCompensationPaidInput,
  EdgeCompensationResponseInput,
} from "../../../../_shared/domain.ts";
import { requireAdminCapability } from "../admin/actor.ts";
import type {
  EdgeAdminCompensationResponse,
  EdgeCompensationEvidenceUpload,
  EdgeCompensationNegotiation,
  EdgeCompensationOffer,
  EdgeCompensationPayee,
  EdgeCompensationPolicy,
  EdgeCustomerCompensationResponse,
  EdgeWorkerCompensationResponse,
} from "../contracts/compensation.ts";
import { DISCIPLINE_EVIDENCE_BUCKET, failFromDisciplineRpc } from "./discipline.ts";
import { malformed, nullableInteger, recordArray, requiredInteger, requiredText } from "./parse.ts";

type Row = Record<string, unknown>;

type EvidenceStorage = {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expires: number): Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
      createSignedUploadUrl(path: string): Promise<{
        data: { signedUrl?: string; signed_url?: string; token?: string } | null;
        error: unknown;
      }>;
    };
  };
};

const EXTENSIONS: Record<EdgeCompensationEvidenceUploadInput["content_type"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

function evidenceBucket(ctx: MobileApiContext) {
  return (workflowDb(ctx) as unknown as EvidenceStorage).storage.from(DISCIPLINE_EVIDENCE_BUCKET);
}

// Both sides and the admin see the same photos, each through a short-lived signed URL.
async function withSignedEvidence(ctx: MobileApiContext, negotiation: EdgeCompensationNegotiation) {
  if (negotiation.evidence.length === 0) return negotiation;
  const bucket = evidenceBucket(ctx);
  const evidence = await Promise.all(negotiation.evidence.map(async ({ path }) => {
    const signed = await bucket.createSignedUrl(path, 300);
    return { path, signed_url: signed.error ? null : signed.data?.signedUrl ?? null };
  }));
  return { ...negotiation, evidence };
}

const STATUSES = ["awaiting_worker", "awaiting_customer", "agreed", "declined", "expired"] as const;
const ROLES = ["customer", "worker"] as const;
const ACTIONS = ["claim", "counter", "accept", "decline"] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) malformed(what);
  return value as T;
}

function parseOffer(row: Row): EdgeCompensationOffer {
  return {
    actor_role: oneOf(row.actor_role, ROLES, "offer.actor_role"),
    action: oneOf(row.action, ACTIONS, "offer.action"),
    amount_vnd: nullableInteger(row.amount_vnd, "offer.amount_vnd"),
    note: nullableString(row.note),
    created_at: requiredText(row.created_at, "offer.created_at"),
  };
}

export function parseNegotiation(value: unknown): EdgeCompensationNegotiation {
  if (!isRecord(value)) malformed("negotiation");
  const payout = value.payout;
  if (payout !== null && !isRecord(payout)) malformed("negotiation.payout");
  if (!Array.isArray(value.evidence_paths)) malformed("negotiation.evidence_paths");
  return {
    id: requiredText(value.id, "negotiation.id"),
    case_id: requiredText(value.case_id, "negotiation.case_id"),
    job_id: nullableString(value.job_id),
    violation_code: requiredText(value.violation_code, "negotiation.violation_code"),
    worker_name: nullableString(value.worker_name),
    status: oneOf(value.status, STATUSES, "negotiation.status"),
    current_amount_vnd: requiredInteger(value.current_amount_vnd, "negotiation.current_amount_vnd"),
    respond_by: requiredText(value.respond_by, "negotiation.respond_by"),
    offers_left: requiredInteger(value.offers_left, "negotiation.offers_left"),
    agreed_at: nullableString(value.agreed_at),
    payout: payout === null ? null : {
      status: oneOf(payout.status, ["reserved", "paid"] as const, "payout.status"),
      amount_vnd: requiredInteger(payout.amount_vnd, "payout.amount_vnd"),
      paid_at: nullableString(payout.paid_at),
    },
    offers: recordArray(value.offers, "negotiation.offers").map(parseOffer),
    evidence: value.evidence_paths.map((path) => ({ path: requiredText(path, "negotiation.evidence_path"), signed_url: null })),
  };
}

function parsePolicy(value: unknown): EdgeCompensationPolicy {
  if (!isRecord(value)) malformed("compensation policy");
  return {
    min_vnd: requiredInteger(value.min_vnd, "policy.min_vnd"),
    max_vnd: requiredInteger(value.max_vnd, "policy.max_vnd"),
    response_days: requiredInteger(value.response_days, "policy.response_days"),
    max_offers: requiredInteger(value.max_offers, "policy.max_offers"),
  };
}

async function requireRole(ctx: MobileApiContext, role: "customer" | "worker"): Promise<void> {
  if (ctx.role !== role) {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản không dùng được chức năng bồi thường này", 403);
  }
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, role);
}

export async function listCustomerCompensation(ctx: MobileApiContext): Promise<EdgeCustomerCompensationResponse> {
  await requireRole(ctx, "customer");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_customer_compensation", { p_customer_id: ctx.user.id }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể tải yêu cầu bồi thường", 500);
  const value = result.data;
  if (!isRecord(value)) malformed("customer compensation");
  if (typeof value.refund_account_ready !== "boolean") malformed("compensation.refund_account_ready");
  const items = recordArray(value.items, "compensation.items").map((item) => ({
      case_id: requiredText(item.case_id, "item.case_id"),
      job_id: requiredText(item.job_id, "item.job_id"),
      violation_code: requiredText(item.violation_code, "item.violation_code"),
      worker_name: nullableString(item.worker_name),
      decided_at: requiredText(item.decided_at, "item.decided_at"),
      negotiation: item.negotiation === null ? null : parseNegotiation(item.negotiation),
  }));
  return {
    policy: parsePolicy(value.policy),
    refund_account_ready: value.refund_account_ready,
    items: await Promise.all(items.map(async (item) => ({
      ...item,
      negotiation: item.negotiation ? await withSignedEvidence(ctx, item.negotiation) : null,
    }))),
  };
}

// Photos go under compensation/<customer>/<case>/, and the claim RPC re-checks that prefix, so
// a path made for another customer or case is refused even if it was uploaded.
export async function createCompensationEvidenceUpload(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeCompensationEvidenceUploadInput,
): Promise<EdgeCompensationEvidenceUpload> {
  await requireRole(ctx, "customer");
  // A signed URL is issued only for the caller's own eligible case with no claim yet, so an
  // arbitrary case id cannot be used to park files in the evidence bucket.
  const cases = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_customer_compensation", { p_customer_id: ctx.user.id }),
  );
  if (cases.error || !isRecord(cases.data)) apiFailure("DB_ERROR", "Chưa thể kiểm tra vụ việc", 500);
  const open = recordArray(cases.data.items, "compensation.items")
    .some((item) => item.case_id === caseId && item.negotiation === null);
  if (!open) apiFailure("COMPENSATION_NOT_ALLOWED", "Vụ việc này không nhận thêm ảnh bồi thường", 409);
  const path = `compensation/${ctx.user.id}/${caseId}/${crypto.randomUUID()}.${EXTENSIONS[input.content_type]}`;
  const signed = await evidenceBucket(ctx).createSignedUploadUrl(path);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị tải ảnh lên", 503);
  }
  return { path, signed_url: signedUrl, token };
}

export async function openCompensationClaim(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeCompensationClaimInput,
): Promise<EdgeCompensationNegotiation> {
  await requireRole(ctx, "customer");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("open_compensation_claim", {
      p_customer_id: ctx.user.id,
      p_case_id: caseId,
      p_amount_vnd: input.amount_vnd,
      p_note: input.note,
      p_evidence_paths: input.evidence_paths,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gửi đề nghị bồi thường");
  return withSignedEvidence(ctx, parseNegotiation(result.data));
}

export async function respondCompensation(
  ctx: MobileApiContext,
  negotiationId: string,
  input: EdgeCompensationResponseInput,
): Promise<EdgeCompensationNegotiation> {
  const role = ctx.role === "worker" ? "worker" : "customer";
  await requireRole(ctx, role);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("respond_compensation", {
      p_actor_id: ctx.user.id,
      p_actor_role: role,
      p_negotiation_id: negotiationId,
      p_action: input.action,
      p_amount_vnd: input.amount_vnd ?? null,
      p_note: input.note ?? null,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gửi phản hồi bồi thường");
  return withSignedEvidence(ctx, parseNegotiation(result.data));
}

export async function listWorkerCompensation(ctx: MobileApiContext): Promise<EdgeWorkerCompensationResponse> {
  await requireRole(ctx, "worker");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_worker_compensation", { p_worker_id: ctx.user.id }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể tải yêu cầu bồi thường", 500);
  const value = result.data;
  if (!isRecord(value)) malformed("worker compensation");
  return {
    policy: parsePolicy(value.policy),
    withdrawable_vnd: requiredInteger(value.withdrawable_vnd, "compensation.withdrawable_vnd"),
    negotiations: await Promise.all(
      recordArray(value.negotiations, "compensation.negotiations").map((row) => withSignedEvidence(ctx, parseNegotiation(row))),
    ),
  };
}

export async function listAdminCompensation(ctx: MobileApiContext): Promise<EdgeAdminCompensationResponse> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_list_compensation", { p_actor_id: ctx.user.id }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể tải danh sách bồi thường");
  const value = result.data;
  if (!isRecord(value)) malformed("admin compensation");
  return {
    negotiations: await Promise.all(recordArray(value.negotiations, "compensation.negotiations").map(async (row) => ({
      ...await withSignedEvidence(ctx, parseNegotiation(row)),
      customer_name: nullableString(row.customer_name),
      worker_id: requiredText(row.worker_id, "negotiation.worker_id"),
    }))),
  };
}

export async function getCompensationPayee(ctx: MobileApiContext, negotiationId: string): Promise<EdgeCompensationPayee> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_get_compensation_payee", { p_actor_id: ctx.user.id, p_negotiation_id: negotiationId }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể tải tài khoản nhận tiền của khách");
  const value = result.data;
  if (!isRecord(value)) malformed("payee");
  const account = value.account;
  if (account === null) return { account: null };
  if (!isRecord(account) || typeof account.verified !== "boolean") malformed("payee.account");
  return {
    account: {
      bank_name: requiredText(account.bank_name, "payee.bank_name"),
      account_holder_name: requiredText(account.account_holder_name, "payee.account_holder_name"),
      bank_account: requiredText(account.bank_account, "payee.bank_account"),
      verified: account.verified,
    },
  };
}

export async function recordCompensationPaid(
  ctx: MobileApiContext,
  negotiationId: string,
  input: EdgeCompensationPaidInput,
): Promise<EdgeCompensationNegotiation> {
  await requireAdminCapability(ctx, "workers.discipline.manage");
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("admin_record_compensation_paid", {
      p_actor_id: ctx.user.id,
      p_negotiation_id: negotiationId,
      p_transfer_reference: input.transfer_reference,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể ghi nhận đã chuyển tiền");
  return withSignedEvidence(ctx, parseNegotiation(result.data));
}
