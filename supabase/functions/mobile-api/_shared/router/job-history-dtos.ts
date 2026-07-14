import type { JobStatus, ServiceType } from "../../../_shared/domain.ts";

export type EdgeCustomerServiceHistoryItem = {
  id: string;
  service_type: ServiceType;
  status: JobStatus;
  ended_at: string;
  final_price: number | null;
  worker: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    is_favorite: boolean;
  } | null;
};

export type EdgeCustomerServiceHistoryResponse = {
  service_history: EdgeCustomerServiceHistoryItem[];
};
