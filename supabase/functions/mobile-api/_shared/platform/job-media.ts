import type { JobMediaAttachInput } from "../../../_shared/domain.ts";
import { apiFailure } from "./api-failure.ts";

export function validateJobMediaPath(
  jobId: string,
  stage: JobMediaAttachInput["assets"][number]["stage"],
  objectPath: string,
) {
  const expectedPrefix = `${jobId}/${stage}/`;
  const safePathPattern =
    /^[0-9a-fA-F-]{36}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence|access_check_in)\/[A-Za-z0-9._-]+$/;
  if (
    !objectPath.startsWith(expectedPrefix) ||
    objectPath.includes("..") ||
    objectPath.includes("//") ||
    !safePathPattern.test(objectPath)
  ) {
    apiFailure("VALIDATION", "Đường dẫn media không hợp lệ", 400);
  }
}

export function canAttachJobMediaStage(
  stage: JobMediaAttachInput["assets"][number]["stage"],
  isCustomer: boolean,
  isWorker: boolean,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  if (stage === "kael_reference") return isCustomer || isWorker;
  if (stage === "before") return isCustomer;
  return isWorker;
}

export function storageRef(objectPath: string) {
  return `supabase://job-media/${objectPath}`;
}

export function mergeLimitedRefs(
  existing: string[],
  incoming: string[],
  limit: number,
) {
  if (limit <= 0) return [];
  return Array.from(new Set([...existing, ...incoming])).slice(-limit);
}
