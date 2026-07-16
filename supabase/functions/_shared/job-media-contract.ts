import { z } from "zod";

export const MAX_JOB_MEDIA_BYTES = 26_214_400;
export const JOB_MEDIA_STORAGE_TIMEOUT_MS = 15_000;

export const JOB_MEDIA_STAGES = [
  "before",
  "after",
  "kael_reference",
  "cancellation_evidence",
  "scope_change_evidence",
  "access_check_in",
] as const;

export const jobMediaUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(180),
  file_size_bytes: z.number().int().min(1).max(MAX_JOB_MEDIA_BYTES),
  mime_type: z.string().trim().min(3).max(120),
  stage: z.enum(JOB_MEDIA_STAGES),
}).strict();

export const jobMediaRevokeSchema = z.object({
  object_paths: z.array(
    z.string().min(10).max(500).regex(/^[^\\?#\s]+$/),
  ).min(1).max(5),
}).strict();

export type JobMediaUploadInput = z.infer<typeof jobMediaUploadSchema>;
export type JobMediaRevokeInput = z.infer<typeof jobMediaRevokeSchema>;

export type JobMediaUploadResponse = {
  bucket_id: "job-media";
  object_path: string;
  storage_ref: string;
  signed_upload_url: string;
  token: string;
  expires_in_seconds: number;
};

export type JobMediaRevokeResponse = {
  job_id: string;
  revoked_count: number;
  deletion_pending: boolean;
};
