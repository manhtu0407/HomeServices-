import type { ComplexityLevel, JobStatus, ScopeChangeStatus, ServiceType } from "../../../../_shared/domain.ts";
import type { EdgeAddressAccessView } from "./job.ts";
import type { EdgeKaelChatProgressResponse } from "./kael-chat.ts";

export type EdgeJobDetailResponse = {
  job: {
    id: string;
    display_code?: string;
    status: JobStatus;
    service_type: ServiceType;
    description: string;
    problem_chips: string[];
    photo_urls: string[];
    customer_evidence_photo_urls: string[];
    field_evidence_photo_urls: string[];
    address_building: string | null;
    address_unit: string | null;
    address_floor: string | null;
    address_district: string | null;
    address_access: EdgeAddressAccessView;
    scheduled_at: string | null;
    kael_problem_identified: string | null;
    kael_complexity: ComplexityLevel | null;
    kael_price_min: number | null;
    kael_price_max: number | null;
    kael_advisory: string | null;
    kael_estimate_card_v3: Record<string, unknown> | null;
    kael_worker_brief_core: Record<string, unknown> | null;
    kael_worker_brief_guidance: Record<string, unknown> | null;
    kael_progress: EdgeKaelChatProgressResponse["progress"];
    final_price: number | null;
    payment_rail_available: boolean;
    payment_status:
      | "not_started"
      | "code_requested"
      | "vietqr_ready"
      | "pending"
      | "received"
      | "cash_confirmed"
      | "amount_mismatch"
      | "expired"
      | "failed"
      | "reconciled"
      | null;
    payment_provider: string | null;
    payment_code: string | null;
    payment_transfer_content: string | null;
    payment_qr_image_url: string | null;
    payment_expires_at: string | null;
    payment_received_at: string | null;
    payment_amount_received: number | null;
    gross_amount: number | null;
    platform_fee: number | null;
    worker_net: number | null;
    completion_notes: string | null;
    completion_photo_urls: string[];
    created_at: string;
    matched_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    confirmed_at: string | null;
    paid_at: string | null;
    reviewed_at: string | null;
  };
  worker: {
    avatar_url: string | null;
    display_code?: string | null;
    full_name: string;
    id: string;
    rating: number;
    review_count?: number | null;
    total_jobs: number;
  } | null;
  broadcast_state: {
    active_count: number;
    seconds_remaining: number | null;
  } | null;
  current_scope_change: {
    id: string;
    status: ScopeChangeStatus;
    requested_description: string | null;
    reason: string | null;
    price_min: number | null;
    price_max: number | null;
    kael_computed_min: number | null;
    kael_computed_max: number | null;
    kael_review: Record<string, unknown> | null;
    kael_progress: EdgeKaelChatProgressResponse["progress"];
    evidence_photo_urls: string[];
    request_timing: "pre_arrival" | "on_site";
    resume_job_status: JobStatus | null;
    created_at: string | null;
  } | null;
};

export type EdgeCustomerActiveJobResponse = {
  active_job: EdgeJobDetailResponse | null;
};
