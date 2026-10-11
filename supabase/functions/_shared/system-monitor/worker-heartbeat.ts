export const SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS = 5_000;

export type SystemMonitorHeartbeatQuery = PromiseLike<{ error: unknown }> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<{ error: unknown }>;
};

export type SystemMonitorHeartbeatClient = {
  rpc(name: string, args: Record<string, unknown>): SystemMonitorHeartbeatQuery;
};

export async function recordSystemMonitorWorkerCompletion(input: {
  readonly client: SystemMonitorHeartbeatClient;
  readonly jobName: "system-health-monitor" | "kael-matching-maintainer" | "payment-maintainer" | "kael-learning-monitor";
  readonly executionId: string;
  readonly startedAtMs: number;
  readonly completionStatus: "succeeded" | "failed";
  readonly reasonCode?: string;
  readonly releaseId?: string | null;
}) {
  const finishedAt = new Date().toISOString();
  const startedAt = Number.isFinite(input.startedAtMs)
    ? new Date(input.startedAtMs).toISOString()
    : finishedAt;
  const reasonCode = input.reasonCode && /^[A-Z][A-Z0-9_]{0,63}$/u.test(input.reasonCode)
    ? input.reasonCode
    : null;
  const releaseId = typeof input.releaseId === "string" && /^[A-Za-z0-9._:+-]{1,100}$/u.test(input.releaseId)
    ? input.releaseId
    : null;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("worker heartbeat timeout"));
    }, SYSTEM_MONITOR_WORKER_HEARTBEAT_TIMEOUT_MS);
  });

  try {
    const rpcQuery = input.client.rpc("record_system_monitor_worker_heartbeat", {
      p_job_name: input.jobName,
      p_execution_id: input.executionId,
      p_started_at: startedAt,
      p_finished_at: finishedAt,
      p_completion_status: input.completionStatus,
      p_reason_code: reasonCode,
      p_release_id: releaseId,
    });
    if (typeof rpcQuery.abortSignal !== "function") {
      console.warn("system monitor worker heartbeat failed", {
        job_name: input.jobName,
        reason_code: "HEARTBEAT_ABORT_UNAVAILABLE",
      });
      return false;
    }

    const query = rpcQuery.abortSignal(controller.signal);
    const result = await Promise.race([Promise.resolve(query), timeout]);
    if (result.error) {
      console.warn("system monitor worker heartbeat failed", {
        job_name: input.jobName,
        reason_code: "HEARTBEAT_WRITE_FAILED",
      });
      return false;
    }
    return true;
  } catch {
    console.warn("system monitor worker heartbeat failed", {
      job_name: input.jobName,
      reason_code: timedOut ? "HEARTBEAT_WRITE_TIMEOUT" : "HEARTBEAT_WRITE_FAILED",
    });
    return false;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
