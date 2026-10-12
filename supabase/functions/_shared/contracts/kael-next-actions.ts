import { z } from "zod";
import { serviceTypeSchema } from "./common.ts";

// Twin of packages/shared/src/contracts/kael-next-actions.ts. The server decides which next
// steps a Kael turn offers; the app only renders and sends them back. No kind here crosses a
// RULES #7 confirmation gate: confirming, matching and paying stay on their own explicit controls.

export const KAEL_TURN_INTENTS = [
  "provide_information",
  "ask_question",
  "request_reference_price",
  "request_worker_quote",
  "proceed_or_confirm",
  "correction",
  "request_human_or_complaint",
  "off_topic_or_smalltalk",
] as const;

export const kaelTurnIntentSchema = z.enum(KAEL_TURN_INTENTS);

export const KAEL_NEXT_ACTION_KINDS = [
  "provide_detail",
  "attach_photo",
  "request_worker_quote",
  "request_reference_price",
  "ask_question",
  "review_offer",
  "edit_intake",
  "send_suggestion",
  "start_case",
  "open_scope_change",
  "open_opportunities",
] as const;

export const kaelNextActionKindSchema = z.enum(KAEL_NEXT_ACTION_KINDS);

export const kaelNextActionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  kind: kaelNextActionKindSchema,
  label: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1).max(240).optional(),
  turn_intent: kaelTurnIntentSchema.optional(),
  slot: z.string().trim().min(1).max(80).optional(),
  service_type: serviceTypeSchema.optional(),
}).strict();

export const kaelNextActionsSchema = z.array(kaelNextActionSchema).max(4);

export const CUSTOMER_WORK_NEXT_ACTION_KINDS = [
  "provide_detail",
  "attach_photo",
  "request_worker_quote",
  "request_reference_price",
  "ask_question",
  "review_offer",
  "edit_intake",
] as const;

export const CUSTOMER_CHAT_NEXT_ACTION_KINDS = ["send_suggestion", "start_case"] as const;

export const WORKER_NEXT_ACTION_KINDS = [
  "send_suggestion",
  "attach_photo",
  "open_scope_change",
  "open_opportunities",
] as const;

export type EdgeKaelTurnIntent = z.infer<typeof kaelTurnIntentSchema>;
export type EdgeKaelNextActionKind = z.infer<typeof kaelNextActionKindSchema>;
export type EdgeKaelNextAction = z.infer<typeof kaelNextActionSchema>;
