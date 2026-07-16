export type CleanupBucket = "kael-chat-media" | "job-media";

export type CleanupRow = {
  intent_id: string;
  object_path: string;
};

const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_SEGMENT}$`, "i");
const KAEL_OBJECT_PATH_PATTERN = new RegExp(
  `^${UUID_SEGMENT}/kael-chat/(?:model_vision|private_video_original)/(?!.*(?:\\.\\.|//))[^\\s?#]+$`,
  "i",
);
const JOB_OBJECT_PATH_PATTERN = new RegExp(
  `^${UUID_SEGMENT}/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence|access_check_in)/(?!.*(?:\\.\\.|//))[^/\\s?#]+$`,
  "i",
);

export function parseCleanupLimit(
  value: unknown,
  maxLimit: number,
  defaultLimit: number,
): number {
  if (
    !Number.isSafeInteger(maxLimit) ||
    maxLimit < 1 ||
    !Number.isSafeInteger(defaultLimit) ||
    defaultLimit < 1 ||
    defaultLimit > maxLimit
  ) {
    throw new RangeError("cleanup limit bounds are invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("INVALID_REQUEST");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "limit")) {
    throw new TypeError("INVALID_REQUEST");
  }
  if (!Object.hasOwn(record, "limit")) return defaultLimit;
  if (
    !Number.isSafeInteger(record.limit) ||
    (record.limit as number) < 1 ||
    (record.limit as number) > maxLimit
  ) {
    throw new TypeError("INVALID_REQUEST");
  }
  return record.limit as number;
}

export function parseCleanupRows(
  value: unknown,
  bucket: CleanupBucket,
  maxRows: number,
): CleanupRow[] {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new RangeError("maxRows must be a positive safe integer");
  }
  if (!Array.isArray(value) || value.length > maxRows) {
    throw new TypeError("CLAIM_RESPONSE_INVALID");
  }

  const intentIds = new Set<string>();
  const objectPaths = new Set<string>();
  const pathPattern = bucket === "kael-chat-media"
    ? KAEL_OBJECT_PATH_PATTERN
    : JOB_OBJECT_PATH_PATTERN;

  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError("CLAIM_RESPONSE_INVALID");
    }
    const record = row as Record<string, unknown>;
    const intentId = record.intent_id;
    const objectPath = record.object_path;
    if (
      typeof intentId !== "string" ||
      !UUID_PATTERN.test(intentId) ||
      typeof objectPath !== "string" ||
      objectPath.length > 500 ||
      !pathPattern.test(objectPath) ||
      intentIds.has(intentId.toLowerCase()) ||
      objectPaths.has(objectPath)
    ) {
      throw new TypeError("CLAIM_RESPONSE_INVALID");
    }
    intentIds.add(intentId.toLowerCase());
    objectPaths.add(objectPath);
    return { intent_id: intentId, object_path: objectPath };
  });
}

export function isStorageRemoveSuccess(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.error === null && Array.isArray(result.data);
}

export function parseCompletedCount(
  value: unknown,
  maxExpected: number,
): number {
  if (!Number.isSafeInteger(maxExpected) || maxExpected < 0) {
    throw new RangeError("maxExpected must be a non-negative safe integer");
  }
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > maxExpected
  ) {
    throw new TypeError("FINALIZE_RESPONSE_INVALID");
  }
  return value as number;
}
