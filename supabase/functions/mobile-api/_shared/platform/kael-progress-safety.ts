const SAFE_PROGRESS_FAILURE_REASONS = new Set([
  "TIMEOUT",
  "UNKNOWN_ERROR",
  "budget_exceeded",
  "out_of_scope",
  "pipeline_error",
  "prompt_injection",
  "service_mismatch",
  "unsupported",
]);

export function safeKaelProgressFailureReason(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && SAFE_PROGRESS_FAILURE_REASONS.has(value)
    ? value
    : "stage_failed";
}
