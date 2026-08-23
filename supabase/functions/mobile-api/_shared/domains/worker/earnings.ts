import { nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";
import type { EdgeEarningsResponse } from "../contracts/broadcast.ts";
import { requireRealTrafficActor } from "../../platform/synthetic-cohort.ts";

export async function getWorkerEarnings(
  ctx: MobileApiContext,
  range: { from?: string; to?: string },
): Promise<EdgeEarningsResponse> {
  await requireRealTrafficActor(db(ctx), ctx.user.id, "worker");
  const [result, safetyResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      db(ctx).rpc("get_worker_earnings_summary_v2", {
        p_worker_id: ctx.user.id,
        p_from: range.from ?? null,
        p_to: range.to ?? null,
      }),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      db(ctx).rpc("get_worker_payment_safety_balance", { p_worker_id: ctx.user.id }),
    ),
  ]);
  const row = result.data?.[0];
  const safetyRow = safetyResult.data?.[0];
  if (result.error || safetyResult.error || !row || !safetyRow) {
    console.warn("mobile-api earnings query failed", {
      errorCode: result.error?.code,
      safetyErrorCode: safetyResult.error?.code,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }
  let aggregate: ReturnType<typeof parseWorkerEarningsAggregate>;
  try {
    aggregate = parseWorkerEarningsAggregate(row, ctx.user.id, parseWorkerPaymentSafetyBalance(safetyRow));
  } catch {
    console.warn("mobile-api earnings aggregate response invalid", {
      userId: ctx.user.id,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }

  return {
    worker_id: ctx.user.id,
    ...aggregate,
    from_date: range.from ?? null,
    to_date: range.to ?? null,
  };
}

const MAX_DAILY_EARNINGS_ROWS = 366;

function parseWorkerEarningsAggregate(
  row: Record<string, unknown>,
  expectedWorkerId: string,
  paymentSafety: WorkerPaymentSafetyBalance,
): Omit<EdgeEarningsResponse, "worker_id" | "from_date" | "to_date"> {
  if (row.worker_id !== expectedWorkerId) {
    throw new Error("INVALID_EARNINGS_OWNER");
  }
  return {
    total_jobs_paid: nonnegativeSafeInteger(row.total_jobs_paid),
    gross_earnings: nonnegativeSafeInteger(row.gross_earnings),
    platform_fee_total: nonnegativeSafeInteger(row.platform_fee_total),
    net_earnings: nonnegativeSafeInteger(row.net_earnings),
    available_balance: paymentSafety.available_balance,
    withdrawal_reserved_amount: paymentSafety.withdrawal_reserved_amount,
    withdrawn_total: paymentSafety.withdrawn_total,
    collateral_reserved_amount: paymentSafety.collateral_reserved_amount,
    cash_commission_collected_total: nonnegativeSafeInteger(row.cash_commission_collected_total),
    cash_commission_due_total: nonnegativeSafeInteger(row.cash_commission_due_total),
    pending_payment_count: nonnegativeSafeInteger(row.pending_payment_count),
    pending_payment_amount: nonnegativeSafeInteger(row.pending_payment_amount),
    provisional_payment_count: nonnegativeSafeInteger(row.provisional_payment_count),
    provisional_payment_amount: nonnegativeSafeInteger(row.provisional_payment_amount),
    on_hold_amount: nonnegativeSafeInteger(row.on_hold_amount),
    current_commission_level: positiveSafeInteger(row.current_commission_level),
    current_commission_rate_bps: commissionRateBps(row.current_commission_rate_bps),
    withdrawal_eligible_at: row.withdrawal_eligible_at === null
      ? null
      : normalizeIsoTimestamp(nullableString(row.withdrawal_eligible_at) ?? ""),
    recent_transactions: parseRecentWorkerTransactions(row.recent_transactions),
    daily_earnings: parseDailyEarnings(row.daily_earnings),
  };
}

type WorkerPaymentSafetyBalance = Pick<
  EdgeEarningsResponse,
  "available_balance" | "withdrawal_reserved_amount" | "withdrawn_total" | "collateral_reserved_amount"
>;

function parseWorkerPaymentSafetyBalance(row: Record<string, unknown>): WorkerPaymentSafetyBalance {
  return {
    available_balance: nonnegativeSafeInteger(row.available_balance),
    withdrawal_reserved_amount: nonnegativeSafeInteger(row.withdrawal_reserved_amount),
    withdrawn_total: nonnegativeSafeInteger(row.withdrawn_total),
    collateral_reserved_amount: nonnegativeSafeInteger(row.collateral_reserved_amount),
  };
}

const MAX_RECENT_WORKER_TRANSACTIONS = 20;

function parseRecentWorkerTransactions(
  value: unknown,
): EdgeEarningsResponse["recent_transactions"] {
  if (!Array.isArray(value) || value.length > MAX_RECENT_WORKER_TRANSACTIONS) {
    throw new Error("INVALID_RECENT_TRANSACTIONS");
  }

  let previousRecordedAt: string | null = null;
  return value.map((entry) => {
    if (!isRecord(entry) || !isWorkerLedgerEntryType(entry.entry_type) || !isWorkerPaymentState(entry.payment_state)) {
      throw new Error("INVALID_RECENT_TRANSACTIONS");
    }
    const jobId = nullableString(entry.job_id);
    const recordedAt = nullableString(entry.recorded_at);
    const availableAt = nullableString(entry.available_at);
    const normalizedRecordedAt = recordedAt ? normalizeIsoTimestamp(recordedAt) : null;
    const normalizedAvailableAt = availableAt ? normalizeIsoTimestamp(availableAt) : null;
    if (
      !jobId ||
      !normalizedRecordedAt ||
      (availableAt !== null && normalizedAvailableAt === null) ||
      (previousRecordedAt !== null && normalizedRecordedAt > previousRecordedAt)
    ) {
      throw new Error("INVALID_RECENT_TRANSACTIONS");
    }
    previousRecordedAt = normalizedRecordedAt;

    return {
      job_id: jobId,
      display_code: nullableString(entry.display_code),
      entry_type: entry.entry_type,
      payment_state: entry.payment_state,
      settlement_state: settlementState(entry.settlement_state),
      gross_amount: nonnegativeSafeInteger(entry.gross_amount),
      platform_fee: nonnegativeSafeInteger(entry.platform_fee),
      worker_net: positiveSafeInteger(entry.worker_net),
      commission_level: positiveSafeInteger(entry.commission_level),
      commission_rate_bps: commissionRateBps(entry.commission_rate_bps),
      cash_commission_collected: nonnegativeSafeInteger(entry.cash_commission_collected),
      cash_commission_due: nonnegativeSafeInteger(entry.cash_commission_due),
      recorded_at: normalizedRecordedAt,
      available_at: normalizedAvailableAt,
    };
  });
}

function isWorkerPaymentState(
  value: unknown,
): value is EdgeEarningsResponse["recent_transactions"][number]["payment_state"] {
  return value === "pending" || value === "available" || value === "on_hold" || value === "reversed" || value === "cash_collected" || value === "cash_reconciliation_due";
}

function settlementState(value: unknown): EdgeEarningsResponse["recent_transactions"][number]["settlement_state"] {
  if (value === "pending" || value === "customer_claimed" || value === "admin_verified" || value === "admin_rejected") {
    return value;
  }
  throw new Error("INVALID_RECENT_TRANSACTIONS");
}

function isWorkerLedgerEntryType(
  value: unknown,
): value is EdgeEarningsResponse["recent_transactions"][number]["entry_type"] {
  return value === "worker_credit" || value === "cash_commission_debit";
}

function parseDailyEarnings(
  value: unknown,
): EdgeEarningsResponse["daily_earnings"] {
  if (!Array.isArray(value) || value.length > MAX_DAILY_EARNINGS_ROWS) {
    throw new Error("INVALID_DAILY_EARNINGS");
  }

  let previousDate: string | null = null;
  return value.map((entry) => {
    if (!isRecord(entry) || !isIsoDate(entry.date)) {
      throw new Error("INVALID_DAILY_EARNINGS");
    }
    if (previousDate !== null && entry.date >= previousDate) {
      throw new Error("INVALID_DAILY_EARNINGS");
    }
    previousDate = entry.date;

    return {
      date: entry.date,
      gross_earnings: nonnegativeSafeInteger(entry.gross_earnings),
      platform_fee_total: nonnegativeSafeInteger(entry.platform_fee_total),
      net_earnings: nonnegativeSafeInteger(entry.net_earnings),
      paid_job_count: nonnegativeSafeInteger(entry.paid_job_count),
    };
  });
}

function nonnegativeSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("INVALID_EARNINGS_AGGREGATE");
  }
  return value;
}

function positiveSafeInteger(value: unknown): number {
  const parsed = nonnegativeSafeInteger(value);
  if (parsed <= 0) throw new Error("INVALID_EARNINGS_AGGREGATE");
  return parsed;
}

function commissionRateBps(value: unknown): number {
  const parsed = nonnegativeSafeInteger(value);
  if (parsed > 1500) throw new Error("INVALID_EARNINGS_AGGREGATE");
  return parsed;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
