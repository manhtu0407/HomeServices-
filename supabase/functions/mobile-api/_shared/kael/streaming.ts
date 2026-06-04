import type { KaelPurpose } from "./types.ts";

export type KaelProgressStatus = "queued" | "running" | "completed" | "failed";

export type KaelProgressUpdate = {
  readonly stage: KaelPurpose;
  readonly status: KaelProgressStatus;
  readonly progress: number;
  readonly failureReason?: string;
};

type ProgressClient = {
  from(table: import("../db-types.ts").PublicTableName): {
    update?: (payload: Record<string, unknown>) => {
      eq?: (column: "id", value: string) => PromiseLike<{ data?: unknown; error?: unknown }>;
    };
  };
};

export async function updateKaelProgress(
  client: unknown,
  jobId: string | undefined,
  update: KaelProgressUpdate,
): Promise<void> {
  if (!jobId) return;
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
    const table = client.from("jobs");
    const updateQuery = table.update?.({ kael_progress: kaelProgress });
    const result = await updateQuery?.eq?.("id", jobId);
    if (result?.error) {
      console.warn("Kael progress update failed", {
        jobId,
        stage: update.stage,
      });
    }
  } catch {
    console.warn("Kael progress update threw", {
      jobId,
      stage: update.stage,
    });
  }
}

function isProgressClient(client: unknown): client is ProgressClient {
  return typeof client === "object" && client !== null && "from" in client &&
    typeof (client as { from?: unknown }).from === "function";
}
