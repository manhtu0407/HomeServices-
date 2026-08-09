import type { SePayVietQrConfig } from "../../../../_shared/platform/env.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { type JobStatus } from "../../../../_shared/domain.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import type { EdgeStagingPaymentResponse } from "./staging.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";

export type SePayWebhookSignatureInput = {
  nowMs?: number;
  rawBody: string;
  secret: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
};

export type SePayVietQrPaymentInstructionsInput = {
  accountHolder: string;
  accountNumber: string;
  amount: number;
  bankCode: string;
  paymentCode: string;
};

export type SePayVietQrWebhookPayload = {
  amount: number;
  paymentCode: string;
  referenceCode: string | null;
  transactionId: string;
};

export type SePayVietQrWebhookInput = {
  nowMs?: number;
  rawBody: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
};

export type SePayVietQrWebhookResult = {
  outcome:
    | "amount_mismatch"
    | "duplicate"
    | "ignored"
    | "paid"
    | "transaction_conflict";
};

export type EdgeSePayVietQrPaymentResponse = {
  job_id: string;
  status: JobStatus;
  payment: {
    provider: "sepay_vietqr";
    status: "vietqr_ready";
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number;
    commission_rate_bps: number;
    payment_code: string;
    transfer_content: string;
    qr_image_url: string;
    expires_at: null;
    received_at: string | null;
    amount_received: number | null;
    updated_at: string;
  };
};

export type EdgePaymentIntentResponse =
  | EdgeSePayVietQrPaymentResponse
  | EdgeStagingPaymentResponse;

export class SePayWebhookFailure extends Error {
  constructor(
    public readonly code: "INVALID_PAYLOAD" | "INVALID_SIGNATURE" | "PAYMENT_NOT_ENABLED" | "PROCESSING_FAILED",
    public readonly status: 400 | 401 | 409 | 500,
  ) {
    super(code);
    this.name = "SePayWebhookFailure";
  }
}

const SEPAY_SIGNATURE_PREFIX = "sha256=";
const SEPAY_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const NESTSCOUT_PAYMENT_CODE_PATTERN = /^NS[A-Z0-9]{24}$/;
const PAYMENT_SELECT =
  "id, status, customer_id, final_price, payment_provider, payment_status, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, worker_commission_level, worker_commission_rate_bps, payment_updated_at";
const encoder = new TextEncoder();

type SePayPaymentRow = Record<string, unknown> & {
  customer_id: string;
  id: string;
  status: JobStatus;
};

export function buildSePayVietQrPaymentInstructions(
  input: SePayVietQrPaymentInstructionsInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new RangeError("amount must be a positive safe integer");
  }
  if (!NESTSCOUT_PAYMENT_CODE_PATTERN.test(input.paymentCode)) {
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

export function parseSePayVietQrWebhookPayload(
  value: unknown,
  merchantAccountNumber: string,
): SePayVietQrWebhookPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const accountNumber = normalizeAccountNumber(payload.accountNumber);
  const expectedAccountNumber = normalizeAccountNumber(merchantAccountNumber);
  if (
    payload.transferType !== "in" ||
    !accountNumber ||
    !expectedAccountNumber ||
    accountNumber !== expectedAccountNumber
  ) {
    return null;
  }

  const paymentCode = typeof payload.code === "string"
    ? payload.code.trim().toUpperCase()
    : "";
  const transactionId = parseTransactionId(payload.id);
  const amount = parseAmount(payload.transferAmount);
  if (!NESTSCOUT_PAYMENT_CODE_PATTERN.test(paymentCode) || !transactionId || amount === null) {
    return null;
  }

  return {
    amount,
    paymentCode,
    referenceCode: parseReferenceCode(payload.referenceCode),
    transactionId,
  };
}

export async function createSePayVietQrPaymentIntent(
  ctx: MobileApiContext,
  jobId: string,
  config: SePayVietQrConfig | undefined,
): Promise<EdgeSePayVietQrPaymentResponse> {
  const settings = requirePaymentSettings(config);
  const client = ctx.supabase as DbClient;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: PAYMENT_SELECT,
  }) as SePayPaymentRow;

  if (job.status === "payment_pending") {
    assertVietQrPendingPayment(job);
    return sepayPaymentResponse(jobId, job.status, job);
  }
  if (job.status !== "confirmed_by_customer") {
    apiFailure("INVALID_STATUS", "Công việc chưa sẵn sàng cho bước thanh toán.", 409);
  }
  const transition = validateWorkflowTransition({
    event: "kael_decided_payment",
    from: job.status,
    to: "payment_pending",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const grossAmount = nullableNumber(job.final_price);
  if (!grossAmount || grossAmount <= 0 || !Number.isSafeInteger(grossAmount)) {
    apiFailure("INVALID_STATUS", "Giá cuối cùng chưa hợp lệ để tạo thanh toán.", 409);
  }
  const paymentCode = createPaymentCode();
  const instructions = buildSePayVietQrPaymentInstructions({
    accountHolder: settings.accountHolder,
    accountNumber: settings.accountNumber,
    amount: grossAmount,
    bankCode: settings.bankCode,
    paymentCode,
  });
  const intent = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("create_worker_vietqr_payment_intent", {
      p_customer_id: ctx.user.id,
      p_expected_gross_amount: grossAmount,
      p_job_id: jobId,
      p_payment_code: instructions.paymentCode,
      p_payment_updated_at: new Date().toISOString(),
      p_qr_image_url: instructions.qrImageUrl,
      p_transfer_content: instructions.transferContent,
    }),
  );
  const created = intent.data?.[0];
  if (intent.error || !created) {
    if (intent.error?.code === "P0001") {
      apiFailure("STATUS_CHANGED", "Trạng thái công việc đã thay đổi.", 409);
    }
    apiFailure("DB_ERROR", "Không thể tạo thanh toán VietQR.", 500);
  }
  return sepayPaymentResponse(jobId, "payment_pending", {
    ...job,
    gross_amount: created.gross_amount,
    payment_code: created.payment_code,
    payment_qr_image_url: created.qr_image_url,
    payment_received_at: null,
    payment_status: "vietqr_ready",
    payment_transfer_content: created.transfer_content,
    payment_updated_at: created.payment_updated_at,
    platform_fee: created.platform_fee,
    worker_commission_level: created.commission_level,
    worker_commission_rate_bps: created.commission_rate_bps,
    worker_net: created.worker_net,
  });
}

export async function receiveSePayVietQrWebhook(
  client: DbClient,
  config: SePayVietQrConfig,
  input: SePayVietQrWebhookInput,
): Promise<SePayVietQrWebhookResult> {
  const settings = requireWebhookSettings(config);
  const signatureValid = await verifySePayWebhookSignature({
    nowMs: input.nowMs,
    rawBody: input.rawBody,
    secret: settings.webhookSecret,
    signature: input.signature,
    timestamp: input.timestamp,
  });
  if (!signatureValid) {
    throw new SePayWebhookFailure("INVALID_SIGNATURE", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(input.rawBody) as unknown;
  } catch {
    throw new SePayWebhookFailure("INVALID_PAYLOAD", 400);
  }
  const payment = parseSePayVietQrWebhookPayload(body, settings.accountNumber);
  if (!payment) return { outcome: "ignored" };

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("apply_sepay_vietqr_payment_webhook", {
      p_payment_code: payment.paymentCode,
      p_reference_code: payment.referenceCode,
      p_transaction_id: payment.transactionId,
      p_transfer_amount: payment.amount,
    }),
  );
  if (result.error) {
    throw new SePayWebhookFailure("PROCESSING_FAILED", 500);
  }
  const row = result.data?.[0];
  const outcome = row?.outcome;
  if (row?.ok !== true || !isWebhookOutcome(outcome)) {
    throw new SePayWebhookFailure("PROCESSING_FAILED", 500);
  }
  return { outcome };
}

export async function verifySePayWebhookSignature(
  input: SePayWebhookSignatureInput,
): Promise<boolean> {
  const timestampSeconds = parseTimestamp(input.timestamp);
  const signature = input.signature?.trim().toLowerCase();
  if (
    timestampSeconds === null ||
    !signature ||
    !signature.startsWith(SEPAY_SIGNATURE_PREFIX) ||
    !/^[a-f0-9]{64}$/.test(signature.slice(SEPAY_SIGNATURE_PREFIX.length))
  ) {
    return false;
  }

  const nowMs = input.nowMs ?? Date.now();
  if (Math.abs(nowMs - timestampSeconds * 1000) > SEPAY_TIMESTAMP_TOLERANCE_MS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestampSeconds}.${input.rawBody}`),
  );
  const expected = `${SEPAY_SIGNATURE_PREFIX}${toHex(signatureBytes)}`;
  return constantTimeEquals(expected, signature);
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireWebhookSettings(config: SePayVietQrConfig) {
  if (
    !config.accountNumber ||
    !config.webhookSecret
  ) {
    throw new SePayWebhookFailure("PAYMENT_NOT_ENABLED", 409);
  }
  return {
    accountNumber: config.accountNumber,
    webhookSecret: config.webhookSecret,
  };
}

function requirePaymentSettings(config: SePayVietQrConfig | undefined) {
  if (
    !config?.enabled ||
    !config.accountHolder ||
    !config.accountNumber ||
    !config.bankCode ||
    !config.webhookSecret
  ) {
    apiFailure("PAYMENT_NOT_ENABLED", "Thanh toán chưa được bật cho môi trường này.", 409);
  }
  return {
    accountHolder: config.accountHolder,
    accountNumber: config.accountNumber,
    bankCode: config.bankCode,
  };
}

function createPaymentCode(): string {
  return `NS${crypto.randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`;
}

function assertVietQrPendingPayment(job: Record<string, unknown>) {
  if (
    nullableString(job.payment_provider) !== "sepay_vietqr" ||
    nullableString(job.payment_status) !== "vietqr_ready"
  ) {
    apiFailure("PAYMENT_PROVIDER_MISMATCH", "Công việc không dùng phương thức thanh toán này.", 409);
  }
}

function sepayPaymentResponse(
  jobId: string,
  status: JobStatus,
  row: Record<string, unknown>,
): EdgeSePayVietQrPaymentResponse {
  const grossAmount = nullableNumber(row.gross_amount) ?? nullableNumber(row.final_price);
  const paymentCode = nullableString(row.payment_code);
  const transferContent = nullableString(row.payment_transfer_content);
  const qrImageUrl = nullableString(row.payment_qr_image_url);
  if (
    grossAmount === null ||
    grossAmount <= 0 ||
    !paymentCode ||
    !transferContent ||
    !qrImageUrl
  ) {
    apiFailure("DB_ERROR", "Dữ liệu thanh toán VietQR không hợp lệ.", 500);
  }
  const platformFee = nullableNumber(row.platform_fee);
  const workerNet = nullableNumber(row.worker_net);
  const commissionLevel = nullableNumber(row.worker_commission_level);
  const commissionRateBps = nullableNumber(row.worker_commission_rate_bps);
  if (
    platformFee === null ||
    workerNet === null ||
    commissionLevel === null ||
    commissionRateBps === null
  ) {
    apiFailure("DB_ERROR", "Dữ liệu hoa hồng VietQR không hợp lệ.", 500);
  }
  return {
    job_id: jobId,
    status,
    payment: {
      provider: "sepay_vietqr",
      status: "vietqr_ready",
      gross_amount: grossAmount,
      platform_fee: platformFee,
      worker_net: workerNet,
      commission_level: commissionLevel,
      commission_rate_bps: commissionRateBps,
      payment_code: paymentCode,
      transfer_content: transferContent,
      qr_image_url: qrImageUrl,
      expires_at: null,
      received_at: nullableString(row.payment_received_at),
      amount_received: nullableNumber(row.payment_amount_received),
      updated_at: nullableString(row.payment_updated_at) ?? new Date().toISOString(),
    },
  };
}

function isWebhookOutcome(value: unknown): value is SePayVietQrWebhookResult["outcome"] {
  return value === "amount_mismatch" ||
    value === "duplicate" ||
    value === "ignored" ||
    value === "paid" ||
    value === "transaction_conflict";
}

function normalizeAccountNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, "").trim();
  return /^[A-Za-z0-9]{1,19}$/.test(normalized) ? normalized : null;
}

function parseTransactionId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{1,30}$/.test(normalized) ? normalized : null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function parseReferenceCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 120 ? normalized : null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
