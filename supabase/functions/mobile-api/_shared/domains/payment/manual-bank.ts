import type { JobStatus } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { insertUserNotification } from "../notification/notifications.ts";
import { sendPushToUsers } from "../../platform/push.ts";

export type ManualBankConfig = {
  accountHolder?: string;
  accountNumber?: string;
  bankCode?: string;
  enabled: boolean;
};

export type ManualBankPaymentInstructionsInput = {
  accountHolder: string;
  accountNumber: string;
  amount: number;
  bankCode: string;
  paymentCode: string;
};

export type EdgeManualBankPaymentResponse = {
  job_id: string;
  status: JobStatus;
  payment: {
    provider: "platform_bank_manual";
    status: "manual_qr_ready" | "manual_customer_claimed" | "manual_reconcile_required" | "manual_verified";
    gross_amount: number;
    payment_code: string;
    transfer_content: string;
    qr_image_url: string;
    updated_at: string;
  };
};

export type EdgeCompletionPaymentResponse = EdgeManualBankPaymentResponse & {
  operation_id: string;
  request_id: string;
  final_price: number;
  already_applied: boolean;
};

export type ManualBankClaimInput = {
  sending_bank?: string;
  transferred_at: string;
};

export type EdgeManualBankClaimResponse = {
  job_id: string;
  payment_status: "manual_customer_claimed" | "manual_reconcile_required";
  status: "payment_pending";
  transfer_claimed_at: string;
  settlement_state: "customer_claimed" | "admin_verified";
  salary_visible: true;
};

const PAYMENT_CODE_PATTERN = /^NS[A-Z0-9]{24}$/;
const BANK_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

export function buildManualBankPaymentInstructions(
  input: ManualBankPaymentInstructionsInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new RangeError("amount must be a positive safe integer");
  }
  if (!PAYMENT_CODE_PATTERN.test(input.paymentCode)) {
    throw new Error("paymentCode is invalid");
  }

  const url = new URL("https://vietqr.app/img");
  url.searchParams.set("acc", input.accountNumber);
  url.searchParams.set("bank", input.bankCode);
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("des", input.paymentCode);
  url.searchParams.set("template", "compact");
  url.searchParams.set("showinfo", "true");
  url.searchParams.set("holder", input.accountHolder);
  url.searchParams.set("store", "NestScout");
  return {
    paymentCode: input.paymentCode,
    qrImageUrl: url.toString(),
    transferContent: input.paymentCode,
  };
}

export async function confirmCompletionAndCreateManualBankOrder(
  ctx: MobileApiContext,
  jobId: string,
  config: ManualBankConfig | undefined,
): Promise<EdgeCompletionPaymentResponse> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới có thể xác nhận hoàn tất.", 403);
  }
  const settings = requireManualBankSettings(config);
  const client = ctx.supabase as DbClient;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id,status,customer_id,worker_id,final_price",
  });
  const finalPrice = positiveSafeInteger(job.final_price);
  if (finalPrice === null) {
    apiFailure("INVALID_STATUS", "Giá cuối cùng chưa hợp lệ để xác nhận hoàn tất.", 409);
  }

  const instructions = buildManualBankPaymentInstructions({
    accountHolder: settings.accountHolder,
    accountNumber: settings.accountNumber,
    amount: finalPrice,
    bankCode: settings.bankCode,
    paymentCode: createPaymentCode(),
  });
  const requestId = `completion-payment:${jobId}:${ctx.user.id}`;
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_completion_manual_bank_atomic", {
      p_customer_id: ctx.user.id,
      p_expected_final_price: finalPrice,
      p_job_id: jobId,
      p_observed_at: new Date().toISOString(),
      p_payment_code: instructions.paymentCode,
      p_qr_image_url: instructions.qrImageUrl,
      p_request_id: requestId,
      p_transfer_content: instructions.transferContent,
    }),
  );
  const row = result.data?.[0];
  if (result.error?.code === "P0001") {
    const reason = typeof result.error.message === "string" ? result.error.message : "";
    if (reason.includes("CUSTOMER_COMPLETION_EVIDENCE_REQUIRED")) {
      apiFailure("COMPLETION_EVIDENCE_REQUIRED", "Cần bằng chứng hoàn tất trước khi khách xác nhận.", 409);
    }
    if (reason.includes("SYNTHETIC_PAYMENT_PATH_REQUIRED")) {
      apiFailure("AUTH_FORBIDDEN", "Luồng kiểm thử phải dùng cổng thanh toán synthetic riêng.", 403);
    }
    apiFailure("STATUS_CHANGED", "Trạng thái công việc đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Không thể xác nhận hoàn tất và mở lệnh chuyển khoản.", 500);
  }

  const operationId = typeof row.operation_id === "string" ? row.operation_id : null;
  const returnedRequestId = typeof row.request_id === "string" ? row.request_id : null;
  const alreadyApplied = typeof row.already_applied === "boolean" ? row.already_applied : null;
  if (!operationId || returnedRequestId !== requestId || alreadyApplied === null) {
    apiFailure("DB_ERROR", "Biên nhận xác nhận hoàn tất không hợp lệ.", 500);
  }
  const payment = manualBankPaymentResponse(jobId, row);
  if (!alreadyApplied && typeof job.worker_id === "string") {
    await insertUserNotification(client, {
      userId: job.worker_id,
      jobId,
      eventType: "customer_confirmed_completion",
      title: "Khách đã xác nhận hoàn tất",
      body: "Khách đã duyệt bằng chứng hoàn tất. Lệnh chuyển khoản đang chờ đối soát.",
      metadata: { final_price: finalPrice },
    }).catch((error) => {
      console.warn("mobile-api completion notification enqueue failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        jobId,
      });
    });
  }
  return {
    ...payment,
    operation_id: operationId,
    request_id: requestId,
    final_price: finalPrice,
    already_applied: alreadyApplied,
  };
}

export async function createManualBankPaymentOrder(
  ctx: MobileApiContext,
  jobId: string,
  config: ManualBankConfig | undefined,
): Promise<EdgeManualBankPaymentResponse> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới có thể mở lệnh thanh toán.", 403);
  }
  const settings = requireManualBankSettings(config);
  const client = ctx.supabase as DbClient;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id,status,customer_id,worker_id,final_price",
  });
  if (job.status !== "confirmed_by_customer" && job.status !== "payment_pending") {
    apiFailure("INVALID_STATUS", "Công việc chưa sẵn sàng cho bước thanh toán.", 409);
  }
  const grossAmount = positiveSafeInteger(job.final_price);
  if (grossAmount === null) {
    apiFailure("INVALID_STATUS", "Giá cuối cùng chưa hợp lệ để tạo lệnh thanh toán.", 409);
  }
  const instructions = buildManualBankPaymentInstructions({
    accountHolder: settings.accountHolder,
    accountNumber: settings.accountNumber,
    amount: grossAmount,
    bankCode: settings.bankCode,
    paymentCode: createPaymentCode(),
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("create_manual_bank_payment_order", {
      p_customer_id: ctx.user.id,
      p_expected_gross_amount: grossAmount,
      p_job_id: jobId,
      p_payment_code: instructions.paymentCode,
      p_payment_updated_at: new Date().toISOString(),
      p_qr_image_url: instructions.qrImageUrl,
      p_transfer_content: instructions.transferContent,
    }),
  );
  const row = result.data?.[0];
  if (result.error?.code === "P0001") {
    apiFailure("STATUS_CHANGED", "Trạng thái công việc đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Không thể tạo lệnh chuyển khoản cho công việc này.", 500);
  }
  return manualBankPaymentResponse(jobId, row);
}

export async function claimManualBankPayment(
  ctx: MobileApiContext,
  jobId: string,
  input: ManualBankClaimInput,
): Promise<EdgeManualBankClaimResponse> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới có thể báo đã chuyển khoản.", 403);
  }
  const transferredAt = validIsoTimestamp(input.transferred_at);
  if (!transferredAt) {
    apiFailure("VALIDATION", "Thời điểm chuyển khoản không hợp lệ.", 400);
  }
  const sendingBank = normalizeBankCode(input.sending_bank);
  if (input.sending_bank !== undefined && !sendingBank) {
    apiFailure("VALIDATION", "Ngân hàng gửi không hợp lệ.", 400);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    (ctx.supabase as DbClient).rpc("claim_manual_bank_payment", {
      p_customer_id: ctx.user.id,
      p_job_id: jobId,
      p_sending_bank: sendingBank,
      p_transferred_at: transferredAt,
    }),
  );
  const row = result.data?.[0];
  if (result.error?.code === "P0001") {
    apiFailure("STATUS_CHANGED", "Lệnh thanh toán không còn ở trạng thái có thể xác nhận.", 409);
  }
  if (result.error || !row || row.status !== "payment_pending" ||
    typeof row.transfer_claimed_at !== "string") {
    apiFailure("DB_ERROR", "Không thể lưu xác nhận chuyển khoản.", 500);
  }
  const paymentStatus = row.payment_status;
  if (paymentStatus !== "manual_customer_claimed" && paymentStatus !== "manual_reconcile_required") {
    apiFailure("DB_ERROR", "Không thể lưu xác nhận chuyển khoản.", 500);
  }
  if (typeof row.notification_required !== "boolean") {
    apiFailure("DB_ERROR", "Không thể lưu xác nhận chuyển khoản.", 500);
  }
  const recognition = await dbQuery<Array<Record<string, unknown>>>(
    (ctx.supabase as DbClient).rpc("recognize_customer_payment_claim", {
      p_customer_id: ctx.user.id,
      p_job_id: jobId,
    }),
  );
  const recognitionRow = recognition.data?.[0];
  if (recognition.error || !recognitionRow || recognitionRow.ok !== true ||
    (recognitionRow.settlement_state !== "customer_claimed" && recognitionRow.settlement_state !== "admin_verified")) {
    apiFailure("DB_ERROR", "Không thể ghi nhận thu nhập tạm thời cho thợ.", 500);
  }
  const response: EdgeManualBankClaimResponse = {
    job_id: typeof row.job_id === "string" ? row.job_id : jobId,
    payment_status: paymentStatus,
    status: "payment_pending",
    transfer_claimed_at: row.transfer_claimed_at,
    settlement_state: recognitionRow.settlement_state,
    salary_visible: true,
  };
  if (row.notification_required) {
    await notifyFinanceReconciliationRequired(
      ctx.supabase as DbClient,
      response.job_id,
      "customer_transfer_claimed",
    );
  }
  return response;
}

export async function notifyFinanceReconciliationRequired(
  client: DbClient,
  jobId: string,
  reasonCode: "customer_transfer_claimed" | "direct_payment_timeout",
) {
  try {
    const [ownerResult, operatorResult] = await Promise.all([
      dbQuery<Array<Record<string, unknown>>>(
        client.from("profiles").select("id").eq("role", "admin"),
      ),
      dbQuery<Array<Record<string, unknown>>>(
        client
          .from("admin_operator_accounts")
          .select("user_id,capabilities")
          .eq("status", "active"),
      ),
    ]);
    if (ownerResult.error || operatorResult.error) {
      console.warn("mobile-api finance notification recipient lookup failed", { jobId, reasonCode });
      return;
    }
    const operatorIds = (operatorResult.data ?? []).flatMap((row) =>
      hasFinanceReconcileCapability(row.capabilities) && typeof row.user_id === "string"
        ? [row.user_id]
        : []
    );
    const userIds = Array.from(new Set([
      ...(ownerResult.data ?? []).flatMap((row) => typeof row.id === "string" ? [row.id] : []),
      ...operatorIds,
    ]));
    if (userIds.length === 0) return;
    const title = "Cần đối soát thanh toán";
    const body = reasonCode === "direct_payment_timeout"
      ? "Một giao dịch trả trực tiếp cũ chưa có đủ xác nhận trong thời hạn."
      : "Khách hàng đã báo chuyển khoản. Bộ phận vận hành cần đối soát biên nhận trước khi ghi nhận đã thanh toán.";
    await Promise.all(userIds.map((userId) => insertUserNotification(client, {
      userId,
      jobId,
      eventType: "payment_reconciliation_required",
      title,
      body,
      metadata: { reason_code: reasonCode },
    })));
    const push = await sendPushToUsers(client, userIds, {
      title,
      body,
      data: {
        event_type: "payment_reconciliation_required",
        job_id: jobId,
        deep_link: "/(admin)/sections?panel=finance",
      },
      sound: "default",
    });
    if (push.failed > 0) {
      console.warn("mobile-api finance reconciliation push delivery had failures", {
        jobId,
        reasonCode,
        failed: push.failed,
      });
    }
  } catch {
    console.warn("mobile-api finance reconciliation notification failed", { jobId, reasonCode });
  }
}

function manualBankPaymentResponse(
  jobId: string,
  row: Record<string, unknown>,
): EdgeManualBankPaymentResponse {
  const grossAmount = positiveSafeInteger(row.gross_amount);
  const paymentCode = requiredPaymentCode(row.payment_code);
  const transferContent = requiredPaymentCode(row.payment_transfer_content);
  const qrImageUrl = validQrImageUrl(row.payment_qr_image_url, grossAmount, transferContent);
  const paymentStatus = row.payment_status;
  if (
    !grossAmount || !paymentCode || !transferContent || !qrImageUrl ||
    (paymentStatus !== "manual_qr_ready" && paymentStatus !== "manual_customer_claimed" &&
      paymentStatus !== "manual_reconcile_required" && paymentStatus !== "manual_verified") ||
    typeof row.payment_updated_at !== "string" ||
    (row.status !== "payment_pending" && row.status !== "paid" && row.status !== "reviewed")
  ) {
    apiFailure("DB_ERROR", "Dữ liệu lệnh chuyển khoản không hợp lệ.", 500);
  }
  return {
    job_id: typeof row.job_id === "string" ? row.job_id : jobId,
    status: row.status,
    payment: {
      provider: "platform_bank_manual",
      status: paymentStatus,
      gross_amount: grossAmount,
      payment_code: paymentCode,
      transfer_content: transferContent,
      qr_image_url: qrImageUrl,
      updated_at: row.payment_updated_at,
    },
  };
}

function requireManualBankSettings(config: ManualBankConfig | undefined) {
  const bankCode = normalizeBankCode(config?.bankCode);
  const accountNumber = config?.accountNumber?.replace(/\s+/g, "").trim();
  const accountHolder = config?.accountHolder?.trim();
  if (
    !config?.enabled || !bankCode || !accountNumber || !/^[A-Za-z0-9]{1,19}$/.test(accountNumber) ||
    !accountHolder || accountHolder.length > 120
  ) {
    apiFailure("PAYMENT_NOT_ENABLED", "Thanh toán chuyển khoản chưa được bật cho môi trường này.", 409);
  }
  return { accountHolder, accountNumber, bankCode };
}

function createPaymentCode() {
  return `NS${crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
}

function requiredPaymentCode(value: unknown) {
  return typeof value === "string" && PAYMENT_CODE_PATTERN.test(value) ? value : null;
}

function validQrImageUrl(value: unknown, amount: number | null, paymentCode: string | null) {
  if (typeof value !== "string" || !amount || !paymentCode) return null;
  try {
    const url = new URL(value);
    return url.origin === "https://vietqr.app" && url.pathname === "/img" &&
        url.searchParams.getAll("amount").length === 1 && url.searchParams.get("amount") === String(amount) &&
        url.searchParams.getAll("des").length === 1 && url.searchParams.get("des") === paymentCode
      ? value
      : null;
  } catch {
    return null;
  }
}

function positiveSafeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validIsoTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

function normalizeBankCode(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && BANK_CODE_PATTERN.test(normalized) ? normalized : null;
}

function hasFinanceReconcileCapability(value: unknown) {
  return Array.isArray(value) && value.includes("finance.reconcile");
}
