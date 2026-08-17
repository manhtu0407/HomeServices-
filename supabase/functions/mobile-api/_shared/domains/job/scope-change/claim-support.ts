import { apiFailure } from "../../../platform/api-failure.ts";
import { type DbClient, dbQuery } from "../../../platform/db.ts";

export async function releaseDirectScopeClaim(
  client: DbClient,
  jobId: string,
  workerId: string,
  clientRequestId: string | undefined,
  claimId: string | null,
  errorCode: string,
) {
  if (!clientRequestId || !claimId) return;
  try {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("release_scope_change_request_claim_atomic", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_client_request_id: clientRequestId,
        p_claim_id: claimId,
        p_error_code: errorCode,
      }),
    );
    if (result.error || result.data?.[0]?.released !== true) {
      console.warn("mobile-api scope-change claim release failed", { jobId, errorCode });
    }
  } catch {
    console.warn("mobile-api scope-change claim release threw", { jobId, errorCode });
  }
}

export async function assertWorkerQuoteConfirmation(
  client: DbClient,
  jobId: string,
  workerId: string,
  clientRequestId: string | undefined,
  claimId: string | null,
  confirmedQuotePresent: boolean,
) {
  if (confirmedQuotePresent) return;
  await releaseDirectScopeClaim(
    client,
    jobId,
    workerId,
    clientRequestId,
    claimId,
    "WORKER_QUOTE_CONFIRMATION_REQUIRED",
  );
  apiFailure(
    "WORKER_QUOTE_CONFIRMATION_REQUIRED",
    "Thợ cần xem tổng khách trả, phí nền tảng và thu nhập rồi xác nhận báo giá trước khi gửi khách.",
    409,
  );
}
