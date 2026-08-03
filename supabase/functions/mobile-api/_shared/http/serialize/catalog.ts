import type {
  ComplexityLevel,
  ServiceType,
} from "../../../../_shared/domain.ts";

export type EdgeServiceCatalogResponse = {
  services: {
    id: string;
    service_type: ServiceType;
    label_vi: string;
    problems: {
      id: string;
      slug: string;
      label_vi: string;
      default_complexity: ComplexityLevel;
    }[];
    baselines: {
      complexity: ComplexityLevel;
      district_code: string;
      price_min: number;
      price_max: number;
    }[];
  }[];
};

export type EdgePlacesResolveResponse = {
  fallback_used: boolean;
  label: string | null;
  location: { lat: number; lng: number } | null;
  place_id: string;
  provider: "vietmap" | "google_maps" | "fallback";
};

export type EdgeKaelAssistantResponse = {
  answer: string;
  safety_notes: readonly string[];
  citations: readonly string[];
  suggested_actions: readonly (
    | "open_booking"
    | "check_job"
    | "message_worker"
    | "contact_support"
    | "request_scope_change"
  )[];
  boundary:
    | "answered"
    | "educational_only"
    | "redirect"
    | "unsupported"
    | "fallback";
  fallback_used: boolean;
};

export type EdgeNotificationListResponse = {
  unread_count: number;
  notifications: {
    id: string;
    title: string;
    body: string;
    event_type: string;
    status: string;
    job_id: string | null;
    created_at: string;
    read_at: string | null;
  }[];
};

export type EdgeNotificationReadResponse = {
  notification_id: string;
  status: "read";
  read_at: string;
};

export type EdgeDevicePushTokenResponse = {
  token_id: string;
  enabled: boolean;
  updated_at: string;
};
