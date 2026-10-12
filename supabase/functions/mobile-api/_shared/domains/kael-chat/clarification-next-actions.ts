// Every clarification Kael asks gets one-tap answers: the matching sample answer for the field it
// is missing, and a photo option when a photo is what it needs. Built server-side so the app never
// guesses which step is allowed.

import type { EdgeKaelNextAction } from "../../../../_shared/contracts/kael-next-actions.ts";
import { intakeSlotQuestion } from "../../kael/language/intake-slot-questions.ts";
import { asRecord, asStringArray } from "../../platform/coercions.ts";

const PHOTO_FIELDS = new Set(["description_or_photo", "photo", "evidence_photo"]);

export function clarificationNextActions(
  metadata: Record<string, unknown>,
  language: "vi" | "en",
): EdgeKaelNextAction[] {
  const missing = asStringArray(asRecord(metadata.artifact_proposal).missing_fields);
  const actions: EdgeKaelNextAction[] = [];
  for (const field of missing) {
    const question = intakeSlotQuestion(field, language);
    if (!question) continue;
    actions.push({
      id: `provide_${field}`.slice(0, 64),
      kind: "provide_detail",
      label: question.label,
      message: question.example,
      slot: field,
    });
    if (actions.length >= 2) break;
  }
  if (missing.some((field) => PHOTO_FIELDS.has(field))) {
    actions.push({ id: "attach_photo", kind: "attach_photo", label: language === "en" ? "Add a photo" : "Gửi ảnh" });
  }
  return actions.slice(0, 4);
}
