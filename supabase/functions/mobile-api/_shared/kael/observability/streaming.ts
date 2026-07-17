import type { KaelPurpose } from "../types.ts";

export type KaelProgressStatus = "queued" | "running" | "completed" | "failed";
export type KaelProgressStage = KaelPurpose | "scope_reviewing" | "scope_estimating";

export type KaelProgressUpdate = {
  readonly stage: KaelProgressStage;
  readonly status: KaelProgressStatus;
  readonly progress: number;
  readonly failureReason?: string;
};

export type KaelProgressTable =
  | "jobs"
  | "kael_chat_sessions"
  | "kael_worker_chat_sessions"
  | "scope_change_requests";

export type KaelProgressTarget = {
  readonly table: KaelProgressTable;
  readonly id: string | undefined;
};

type ProgressClient = {
  from(table: string): {
    update?: (payload: Record<string, unknown>) => {
      eq?: (column: "id", value: string) => PromiseLike<{ data?: unknown; error?: unknown }>;
    };
  };
};

export async function updateKaelProgress(
  client: unknown,
  target: string | KaelProgressTarget | undefined,
  update: KaelProgressUpdate,
): Promise<void> {
  const progressTarget = normalizeProgressTarget(target);
  if (!progressTarget?.id) return;
  if (!isProgressClient(client)) return;
  const progress = Math.max(0, Math.min(1, update.progress));
  const kaelProgress = {
    current_stage: update.stage,
    status: update.status,
    progress,
    failure_reason: update.failureReason ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const table = client.from(progressTarget.table);
    const updateQuery = table.update?.({ kael_progress: kaelProgress });
    const result = await updateQuery?.eq?.("id", progressTarget.id);
    if (result?.error) {
      console.warn("Kael progress update failed", {
        targetTable: progressTarget.table,
        targetId: progressTarget.id,
        stage: update.stage,
      });
    }
  } catch {
    console.warn("Kael progress update threw", {
      targetTable: progressTarget.table,
      targetId: progressTarget.id,
      stage: update.stage,
    });
  }
}

function normalizeProgressTarget(
  target: string | KaelProgressTarget | undefined,
): KaelProgressTarget | null {
  if (!target) return null;
  if (typeof target === "string") return { table: "jobs", id: target };
  return target;
}

function isProgressClient(client: unknown): client is ProgressClient {
  return typeof client === "object" && client !== null && "from" in client &&
    typeof (client as { from?: unknown }).from === "function";
}
