import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";
import type { EdgeAmbassadorRedeemInput } from "../../../../_shared/domain.ts";
import type {
  EdgeAmbassadorCodeResponse,
  EdgeAmbassadorRedeemReceipt,
  EdgeAmbassadorSummaryResponse,
} from "../contracts/ambassador.ts";
import {
  malformed,
  parsePointEntry,
  parseProgram,
  parseRedemption,
  recordArray,
  requiredInteger,
  requiredText,
} from "./parse.ts";

type Row = Record<string, unknown>;

async function requireWorker(ctx: MobileApiContext): Promise<void> {
  if (ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ thợ mới xem được chương trình thưởng", 403);
  }
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, "worker");
}

export async function getWorkerAmbassadorSummary(
  ctx: MobileApiContext,
): Promise<EdgeAmbassadorSummaryResponse> {
  await requireWorker(ctx);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_worker_ambassador_summary", { p_worker_id: ctx.user.id }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể tải chương trình thưởng", 500);
  const value = result.data;
  if (!isRecord(value)) malformed("summary");
  if (typeof value.tax_policy_ready !== "boolean") malformed("summary.tax_policy_ready");
  return {
    program: value.program === null ? null : parseProgram(value.program),
    referral_code: nullableString(value.referral_code),
    points_milli: requiredInteger(value.points_milli, "summary.points_milli"),
    linked_customers: requiredInteger(value.linked_customers, "summary.linked_customers"),
    active_customers: requiredInteger(value.active_customers, "summary.active_customers"),
    multiplier_bps: requiredInteger(value.multiplier_bps, "summary.multiplier_bps"),
    redemption_frozen_until: nullableString(value.redemption_frozen_until),
    network_frozen_until: nullableString(value.network_frozen_until),
    tax_policy_ready: value.tax_policy_ready,
    recent_entries: recordArray(value.recent_entries, "summary.recent_entries").map(parsePointEntry),
    redemptions: recordArray(value.redemptions, "summary.redemptions").map(parseRedemption),
  };
}

export async function ensureWorkerReferralCode(
  ctx: MobileApiContext,
): Promise<EdgeAmbassadorCodeResponse> {
  await requireWorker(ctx);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("ensure_worker_referral_code", { p_worker_id: ctx.user.id }),
  );
  if (result.error) {
    if (result.error.message?.includes("WORKER_NOT_ELIGIBLE")) {
      apiFailure("WORKER_NOT_ELIGIBLE", "Tài khoản thợ cần được duyệt và đang hoạt động để có mã mời", 409);
    }
    apiFailure("DB_ERROR", "Chưa thể tạo mã mời", 500);
  }
  return { referral_code: requiredText(result.data, "referral_code") };
}

const REDEEM_ERRORS: Record<string, [string, string, number]> = {
  WORKER_NOT_ELIGIBLE: ["WORKER_NOT_ELIGIBLE", "Tài khoản hiện không thể đổi thưởng", 409],
  REDEMPTION_FROZEN: ["REDEMPTION_FROZEN", "Quyền đổi thưởng đang tạm khóa", 409],
  MILESTONE_UNAVAILABLE: ["MILESTONE_UNAVAILABLE", "Mốc thưởng này không còn áp dụng", 409],
  INSUFFICIENT_POINTS: ["INSUFFICIENT_POINTS", "Bạn chưa đủ điểm cho mốc này", 409],
  BONUS_TAX_POLICY_MISSING: [
    "BONUS_TAX_POLICY_MISSING",
    "NestScout đang hoàn tất chính sách thuế cho thưởng; bạn sẽ đổi được ngay khi chính sách được duyệt",
    409,
  ],
  CLIENT_REQUEST_MISMATCH: ["IDEMPOTENCY_CONFLICT", "Yêu cầu đổi thưởng bị trùng mã với một yêu cầu khác", 409],
  INVALID_INPUT: ["VALIDATION", "Yêu cầu đổi thưởng không hợp lệ", 400],
};

export async function redeemAmbassadorMilestone(
  ctx: MobileApiContext,
  input: EdgeAmbassadorRedeemInput,
): Promise<EdgeAmbassadorRedeemReceipt> {
  await requireWorker(ctx);
  const result = await dbQuery<Row[]>(
    workflowDb(ctx).rpc("redeem_ambassador_milestone", {
      p_worker_id: ctx.user.id,
      p_milestone_id: input.milestone_id,
      p_client_request_id: input.client_request_id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể đổi thưởng", 500);
  const row = result.data?.[0];
  if (!row) malformed("redeem receipt");
  if (row.ok !== true) {
    const mapped = REDEEM_ERRORS[nullableString(row.error_code) ?? ""];
    if (!mapped) apiFailure("DB_ERROR", "Chưa thể đổi thưởng", 500);
    apiFailure(mapped[0], mapped[1], mapped[2]);
  }
  if (typeof row.replayed !== "boolean") malformed("redeem.replayed");
  return {
    redemption_id: requiredText(row.redemption_id, "redeem.redemption_id"),
    reward_vnd: requiredInteger(row.reward_vnd, "redeem.reward_vnd"),
    tax_withheld_vnd: requiredInteger(row.tax_withheld_vnd, "redeem.tax_withheld_vnd"),
    net_vnd: requiredInteger(row.net_vnd, "redeem.net_vnd"),
    points_left_milli: requiredInteger(row.points_left_milli, "redeem.points_left_milli"),
    replayed: row.replayed,
  };
}
