import type { JobStatus } from "../../../_shared/domain.ts";
import { kaelChatProgressSchema } from "../../../_shared/domain.ts";
import { nullableRecord } from "./coercions.ts";

export const ACTIVE_WORKER_JOB_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
];

export const JOB_CHAT_SEND_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
];

export const JOB_DETAIL_SELECT =
  "id, display_code, status, quote_mode, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, kael_estimate_card_v3, kael_worker_brief_core, kael_worker_brief_guidance, kael_progress, customer_id, worker_id, final_price, worker_commission_level, worker_commission_rate_bps, payment_status, payment_provider, payment_code, payment_transfer_content, payment_qr_image_url, payment_expires_at, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, work_started_at, work_paused_at, work_paused_ms, worker_work_note, completed_at, confirmed_at, paid_at, reviewed_at";

export const DEFAULT_WORKER_CANDIDATE_POOL_SIZE = 50;

export function parseKaelProgressSnapshot(raw: unknown, contextId: string) {
  const rawProgress = nullableRecord(raw);
  const parsedProgress = rawProgress
    ? kaelChatProgressSchema.safeParse(rawProgress)
    : null;
  if (parsedProgress && !parsedProgress.success) {
    console.warn("mobile-api Kael progress invalid", { contextId });
  }
  return parsedProgress?.success
    ? {
      ...parsedProgress.data,
      failure_reason: parsedProgress.data.failure_reason ?? null,
    }
    : null;
}
