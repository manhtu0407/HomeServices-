import type {
  WorkerKaelConversationScope,
} from "../../kael/contracts/types.ts";
import type { WorkerKaelChatCreateInput } from "../../../../_shared/domain.ts";

export function deriveWorkerKaelConversationScope(
  mode: WorkerKaelChatCreateInput["mode"],
  jobId: string | null,
): WorkerKaelConversationScope | null {
  if (mode === "normal") return jobId === null ? "normal" : null;
  return jobId === null ? "opportunity_intake" : "job_intake";
}
