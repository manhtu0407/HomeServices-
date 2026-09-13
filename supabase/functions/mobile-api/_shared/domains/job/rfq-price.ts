// Job lifecycle owns post-inspection RFQ consent; Kael never fabricates a price receipt.
import {
  rfqPriceDecisionInputSchema, rfqPriceProposalInputSchema, rfqPriceProposalSchema, rfqPriceStatusSchema,
  type EdgeRfqPriceDecisionInput as RfqPriceDecisionInput, type EdgeRfqPriceProposalInput as RfqPriceProposalInput,
  type EdgeRfqPriceProposal as RfqPriceProposal, type EdgeRfqPriceStatus as RfqPriceStatus,
} from "../../../../_shared/contracts/rfq-price.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";

const PUBLIC_FIELDS = "id,job_id,worker_id,customer_id,quote_mode,scope_summary,customer_total,currency,status,created_at,decided_at";

export async function getRfqPrice(ctx: MobileApiContext, jobId: string): Promise<RfqPriceStatus> {
  if (ctx.role !== "customer" && ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ các bên của công việc được xem báo giá.", 403);
  }
  const job = await requireJobAccess(db(ctx), jobId, ctx, { select: "id,status,customer_id,worker_id,quote_mode" });
  const mode = rfqPriceStatusSchema.shape.quote_mode.safeParse(job.quote_mode ?? null);
  if (!mode.success) apiFailure("RFQ_PRICE_READ_UNAVAILABLE", "Chưa xác định được chế độ báo giá.", 503);
  const quoteMode = mode.data;
  if (quoteMode !== "rfq" && quoteMode !== "inspection_only") {
    return { job_id: jobId, quote_mode: quoteMode, proposal: null };
  }
  const result = await dbQuery<Record<string, unknown>>(workflowDb(ctx)
    .from("job_rfq_price_proposals").select(PUBLIC_FIELDS)
    .eq("job_id", jobId).eq("customer_id", job.customer_id).eq("worker_id", job.worker_id)
    .eq("quote_mode", quoteMode)
    .order("created_at", { ascending: false }).limit(1).maybeSingle());
  if (result.error) apiFailure("RFQ_PRICE_READ_UNAVAILABLE", "Chưa tải được báo giá. Vui lòng thử lại.", 503);
  if (result.data === null) return { job_id: jobId, quote_mode: quoteMode, proposal: null };
  const proposal = readReceipt(result.data, jobId);
  if (proposal.customer_id !== job.customer_id || proposal.worker_id !== job.worker_id) outcomeUnknown();
  return { job_id: jobId, quote_mode: quoteMode, proposal };
}

export async function proposeRfqPrice(
  ctx: MobileApiContext, jobId: string, input: RfqPriceProposalInput,
): Promise<RfqPriceProposal> {
  if (ctx.role !== "worker") apiFailure("AUTH_FORBIDDEN", "Chỉ thợ được phân công được đề xuất báo giá.", 403);
  const parsed = rfqPriceProposalInputSchema.safeParse(input);
  if (!parsed.success) apiFailure("VALIDATION", "Báo giá không hợp lệ.", 400);
  const intent = parsed.data;
  const result = await dbQuery<Record<string, unknown>>(workflowDb(ctx).rpc("propose_rfq_price_atomic", {
    p_job_id: jobId, p_worker_id: ctx.user.id, p_request_id: intent.request_id,
    p_customer_total: intent.customer_total, p_scope_summary: intent.scope_summary,
  }));
  if (result.error) commandError(result.error);
  const proposal = readReceipt(result.data, jobId);
  if (proposal.id !== intent.request_id || proposal.worker_id !== ctx.user.id ||
    proposal.customer_total !== intent.customer_total || proposal.scope_summary !== intent.scope_summary) outcomeUnknown();
  return proposal;
}

export async function decideRfqPrice(
  ctx: MobileApiContext, jobId: string, input: RfqPriceDecisionInput,
): Promise<RfqPriceProposal> {
  if (ctx.role !== "customer") apiFailure("AUTH_FORBIDDEN", "Chỉ khách đặt dịch vụ được xác nhận báo giá.", 403);
  const parsed = rfqPriceDecisionInputSchema.safeParse(input);
  if (!parsed.success) apiFailure("VALIDATION", "Quyết định báo giá không hợp lệ.", 400);
  const intent = parsed.data;
  const result = await dbQuery<Record<string, unknown>>(workflowDb(ctx).rpc("decide_rfq_price_atomic", {
    p_job_id: jobId, p_customer_id: ctx.user.id, p_proposal_id: intent.proposal_id, p_approve: intent.approve,
  }));
  if (result.error) commandError(result.error);
  const proposal = readReceipt(result.data, jobId);
  if (proposal.id !== intent.proposal_id || proposal.customer_id !== ctx.user.id ||
    proposal.status !== (intent.approve ? "approved" : "rejected")) outcomeUnknown();
  return proposal;
}

function readReceipt(value: unknown, jobId: string): RfqPriceProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) outcomeUnknown();
  const row = value as Record<string, unknown>;
  const parsed = rfqPriceProposalSchema.safeParse(Object.fromEntries(
    PUBLIC_FIELDS.split(",").map(key => [key, row[key]]),
  ));
  if (!parsed.success || parsed.data.job_id !== jobId) outcomeUnknown();
  return parsed.data;
}

function commandError(error: { code?: string; message?: string }): never {
  if (error.code === "P0002" && error.message === "RFQ_PRICE_NOT_FOUND") {
    apiFailure("RFQ_PRICE_NOT_FOUND", "Không tìm thấy báo giá phù hợp với công việc.", 404);
  }
  const known = ["RFQ_PRICE_INVALID_INPUT", "RFQ_PRICE_REQUEST_CONFLICT", "RFQ_PRICE_DECISION_CONFLICT",
    "RFQ_PRICE_STATE_CHANGED", "RFQ_PRICE_PENDING"];
  if (["22023", "55000"].includes(error.code ?? "") && known.includes(error.message ?? "")) {
    apiFailure(error.message!, "Báo giá hoặc trạng thái đã thay đổi. Hãy tải lại để kiểm tra.", 409);
  }
  outcomeUnknown();
}

function outcomeUnknown(): never {
  apiFailure("RFQ_PRICE_OUTCOME_UNKNOWN", "Đang đối soát báo giá. Hãy tải lại công việc để kiểm tra kết quả.", 503,
    { reconcile_required: true });
}
