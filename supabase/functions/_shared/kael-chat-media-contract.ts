import { z } from "zod";

export const kaelChatMediaRefSchema = z.string().regex(
  /^supabase:\/\/kael-chat-media\/(?!\.{1,2}\/)[^/\s?#]+\/kael-chat\/(?:model_vision|private_video_original)\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i,
  "Kael chat media_refs must be Supabase kael-chat-media storage refs",
).refine(
  (value) => !/\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(value),
  "Raw audio must stay on device; submit an editable voice transcript instead",
);

export const kaelChatMediaUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(180).optional(),
  mime_type: z.string().trim().min(3).max(120),
  purpose: z.enum(["model_vision", "private_video_original"]),
  file_size_bytes: z.number().int().positive().max(50 * 1024 * 1024),
}).strict().superRefine((value, ctx) => {
  const mimeType = value.mime_type.toLowerCase();
  const rawAudio = mimeType.startsWith("audio/") ||
    /\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(value.file_name ?? "");
  if (rawAudio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Raw voice audio must remain on device; submit a reviewed transcript",
      path: ["mime_type"],
    });
  }
  if (
    value.purpose === "model_vision" &&
    !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model vision uploads must be compatible JPEG, PNG, or WebP images",
      path: ["purpose"],
    });
  }
  if (value.purpose === "model_vision" && value.file_size_bytes > 10 * 1024 * 1024) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model vision images must not exceed 10 MB",
      path: ["file_size_bytes"],
    });
  }
  if (value.purpose === "private_video_original" && !mimeType.startsWith("video/")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Private original evidence must be a video",
      path: ["purpose"],
    });
  }
});

export const kaelChatMediaRevokeSchema = z.object({
  media_refs: z.array(kaelChatMediaRefSchema).min(1).max(20),
}).strict();

export type EdgeKaelChatMediaUploadInput = z.infer<typeof kaelChatMediaUploadSchema>;
export type EdgeKaelChatMediaRevokeInput = z.infer<typeof kaelChatMediaRevokeSchema>;
