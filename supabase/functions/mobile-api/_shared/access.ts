import type { JobStatus, UserRole } from "../../_shared/domain.ts";
import { JOB_STATUSES } from "../../_shared/domain.ts";
import { apiFailure, type MobileApiContext } from "./router.ts";

type DbError = { code?: string; message?: string };
type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  count?: number | null;
};
type QueryLike = PromiseLike<DbResult<unknown>>;

export type JobAccessRecord = Record<string, unknown> & {
  id: string;
  status: JobStatus;
  customer_id: string | null;
  worker_id: string | null;
};

export type JobAccessDbClient = {
  from(table: string): JobAccessChain;
};

type JobAccessChain = {
  select(columns?: string, options?: unknown): JobAccessChain;
  eq(column: string, value: unknown): JobAccessChain;
  single(): QueryLike;
};

export type JobAccessOptions = {
  requiredRole?: UserRole;
  statuses?: readonly JobStatus[];
  select?: string;
};

const DEFAULT_JOB_ACCESS_SELECT = "id, status, customer_id, worker_id";

export async function requireJobAccess(
  client: JobAccessDbClient,
  jobId: string,
  ctx: MobileApiContext,
  options: JobAccessOptions = {},
): Promise<JobAccessRecord> {
  if (options.requiredRole && ctx.role !== options.requiredRole) {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }

  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(options.select ?? DEFAULT_JOB_ACCESS_SELECT)
      .eq("id", jobId)
      .single() as QueryLike,
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }

  const job = normalizeJobAccessRecord(result.data);
  if (ctx.role === "customer" && job.customer_id !== ctx.user.id) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (ctx.role === "worker" && job.worker_id !== ctx.user.id) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }

  if (options.statuses && !options.statuses.includes(job.status)) {
    apiFailure(
      "INVALID_STATUS",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }

  return job;
}

function normalizeJobAccessRecord(row: Record<string, unknown>): JobAccessRecord {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) apiFailure("DB_ERROR", "Dữ liệu yêu cầu không hợp lệ", 500);
  return {
    ...row,
    id,
    status: asJobStatus(row.status),
    customer_id: nullableString(row.customer_id),
    worker_id: nullableString(row.worker_id),
  };
}

function asJobStatus(value: unknown): JobStatus {
  if (
    typeof value === "string" &&
    (JOB_STATUSES as readonly string[]).includes(value)
  ) {
    return value as JobStatus;
  }
  apiFailure("DB_ERROR", "Dữ liệu trạng thái yêu cầu không hợp lệ", 500);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function dbQuery<T = unknown>(
  promise: QueryLike,
  ms = 10_000,
): Promise<DbResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]) as DbResult<T>;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
