import type { JobStatus } from "../../_shared/domain.ts";

const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["analyzing", "cancelled"],
  analyzing: [
    "estimate_ready",
    "awaiting_customer_confirm",
    "broadcasting",
    "draft",
    "cancelled",
  ],
  estimate_ready: ["awaiting_customer_confirm", "broadcasting"],
  awaiting_customer_confirm: ["broadcasting", "cancelled"],
  broadcasting: ["worker_matched", "cancelled"],
  worker_matched: ["worker_on_way", "broadcasting", "cancelled"],
  worker_on_way: ["arrived", "broadcasting", "cancelled"],
  arrived: ["inspecting", "broadcasting", "cancelled"],
  inspecting: ["repairing", "scope_change_pending", "broadcasting", "cancelled"],
  repairing: ["completed_by_worker", "scope_change_pending", "broadcasting", "cancelled"],
  scope_change_pending: ["repairing", "broadcasting", "cancelled"],
  completed_by_worker: ["confirmed_by_customer"],
  confirmed_by_customer: ["payment_pending", "reviewed"],
  payment_pending: ["paid"],
  paid: ["reviewed"],
  reviewed: [],
  cancelled: [],
};

const STATUS_TIMESTAMP_MAP: Partial<Record<JobStatus, string>> = {
  broadcasting: "broadcast_at",
  worker_matched: "matched_at",
  arrived: "arrived_at",
  completed_by_worker: "completed_at",
  confirmed_by_customer: "confirmed_at",
  paid: "paid_at",
  cancelled: "cancelled_at",
  reviewed: "reviewed_at",
  estimate_ready: "estimate_ready_at",
};

export type TransitionResult =
  | { valid: true; timestampColumn: string | null }
  | { valid: false; error: string };

export function validateTransition(
  from: JobStatus,
  to: JobStatus,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) {
    return { valid: false, error: `Trạng thái '${from}' không hợp lệ` };
  }
  if (allowed.length === 0) {
    return {
      valid: false,
      error:
        `Trạng thái '${from}' là trạng thái kết thúc, không thể chuyển đổi`,
    };
  }
  if (!allowed.includes(to)) {
    return {
      valid: false,
      error: `Không thể chuyển từ '${from}' sang '${to}'. Cho phép: ${
        allowed.join(", ") || "không có"
      }`,
    };
  }
  return { valid: true, timestampColumn: STATUS_TIMESTAMP_MAP[to] ?? null };
}
