// What a worker may submit when driving a job status change, including the last-50m access
// check-in handshake. Every helper here is reachable only from workerStatusUpdateSchema.

import { normalizeIsoTimestamp } from "../iso-timestamp.ts";
import type { WorkerStatusUpdate, WorkerStatusUpdateInput } from "./contracts.ts";
import { apiFailure } from "./api-failure.ts";

export function workerStatusUpdateSchema(
  input: unknown,
  jobId: string,
): WorkerStatusUpdateInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  const record = input as Record<string, unknown>;
  const status = record.status;
  const allowed = [
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
    "completed_by_worker",
  ];
  if (typeof status !== "string" || !allowed.includes(status)) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (record.final_price !== undefined) {
    apiFailure(
      "VALIDATION",
      "Giá cuối do Kael xác định, thợ không được nhập",
      400,
    );
  }

  const result: WorkerStatusUpdateInput = {
    status: status as WorkerStatusUpdate,
  };
  if (typeof record.completion_notes === "string") {
    if (record.completion_notes.length > 2000) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_notes = record.completion_notes.slice(0, 2000);
  } else if (record.completion_notes !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (Array.isArray(record.completion_photo_urls)) {
    const urls = record.completion_photo_urls;
    if (urls.length > 10 || urls.some((value) => !isCompletionPhotoRef(value))) {
      apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
    }
    result.completion_photo_urls = urls;
  } else if (record.completion_photo_urls !== undefined) {
    apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
  }
  if (record.access_check_in !== undefined) {
    result.access_check_in = parseWorkerAccessCheckIn(record.access_check_in, jobId);
  }
  if (status === "completed_by_worker") {
    const note = result.completion_notes?.trim() ?? "";
    if (note.length < 5) {
      apiFailure(
        "VALIDATION",
        "Cần ghi chú hoàn tất trước khi báo hoàn tất",
        400,
      );
    }
  }
  return result;
}

export function parseWorkerAccessCheckIn(
  value: unknown,
  jobId: string,
): NonNullable<WorkerStatusUpdateInput["access_check_in"]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  const record = value as Record<string, unknown>;
  const mode = record.mode;
  if (mode !== "geofence" && mode !== "manual_photo") {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }

  let photoUrls: string[] | undefined;
  if (record.photo_urls !== undefined) {
    const rawPhotoUrls = record.photo_urls;
    if (!Array.isArray(rawPhotoUrls)) {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    if (
      rawPhotoUrls.length > 5 ||
      rawPhotoUrls.some((item) => !isAccessCheckInPhotoRef(item, jobId))
    ) {
      apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
    }
    photoUrls = rawPhotoUrls as string[];
  }

  const lat = optionalBoundedNumber(record.lat, -90, 90);
  const lng = optionalBoundedNumber(record.lng, -180, 180);
  const accuracy = optionalBoundedNumber(record.accuracy_m, 0, 5000);
  const note = optionalText(record.note, 300);
  const checkedInAt = optionalIsoString(record.checked_in_at);
  if (mode === "geofence" && (lat === undefined || lng === undefined)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  if (mode === "manual_photo" && (!photoUrls || photoUrls.length === 0)) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }

  return {
    mode,
    ...(lat === undefined ? {} : { lat }),
    ...(lng === undefined ? {} : { lng }),
    ...(accuracy === undefined ? {} : { accuracy_m: accuracy }),
    ...(photoUrls && photoUrls.length > 0 ? { photo_urls: photoUrls } : {}),
    ...(note === undefined ? {} : { note }),
    ...(checkedInAt === undefined ? {} : { checked_in_at: checkedInAt }),
  };
}

export function optionalBoundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return value;
}

export function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return value.trim() || undefined;
}

export function optionalIsoString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  const parsed = normalizeIsoTimestamp(value);
  if (!parsed) {
    apiFailure("VALIDATION", "D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7", 400);
  }
  return parsed;
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isCompletionPhotoRef(value: unknown): value is string {
  return isHttpUrl(value) || isSupabaseJobMediaStageRef(value, "after");
}

// §32.7 (Codex review PR #66): the check-in gates the customer unit-release handshake,
// so its refs MUST be uploads into the controlled access_check_in stage — no arbitrary
// http(s) URLs and no completion-stage refs. (The completion validator keeps its legacy
// http acceptance; this new flow has no legacy to honor.)
export function isAccessCheckInPhotoRef(value: unknown, jobId: string): value is string {
  return isSupabaseJobMediaStageRef(value, "access_check_in", jobId);
}

export function isSupabaseJobMediaStageRef(
  value: unknown,
  stage: string,
  jobId?: string,
): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    return url.protocol === "supabase:" &&
      url.hostname === "job-media" &&
      pathParts.length === 3 &&
      (jobId === undefined || pathParts[0] === jobId) &&
      pathParts[1] === stage &&
      !pathParts.some((part) => part === "." || part === "..");
  } catch {
    return false;
  }
}

