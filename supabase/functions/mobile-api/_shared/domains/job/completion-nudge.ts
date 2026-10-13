// A customer's reminder to the worker to report the job done. The reminder never moves the job: the
// worker alone reports completion. The limits and the writes live in the database functions
// completion_nudge_state and nudge_worker_completion_atomic; this module binds the caller, maps a
// refusal to a Vietnamese answer and sends the push after the commit.

import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { nullableString } from "../../platform/coercions.ts";
import { pushWorkerCompletionNudge } from "../notification/notifications-job.ts";
import type { EdgeCompletionNudgeState } from "../contracts/job-detail.ts";

export type EdgeCompletionNudgeResponse = EdgeCompletionNudgeState & {
  job_id: string;
  nudged: true;
};

const REFUSALS: Record<string, { code: string; message: string; status: number }> = {
  INVALID_STATUS: {
    code: "INVALID_STATUS",
    message: "Chỉ nhắc được khi thợ đang thực hiện công việc.",
    status: 409,
  },
  LIMIT_REACHED: {
    code: "NUDGE_LIMIT_REACHED",
    message: "Bạn đã nhắc thợ đủ số lần cho công việc này.",
    status: 409,
  },
  NO_WORKER: {
    code: "INVALID_STATUS",
    message: "Công việc chưa có thợ để nhắc.",
    status: 409,
  },
  TOO_EARLY: {
    code: "NUDGE_TOO_EARLY",
    message: "Thợ mới bắt đầu làm. Bạn có thể nhắc sau khi thợ làm được một lúc.",
    status: 409,
  },
  COOLDOWN: {
    code: "NUDGE_COOLDOWN",
    message: "Bạn vừa nhắc thợ. Vui lòng chờ một lúc rồi nhắc lại.",
    status: 409,
  },
  WORK_PAUSED: {
    code: "NUDGE_WORK_PAUSED",
    message: "Thợ đang tạm dừng công việc nên chưa thể nhắc.",
    status: 409,
  },
};

function stateFromRow(row: Record<string, unknown>): EdgeCompletionNudgeState {
  const reason = nullableString(row.reason);
  return {
    can_nudge: row.can_nudge === true,
    reason: reason as EdgeCompletionNudgeState["reason"],
    used: typeof row.used === "number" ? row.used : 0,
    max_allowed: typeof row.max_allowed === "number" ? row.max_allowed : 0,
    last_nudged_at: nullableString(row.last_nudged_at),
    next_available_at: nullableString(row.next_available_at),
  };
}

// The state the job read shows beside the repair. A failure is logged and answered with null, so a
// reminder that cannot be read never takes the job detail down with it.
export async function readCompletionNudgeState(
  client: DbClient,
  jobId: string,
): Promise<EdgeCompletionNudgeState | null> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("completion_nudge_state", { p_job_id: jobId }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    console.warn("mobile-api completion nudge state unavailable", { jobId });
    return null;
  }
  return stateFromRow(row);
}

export async function nudgeWorkerCompletion(
  ctx: MobileApiContext,
  jobId: string,
): Promise<EdgeCompletionNudgeResponse> {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới có thể nhắc thợ báo hoàn tất.", 403);
  }
  const client = ctx.supabase as DbClient;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id,status,customer_id,worker_id",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("nudge_worker_completion_atomic", {
      p_customer_id: ctx.user.id,
      p_job_id: jobId,
    }),
  );
  if (result.error?.code === "P0001") {
    apiFailure("JOB_NOT_FOUND", "Không tìm thấy công việc.", 404);
  }
  const row = result.data?.[0];
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Không thể gửi lời nhắc lúc này.", 500);
  }
  if (row.ok !== true) {
    const refusal = REFUSALS[nullableString(row.reason) ?? ""];
    if (!refusal) apiFailure("DB_ERROR", "Không thể gửi lời nhắc lúc này.", 500);
    apiFailure(refusal.code, refusal.message, refusal.status, {
      completion_nudge: {
        reason: nullableString(row.reason),
        used: typeof row.used === "number" ? row.used : 0,
        max_allowed: typeof row.max_allowed === "number" ? row.max_allowed : 0,
        last_nudged_at: nullableString(row.last_nudged_at),
        next_available_at: nullableString(row.next_available_at),
      },
    });
  }

  const workerId = nullableString(row.worker_id) ?? nullableString(job.worker_id);
  if (workerId) {
    await pushWorkerCompletionNudge(client, jobId, workerId).catch((error) => {
      console.warn("mobile-api completion nudge push failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        jobId,
      });
    });
  }
  return {
    job_id: jobId,
    nudged: true,
    can_nudge: false,
    reason: row.next_available_at ? "COOLDOWN" : "LIMIT_REACHED",
    used: typeof row.used === "number" ? row.used : 0,
    max_allowed: typeof row.max_allowed === "number" ? row.max_allowed : 0,
    last_nudged_at: nullableString(row.last_nudged_at),
    next_available_at: nullableString(row.next_available_at),
  };
}
