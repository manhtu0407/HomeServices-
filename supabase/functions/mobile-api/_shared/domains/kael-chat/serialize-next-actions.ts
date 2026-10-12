// The next steps and labelled market reference a Kael turn carries, re-validated on the way out so a
// stored row that no longer matches the contract is dropped instead of reaching the app.

import { kaelNextActionsSchema } from "../../../../_shared/contracts/kael-next-actions.ts";
import { parseReferencePriceNote } from "./evidence-gap-response.ts";

export function serializeKaelTurnGuidance(metadata: Record<string, unknown>) {
  const actions = kaelNextActionsSchema.safeParse(metadata.next_actions);
  const reference = parseReferencePriceNote(metadata.reference_price);
  return {
    ...(actions.success && actions.data.length > 0 ? { next_actions: actions.data } : {}),
    ...(reference ? { reference_price: reference } : {}),
  };
}
