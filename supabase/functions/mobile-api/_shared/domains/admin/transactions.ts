import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  AdminTransactionDetailResponse,
  AdminTransactionListInput,
  AdminTransactionListResponse,
  AdminTransactionSummary,
} from "../contracts/admin-control.ts";
import { asJobStatus, asString, nullableNumber, nullableServiceType, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { displayCodeFor, emptyRows, matchesTransactionQuery, suffixOf, timelineItem } from "./control-formatters.ts";
import { requireAdminCapability } from "./control.ts";

type Row = Record<string, unknown>;

const ADMIN_JOB_SELECT =
  "id,status,service_type,customer_id,worker_id,payment_status,payment_provider,gross_amount,platform_fee,worker_net,payment_updated_at,paid_at,updated_at,created_at,sepay_transaction_id,sepay_reference_code";
const WORKER_PAYMENT_LEDGER_SELECT =
  "created_at,payment_state,available_at,gross_amount,platform_fee,worker_net,commission_level,commission_rate_bps";

export async function listAdminTransactions(
  ctx: MobileApiContext,
  input: AdminTransactionListInput,
): Promise<AdminTransactionListResponse> {
  await requireAdminCapability(ctx, "transactions.read");
  const scanLimit = input.query
    ? Math.min(250, Math.max(50, input.offset + input.limit + 1))
    : input.offset + input.limit + 1;
  let jobsQuery = db(ctx)
    .from("jobs")
    .select(ADMIN_JOB_SELECT, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(input.query ? 0 : input.offset, (input.query ? 0 : input.offset) + scanLimit - 1);
  if (input.payment_status !== "all") jobsQuery = jobsQuery.eq("payment_status", input.payment_status);
  const result = await dbQuery<Row[]>(jobsQuery);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải danh sách giao dịch", 500);
  const summaries = await buildTransactionSummaries(ctx, result.data ?? []);
  const filtered = input.query
    ? summaries.filter((summary) => matchesTransactionQuery(summary, input.query))
    : summaries;
  const page = input.query
    ? filtered.slice(input.offset, input.offset + input.limit + 1)
    : filtered;
  const hasMore = page.length > input.limit;
  const transactions = page.slice(0, input.limit);
  return {
    transactions,
    has_more: hasMore,
    next_offset: hasMore ? input.offset + transactions.length : null,
    total_count: input.query ? null : nonNegativeInteger(result.count),
  };
}

export async function getAdminTransaction(
  ctx: MobileApiContext,
  jobId: string,
): Promise<AdminTransactionDetailResponse> {
  await requireAdminCapability(ctx, "transactions.read");
  const result = await dbQuery<Row>(
    db(ctx).from("jobs").select(ADMIN_JOB_SELECT).eq("id", jobId).maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải giao dịch", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy giao dịch", 404);
  const [transaction] = await buildTransactionSummaries(ctx, [result.data]);
  if (!transaction) apiFailure("NOT_FOUND", "Không tìm thấy dữ liệu giao dịch", 404);

  const [disputeResult, ledgerResult] = await Promise.all([
    dbQuery<Row>(
      db(ctx)
        .from("disputes")
        .select("status,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
    dbQuery<Row>(
      db(ctx)
        .from("worker_payment_ledger")
        .select(WORKER_PAYMENT_LEDGER_SELECT)
        .eq("job_id", jobId)
        .maybeSingle(),
    ),
  ]);
  if (disputeResult.error || ledgerResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chi tiết giao dịch", 500);
  }
  const ledger = serializeWorkerPaymentLedger(ledgerResult.data, result.data);

  return {
    transaction,
    timeline: buildTransactionTimeline(result.data, ledgerResult.data, disputeResult.data),
    ledger,
  };
}

async function buildTransactionSummaries(
  ctx: MobileApiContext,
  jobRows: Row[],
): Promise<AdminTransactionSummary[]> {
  const jobIds = uniqueStrings(jobRows.map((row) => nullableString(row.id)));
  const profileIds = uniqueStrings(jobRows.flatMap((row) => [
    nullableString(row.customer_id),
    nullableString(row.worker_id),
  ]));
  const client = db(ctx);
  const [profiles, disputes] = await Promise.all([
    profileIds.length
      ? dbQuery<Row[]>(client.from("profiles").select("id,full_name").in("id", profileIds))
      : emptyRows(),
    jobIds.length
      ? dbQuery<Row[]>(client.from("disputes").select("job_id,status,created_at").in("job_id", jobIds).order("created_at", { ascending: false }))
      : emptyRows(),
  ]);
  if (profiles.error || disputes.error) {
    apiFailure("DB_ERROR", "Không thể tải dữ liệu giao dịch", 500);
  }
  const profileById = indexById(profiles.data ?? []);
  const disputeByJobId = new Map<string, Row>();
  for (const dispute of disputes.data ?? []) {
    const id = nullableString(dispute.job_id);
    if (id && !disputeByJobId.has(id)) disputeByJobId.set(id, dispute);
  }
  return jobRows.flatMap((row) => {
    const serviceType = nullableServiceType(row.service_type);
    const jobId = nullableString(row.id);
    if (!serviceType || !jobId) return [];
    const customer = profileById.get(nullableString(row.customer_id) ?? "");
    const worker = profileById.get(nullableString(row.worker_id) ?? "");
    const dispute = disputeByJobId.get(jobId);
    return [{
      job_id: jobId,
      display_code: displayCodeFor(jobId),
      service_type: serviceType,
      status: asJobStatus(row.status),
      payment_status: nullableString(row.payment_status),
      payment_provider: nullableString(row.payment_provider),
      gross_amount: nullableNumber(row.gross_amount),
      platform_fee: nullableNumber(row.platform_fee),
      worker_net: nullableNumber(row.worker_net),
      customer_name: nullableString(customer?.full_name),
      worker_name: nullableString(worker?.full_name),
      dispute_status: nullableString(dispute?.status),
      updated_at: asString(row.updated_at),
      paid_at: nullableString(row.paid_at),
    } satisfies AdminTransactionSummary];
  });
}

function buildTransactionTimeline(
  job: Row,
  ledger: Row | null,
  dispute: Row | null,
): AdminTransactionDetailResponse["timeline"] {
  return [
    timelineItem("created", nullableString(job.created_at)),
    timelineItem("payment_updated", nullableString(job.payment_updated_at)),
    timelineItem("paid", nullableString(job.paid_at)),
    timelineItem("ledger_recorded", nullableString(ledger?.created_at)),
    timelineItem("dispute_opened", nullableString(dispute?.created_at)),
  ]
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
}

function serializeWorkerPaymentLedger(
  ledger: Row | null,
  job: Row,
): AdminTransactionDetailResponse["ledger"] {
  if (!ledger) return null;

  const createdAt = nullableString(ledger.created_at);
  const grossAmount = nullableNumber(ledger.gross_amount);
  const platformFee = nullableNumber(ledger.platform_fee);
  const workerNet = nullableNumber(ledger.worker_net);
  const commissionLevel = nullableNumber(ledger.commission_level);
  const commissionRateBps = nullableNumber(ledger.commission_rate_bps);
  if (
    !createdAt ||
    grossAmount === null ||
    platformFee === null ||
    workerNet === null ||
    commissionLevel === null ||
    commissionRateBps === null
  ) {
    apiFailure("DB_ERROR", "Sổ cái thanh toán của thợ không hợp lệ", 500);
  }

  return {
    created_at: createdAt,
    payment_state: nullableString(ledger.payment_state),
    available_at: nullableString(ledger.available_at),
    gross_amount: grossAmount,
    platform_fee: platformFee,
    worker_net: workerNet,
    commission_level: commissionLevel,
    commission_rate_bps: commissionRateBps,
    sepay_transaction_suffix: suffixOf(job.sepay_transaction_id),
    sepay_reference_suffix: suffixOf(job.sepay_reference_code),
  };
}

function nonNegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function indexById(rows: Row[], key = "id") {
  const values = new Map<string, Row>();
  for (const row of rows) {
    const id = nullableString(row[key]);
    if (id) values.set(id, row);
  }
  return values;
}
