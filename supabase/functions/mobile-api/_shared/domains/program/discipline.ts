import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isRecord, nullableString } from "../../platform/coercions.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";
import type {
  EdgeAppealEvidenceUploadInput,
  EdgeAppealSubmitInput,
  EdgeWorkerReportInput,
} from "../../../../_shared/domain.ts";
import type {
  EdgeAppealEvidenceUploadResponse,
  EdgeViolationCase,
  EdgeWorkerReportResponse,
  EdgeWorkerViolationsResponse,
} from "../contracts/discipline.ts";
import { namedFailure, parseDisciplinePolicy, parseViolationCase } from "./discipline-parse.ts";
import { malformed, requiredInteger, requiredText } from "./parse.ts";

export const DISCIPLINE_EVIDENCE_BUCKET = "discipline-evidence";

// The rules screen states these numbers, so they are read from the policy row rather than
// repeated in the app where an admin change would leave them stale.
const POLICY_COLUMNS =
  "l1_matching_days, l2_points_debit, l2_network_freeze_days, l3_freeze_days, strike_window_months, appeal_window_days, withdrawal_hold_days";

type SignedUploadStorage = {
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(path: string): Promise<{
        data: { signedUrl?: string; signed_url?: string; token?: string } | null;
        error: unknown;
      }>;
    };
  };
};

const EXTENSIONS: Record<EdgeAppealEvidenceUploadInput["content_type"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "audio/m4a": "m4a",
  "application/pdf": "pdf",
};

export function failFromDisciplineRpc(message: string | undefined, fallback: string): never {
  const named = namedFailure(message);
  if (named) apiFailure(named[0], named[1], named[2]);
  apiFailure("DB_ERROR", fallback, 500);
}

async function requireWorker(ctx: MobileApiContext): Promise<void> {
  if (ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ thợ mới xem được hồ sơ vi phạm của mình", 403);
  }
  await requireRealTrafficActor(workflowDb(ctx), ctx.user.id, "worker");
}

export async function listWorkerViolations(ctx: MobileApiContext): Promise<EdgeWorkerViolationsResponse> {
  await requireWorker(ctx);
  return loadWorkerViolations(ctx);
}

async function loadWorkerViolations(ctx: MobileApiContext): Promise<EdgeWorkerViolationsResponse> {
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("get_worker_violations", { p_worker_id: ctx.user.id }),
  );
  if (result.error) apiFailure("DB_ERROR", "Chưa thể tải hồ sơ vi phạm", 500);
  if (!Array.isArray(result.data)) malformed("violations");
  const policy = await dbQuery<Record<string, unknown>>(
    workflowDb(ctx).from("worker_discipline_policy").select(POLICY_COLUMNS).eq("id", 1).maybeSingle(),
  );
  if (policy.error) apiFailure("DB_ERROR", "Chưa thể tải quy định xử lý vi phạm", 500);
  if (!isRecord(policy.data)) malformed("discipline policy");
  return {
    policy: parseDisciplinePolicy(policy.data),
    cases: result.data.map((item) => forWorker(parseViolationCase(item))),
  };
}

// The appeal RPC re-checks the prefix, so a path forged for another worker or case is refused
// even if a client uploads it somewhere else.
export async function createAppealEvidenceUpload(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeAppealEvidenceUploadInput,
): Promise<EdgeAppealEvidenceUploadResponse> {
  await requireWorker(ctx);
  const cases = await loadWorkerViolations(ctx);
  const target = cases.cases.find((item) => item.id === caseId);
  if (!target || !isAppealOpen(target)) {
    apiFailure("APPEAL_NOT_ALLOWED", "Hồ sơ này không thể khiếu nại", 409);
  }
  const path = `appeals/${ctx.user.id}/${caseId}/${crypto.randomUUID()}.${EXTENSIONS[input.content_type]}`;
  const signed = await (workflowDb(ctx) as unknown as SignedUploadStorage).storage
    .from(DISCIPLINE_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị tải bằng chứng lên", 503);
  }
  return { path, signed_url: signedUrl, token };
}

export async function submitViolationAppeal(
  ctx: MobileApiContext,
  caseId: string,
  input: EdgeAppealSubmitInput,
): Promise<EdgeViolationCase> {
  await requireWorker(ctx);
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("submit_violation_appeal", {
      p_worker_id: ctx.user.id,
      p_case_id: caseId,
      p_reason: input.reason,
      p_evidence_paths: input.evidence_paths,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gửi khiếu nại");
  return forWorker(parseViolationCase(result.data));
}

export async function reportWorker(
  ctx: MobileApiContext,
  jobId: string,
  input: EdgeWorkerReportInput,
): Promise<EdgeWorkerReportResponse> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới báo cáo được thợ", 403);
  }
  const result = await dbQuery<unknown>(
    workflowDb(ctx).rpc("create_worker_report", {
      p_customer_id: ctx.user.id,
      p_job_id: jobId,
      p_violation_code: input.violation_code,
      p_statement: input.statement,
    }),
  );
  if (result.error) failFromDisciplineRpc(result.error.message, "Chưa thể gửi báo cáo");
  const value = result.data;
  if (!isRecord(value)) malformed("report");
  const status = nullableString(value.status);
  if (status !== "proposed" && status !== "confirmed" && status !== "dismissed" && status !== "fabricated_report") {
    malformed("report.status");
  }
  return {
    case_id: requiredText(value.case_id, "report.case_id"),
    level: requiredInteger(value.level, "report.level"),
    status,
  };
}

// A customer's own words stay with the admin: the accused worker sees the decision reason,
// never the reporter's statement, so a report cannot become a lever against the customer.
function forWorker(item: EdgeViolationCase): EdgeViolationCase {
  return item.source === "customer_report" ? { ...item, statement: null } : item;
}

function isAppealOpen(item: EdgeViolationCase): boolean {
  return item.status === "confirmed" &&
    item.appeal_status === "none" &&
    item.appeal_deadline_at !== null &&
    Date.parse(item.appeal_deadline_at) > Date.now();
}
