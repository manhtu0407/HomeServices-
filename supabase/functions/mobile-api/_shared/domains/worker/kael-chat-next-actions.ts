// Next steps under a worker's Kael reply. They only open screens the worker already has (scope
// change form, photo picker, opportunity inbox) or send a follow-up question; none accepts a job,
// changes a price or moves the job forward on the worker's behalf.

import {
  kaelNextActionsSchema,
  type EdgeKaelNextAction,
} from "../../../../_shared/contracts/kael-next-actions.ts";
import type { WorkerAssistAnswer } from "../../kael/agents/worker-assist.ts";
import { scrubSensitiveForLLM } from "../../kael/pipeline/utils.ts";
import { asRecord } from "../../platform/coercions.ts";

const VIETNAMESE_DIACRITIC = /[\u00c0-\u01ef\u1ea0-\u1eff]/u;

export function buildWorkerKaelNextActions(input: {
  answer: WorkerAssistAnswer;
  jobId: string | null;
  normalChatSession: boolean;
  language: "vi" | "en";
}): EdgeKaelNextAction[] {
  const vi = input.language === "vi";
  const actions: EdgeKaelNextAction[] = [];
  if (input.answer.redirect_scope_change && input.jobId) {
    actions.push({ id: "open_scope_change", kind: "open_scope_change", label: vi ? "Đề xuất thay đổi phạm vi" : "Propose a scope change" });
  }
  if (input.jobId) {
    actions.push({ id: "attach_photo", kind: "attach_photo", label: vi ? "Gửi ảnh hiện trường" : "Send a site photo" });
  } else if (!input.normalChatSession) {
    actions.push({ id: "open_opportunities", kind: "open_opportunities", label: vi ? "Mở hộp cơ hội" : "Open opportunities" });
  }
  // Model-written follow-ups are kept only when they are clean, in the reply language and short
  // enough to be a chip; anything else is dropped rather than repaired.
  for (const [index, text] of (input.answer.follow_up_suggestions ?? []).entries()) {
    const clean = text.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (
      !clean || clean.length > 60 || scrubSensitiveForLLM(clean) !== clean ||
      (vi ? !VIETNAMESE_DIACRITIC.test(clean) : VIETNAMESE_DIACRITIC.test(clean))
    ) continue;
    actions.push({ id: `follow_up_${index + 1}`, kind: "send_suggestion", label: clean, message: clean });
  }
  return actions.slice(0, 4);
}

export function workerKaelTurnNextActions(metadata: unknown): { next_actions?: EdgeKaelNextAction[] } {
  const parsed = kaelNextActionsSchema.safeParse(asRecord(metadata).next_actions);
  return parsed.success && parsed.data.length > 0 ? { next_actions: parsed.data } : {};
}
