import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";
import type { EdgeReferralClaimInput } from "../../../../_shared/domain.ts";
import type {
  EdgeCustomerMembershipResponse,
  EdgeReferralClaimOutcome,
  EdgeReferralClaimResponse,
} from "../contracts/ambassador.ts";
import { malformed, nullableInteger, recordArray, requiredInteger, requiredText } from "./parse.ts";

type Row = Record<string, unknown>;

const CLAIM_OUTCOMES: readonly EdgeReferralClaimOutcome[] = [
  "LINKED",
  "ALREADY_LINKED",
  "CODE_NOT_FOUND",
  "LINKED_TO_OTHER_WORKER",
  "CLAIM_WINDOW_CLOSED",
  "ALREADY_TRANSACTED",
  "RATE_LIMITED",
  "PROGRAM_UNAVAILABLE",
];

async function requireCustomer(ctx: MobileApiContext): Promise<void> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới dùng được chức năng này", 403);
  }
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, "customer");
}

export async function getCustomerMembership(
  ctx: MobileApiContext,
): Promise<EdgeCustomerMembershipResponse> {
  await requireCustomer(ctx);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_customer_membership_summary", { p_customer_id: ctx.user.id }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể tải điểm thành viên", 500);
  const value = result.data;
  if (!isRecord(value)) malformed("membership");
  const link = value.linked_worker;
  let linkedWorker: EdgeCustomerMembershipResponse["linked_worker"] = null;
  if (link !== null) {
    if (!isRecord(link) || (link.source !== "invite_code" && link.source !== "rebook")) {
      malformed("membership.linked_worker");
    }
    linkedWorker = {
      worker_id: requiredText(link.worker_id, "membership.linked_worker.worker_id"),
      display_name: nullableString(link.display_name),
      source: link.source,
      expires_at: requiredText(link.expires_at, "membership.linked_worker.expires_at"),
    };
  }
  return {
    points: requiredInteger(value.points, "membership.points"),
    customer_vnd_per_point: nullableInteger(value.customer_vnd_per_point, "membership.customer_vnd_per_point"),
    linked_worker: linkedWorker,
    recent_entries: recordArray(value.recent_entries, "membership.recent_entries").map((row) => {
      if (row.entry_kind !== "accrual" && row.entry_kind !== "reversal") malformed("membership.entry_kind");
      return {
        job_id: requiredText(row.job_id, "membership.entry.job_id"),
        entry_kind: row.entry_kind,
        points: requiredInteger(row.points, "membership.entry.points"),
        created_at: requiredText(row.created_at, "membership.entry.created_at"),
      };
    }),
  };
}

export async function claimReferralCode(
  ctx: MobileApiContext,
  input: EdgeReferralClaimInput,
): Promise<EdgeReferralClaimResponse> {
  await requireCustomer(ctx);
  const result = await dbQuery<Row[]>(
    workflowDb(ctx).rpc("claim_referral_code", { p_customer_id: ctx.user.id, p_code: input.code }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể xác nhận mã mời", 500);
  const row = result.data?.[0];
  const outcome = row?.outcome;
  // NOT_CUSTOMER and SELF_REFERRAL cannot reach here: the role gate above already refused them.
  if (!CLAIM_OUTCOMES.includes(outcome as EdgeReferralClaimOutcome)) malformed("claim.outcome");
  return {
    outcome: outcome as EdgeReferralClaimOutcome,
    linked_worker_id: nullableString(row?.worker_id),
  };
}
