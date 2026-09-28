import { z } from "zod";

export const customerKaelConversationModeSchema = z.enum(["normal", "case"]);

export const customerKaelConversationCreateSchema = z.object({
  mode: customerKaelConversationModeSchema,
  client_request_id: z.string().uuid(),
}).strict();

export const customerKaelConversationTurnSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.enum(["vi", "en"]).default("vi"),
  client_request_id: z.string().uuid(),
  media_refs: z.array(z.string().regex(
    /^supabase:\/\/kael-chat-media\/(?!\.{1,2}\/)[^\/\s?#]+\/kael-chat\/model_vision\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i,
    "Customer normal chat accepts only private vision-image refs",
  )).max(5).optional().refine(
    (mediaRefs) => mediaRefs === undefined || new Set(mediaRefs).size === mediaRefs.length,
    "Customer normal chat media_refs must be unique",
  ),
}).strict();

export const customerKaelConversationRenameSchema = z.object({
  title: z.string().trim().min(1).max(64),
}).strict();

export const customerKaelConversationPinSchema = z.object({
  pinned: z.boolean(),
}).strict();

export type EdgeCustomerKaelConversationMode = z.infer<
  typeof customerKaelConversationModeSchema
>;
export type EdgeCustomerKaelConversationCreateInput = z.infer<
  typeof customerKaelConversationCreateSchema
>;
export type EdgeCustomerKaelConversationTurnInput = z.infer<
  typeof customerKaelConversationTurnSchema
>;
export type EdgeCustomerKaelConversationRenameInput = z.infer<
  typeof customerKaelConversationRenameSchema
>;
export type EdgeCustomerKaelConversationPinInput = z.infer<
  typeof customerKaelConversationPinSchema
>;
